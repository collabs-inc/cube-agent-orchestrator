// Cube integration, added by Collabs. Linux amd64 toolchains are local to the app.
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, rename, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "linux" || process.arch !== "x64")
  throw Error("This Cube port currently supports Linux x86_64 machines");
const runtime = join(root, "cube/runtime");
await mkdir(runtime, { recursive: true });
async function tool(name, url, sha, archiveRoot) {
  const archive = join(runtime, name + ".tar.gz");
  const response = await fetch(url);
  if (!response.ok) throw Error(`Download failed: ${url} (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== sha)
    throw Error(`Checksum mismatch: ${name}`);
  await writeFile(archive, bytes);
  run("tar", ["-xf", archive, "-C", runtime]);
  if (archiveRoot !== name) {
    await rm(join(runtime, name), { recursive: true, force: true });
    await rename(join(runtime, archiveRoot), join(runtime, name));
  }
  await rm(archive);
}
function run(command, args, extra = {}) {
  const r = spawnSync(command, args, { cwd: root, stdio: "inherit", ...extra });
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error(`${command} exited ${r.status}`);
}
await tool(
  "node",
  "https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64.tar.gz",
  "6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff",
  "node-v24.21.0-linux-x64",
);
await tool(
  "go",
  "https://go.dev/dl/go1.27.2.linux-amd64.tar.gz",
  "ecbadb99091a3f46e31f5f934b068b1864eafa7995211b39eaddf76996045fe5",
  "go",
);
await tool(
  "bison-source",
  "https://ftp.gnu.org/gnu/bison/bison-3.8.2.tar.xz",
  "9bba0214ccf7f1079c5d59210045227bcf619519840ebfa80cd3849cff5a5bf2",
  "bison-3.8.2",
);
run("./configure", [`--prefix=${runtime}/bison`], {
  cwd: join(runtime, "bison-source"),
});
run("make", ["-j2"], { cwd: join(runtime, "bison-source") });
run("make", ["install"], { cwd: join(runtime, "bison-source") });
const env = {
  ...process.env,
  PATH: `${runtime}/bison/bin:${runtime}/node/bin:${runtime}/go/bin:${process.env.PATH}`,
  GOWORK: "off",
  GOMAXPROCS: "4",
  GOTMPDIR: join(runtime, "tmp"),
  GOCACHE: join(runtime, "go-cache"),
  ELECTRON_SKIP_BINARY_DOWNLOAD: "1",
};
await mkdir(env.GOTMPDIR, { recursive: true });
run(
  join(runtime, "go/bin/go"),
  ["-C", "backend", "build", "-p", "2", "-o", "../cube/ao", "./cmd/ao"],
  { env },
);
run(join(runtime, "node/bin/npm"), ["ci", "--prefix", "frontend"], { env });
run(
  join(runtime, "node/bin/npm"),
  ["run", "build:tmux", "--prefix", "frontend"],
  { env },
);
run(
  join(runtime, "node/bin/npm"),
  ["run", "build:acp-runtime", "--prefix", "frontend"],
  { env },
);
run(
  join(runtime, "node/bin/node"),
  [
    "node_modules/vite/bin/vite.js",
    "build",
    "--config",
    "vite.renderer.config.ts",
    "--outDir",
    "../cube/web",
  ],
  {
    cwd: join(root, "frontend"),
    env: {
      ...env,
      VITE_CUBE: "1",
      VITE_NO_ELECTRON: "0",
      RAYON_NUM_THREADS: "2",
    },
  },
);
// Build caches are disposable. The runtimes and application output remain.
await rm(env.GOTMPDIR, { recursive: true, force: true });
await rm(env.GOCACHE, { recursive: true, force: true });

await rm(join(runtime, "bison-source"), { recursive: true, force: true });
await rm(join(runtime, "bison"), { recursive: true, force: true });
