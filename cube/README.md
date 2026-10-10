# Agent Orchestrator for Cube

This community port runs the upstream Orchestrator.inc interface and Go daemon
on your Cube machine. Repositories, worktrees, agent processes, and terminal
sessions live on that machine. It uses real daemon APIs, not the upstream
browser preview's sample data.

Upstream: [OrchestratorInc/agent-orchestrator](https://github.com/OrchestratorInc/agent-orchestrator),
based on `c72956ae6df2a658f941afe62c2c61275ec6f20a`. This port is not an official
Orchestrator.inc product. The upstream [Apache-2.0 license](../LICENSE) and
source attributions remain in the repository. Files changed for Cube carry
modification notices.

## Installation

Install this repository through Cube's app installer after the port is merged
into its default branch. The root `cube.json` builds and launches the app.
The initial port supports Linux x86_64. Installation needs Git, a C/C++
compiler, make, m4, tar, curl, and an existing Node runtime to bootstrap. Cube's
cloud image provides these tools. No administrator access is required.

The installer downloads checksum-pinned Node 24.21.0, Go 1.27.2, and the
build-only Bison 3.8.2 toolchain into the app folder. It builds the Go daemon,
upstream tmux bundle, upstream ACP runtime, and the renderer. The tmux build
retains its dependency license files under `frontend/tmux/licenses`; packaged
Node and Go toolchains and npm dependencies retain their upstream licenses.
The installer leaves agent CLIs and their sign-ins to the machine's Tools and
agent setup flows.

For a source checkout, run `node cube/install.mjs`, then start with
`PORT=4387 cube/runtime/node/bin/node cube/start.mjs`. Open the local address
or let Cube expose it through its authenticated app gateway.

## Using the port

Open a local folder to browse the Cube machine's directories, or clone a
repository through the existing project flow. The existing project, worker,
chat, and terminal interfaces use the machine's daemon. GitHub operations use
the machine's `gh` credentials. Agent authentication and provider access are
still required to run actual coding agents.

The embedded Electron browser, native browser profiles, desktop editor
handoff, mobile pairing, and Orchestrator.inc cloud account controls are not
provided by this port. Use Cube's previews for web apps. Desktop update actions
report that Cube manages updates. Native browser and mobile settings are
hidden; browser profile mutations explicitly refuse rather than fabricate
success. Browser UI preferences are stored in that browser's local storage.

## State and lifecycle

The launcher keeps durable data under `~/.ao/cube/data` and its discovery file
at `~/.ao/cube/running.json`, outside the replaceable app folder. For isolated
tests, set `AO_CUBE_STATE_DIR` and an isolated process home. Removing the app
leaves this state in place.

The launcher stays in the foreground, waits for its own daemon's readiness,
and exits if that daemon exits. Cube can restart the app. Stopping the app
signals only the child daemon that launcher started; it never looks up and
kills another desktop daemon. Upstream persistent worker PTYs may survive a
daemon restart. Use the app's session controls to stop workers explicitly.

The public app server binds to `127.0.0.1:$PORT`. It serves built assets and
forwards API, SSE, and terminal WebSocket traffic to a separate loopback
port. It checks browser origins, rejects unsupported desktop control routes,
and does not expose the daemon's `/shutdown` endpoint. Cube supplies remote
authentication; do not expose this loopback server independently to a network.

## Validation

Run gateway and filesystem tests with Node 24:

```sh
node --test cube/server.test.mjs cube/rpc.test.mjs
npm test --prefix frontend -- --maxWorkers=1 --run \
  src/renderer/lib/cube-bridge.test.ts \
  src/renderer/lib/api-client.test.ts \
  src/renderer/lib/terminal-mux.test.ts \
  src/renderer/components/RemoteDirectoryPicker.test.tsx \
  src/renderer/components/TerminalPane.test.tsx
```

For browser acceptance, use isolated state and a disposable Git repository.
Verify the home page, directory picker, repository registration, worker
creation, live terminal input/output, and page reload. A test harness executable
can validate process routing without using a paid model or a user's sign-in.
Production HTTPS gateway behavior and actual provider authentication require
separate integration checks.

To typecheck the production renderer, install the shared package dependencies
and run `npx tsc --noEmit -p tsconfig.cube.json` from `frontend`. The dedicated
Cube CI workflow builds the installer output and runs these checks. The larger
upstream desktop suite also needs Electron and packaging tools such as `zip`;
those are test dependencies, not requirements for running this Cube app.
