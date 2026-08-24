import { spawn } from "node:child_process";
import { createServer } from "node:http";

if (process.argv[2] === "--server") {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"status":"ok"}');
  });
  server.listen(Number(process.argv[3]), "127.0.0.1");
} else {
  // Model the npm -> tsx/next hierarchy: the direct child deliberately does
  // not own the port, so lifecycle checks must clean up a grandchild.
  spawn(process.execPath, [process.argv[1], "--server", process.argv[2]], {
    stdio: "inherit",
  });
  if (process.env.E2E_LIFECYCLE_FIXTURE_FAIL_PORT === process.argv[2]) {
    setTimeout(() => process.exit(7), 300);
  }
  await new Promise(() => {});
}
