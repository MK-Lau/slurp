import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const apiUrl = process.env.API_URL ?? "http://localhost:8080";
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID ?? "";
const appUrl = process.env.APP_URL ?? "";

export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    "default-src 'self'",
    // 'unsafe-inline' removed — Next.js inline scripts use the per-request nonce instead.
    // 'unsafe-eval' removed — not needed in production by Next.js or Firebase Auth.
    `script-src 'self' 'nonce-${nonce}' https://apis.google.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/`,
    // 'unsafe-inline' kept for styles — required by next/font which injects an inline <style> for font variables.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${apiUrl} https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com/recaptcha/`,
    `frame-src https://accounts.google.com${firebaseProjectId ? ` https://${firebaseProjectId}.firebaseapp.com` : ""}${appUrl ? ` ${appUrl}` : ""} https://www.google.com/recaptcha/ https://recaptcha.google.com`,
  ].join("; ");

  // Forward the nonce to Next.js via x-nonce so it applies the nonce to the
  // inline scripts it generates during SSR (e.g. __NEXT_DATA__).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
