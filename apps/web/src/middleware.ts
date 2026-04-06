import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const apiUrl = process.env.API_URL ?? "http://localhost:8080";
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID ?? "";
const appUrl = process.env.APP_URL ?? "";

export function middleware(request: NextRequest): NextResponse {
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
    `connect-src 'self' ${apiUrl} https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com/recaptcha/`,
    `frame-src https://accounts.google.com${firebaseProjectId ? ` https://${firebaseProjectId}.firebaseapp.com` : ""}${appUrl ? ` ${appUrl}` : ""} https://www.google.com/recaptcha/ https://recaptcha.google.com`,
  ].join("; ");

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
