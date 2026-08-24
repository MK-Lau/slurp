import { SchemaType, VertexAI } from "@google-cloud/vertexai";
import pino from "pino";

const logger = pino();
const MODEL = "gemini-3.5-flash-lite";
// gemini-3.5-flash-lite is only served from the "global" location, not us-central1.
const LOCATION = "global";

const RECEIPT_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING, nullable: true },
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name:     { type: SchemaType.STRING },
          price:    { type: SchemaType.NUMBER },
          quantity: { type: SchemaType.INTEGER },
        },
        required: ["name", "price", "quantity"],
      },
    },
    tax:        { type: SchemaType.NUMBER, nullable: true },
    tip:        { type: SchemaType.NUMBER, nullable: true },
    subtotal:   { type: SchemaType.NUMBER, nullable: true },
    total:      { type: SchemaType.NUMBER, nullable: true },
    confidence: { type: SchemaType.STRING, enum: ["high", "medium", "low"] },
  },
  required: ["title", "items", "tax", "tip", "subtotal", "total", "confidence"],
};

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
- tax: ONLY extract tax as a flat dollar/euro amount if it appears as a SEPARATE line that is ADDED ON TOP of the subtotal to reach the final total (i.e. total ≈ subtotal + tax). In many countries (EU, Canada, etc.) tax/VAT/IVA is already included in item prices — in that case total ≈ subtotal with no separate tax addition, so tax must be the JSON value null — not the number 0. Verify: does subtotal + tax ≈ total? If not, set tax to null (not 0).
- tip: tip/gratuity as a flat amount, only if it is an amount that was ACTUALLY ADDED to the bill and reflected in the total. Do NOT confuse a printed suggested-tip guide (e.g. "15% / 18% / 20%" gratuity suggestion table) or a gratuity/service-charge disclaimer with an actual charged tip — those are not tip. If no tip was actually charged, tip must be the JSON value null — not the number 0.
- subtotal: the pre-tax/tip amount, ONLY if it is printed as its own explicit line on the receipt distinct from the final total line — this includes lines labeled "Subtotal"/"Sub Total" as well as equivalent pre-tax base labels in any language (e.g. "Base Impuestos", "Base Imponible", "Taxable Base"). If such a line IS printed, report its value even if that value happens to equal the total or equal the sum of the items — a correct subtotal is expected to match the item sum, that is not a reason to null it. Only use null when the receipt has no separate subtotal/base line printed at all (e.g. it shows only a single total and nothing else). Do not invent a subtotal by computing it yourself when no such line was printed.
- total: final total charged.
- Use numbers, not strings, for all monetary values.
- confidence: before choosing confidence, check: (1) does subtotal + tax + tip ≈ total, when all three are non-null? (2) does the sum of item prices ≈ subtotal, when subtotal is non-null? (3) did you have to guess between an actual charge and a suggested/disclaimer amount for tip? Use "low" if the image is not clearly readable as a receipt, is blurry, not a receipt at all, or you cannot extract items with confidence. Use "medium" if the receipt is readable but some items or amounts are partially obscured, small, or uncertain, OR if any of the checks above fail to reconcile, OR if you had to guess on an ambiguous tip/subtotal. Use "high" only if clearly readable AND all checks above reconcile.
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

  // The SDK builds its default endpoint as `${location}-aiplatform.googleapis.com`,
  // which doesn't exist for "global" — override with the bare host it actually serves from.
  const vertexAI = new VertexAI({ project, location: LOCATION, apiEndpoint: "aiplatform.googleapis.com" });
  const generativeModel = vertexAI.getGenerativeModel(
    {
      model: MODEL,
      generationConfig: { responseMimeType: "application/json", responseSchema: RECEIPT_SCHEMA },
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
