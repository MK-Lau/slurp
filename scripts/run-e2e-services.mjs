#!/usr/bin/env node
/**
 * Portable e2e service orchestrator.
 * - Passes env via spawn options (no shell quoting needed, handles "(default)" safely).
 * - Refuses occupied ports, then waits for processor, web, and API readiness.
 * - Propagates child failures and terminates all children on signals.
 */
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { promisify } from "node:util";

const delay = promisify(setTimeout);
const execFileAsync = promisify(execFile);
const runId = randomUUID();

const children = [];

function log(prefix, chunk, isError = false) {
  const text = chunk.toString();
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.length === 0) continue;
    const out = `[${prefix}] ${line}\n`;
    if (isError) process.stderr.write(out);
    else process.stdout.write(out);
  }
}

function spawnService(name, npmArgs, envOverrides) {
  const env = { ...process.env, ...envOverrides, SLURP_E2E_ORCHESTRATOR_ID: runId };
  const fixtureMode = process.env.E2E_LIFECYCLE_FIXTURE === "1";
  const command = fixtureMode ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
  const args = fixtureMode
    ? ["e2e/support/lifecycle-fixture.mjs", envOverrides.PORT]
    : npmArgs;
  const child = spawn(command, args, {
    env,
    // Keep services in the webServer command's process group. Playwright kills
    // that group when it tears down the command; putting every service in a
    // separate detached group leaves their npm/tsx/next descendants orphaned.
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push({ name, child });
  child.stdout.on("data", (d) => log(name, d, false));
  child.stderr.on("data", (d) => log(name, d, true));
  child.on("exit", (code, signal) => {
    // If exit is due to our killAll during shutdown, don't treat as failure.
    // shuttingDown flag handles that.
    if (shuttingDown) return;
    if (code !== null && code !== 0) {
      console.error(`[orchestrator] ${name} exited with code ${code} — terminating`);
      void shutdown(code);
      return;
    }
    if (signal) {
      console.error(`[orchestrator] ${name} terminated by signal ${signal} — terminating`);
      void shutdown(1);
      return;
    }
    // code 0 with no signal but unexpected early exit -> fail
    // (should only happen if child exits cleanly unexpectedly)
    console.error(`[orchestrator] ${name} exited unexpectedly (code=${code}) — terminating`);
    void shutdown(1);
  });
  child.on("error", (err) => {
    console.error(`[orchestrator] failed to spawn ${name}: ${err.message}`);
    void shutdown(1);
  });
  return child;
}

let shuttingDown = false;
async function signalProcessTree(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    const args = ["/pid", String(child.pid), "/t"];
    if (signal === "SIGKILL") args.push("/f");
    try { await execFileAsync("taskkill", args); } catch {}
    return;
  }

  // Services share Playwright's process group for external teardown. For a
  // service/readiness failure, explicitly walk its subtree so npm wrappers do
  // not orphan tsx/next grandchildren.
  try {
    const { stdout } = await execFileAsync("ps", ["-e", "-o", "pid=", "-o", "ppid="]);
    const byParent = new Map();
    for (const line of stdout.trim().split("\n")) {
      const [pid, ppid] = line.trim().split(/\s+/).map(Number);
      if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue;
      const entries = byParent.get(ppid) ?? [];
      entries.push(pid);
      byParent.set(ppid, entries);
    }
    const descendants = [];
    const visit = (pid) => {
      for (const descendant of byParent.get(pid) ?? []) visit(descendant);
      descendants.push(pid);
    };
    visit(child.pid);
    for (const pid of descendants) {
      try { process.kill(pid, signal); } catch {}
    }
  } catch {
    try { child.kill(signal); } catch {}
  }
}

async function signalChildren(signal) {
  for (const { child } of children) {
    await signalProcessTree(child, signal);
  }
  if (process.platform === "linux") {
    // A failed npm wrapper may already have orphaned its descendants before
    // emitting "exit". Find those processes by the per-run inherited marker.
    let entries = [];
    try { entries = await readdir("/proc"); } catch {}
    for (const entry of entries) {
      if (!/^\d+$/.test(entry) || Number(entry) === process.pid) continue;
      try {
        const environ = await readFile(`/proc/${entry}/environ`, "utf8");
        if (environ.includes(`SLURP_E2E_ORCHESTRATOR_ID=${runId}\0`)) {
          process.kill(Number(entry), signal);
        }
      } catch {}
    }
  } else if (process.platform !== "win32") {
    // If a wrapper exits before shutdown, its descendants are reparented and
    // can no longer be found by walking the wrapper's process tree. macOS does
    // not expose /proc, so locate those descendants by the per-run marker they
    // inherited. The UUID scopes cleanup to this orchestrator invocation.
    try {
      const { stdout } = await execFileAsync(
        "ps",
        ["eww", "-ax", "-o", "pid=", "-o", "command="],
        { maxBuffer: 20 * 1024 * 1024 }
      );
      const marker = `SLURP_E2E_ORCHESTRATOR_ID=${runId}`;
      for (const line of stdout.split("\n")) {
        if (!line.includes(marker)) continue;
        const pid = Number(line.trim().split(/\s+/, 1)[0]);
        if (!Number.isInteger(pid) || pid === process.pid) continue;
        try { process.kill(pid, signal); } catch {}
      }
    } catch {}
  }
}

async function shutdown(exitCode, signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  await signalChildren(signal);
  await Promise.race([
    Promise.all(children.map(({ child }) => child.exitCode !== null || child.signalCode !== null
      ? undefined
      : new Promise((resolve) => child.once("exit", resolve)))),
    delay(2_000),
  ]);
  await signalChildren("SIGKILL");
  await delay(50);
  process.exit(exitCode);
}

function handleSignal(sig) {
  console.error(`[orchestrator] received ${sig} — shutting down children`);
  void shutdown(0, sig);
}

process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));

