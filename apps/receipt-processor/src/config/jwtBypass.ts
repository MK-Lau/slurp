import { isSafeE2eRuntime } from "./e2eReceiptConfig";

/**
 * Pure predicate for the Pub/Sub JWT bypass.
 * - Only exact ENVIRONMENT=local may bypass without further checks (legacy local).
 * - Missing/unknown ENVIRONMENT does NOT bypass (requires JWT verification).
 * - ENVIRONMENT=e2e bypasses only when the full safe E2E runtime holds.
 */
export function shouldBypassJwtVerification(env: {
  ENVIRONMENT?: string;
  RECEIPT_PARSER?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  FIREBASE_PROJECT_ID?: string;
  FIRESTORE_EMULATOR_HOST?: string;
}): boolean {
  if (env.ENVIRONMENT === "local") return true;
  if (isSafeE2eRuntime(env)) return true;
  return false;
}

/**
 * Never expose an unauthenticated processor beyond the local machine.
 * Authenticated Cloud Run deployments must continue to accept external traffic.
 */
export function receiptProcessorListenHost(env: Parameters<typeof shouldBypassJwtVerification>[0]): string {
  return shouldBypassJwtVerification(env) ? "127.0.0.1" : "0.0.0.0";
}
