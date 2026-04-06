export interface AppConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  apiUrl: string;
  firestoreDatabase: string;
  appUrl: string;
}

let cached: AppConfig | null = null;
let pending: Promise<AppConfig> | null = null;

export async function getConfig(): Promise<AppConfig> {
  if (cached) return cached;
  if (typeof document !== "undefined") {
    const el = document.getElementById("__app_config__");
    if (el?.textContent) {
      try {
        const parsed = JSON.parse(el.textContent) as AppConfig;
        if (parsed.apiKey) {
          cached = parsed;
          return cached;
        }
      } catch (_) { /* malformed inline config — fall through to fetch */ }
    }
  }
  if (pending) return pending;
  pending = fetch("/api/config")
    .then((r) => r.json() as Promise<AppConfig>)
    .then((c) => {
      cached = c;
      return c;
    });
  return pending;
}