async function waitFor(url, { timeoutMs = 90_000, intervalMs = 250, label = url } = {}) {
  const start = Date.now();
  let lastErr = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.error(`[orchestrator] ${label} ready (${url})`);
        return;
      }
      lastErr = `status ${res.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label} at ${url} — last error: ${lastErr}`);
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => reject(new Error(`E2E port ${port} is already in use: ${error.message}`)));
    server.listen({ host: "127.0.0.1", port }, () => server.close(resolve));
  });
}

async function main() {
  await Promise.all([3100, 8081, 8082].map(assertPortAvailable));

  console.error("[orchestrator] starting processor on :8082");
  spawnService(
    "processor",
    ["run", "dev", "--workspace=@slurp/receipt-processor"],
    {
      GOOGLE_CLOUD_PROJECT: "slurp-e2e",
      FIRESTORE_DATABASE: "(default)",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
      PORT: "8082",
      ENVIRONMENT: "e2e",
      RECEIPT_BUCKET: "e2e-receipts",
      RECEIPT_PARSER: "fixture",
    }
  );
  await waitFor("http://127.0.0.1:8082/health", { label: "processor /health" });

  console.error("[orchestrator] starting web on :3100");
  spawnService(
    "web",
    ["run", "dev", "--workspace=@slurp/web", "--", "--port", "3100"],
    {
      FIREBASE_PROJECT_ID: "slurp-e2e",
      FIREBASE_API_KEY: "fake-api-key",
      FIREBASE_AUTH_DOMAIN: "slurp-e2e.firebaseapp.com",
      FIREBASE_APP_ID: "1:123:web:e2e",
      FIRESTORE_DATABASE: "(default)",
      FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
      API_URL: "http://127.0.0.1:8081",
      APP_URL: "http://127.0.0.1:3100",
      PORT: "3100",
      GOOGLE_CLOUD_PROJECT: "slurp-e2e",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
      ENVIRONMENT: "e2e",
      E2E_RECEIPT_UPLOAD_BASE_URL: "http://127.0.0.1:8082",
    }
  );
  await waitFor("http://127.0.0.1:3100/api/config", { label: "web /api/config" });

  console.error("[orchestrator] starting api on :8081");
  spawnService(
    "api",
    ["run", "dev", "--workspace=@slurp/api"],
    {
      GOOGLE_CLOUD_PROJECT: "slurp-e2e",
      FIRESTORE_DATABASE: "(default)",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
      PORT: "8081",
      ENVIRONMENT: "e2e",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      ALLOWED_ORIGINS: "http://127.0.0.1:3100",
      RECEIPT_BUCKET: "e2e-receipts",
      RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8082",
      RECEIPT_PARSER: "fixture",
      E2E_RECEIPT_UPLOAD_BASE_URL: "http://127.0.0.1:8082",
    }
  );
  await waitFor("http://127.0.0.1:8081/health", { label: "api /health" });

  console.error("[orchestrator] processor, web, and api are ready");
  // Do not exit; keep process alive until signal or child failure.
  // Playwright will poll http://127.0.0.1:8081/health as its webServer.url.
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(`[orchestrator] fatal: ${err instanceof Error ? err.message : String(err)}`);
  void shutdown(1);
});
