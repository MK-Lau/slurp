/**
 * Receipt parser evaluation script.
 * Discovers test cases dynamically from gs://slurp-test-images/ and scores
 * model+prompt combinations against the ground-truth correct.json files.
 *
 * Usage:
 *   GOOGLE_CLOUD_PROJECT=your-gcp-project-id npx tsx scripts/test-prompts.ts [options]
 *
 * Options:
 *   --model <id>          Model to test (repeatable; default: gemini-2.5-flash)
 *                         Gemini models are routed via Vertex AI.
 *                         Other models (e.g. qwen/qwen2.5-vl-32b-instruct) are
 *                         routed via OpenRouter and require OPENROUTER_API_KEY.
 *   --prompt <file>       Path to prompt .txt file (repeatable; default: scripts/prompts/production.txt)
 */
import { GoogleAuth } from "google-auth-library";
import * as fs from "fs";
import * as path from "path";

// --- Types ---

interface ParsedReceipt {
  title: string | null;
  items: Array<{ name: string; price: number; quantity: number }>;
  tax: number | null;
  tip: number | null;
  subtotal: number | null;
  total: number | null;
  confidence: "high" | "medium" | "low";
}

interface TestCase {
  id: string;
  mimeType: "image/jpeg" | "image/png";
  correct: ParsedReceipt;
  imageBase64: string;
}

// --- ANSI helpers ---

const G = "\x1b[32m";  // green
const R = "\x1b[31m";  // red
const Y = "\x1b[33m";  // yellow
const B = "\x1b[1m";   // bold
const D = "\x1b[2m";   // dim
const X = "\x1b[0m";   // reset

// --- Constants ---

const BUCKET = process.env.TEST_IMAGES_BUCKET ?? "slurp-test-images";
const LOCATION = "us-central1";
const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_PROMPT_FILE = path.join(path.dirname(process.argv[1]), "prompts/production.txt");
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// --- Arg parsing ---

function parseArgs(): { models: string[]; promptFiles: string[]; only: string[] } {
  const args = process.argv.slice(2);
  const models: string[] = [];
  const promptFiles: string[] = [];
  const only: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) {
      models.push(args[++i]);
    } else if (args[i] === "--prompt" && args[i + 1]) {
      promptFiles.push(args[++i]);
    } else if (args[i] === "--tests" && args[i + 1]) {
      only.push(...args[++i].split(",").map((s) => s.trim()));
    }
  }

  return {
    models: models.length > 0 ? models : [DEFAULT_MODEL],
    promptFiles: promptFiles.length > 0 ? promptFiles : [DEFAULT_PROMPT_FILE],
    only,
  };
}

// --- GCS helpers ---

async function gcsDownload(token: string, objectName: string): Promise<Buffer> {
  const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(objectName)}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`GCS download failed for "${objectName}": HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function gcsListObjects(token: string): Promise<string[]> {
  const names: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GCS list failed: HTTP ${res.status}`);

    const data = (await res.json()) as { items?: Array<{ name: string }>; nextPageToken?: string };
    for (const item of data.items ?? []) names.push(item.name);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return names;
}

// Discover test IDs from object listing (any prefix with a correct.json)
function discoverTestIds(objects: string[]): string[] {
  const dirs = new Set<string>();
  for (const name of objects) {
    const m = name.match(/^([^/]+)\/info\.json$/);
    if (m) dirs.add(m[1]);
  }
  return Array.from(dirs).sort((a, b) => {
    const na = parseInt(a.replace(/\D+/g, ""), 10) || 0;
    const nb = parseInt(b.replace(/\D+/g, ""), 10) || 0;
    return na !== nb ? na - nb : a.localeCompare(b);
  });
}

async function loadTestCase(token: string, id: string, objects: string[]): Promise<TestCase> {
  const imageObj = objects.find(
    (name) => name.startsWith(`${id}/`) && !name.endsWith("info.json") && !name.endsWith("info.txt")
  );
  if (!imageObj) throw new Error(`No image found for test "${id}"`);

  const ext = path.extname(imageObj).toLowerCase();
  const mimeType: "image/jpeg" | "image/png" = ext === ".png" ? "image/png" : "image/jpeg";

  const [infoBuf, imageBuf] = await Promise.all([
    gcsDownload(token, `${id}/info.json`),
    gcsDownload(token, imageObj),
  ]);

  const correct = JSON.parse(infoBuf.toString("utf-8")) as ParsedReceipt;
  return { id, mimeType, correct, imageBase64: imageBuf.toString("base64") };
}

// --- Model routing ---

function isGeminiModel(model: string): boolean {
  return model.startsWith("gemini-");
}

// --- Vertex AI call ---

async function callVertexAI(
  token: string,
  model: string,
  prompt: string,
  imageBase64: string,
  mimeType: string,
  project: string
): Promise<{ parsed: ParsedReceipt; durationMs: number; totalTokens: number }> {
  const url =
    `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${LOCATION}/publishers/google/models/${model}:generateContent`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json" },
  };

  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const durationMs = Date.now() - start;

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vertex AI error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as any;
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const totalTokens: number = data.usageMetadata?.totalTokenCount ?? 0;

  const json = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
  const parsed = JSON.parse(json) as ParsedReceipt;

  return { parsed, durationMs, totalTokens };
}

