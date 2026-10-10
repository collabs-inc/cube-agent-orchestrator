// Cube integration, added by Collabs. Upstream license: Apache-2.0.
import { createServer, request } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const blocked = /^\/api\/v1\/(mobile|remote-host|telemetry)(\/|$)/;
export function createCubeServer({ webRoot, daemonPort, status, rpc }) {
  const sockets = new Set();
  const root = resolve(webRoot);
  function reply(res, code, body) {
    res.writeHead(code, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(body));
  }
  function allowed(req, upgrade = false) {
    let host;
    try {
      host = new URL(`http://${req.headers.host}`).hostname;
    } catch {
      return false;
    }
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(host) &&
      !host.endsWith(".cube.site")
    )
      return false;
    if (req.headers["sec-fetch-site"] === "cross-site") return false;
    const origin = req.headers.origin;
    if (!origin) return !upgrade;
    return (
      origin ===
      `${req.headers["x-forwarded-proto"] === "https" ? "https" : "http"}://${req.headers.host}`
    );
  }
  function headers(req) {
    // Cube has already authenticated the browser. Forward only application
    // headers; the private daemon sees a loopback request, never a public host.
    const h = { ...req.headers, host: `127.0.0.1:${daemonPort}` };
    for (const key of Object.keys(h))
      if (/^(origin|cookie|forwarded|x-forwarded-.*|sec-fetch-.*)$/i.test(key))
        delete h[key];
    return h;
  }
  const server = createServer(async (req, res) => {
    try {
      if (!allowed(req))
        return reply(res, 403, { error: "Origin or host is not allowed" });
      const url = new URL(req.url, "http://localhost");
      const path = decodeURIComponent(url.pathname);
      if (path.includes("\\") || path.split("/").some((s) => s.startsWith(".")))
        return reply(res, 404, { error: "Not found" });
      if (path === "/cube/status" && req.method === "GET")
        return reply(res, 200, await status());
      if (path === "/cube/rpc" && req.method === "POST" && rpc) {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 65536)
            return reply(res, 413, { error: "Request too large" });
        }
        try {
          return reply(res, 200, { result: await rpc(JSON.parse(body)) });
        } catch (e) {
          return reply(res, 400, { error: e.message });
        }
      }
      if (blocked.test(path))
        return reply(res, 404, {
          error: "This desktop operation is unavailable on Cube",
        });
      if (path.startsWith("/api/v1/")) {
        const upstream = request(
          {
            host: "127.0.0.1",
            port: daemonPort,
            path: url.pathname + url.search,
            method: req.method,
            headers: headers(req),
          },
          (incoming) => {
            const h = { ...incoming.headers };
            delete h["set-cookie"];
            delete h["access-control-allow-origin"];
            res.writeHead(incoming.statusCode, h);
            incoming.pipe(res);
          },
        );
        upstream.on("error", () => {
          if (!res.headersSent)
            reply(res, 502, { error: "Agent Orchestrator daemon unavailable" });
          else res.destroy();
        });
        res.on("close", () => upstream.destroy());
        req.pipe(upstream);
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        return reply(res, 404, { error: "Not found" });
      if (path.startsWith("/cube/") || path === "/shutdown")
        return reply(res, 404, { error: "Not found" });
      let file = resolve(root, "." + path);
      if (file !== root && !file.startsWith(root + sep))
        return reply(res, 404, { error: "Not found" });
      try {
        file = await realpath(file);
        if (file !== root && !file.startsWith(root + sep))
          return reply(res, 404, { error: "Not found" });
        if (!(await stat(file)).isFile()) file = resolve(root, "index.html");
      } catch {
        if (extname(path)) return reply(res, 404, { error: "Not found" });
        file = resolve(root, "index.html");
      }
      const data = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (e) {
      if (!res.headersSent) reply(res, 400, { error: "Invalid request" });
      else res.destroy();
    }
  });
  server.on("upgrade", (req, socket, head) => {
    if (!allowed(req, true) || req.url !== "/mux") {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const upstream = request({
      host: "127.0.0.1",
      port: daemonPort,
      path: "/mux",
      headers: headers(req),
    });
    upstream.on("upgrade", (res, remote, remoteHead) => {
      sockets.add(remote);
      remote.on("close", () => sockets.delete(remote));
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\n${Object.entries(res.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n")}\r\n\r\n`,
      );
      if (remoteHead.length) socket.write(remoteHead);
      if (head.length) remote.write(head);
      remote.pipe(socket);
      socket.pipe(remote);
      remote.on("error", () => socket.destroy());
      socket.on("error", () => remote.destroy());
      socket.on("close", () => remote.destroy());
      remote.on("close", () => socket.destroy());
    });
    upstream.on("response", () => socket.destroy());
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
    upstream.end();
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  server.closeClients = () => {
    for (const s of sockets) s.destroy();
  };
  return server;
}
