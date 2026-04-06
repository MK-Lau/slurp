import { nanoid } from "nanoid";
import pino from "pino";
import type { Slurp, Item } from "@slurp/types";
import { DEFAULT_SLURP_TITLE } from "@slurp/types";
import { FieldValue } from "@google-cloud/firestore";
import { db } from "./firestore";
import { parseReceiptFromGcs } from "./gemini";

const logger = pino();

const MAX_ITEMS = 20;
export const MEDIUM_CONFIDENCE_WARNING = "Receipt image was unclear — please review items before confirming.";

export async function processReceipt(slurpId: string, gcsPath: string): Promise<void> {
  const ref = db.collection("slurps").doc(slurpId);
  const bucket = process.env.RECEIPT_BUCKET;
  if (!bucket) throw new Error("RECEIPT_BUCKET env var is not set");

  // Check status before calling Gemini to avoid wasted API calls on stale
  // Pub/Sub retries (e.g. slurp already done, failed, or deleted).
  const preSnap = await ref.get();
  if (!preSnap.exists) return;
  if ((preSnap.data() as Slurp).receiptStatus !== "processing") return;

  const mimeType = gcsPath.endsWith(".png") ? "image/png" : "image/jpeg";
  const gcsUri = `gs://${bucket}/${gcsPath}`;

  try {
    const parsed = await parseReceiptFromGcs(gcsUri, mimeType);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error(`Slurp ${slurpId} not found`);
      const slurp = snap.data() as Slurp;

      if (slurp.receiptStatus === "done") {
        // Duplicate Pub/Sub delivery — receipt was already processed successfully.
        return;
      }

      if (parsed.confidence === "low") {
        tx.delete(ref);
        return;
      }

      const existingItems: Item[] = slurp.items ?? [];
      const newItems: Item[] = (parsed.items ?? []).flatMap((i) => {
        const qty = Math.max(1, Math.round(i.quantity ?? 1));
        const unitPrice = Math.round((i.price / qty) * 100) / 100;
        return Array.from({ length: qty }, () => ({
          id: nanoid(),
          name: i.name,
          price: unitPrice,
        }));
      });

      const combined = [...existingItems, ...newItems].slice(0, MAX_ITEMS);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update: Record<string, any> = {
        items: combined,
        receiptStatus: "done",
        receiptWarningDismissed: FieldValue.delete(),
        updatedAt: new Date().toISOString(),
      };

      if (parsed.confidence === "medium") {
        update.receiptWarning = MEDIUM_CONFIDENCE_WARNING;
      } else {
        update.receiptWarning = FieldValue.delete();
      }

      if ((!slurp.title || slurp.title === DEFAULT_SLURP_TITLE) && parsed.title) {
        update.title = String(parsed.title).trim().slice(0, 255);
      }

      if (parsed.tax != null) update.taxAmount = parsed.tax;
      if (parsed.tip != null) update.tipAmount = parsed.tip;

      tx.update(ref, update);
    });
  } catch (err) {
    logger.error({ err, slurpId, gcsPath }, "processReceipt failed");
    await ref.update({
      receiptStatus: "failed",
      receiptError: "Receipt processing failed. Please re-upload and try again.",
      updatedAt: new Date().toISOString(),
    });
  }
}
