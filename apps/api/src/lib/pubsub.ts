import { PubSub } from "@google-cloud/pubsub";

const pubsub = new PubSub();

export async function publishReceiptJob({
  slurpId,
  gcsPath,
}: {
  slurpId: string;
  gcsPath: string;
}): Promise<void> {
  const processorUrl = process.env.RECEIPT_PROCESSOR_URL;
  if (processorUrl) {
    // Local dev: POST directly to the processor, bypassing Pub/Sub.
    // Wraps payload in the same Pub/Sub push envelope the processor expects.
    const data = Buffer.from(JSON.stringify({ slurpId, gcsPath })).toString("base64");
    const res = await fetch(`${processorUrl}/`, {
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
