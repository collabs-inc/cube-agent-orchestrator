// Cube integration, added by Collabs. Own only the child spawned by this process.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createCubeServer } from "./server.mjs";
import { rpc } from "./rpc.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("PORT must be a valid TCP port");
const state = process.env.AO_CUBE_STATE_DIR || join(homedir(), ".ao", "cube");
await mkdir(state, { recursive: true, mode: 0o700 });
const reservation = createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const daemonPort = reservation.address().port;
await new Promise((r) => reservation.close(r));
const env = {
  ...process.env,
  AO_PORT: String(daemonPort),
  AO_DATA_DIR: join(state, "data"),
  AO_RUN_FILE: join(state, "running.json"),
  AO_TELEMETRY_EVENTS: "off",
  AO_TELEMETRY_METRICS: "off",
  AO_TELEMETRY_REMOTE: "off",
  AO_ACP_RUNTIME_DIR: join(root, "frontend/resources/acp-runtime"),
  AO_TMUX_BINARY: join(root, "frontend/tmux/bin/tmux"),
  AO_TMUX_SOCKET_NAME: "ao-cube",
};
const child = spawn(join(root, "cube/ao"), ["daemon"], {
  env,
  cwd: root,
  stdio: "inherit",
});
let closing = false;
const childClosed = new Promise((resolve) => child.once("close", resolve));
const server = createCubeServer({
  webRoot: join(root, "cube/web"),
  daemonPort,
  rpc,
  status: async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${daemonPort}/readyz`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok || (await res.json()).pid !== child.pid) throw Error();
      return { state: "ready", port: daemonPort, pid: child.pid };
    } catch {
      return {
        state: "starting",
        message: "Waiting for the Agent Orchestrator daemon",
      };
    }
  },
});
async function stop(code = 0) {
  if (closing) return;
  closing = true;
  server.closeClients();
  server.close();
  child.kill("SIGTERM");
  const force = setTimeout(() => child.kill("SIGKILL"), 8000);
  force.unref();
  await childClosed;
  clearTimeout(force);
  process.exitCode = code;
}
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
child.once("error", (e) => {
  console.error(e);
  void stop(1);
});
child.once("exit", (code, signal) => {
  if (!closing) {
    console.error(`Daemon exited: ${code ?? signal}`);
    void stop(code || 1);
  }
});
try {
  const deadline = Date.now() + 45000;
  while (!closing) {
    try {
      const res = await fetch(`http://127.0.0.1:${daemonPort}/readyz`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok && (await res.json()).pid === child.pid) break;
    } catch {}
    if (Date.now() > deadline)
      throw Error("Daemon did not become ready within 45 seconds");
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!closing) {
    server.on("error", (e) => {
      console.error(e);
      void stop(1);
    });
    server.listen(port, "127.0.0.1", () =>
      console.log(`Agent Orchestrator for Cube listening on 127.0.0.1:${port}`),
    );
  }
} catch (e) {
  console.error(e);
  await stop(1);
}
