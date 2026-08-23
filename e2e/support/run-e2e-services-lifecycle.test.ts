/** @jest-environment node */

import { spawn, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { join } from "node:path";

const ports = [3100, 8081, 8082];

function isOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

async function waitUntil(check: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("lifecycle condition timed out");
}

function exited(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => child.once("exit", () => resolve()));
}

describe("run-e2e-services lifecycle", () => {
  jest.setTimeout(25_000);

  it("closes every descendant-owned port when the orchestrator is terminated", async () => {
    expect(await Promise.all(ports.map(isOpen))).toEqual([false, false, false]);
    const child = spawn(process.execPath, [join(process.cwd(), "scripts/run-e2e-services.mjs")], {
      cwd: process.cwd(),
      env: { ...process.env, E2E_LIFECYCLE_FIXTURE: "1" },
      stdio: "ignore",
    });
    try {
      await waitUntil(async () => (await Promise.all(ports.map(isOpen))).every(Boolean));
      const done = exited(child);
      child.kill("SIGTERM");
      await done;
      await waitUntil(async () => (await Promise.all(ports.map(isOpen))).every((open) => !open));
      expect(await Promise.all(ports.map(isOpen))).toEqual([false, false, false]);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  });

  it("exits nonzero and closes other trees when a service exits", async () => {
    expect(await Promise.all(ports.map(isOpen))).toEqual([false, false, false]);
    const child = spawn(process.execPath, [join(process.cwd(), "scripts/run-e2e-services.mjs")], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        E2E_LIFECYCLE_FIXTURE: "1",
        E2E_LIFECYCLE_FIXTURE_FAIL_PORT: "3100",
      },
      stdio: "ignore",
    });
    try {
      const exit = new Promise<number | null>((resolve) => child.once("exit", resolve));
      const code = await exit;
      expect(code).not.toBe(0);
      await waitUntil(async () => (await Promise.all(ports.map(isOpen))).every((open) => !open));
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  });
});
