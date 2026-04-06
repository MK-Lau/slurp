import { VertexAI } from "@google-cloud/vertexai";
import pino from "pino";

const logger = pino();
const MODEL = "gemini-2.5-flash";
const LOCATION = "us-central1";

const PROMPT = `
You are a receipt parser. Extract the following from this receipt image and return ONLY valid JSON with no markdown or extra text:

{
  "title": "string or null",
  "items": [
    { "name": "string", "price": number, "quantity": number }
  ],
  "tax": number or null,
  "tip": number or null,
  "subtotal": number or null,
  "total": number or null,
  "confidence": "high" or "medium" or "low"
}

Rules:
- title: the restaurant or vendor name shown on the receipt. If not identifiable, null.
- items: list of individual line items. price is the total price for that line (quantity * unit price). quantity is the integer count ordered (default 1 if not shown). If a line item is printed with a quantity prefix (e.g. "2 X Item", "3x Item", "4 COPERTO", "2 x Spritz"), extract the number as \`quantity\` and strip the prefix entirely from the name — do NOT include any numeric or multiplier prefix (e.g. "2 X", "3x", "4 ") in the name field.
- CRITICAL — no splitting: Each printed line item on the receipt must become exactly ONE item in the output. Never split a single line item into multiple items. Modifier lines (e.g. "No Bacon", "Extra Sauce") that appear indented or subordinate to a menu item are NOT separate items — ignore them or fold them into the parent item name.
- tax: ONLY extract tax as a flat dollar/euro amount if it appears as a SEPARATE line that is ADDED ON TOP of the subtotal to reach the final total (i.e. total ≈ subtotal + tax). In many countries (EU, Canada, etc.) tax/VAT/IVA is already included in item prices — in that case total ≈ subtotal with no separate tax addition, so tax must be null. Verify: does subtotal + tax ≈ total? If not, set tax to null.
- tip: tip/gratuity as a flat amount, only if it appears as a separate line added to reach the total. If not shown, null.
- subtotal: the pre-tax/tip subtotal line as printed on the receipt. If the receipt shows no explicit subtotal line distinct from the total, null.
- total: final total charged.
- Use numbers, not strings, for all monetary values.
- confidence: "low" if the image is not clearly readable as a receipt, is blurry, not a receipt at all, or you cannot extract items with confidence. "medium" if the receipt is readable but some items or amounts are partially obscured, small, or uncertain. "high" if clearly readable with high confidence in all extracted values.
`;

export interface ParsedReceipt {
  title: string | null;
  items: Array<{ name: string; price: number; quantity: number }>;
  tax: number | null;
  tip: number | null;
  subtotal: number | null;
  total: number | null;
  confidence: "high" | "medium" | "low";
}

export async function parseReceiptFromGcs(
  gcsUri: string,
  mimeType: "image/jpeg" | "image/png"
): Promise<ParsedReceipt> {
  const project =
    process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT;

  const vertexAI = new VertexAI({ project, location: LOCATION });
  const generativeModel = vertexAI.getGenerativeModel(
    {
      model: MODEL,
      generationConfig: { responseMimeType: "application/json" },
    },
    {
      customHeaders: new Headers({ "X-Vertex-AI-LLM-Shared-Request-Type": "shared" }),
    }
  );

  const startMs = Date.now();
  const result = await generativeModel.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: PROMPT },
          { fileData: { fileUri: gcsUri, mimeType } },
        ],
      },
    ],
  });
  const durationMs = Date.now() - startMs;

  const usage = result.response.usageMetadata;
  logger.info({
    msg: "gemini_call_complete",
    durationMs,
    inputTokens: usage?.promptTokenCount,
    outputTokens: usage?.candidatesTokenCount,
    totalTokens: usage?.totalTokenCount,
    model: MODEL,
  });

  const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return JSON.parse(text) as ParsedReceipt;
}
