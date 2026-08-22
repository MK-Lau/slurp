const LOOPBACK_RE = /^127\.0\.0\.1(?::\d+)?$|^localhost(?::\d+)?$/;

function assertLoopback(host: string | undefined, label: string): string {
  if (!host) throw new Error(`${label} is not set — refusing to reset non-emulator endpoint`);
  const normalized = host.replace(/^https?:\/\//, "");
  if (!LOOPBACK_RE.test(normalized)) {
    throw new Error(`${label} must be loopback (got ${host}) — refusing to reset real project`);
  }
  return normalized;
}

export function emulatorHosts(): { firestoreHost: string; authHost: string; projectId: string } {
  const firestoreHost = assertLoopback(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST");
  const authHost = assertLoopback(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST");
  const configuredProjectIds = [
    process.env.GOOGLE_CLOUD_PROJECT,
    process.env.FIREBASE_PROJECT_ID,
  ].filter((value): value is string => Boolean(value));
  const projectId = configuredProjectIds[0] ?? "";
  if (!projectId) throw new Error("GOOGLE_CLOUD_PROJECT / FIREBASE_PROJECT_ID not set");
  if (configuredProjectIds.some((value) => value !== "slurp-e2e")) {
    throw new Error(`all configured project IDs must be slurp-e2e (got ${configuredProjectIds.join(", ")}) — refusing to reset real project`);
  }
  return { firestoreHost, authHost, projectId };
}

export async function clearFirestoreDocs(projectId?: string): Promise<void> {
  const { firestoreHost, projectId: pid } = emulatorHosts();
  const prj = projectId ?? pid;
  if (prj !== "slurp-e2e") {
    throw new Error(`projectId must be slurp-e2e (got ${prj}) — refusing to reset real project`);
  }
  const url = `http://${firestoreHost}/emulator/v1/projects/${prj}/databases/(default)/documents`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to clear Firestore emulator: ${res.status} ${body}`);
  }
}

export async function clearAuthEmulator(): Promise<void> {
  const { authHost, projectId } = emulatorHosts();
  const url = `http://${authHost}/emulator/v1/projects/${projectId}/accounts`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to clear Auth emulator: ${res.status} ${body}`);
  }
}

export async function resetEmulators(): Promise<void> {
  await Promise.all([clearFirestoreDocs(), clearAuthEmulator()]);
}
