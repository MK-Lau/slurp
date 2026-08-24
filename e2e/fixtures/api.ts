import type { APIRequestContext, Page, Request } from "@playwright/test";
import { expect } from "@playwright/test";

const API_URL = "http://127.0.0.1:8081";

export interface ApiResponse {
  status: number;
  body: any;
  text: string;
}

export function installBearerCapture(page: Page): {
  get: () => string | null;
  wait: (timeoutMs?: number) => Promise<string>;
} {
  let captured: string | null = null;
  const onRequest = (request: Request): void => {
    const authorization = request.headers().authorization;
    if (authorization?.startsWith("Bearer ")) {
      const token = authorization.slice(7).trim();
      if (token.length > 20) captured = token;
    }
  };
  page.on("request", onRequest);
  return {
    get: () => captured,
    wait: async (timeoutMs = 10_000): Promise<string> => {
      await expect.poll(() => captured, { timeout: timeoutMs }).not.toBeNull();
      if (!captured) {
        throw new Error("Timed out waiting for an authenticated app request");
      }
      return captured;
    },
  };
}

export async function apiFetchWithToken(
  request: APIRequestContext,
  path: string,
  token: string,
  options: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown } = {}
): Promise<ApiResponse> {
  const method = options.method ?? "GET";
  const requestOptions = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    data: options.body ?? {},
  };
  const url = `${API_URL}${path}`;
  const response = method === "GET"
    ? await request.get(url, { headers: requestOptions.headers })
    : method === "POST"
      ? await request.post(url, requestOptions)
      : method === "PATCH"
        ? await request.patch(url, requestOptions)
        : method === "PUT"
          ? await request.put(url, requestOptions)
          : await request.delete(url, requestOptions);
  const responseText = await response.text();
  let body: any;
  try {
    body = JSON.parse(responseText);
  } catch {
    body = responseText;
  }
  return { status: response.status(), body, text: responseText };
}
