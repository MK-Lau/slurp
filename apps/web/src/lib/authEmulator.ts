/**
 * Validates that an Auth emulator URL is loopback-only (http://127.0.0.1:* or http://localhost:*).
 * Guards against accidentally enabling emulator wiring against production.
 */
export function isLoopbackUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:") return false;
    return u.hostname === "127.0.0.1" || u.hostname === "localhost";
  } catch {
    return false;
  }
}

export function getLoopbackAuthEmulatorUrl(url: string | undefined): string {
  const trimmed = url?.trim() ?? "";
  return isLoopbackUrl(trimmed) ? trimmed : "";
}
