import type { ParsedReceipt } from "./gemini";
import { parseReceiptFromGcs } from "./gemini";
import { parseFixtureReceipt } from "./fixtureParser";
import { isSafeE2eRuntime } from "./config/e2eReceiptConfig";

export type { ParsedReceipt };

export async function parseReceipt(
  gcsUri: string,
  mimeType: "image/jpeg" | "image/png"
): Promise<ParsedReceipt> {
  if (isSafeE2eRuntime(process.env as Record<string, string | undefined>)) {
    return parseFixtureReceipt();
  }
  return parseReceiptFromGcs(gcsUri, mimeType);
}
