import cors from "cors";
import express, { Request, Response } from "express";
import pino from "pino";
import { OAuth2Client } from "google-auth-library";
import { processReceipt } from "./processor";
import { isSafeE2eRuntime } from "./config/e2eReceiptConfig";
import { shouldBypassJwtVerification } from "./config/jwtBypass";
import { validateE2eUploadRequest } from "./e2eUploadValidation";

const app = express();
const port = parseInt(process.env.PORT ?? "8080", 10);
const logger = pino();
const authClient = new OAuth2Client();

async function verifyPubSubJwt(req: Request, res: Response): Promise<boolean> {
  if (shouldBypassJwtVerification(process.env as Record<string, string | undefined>)) return true;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return false;
  }

  const expectedEmail = process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL;
  if (!expectedEmail) {
    logger.error("PUBSUB_SERVICE_ACCOUNT_EMAIL is not configured");
    res.status(500).json({ error: "Server misconfiguration" });
    return false;
  }

  const audience = process.env.PROCESSOR_URL;
  if (!audience) {
    logger.error("PROCESSOR_URL is not configured");
    res.status(500).json({ error: "Server misconfiguration" });
    return false;
  }

  const token = authHeader.slice(7);
  try {
    const ticket = await authClient.verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();
    if (!payload?.email_verified || payload.email !== expectedEmail) {
      res.status(403).json({ error: "Unauthorized" });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, "Pub/Sub JWT verification failed");
    res.status(401).json({ error: "Invalid token" });
    return false;
  }
}

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", environment: process.env.ENVIRONMENT ?? "local" });
});

// E2E-only local upload endpoint — guarded to exact ENVIRONMENT=e2e.
// Accepts raw image bytes and validates path/mime/size without touching GCS.
// CORS is enabled here so the browser (origin 127.0.0.1:3100) can PUT directly
// to the processor's e2e-upload URL returned by the API.

const e2eUploadCors = cors({
  origin: true,
  methods: ["PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Content-Length"],
});

const e2eUploadRaw = express.raw({
  type: ["image/jpeg", "image/png"],
  limit: "10mb",
});

app.options("/e2e-upload/:encodedPath", (req: Request, res: Response, next) => {
  if (!isSafeE2eRuntime(process.env as Record<string, string | undefined>)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  return (e2eUploadCors as unknown as (r: Request, s: Response, n: () => void) => void)(req, res, next);
});
app.put("/e2e-upload/:encodedPath", (req: Request, res: Response, next) => {
  if (!isSafeE2eRuntime(process.env as Record<string, string | undefined>)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  return (e2eUploadCors as unknown as (r: Request, s: Response, n: () => void) => void)(req, res, next);
}, e2eUploadRaw, (req: Request, res: Response) => {

  const rawContentType = req.headers["content-type"]?.split(";")[0]?.trim() ?? "";
  if (rawContentType !== "image/jpeg" && rawContentType !== "image/png") {
    res.status(400).json({ error: "Invalid content type" });
    return;
  }

  let gcsPath: string;
  try {
    gcsPath = decodeURIComponent(req.params.encodedPath);
  } catch {
    res.status(400).json({ error: "Invalid gcsPath encoding" });
    return;
  }

  const contentLength = Number(req.headers["content-length"] ?? (req.body as Buffer)?.length ?? 0);
  const validation = validateE2eUploadRequest({
    gcsPath,
    contentType: rawContentType as "image/jpeg" | "image/png",
    contentLength: Number.isFinite(contentLength) ? contentLength : (req.body as Buffer)?.length ?? 0,
  });

  if (!validation.valid) {
    res.status(400).json({ error: validation.error ?? "Invalid upload request" });
    return;
  }

  if (!req.body || (req.body as Buffer).length === 0) {
    res.status(400).json({ error: "Empty body" });
    return;
  }

  res.status(204).send();
});

// Pub/Sub push subscription endpoint
app.post("/", async (req: Request, res: Response) => {
  if (!(await verifyPubSubJwt(req, res))) return;
  const message = (req.body as { message?: { data?: string } })?.message;
  if (!message?.data) {
    res.status(400).json({ error: "Invalid Pub/Sub message: missing message.data" });
    return;
  }

  let slurpId: string;
  let gcsPath: string;

  try {
    const payload = JSON.parse(Buffer.from(message.data, "base64").toString()) as {
      slurpId: string;
      gcsPath: string;
    };
    slurpId = payload.slurpId;
    gcsPath = payload.gcsPath;
  } catch {
    res.status(400).json({ error: "Invalid Pub/Sub message: could not parse data" });
    return;
  }

  if (!slurpId || !gcsPath) {
    res.status(400).json({ error: "Invalid Pub/Sub message: missing slurpId or gcsPath" });
    return;
  }

  // Process synchronously — Cloud Run throttles CPU after response is sent
  // (cpu_idle = true), so background processing would stall. Pub/Sub will
  // retry if we don't ack within ack_deadline_seconds (60s).
  try {
    await processReceipt(slurpId, gcsPath);
    res.status(204).send();
  } catch (err: unknown) {
    logger.error({ err, slurpId, gcsPath }, "Unexpected error in processReceipt");
    res.status(500).json({ error: "Failed to process receipt" });
  }
});

app.listen(port, () => {
  logger.info({ port }, "slurp-receipt-processor listening");
});
