import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getLoopbackAuthEmulatorUrl, isLoopbackUrl } from "@/lib/authEmulator";

const apiUrl = process.env.API_URL ?? "http://localhost:8080";
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID ?? "";
const appUrl = process.env.APP_URL ?? "";
const authEmulatorUrl = getLoopbackAuthEmulatorUrl(process.env.FIREBASE_AUTH_EMULATOR_URL);

function getLoopbackE2eUploadBaseUrl(): string {
  const raw = process.env.E2E_RECEIPT_UPLOAD_BASE_URL?.trim() ?? "";
  if (!raw) return "";
  if (process.env.ENVIRONMENT !== "e2e") return "";
  return isLoopbackUrl(raw) ? raw.replace(/\/+$/, "") : "";
}

export function middleware(request: NextRequest): NextResponse {
  const e2eUploadBaseUrl = getLoopbackE2eUploadBaseUrl();
  const csp = [
    "default-src 'self'",
    // 'unsafe-inline' is required for Firebase Auth and gapi, which inject inline <script> blocks
    // that cannot be controlled with nonces. A nonce-based policy would silently block Firebase
    // Auth initialization (onAuthStateChanged never fires) in CSP3 browsers.
    "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
    // 'unsafe-inline' required by next/font (inline <style> for font variables).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${apiUrl} ${authEmulatorUrl ? `${authEmulatorUrl} ` : ""}${e2eUploadBaseUrl ? `${e2eUploadBaseUrl} ` : ""}https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com/recaptcha/`,
    `frame-src https://accounts.google.com${firebaseProjectId ? ` https://${firebaseProjectId}.firebaseapp.com` : ""}${appUrl ? ` ${appUrl}` : ""}${authEmulatorUrl ? ` ${authEmulatorUrl}` : ""} https://www.google.com/recaptcha/ https://recaptcha.google.com`,
  ].join("; ");

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
