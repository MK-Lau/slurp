import { Storage } from "@google-cloud/storage";
import { nanoid } from "nanoid";

const storage = new Storage();

export async function generateSignedUploadUrl(
  slurpId: string,
  contentType: "image/jpeg" | "image/png"
): Promise<{ uploadUrl: string; gcsPath: string }> {
  const bucket = process.env.RECEIPT_BUCKET;
  if (!bucket) throw new Error("RECEIPT_BUCKET env var is not set");

  const ext = contentType === "image/png" ? "png" : "jpg";
  const gcsPath = `receipts/${slurpId}/${nanoid()}.${ext}`;

  const [uploadUrl] = await storage.bucket(bucket).file(gcsPath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  return { uploadUrl, gcsPath };
}
