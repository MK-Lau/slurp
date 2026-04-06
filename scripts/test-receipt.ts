/**
 * Manual test script for Gemini receipt parsing.
 * Uses GCP ADC credentials (gcloud auth application-default login).
 * Usage: GOOGLE_CLOUD_PROJECT=<project> npx tsx scripts/test-receipt.ts <path-to-image>
 */
import { GoogleAuth } from "google-auth-library";
import * as fs from "fs";
import * as path from "path";

const imagePath = process.argv[2];
if (!imagePath) {
  console.error("Usage: GOOGLE_CLOUD_PROJECT=<project> npx tsx scripts/test-receipt.ts <path-to-image>");
  process.exit(1);
}

const project = process.env.GOOGLE_CLOUD_PROJECT;
if (!project) {
  console.error("GOOGLE_CLOUD_PROJECT env var is required");
  process.exit(1);
}

const MODEL = "gemini-2.5-flash";
const LOCATION = "us-central1";

const PROMPT = `
You are a receipt parser. Extract the following from this receipt image and return ONLY valid JSON with no markdown or extra text:

{
  "items": [
    { "name": "string", "price": number, "quantity": number }
  ],
  "tax": number or null,
  "tip": number or null,
  "subtotal": number or null,
  "total": number or null
}

Rules:
- items: list of individual line items. name should NOT include the quantity prefix. price is the total price for that line (quantity * unit price). quantity is the integer count ordered (default 1 if not shown).
- tax: tax as a flat dollar amount (e.g. 29.67). Extract directly from the receipt. If not shown, null.
- tip: tip/gratuity as a flat dollar amount. Extract directly from the receipt. If not shown, null.
- subtotal: pre-tax/tip total (after any discounts)
- total: final total charged
- Use numbers, not strings, for all monetary values
`;

async function main() {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;
  if (!token) throw new Error("Failed to get access token from ADC");

  const imageBuffer = fs.readFileSync(path.resolve(imagePath));
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${project}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mimeType, data: imageBuffer.toString("base64") } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };

  console.log(`Sending ${imagePath} to Vertex AI (${MODEL})...\n`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vertex AI error ${res.status}: ${err}`);
  }

  const data = await res.json() as any;
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  console.log("Raw response:\n", text, "\n");

  try {
    const json = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed = JSON.parse(json);
    console.log("Parsed result:");
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.error("Failed to parse JSON from response");
  }
}

main().catch(console.error);
