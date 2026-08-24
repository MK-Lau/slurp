export function isLoopbackUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "http:") return false;
    return u.hostname === "127.0.0.1" || u.hostname === "localhost";
  } catch {
    return false;
  }
}

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
  const normalized = host.replace(/^https?:\/\//, "");
  const LOOPBACK_WITH_PORT = /^(127\.0\.0\.1|localhost):\d+$/;
  if (!LOOPBACK_WITH_PORT.test(normalized)) return false;
  return true;
}

export function resolveE2eUploadBaseUrl(env: {
  ENVIRONMENT?: string;
  E2E_RECEIPT_UPLOAD_BASE_URL?: string;
  RECEIPT_PARSER?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  FIREBASE_PROJECT_ID?: string;
  FIRESTORE_EMULATOR_HOST?: string;
}): string | undefined {
  const raw = env.E2E_RECEIPT_UPLOAD_BASE_URL?.trim();
  if (!raw) return undefined;

  if (!isLoopbackUrl(raw)) {
    throw new Error("E2E_RECEIPT_UPLOAD_BASE_URL must be a loopback URL (http://127.0.0.1:* or http://localhost:*)");
  }

  const normalized = raw.replace(/\/+$/, "");

  if (!isSafeE2eRuntime(env)) {
    throw new Error(
      "E2E_RECEIPT_UPLOAD_BASE_URL is only allowed when safe E2E runtime is active (ENVIRONMENT=e2e, RECEIPT_PARSER=fixture, project slurp-e2e, FIRESTORE_EMULATOR_HOST loopback with port)"
    );
  }

  return normalized;
}
