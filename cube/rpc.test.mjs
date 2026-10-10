import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { rpc } from "./rpc.mjs";
test("scans a real machine repository and validates RPC inputs", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ao-rpc-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync("git", ["init", "-b", "main", dir], { stdio: "ignore" });
  const result = await rpc({
    method: "scanImportFolder",
    input: { path: dir, mode: "project" },
  });
  assert.equal(result.path, dir);
  assert.ok(Array.isArray(result.repos));
  await assert.rejects(
    rpc({ method: "getRepositoryBranch", input: "relative" }),
    /absolute/,
  );
  await assert.rejects(rpc({ method: "shell", input: "id" }), /Unsupported/);
  await assert.rejects(
    rpc({ method: "checkGitRepository", input: "ext::sh -c evil" }),
    /HTTPS or SSH/,
  );
});
