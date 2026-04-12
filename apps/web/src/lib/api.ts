import { getConfig } from "./config";
import { getFirebaseAuth } from "./firebase";

const inFlight = new Map<string, Promise<unknown>>();

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const config = await getConfig();
  const method = (options.method ?? "GET").toUpperCase();
  const url = `${config.apiUrl}${path}`;

  const user = getFirebaseAuth().currentUser;
  const cacheKey = `${url}:${user?.uid ?? "anon"}`;

  if (method === "GET" && inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey) as Promise<T>;
  }

  const token = user ? await user.getIdToken() : null;

  const promise = fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = (body as { error?: string }).error;
      if (message) throw new Error(message);
      if (res.status === 429) throw new Error("Too many requests, please try again later");
      throw new Error(`HTTP ${res.status}`);
    }
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as T;
    }
    return res.json() as T;
  }).finally(() => {
    inFlight.delete(cacheKey);
  });

  // Only deduplicate GET requests — mutations must never be collapsed
  if (method === "GET") inFlight.set(cacheKey, promise);
  return promise;
}
