import { PubSub } from "@google-cloud/pubsub";
import { isSafeE2eRuntime } from "./storageConfig";

const pubsub = new PubSub();

function isCanonicalLoopbackUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "http:") return false;
    if (u.username || u.password) return false;
    return u.hostname === "127.0.0.1" || u.hostname === "localhost";
  } catch {
    return false;
  }
}

export function resolveReceiptProcessorUrl(env: {
  ENVIRONMENT?: string;
  RECEIPT_PROCESSOR_URL?: string;
  RECEIPT_PARSER?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  FIREBASE_PROJECT_ID?: string;
  FIRESTORE_EMULATOR_HOST?: string;
}): string | undefined {
  const raw = env.RECEIPT_PROCESSOR_URL?.trim();
  if (!raw) return undefined;

  if (!isCanonicalLoopbackUrl(raw)) {
    throw new Error(
      "RECEIPT_PROCESSOR_URL must be a canonical HTTP loopback URL (http://127.0.0.1:* or http://localhost:*) without credentials"
    );
  }

  const normalized = raw.replace(/\/+$/, "");

  if (env.ENVIRONMENT === "local" || env.ENVIRONMENT === "dev") {
    return normalized;
  }

  if (env.ENVIRONMENT === "e2e") {
    if (!isSafeE2eRuntime(env)) {
      throw new Error(
        "RECEIPT_PROCESSOR_URL direct mode for ENVIRONMENT=e2e requires safe E2E runtime (RECEIPT_PARSER=fixture, project slurp-e2e, FIRESTORE_EMULATOR_HOST loopback with port)"
      );
    }
    return normalized;
  }

  throw new Error(
    `RECEIPT_PROCESSOR_URL direct mode not allowed for ENVIRONMENT=${env.ENVIRONMENT ?? "(missing)"} — refusing to POST slurpId/gcsPath to arbitrary endpoint`
  );
}

export async function publishReceiptJob({
  slurpId,
  gcsPath,
}: {
  slurpId: string;
  gcsPath: string;
}): Promise<void> {
  const resolved = resolveReceiptProcessorUrl(
    process.env as Record<string, string | undefined>
  );
  if (resolved !== undefined) {
    // Local dev/e2e: POST directly to the processor, bypassing Pub/Sub.
    // Wraps payload in the same Pub/Sub push envelope the processor expects.
    const data = Buffer.from(JSON.stringify({ slurpId, gcsPath })).toString("base64");
    const res = await fetch(`${resolved}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: { data } }),
    });
    if (!res.ok) throw new Error(`Processor returned HTTP ${res.status}`);
    return;
  }

  const env = process.env.ENVIRONMENT ?? "dev";
  const topicName = `slurp-receipts-${env}`;
  const data = Buffer.from(JSON.stringify({ slurpId, gcsPath }));
  await pubsub.topic(topicName).publishMessage({ data });
}
