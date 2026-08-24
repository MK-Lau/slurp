import { Router, Request, Response, NextFunction } from "express";
import { db } from "../firebase";
import { requireAuth } from "../middleware/auth";
import { BadRequestError, ConflictError, NotFoundError } from "../middleware/errorHandler";
import { requireHost, requireParticipant } from "../lib/guards";
import { generateSignedUploadUrl } from "../lib/storage";
import { publishReceiptJob } from "../lib/pubsub";
import { isFixedFinanciallyLocked } from "../lib/fixedShares";
import { receiptProcessHourlyLimiter, receiptProcessDailyLimiter } from "../middleware/rateLimiter";
import type { Slurp } from "@slurp/types";

const router = Router({ mergeParams: true });

// POST /slurps/:id/receipt/upload-url
// Rate-limited with the same hourly/daily limiters as /process so users cannot
// bypass the Gemini cost cap by spamming upload-url without triggering processing.
router.post(
  "/upload-url",
  requireAuth,
  receiptProcessHourlyLimiter,
  receiptProcessDailyLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { uid } = req.user;

      const snap = await db.collection("slurps").doc(id).get();
      if (!snap.exists) throw new NotFoundError("Slurp not found");
      const slurp = snap.data() as Slurp;

      requireParticipant(slurp, uid);
      requireHost(slurp, uid);
      if (isFixedFinanciallyLocked(slurp)) {
        throw new ConflictError("Receipt changes are locked because a participant has confirmed");
      }

      if (slurp.receiptStatus === "processing") {
        throw new ConflictError("Receipt is already being processed");
      }

      const { contentType } = req.body as { contentType?: string };
      if (contentType !== "image/jpeg" && contentType !== "image/png") {
        throw new BadRequestError("contentType must be image/jpeg or image/png");
      }

      const { uploadUrl, gcsPath } = await generateSignedUploadUrl(id, contentType);

      // Signed URL generation is asynchronous. Re-read inside a transaction so
      // a confirmation that lands while the URL is being generated cannot be
      // overwritten with a new pending receipt state.
      const ref = db.collection("slurps").doc(id);
      await db.runTransaction(async (tx) => {
        const currentSnap = await tx.get(ref);
        if (!currentSnap.exists) throw new NotFoundError("Slurp not found");
        const currentSlurp = currentSnap.data() as Slurp;

        requireParticipant(currentSlurp, uid);
        requireHost(currentSlurp, uid);
        if (isFixedFinanciallyLocked(currentSlurp)) {
          throw new ConflictError("Receipt changes are locked because a participant has confirmed");
        }
        if (currentSlurp.receiptStatus === "processing") {
          throw new ConflictError("Receipt is already being processed");
        }

        tx.update(ref, {
          receiptStatus: "pending",
          receiptPath: gcsPath,
          updatedAt: new Date().toISOString(),
        });
      });

      res.json({ uploadUrl, gcsPath });
    } catch (err) {
      next(err);
    }
  }
);

// POST /slurps/:id/receipt/process
router.post(
  "/process",
  requireAuth,
  receiptProcessHourlyLimiter,
  receiptProcessDailyLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { uid } = req.user;

      const ref = db.collection("slurps").doc(id);

      let gcsPath: string | undefined;

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new NotFoundError("Slurp not found");
        const slurp = snap.data() as Slurp;

        requireParticipant(slurp, uid);
        requireHost(slurp, uid);
        if (isFixedFinanciallyLocked(slurp)) {
          throw new ConflictError("Receipt changes are locked because a participant has confirmed");
        }

        if (slurp.receiptStatus !== "pending") {
          throw new ConflictError("Receipt must be in pending status to process");
        }

        gcsPath = (req.body as { gcsPath?: string }).gcsPath ?? slurp.receiptPath;
        if (!gcsPath) throw new BadRequestError("gcsPath is required");
        if (!gcsPath.startsWith(`receipts/${id}/`) || gcsPath.includes("..")) {
          throw new BadRequestError("gcsPath does not belong to this slurp");
        }

        tx.update(ref, {
          receiptStatus: "processing",
          receiptPath: gcsPath,
          updatedAt: new Date().toISOString(),
        });
      });

      await publishReceiptJob({ slurpId: id, gcsPath: gcsPath! });

      res.json({ id, receiptStatus: "processing" });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
