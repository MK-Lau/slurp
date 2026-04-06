import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Serves Firebase client config from server-side env vars set by Terraform
// on the Cloud Run service — nothing is baked into the Docker image.
export async function GET(): Promise<NextResponse> {
  const res = NextResponse.json({
    apiKey: process.env.FIREBASE_API_KEY ?? "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.FIREBASE_PROJECT_ID ?? "",
    appId: process.env.FIREBASE_APP_ID ?? "",
    apiUrl: process.env.API_URL ?? "http://localhost:8080",
    firestoreDatabase: process.env.FIRESTORE_DATABASE ?? "slurp-dev",
    appUrl: process.env.APP_URL ?? "",
  });
  res.headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  return res;
}
