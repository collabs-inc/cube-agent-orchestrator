import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer as httpServer, request as httpRequest } from "node:http";
import { mkdtemp, writeFile, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCubeServer } from "./server.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "ao-cube-server-"));
  await mkdir(join(root, "web"));
  await writeFile(join(root, "web/index.html"), "<h1>Real renderer</h1>");
  await writeFile(join(root, "secret"), "private");
  await symlink(join(root, "secret"), join(root, "web/leak"));
  const backend = httpServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        path: req.url,
        origin: req.headers.origin,
        host: req.headers.host,
      }),
    );
  });
  await new Promise((r) => backend.listen(0, "127.0.0.1", r));
  const server = createCubeServer({
    webRoot: join(root, "web"),
    daemonPort: backend.address().port,
    status: () => ({ state: "ready", port: backend.address().port }),
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    server.closeAllConnections();
    backend.closeAllConnections();
    await Promise.all([
      new Promise((r) => server.close(r)),
      new Promise((r) => backend.close(r)),
    ]);
    await rm(root, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${server.address().port}`;
}
test("serves renderer routes and proxies real API requests", async (t) => {
  const base = await fixture(t);
  assert.match(await (await fetch(base + "/")).text(), /Real renderer/);
  assert.match(
    await (await fetch(base + "/projects/one")).text(),
    /Real renderer/,
  );
  const res = await fetch(base + "/api/v1/projects", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).path, "/api/v1/projects");
  assert.equal(
    (await (await fetch(base + "/cube/status")).json()).state,
    "ready",
  );
});
test("rejects foreign mutations, DNS rebinding, controls and non-public files", async (t) => {
  const base = await fixture(t);
  assert.equal(
    (
      await fetch(base + "/api/v1/projects", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const hostile = await new Promise((resolve) => {
    const req = httpRequest(
      base + "/api/v1/projects",
      { headers: { Host: "evil.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.end();
  });
  assert.equal(hostile, 403);
  assert.equal(
    (await fetch(base + "/shutdown", { method: "POST" })).status,
    404,
  );
  assert.equal((await fetch(base + "/.git/config")).status, 404);
  assert.equal((await fetch(base + "/leak")).status, 404);
  assert.equal(
    (await fetch(base + "/api/v1/mobile/enable", { method: "POST" })).status,
    404,
  );
});
test("streams SSE without buffering and relays terminal WebSocket frames", async (t) => {
  const { WebSocketServer, WebSocket } =
    await import("../frontend/node_modules/ws/wrapper.mjs");
  const backend = httpServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write("data: live\n\n");
  });
  const wss = new WebSocketServer({ server: backend });
  wss.on("connection", (ws) => ws.on("message", (data) => ws.send(data)));
  await new Promise((r) => backend.listen(0, "127.0.0.1", r));
  const server = createCubeServer({
    webRoot: "/nonexistent",
    daemonPort: backend.address().port,
    status: () => ({ state: "ready" }),
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeClients();
    server.close();
    wss.close();
    backend.closeAllConnections();
    backend.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const controller = new AbortController();
  const response = await fetch(base + "/api/v1/events", {
    signal: controller.signal,
  });
  const reader = response.body.getReader();
  assert.equal(
    new TextDecoder().decode((await reader.read()).value),
    "data: live\n\n",
  );
  controller.abort();
  const ws = new WebSocket(base.replace("http:", "ws:") + "/mux", {
    origin: base,
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const message = new Promise((resolve) =>
    ws.once("message", (d) => resolve(d.toString())),
  );
  ws.send("terminal input");
  assert.equal(await message, "terminal input");
  ws.close();
});