// --- OpenRouter call (OpenAI-compatible, used for non-Gemini models) ---

async function callOpenRouter(
  apiKey: string,
  model: string,
  prompt: string,
  imageBase64: string,
  mimeType: string
): Promise<{ parsed: ParsedReceipt; durationMs: number; totalTokens: number }> {
  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
    response_format: { type: "json_object" },
  };

  const start = Date.now();
  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const durationMs = Date.now() - start;

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as any;
  const text: string = data.choices?.[0]?.message?.content ?? "";
  const totalTokens: number = data.usage?.total_tokens ?? 0;

  const json = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
  const parsed = JSON.parse(json) as ParsedReceipt;

  return { parsed, durationMs, totalTokens };
}

// --- Diff logic ---

const EPS = 0.01;

function numEq(a: number | null | undefined, b: number | null | undefined): boolean {
  if ((a == null) && (b == null)) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= EPS;
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

interface DiffResult {
  perfect: boolean;
  lines: string[];
}

function diffReceipts(correct: ParsedReceipt, actual: ParsedReceipt): DiffResult {
  const lines: string[] = [];
  let perfect = true;

  // Scalar fields
  const scalars = ["title", "tax", "tip", "subtotal", "total", "confidence"] as const;
  for (const field of scalars) {
    const exp = correct[field];
    const got = actual[field];
    const pad = field.padEnd(11);

    const match =
      typeof exp === "number" || typeof got === "number"
        ? numEq(exp as number | null, got as number | null)
        : typeof exp === "string" && typeof got === "string"
          ? exp.toLowerCase() === got.toLowerCase()
          : exp === got;

    if (match) {
      lines.push(`  ${G}✓${X}  ${pad}  ${D}${fmtVal(exp)}${X}`);
    } else {
      perfect = false;
      lines.push(`  ${R}✗${X}  ${pad}  expected=${R}${fmtVal(exp)}${X}  got=${Y}${fmtVal(got)}${X}`);
    }
  }

  // Items: match by name (case-insensitive), then report diffs/missing/extra
  const expItems = correct.items ?? [];
  const gotItems = actual.items ?? [];
  const matchedExp = new Set<number>();
  const matchedGot = new Set<number>();
  const itemLines: string[] = [];
  let itemPerfect = true;

  for (let gi = 0; gi < gotItems.length; gi++) {
    const got = gotItems[gi];
    const ei = expItems.findIndex(
      (e, idx) => !matchedExp.has(idx) && e.name.toLowerCase() === got.name.toLowerCase()
    );
    if (ei < 0) continue;
    matchedExp.add(ei);
    matchedGot.add(gi);

    const exp = expItems[ei];
    const priceOk = numEq(exp.price, got.price);
    const qtyOk = exp.quantity === got.quantity;

    if (priceOk && qtyOk) {
      itemLines.push(`    ${G}✓${X}  ${got.name}  ${D}price=${got.price} qty=${got.quantity}${X}`);
    } else {
      itemPerfect = false;
      const nameDiff = exp.name.toLowerCase() !== got.name.toLowerCase()
        ? ` name: expected=${R}${exp.name}${X} got=${Y}${got.name}${X}`
        : ``;
      const priceDiff = !priceOk
        ? ` price: expected=${R}${exp.price}${X} got=${Y}${got.price}${X}`
        : ` price=${D}${got.price}${X}`;
      const qtyDiff = !qtyOk
        ? ` qty: expected=${R}${exp.quantity}${X} got=${Y}${got.quantity}${X}`
        : ` qty=${D}${got.quantity}${X}`;
      itemLines.push(`    ${R}✗${X}  ${got.name}${nameDiff}${priceDiff}${qtyDiff}`);
    }
  }

  // Missing items (in expected but unmatched) — show full expected values
  for (let ei = 0; ei < expItems.length; ei++) {
    if (!matchedExp.has(ei)) {
      itemPerfect = false;
      const e = expItems[ei];
      itemLines.push(`    ${R}−${X}  ${e.name}  ${D}price=${e.price} qty=${e.quantity}${X}  ${R}(missing)${X}`);
    }
  }

  // Extra items (in actual but unmatched) — show full actual values
  for (let gi = 0; gi < gotItems.length; gi++) {
    if (!matchedGot.has(gi)) {
      itemPerfect = false;
      const g = gotItems[gi];
      itemLines.push(`    ${Y}+${X}  ${g.name}  ${D}price=${g.price} qty=${g.quantity}${X}  ${Y}(extra)${X}`);
    }
  }

  if (!itemPerfect) perfect = false;

  const matched = matchedExp.size;
  const itemHeader = itemPerfect
    ? `  ${G}✓${X}  ${"items".padEnd(11)}  ${D}${matched}/${expItems.length} matched${X}`
    : `  ${R}✗${X}  ${"items".padEnd(11)}  ${matched}/${expItems.length} matched`;
  lines.push(itemHeader);
  lines.push(...itemLines);

  return { perfect, lines };
}

// --- Main ---

async function main() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) {
    console.error("GOOGLE_CLOUD_PROJECT env var is required");
    process.exit(1);
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY ?? null;

  const { models, promptFiles, only } = parseArgs();

  // Load prompt files
  const prompts = promptFiles.map((file) => {
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) {
      console.error(`Prompt file not found: ${abs}`);
      process.exit(1);
    }
    return { label: path.basename(file, ".txt"), text: fs.readFileSync(abs, "utf-8").trimEnd() };
  });

  // Get ADC token
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const tokenRes = await client.getAccessToken();
  const token = tokenRes.token;
  if (!token) throw new Error("Failed to obtain ADC token");

  // Discover and load test cases
  process.stdout.write(`${D}Listing gs://${BUCKET}/...${X}\n`);
  const objects = await gcsListObjects(token);
  const testIds = discoverTestIds(objects);

  if (testIds.length === 0) {
    console.error("No test cases found in bucket (expected subdirectories with correct.json)");
    process.exit(1);
  }

  const filteredIds = only.length > 0 ? testIds.filter((id) => only.includes(id)) : testIds;
  process.stdout.write(`Found ${filteredIds.length} test cases: ${D}${filteredIds.join(", ")}${X}\n`);
  process.stdout.write(`${D}Downloading images...${X}\n`);
  const testCases = await Promise.all(filteredIds.map((id) => loadTestCase(token, id, objects)));

  // Cross-product: models × prompts
  const combos = models.flatMap((model) => prompts.map((prompt) => ({ model, prompt })));

  const summaries: Array<{
    label: string;
    score: number;
    total: number;
    avgLatencySec: number;
    avgTokens: number;
  }> = [];

  for (const { model, prompt } of combos) {
    const hr = "━".repeat(62);
    console.log(`\n${hr}`);
    console.log(`  ${B}Model:${X}  ${model}`);
    console.log(`  ${B}Prompt:${X} ${prompt.label}`);
    console.log(hr);

    let perfectCount = 0;
    let totalLatencyMs = 0;
    let totalTokens = 0;
    let ran = 0;

    for (const tc of testCases) {
      let result: Awaited<ReturnType<typeof callVertexAI>> | null = null;
      let errorMsg: string | null = null;

      try {
        if (isGeminiModel(model)) {
          result = await callVertexAI(token, model, prompt.text, tc.imageBase64, tc.mimeType, project);
        } else {
          if (!openRouterKey) throw new Error("OPENROUTER_API_KEY env var is required for non-Gemini models");
          result = await callOpenRouter(openRouterKey, model, prompt.text, tc.imageBase64, tc.mimeType);
        }
      } catch (e) {
        errorMsg = (e as Error).message;
      }

      if (errorMsg || !result) {
        console.log(`\n${R}✗ [${tc.id}] ERROR: ${errorMsg}${X}`);
        continue;
      }

      ran++;
      totalLatencyMs += result.durationMs;
      totalTokens += result.totalTokens;

      const diff = diffReceipts(tc.correct, result.parsed);
      if (diff.perfect) perfectCount++;

      const icon = diff.perfect ? `${G}✓${X}` : `${R}✗${X}`;
      const title = result.parsed.title ?? tc.id;
      const meta = `${D}(${(result.durationMs / 1000).toFixed(1)}s, ${result.totalTokens} tokens)${X}`;
      console.log(`\n${icon} [${tc.id}] ${B}${title}${X}  ${meta}`);
      console.log(diff.lines.join("\n"));
    }

    const avgLatencySec = ran > 0 ? totalLatencyMs / ran / 1000 : 0;
    const avgTokens = ran > 0 ? Math.round(totalTokens / ran) : 0;
    const scoreColor = perfectCount === ran ? G : perfectCount >= ran * 0.7 ? Y : R;

    console.log(
      `\n${B}SUMMARY${X}: ${scoreColor}${perfectCount}/${ran} perfect${X}` +
        `  |  avg latency: ${avgLatencySec.toFixed(1)}s` +
        `  |  avg tokens: ${avgTokens}`
    );

    summaries.push({
      label: `${model} / ${prompt.label}`,
      score: perfectCount,
      total: ran,
      avgLatencySec,
      avgTokens,
    });
  }

  // Cross-combo comparison table (only when >1 combo)
  if (combos.length > 1) {
    const hr = "━".repeat(62);
    console.log(`\n${hr}`);
    console.log(`  ${B}COMPARISON${X}`);
    console.log(hr);
    const maxLen = Math.max(...summaries.map((s) => s.label.length));
    for (const s of summaries) {
      const score = `${s.score}/${s.total}`;
      const c = s.score === s.total ? G : s.score >= s.total * 0.7 ? Y : R;
      console.log(
        `  ${s.label.padEnd(maxLen)}  ${c}${score.padStart(5)} perfect${X}` +
          `  ${D}${s.avgLatencySec.toFixed(1)}s / ${s.avgTokens} tok${X}`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
