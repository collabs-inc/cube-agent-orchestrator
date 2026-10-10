import { describe, it, expect, vi, afterEach } from "vitest";
import { cubeDaemonStatus, cubeRpc } from "./cube-bridge";
afterEach(() => vi.unstubAllGlobals());
describe("Cube bridge", () => {
  it("reports real supervisor status through the same-origin endpoint", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ state: "ready", port: 3002, pid: 123 })),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await cubeDaemonStatus()).toMatchObject({
      state: "ready",
      pid: 123,
    });
    expect(fetcher.mock.calls[0][0]).toBe("/cube/status");
  });
  it("does not report a failed daemon probe as ready", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("down", { status: 502 })),
    );
    await expect(cubeDaemonStatus()).rejects.toThrow();
  });
  it("surfaces actual RPC errors instead of returning preview success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Folder missing" }), {
          status: 400,
        }),
      ),
    );
    await expect(
      cubeRpc("scanImportFolder", { path: "/missing", mode: "project" }),
    ).rejects.toThrow("Folder missing");
  });
});
it("never simulates browser profile creation in Cube", async () => {
  const { createCubeBridge } = await import("./cube-bridge");
  const { aoBridge } = await import("./bridge");
  await expect(
    createCubeBridge(aoBridge).browserProfiles.create("test"),
  ).rejects.toThrow("unavailable");
});
