import express, { Request, Response } from "express";
import pino from "pino";
import { OAuth2Client } from "google-auth-library";
import { processReceipt } from "./processor";

const app = express();
const port = parseInt(process.env.PORT ?? "8080", 10);
const logger = pino();
const authClient = new OAuth2Client();

async function verifyPubSubJwt(req: Request, res: Response): Promise<boolean> {
  const environment = process.env.ENVIRONMENT ?? "local";
  if (environment === "local") return true;

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
