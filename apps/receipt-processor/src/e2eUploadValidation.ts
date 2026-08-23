const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface E2eUploadValidationResult {
  valid: boolean;
  error?: string;
}

export function validateE2eUploadRequest(params: {
  gcsPath: string;
  contentType: string;
  contentLength: number;
}): E2eUploadValidationResult {
  const { gcsPath, contentType, contentLength } = params;

  if (!gcsPath || typeof gcsPath !== "string") {
    return { valid: false, error: "gcsPath is required" };
  }

  if (gcsPath.includes("..") || gcsPath.includes("\\") || gcsPath.startsWith("/")) {
    return { valid: false, error: "Invalid gcsPath: path traversal detected" };
  }

  if (!gcsPath.startsWith("receipts/")) {
    return { valid: false, error: "Invalid gcsPath: must be under receipts/" };
  }

  // Require exactly receipts/<slurpId>/<file> with no extra slashes/segments trivially
  const parts = gcsPath.split("/");
  if (parts.length !== 3 || !parts[1] || !parts[2]) {
    return { valid: false, error: "Invalid gcsPath: must be receipts/<slurpId>/<file>" };
  }

  if (contentType !== "image/jpeg" && contentType !== "image/png") {
    return { valid: false, error: "Unsupported content type" };
  }

  const ext = gcsPath.endsWith(".png") ? "png" : gcsPath.endsWith(".jpg") || gcsPath.endsWith(".jpeg") ? "jpg" : "";
  if (!ext) {
    return { valid: false, error: "Invalid gcsPath: unsupported extension" };
  }

  if (contentType === "image/png" && ext !== "png") {
    return { valid: false, error: "Content type does not match file extension" };
  }

  if (contentType === "image/jpeg" && ext === "png") {
    return { valid: false, error: "Content type does not match file extension" };
  }

  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return { valid: false, error: "Invalid content length" };
  }

  if (contentLength > MAX_UPLOAD_BYTES) {
    return { valid: false, error: `Upload too large: max ${MAX_UPLOAD_BYTES} bytes` };
  }

  return { valid: true };
}
