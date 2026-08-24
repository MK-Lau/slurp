export function isLoopbackUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "http:") return false;
    return u.hostname === "127.0.0.1" || u.hostname === "localhost";
  } catch {
    return false;
  }
}

/**
 * True only when all E2E safety conditions are exactly met:
 * - ENVIRONMENT exactly "e2e"
 * - RECEIPT_PARSER exactly "fixture"
 * - GOOGLE_CLOUD_PROJECT or FIREBASE_PROJECT_ID exactly "slurp-e2e"
 * - FIRESTORE_EMULATOR_HOST loopback (127.0.0.1 or localhost) with an explicit port
 */
export function isSafeE2eRuntime(env: {
  ENVIRONMENT?: string;
  RECEIPT_PARSER?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  FIREBASE_PROJECT_ID?: string;
  FIRESTORE_EMULATOR_HOST?: string;
}): boolean {
  if (env.ENVIRONMENT !== "e2e") return false;
  if (env.RECEIPT_PARSER !== "fixture") return false;
  const projectIds = [env.GOOGLE_CLOUD_PROJECT, env.FIREBASE_PROJECT_ID].filter(
    (v): v is string => typeof v === "string" && v.length > 0
  );
  if (projectIds.length === 0) return false;
  if (projectIds.some((v) => v !== "slurp-e2e")) return false;
  const host = env.FIRESTORE_EMULATOR_HOST?.trim();
  if (!host) return false;
  // Accept optional http(s):// prefix, then require 127.0.0.1 or localhost with colon + port.
  const normalized = host.replace(/^https?:\/\//, "");
  const LOOPBACK_WITH_PORT = /^(127\.0\.0\.1|localhost):\d+$/;
  if (!LOOPBACK_WITH_PORT.test(normalized)) return false;
  return true;
}

export function isFixtureParserEnabled(env: {
  ENVIRONMENT?: string;
  RECEIPT_PARSER?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  FIREBASE_PROJECT_ID?: string;
  FIRESTORE_EMULATOR_HOST?: string;
}): boolean {
  return isSafeE2eRuntime(env);
}

export function isE2eUploadEnabled(env: {
  ENVIRONMENT?: string;
  RECEIPT_PARSER?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  FIREBASE_PROJECT_ID?: string;
  FIRESTORE_EMULATOR_HOST?: string;
}): boolean {
  return isSafeE2eRuntime(env);
}
