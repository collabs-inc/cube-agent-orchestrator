# Agent Orchestrator on Cube

Port the existing UI and Go daemon to a Cube app. Repositories, worktrees,
agent processes, and durable state run on the Cube machine. Preserve upstream
behavior and attribution; do not use the mock-data browser preview.

The upstream Electron supervisor is replaced by a foreground Node launcher.
It serves the built renderer, proxies REST, SSE, and terminal WebSockets to a
private loopback daemon, and supplies the browser equivalents of essential
preload functions. Cube authenticates access to the app. Keep the daemon on
loopback, check request origins on the launcher, and never expose its shutdown
or other loopback control endpoints through a catch-all proxy.

Build with pinned Node and Go toolchains inside the replaceable app folder.
State stays under `~/.ao/cube` and survives application updates. The launcher
owns only the daemon it starts. Stop cleans up owned processes; it must not
stop an unrelated desktop daemon. Agent CLI sign-ins use the machine's normal
home and credentials.

Core acceptance: real readiness, add an existing repository, list real sessions,
create a worker, view its terminal, send terminal input, and survive a page
reload. Directory selection must refer to the Cube filesystem. Desktop-only
browser composition, editor handoff, updates, and AO Cloud account operations
must be unavailable explicitly rather than silently succeeding. Existing
Electron builds and preview tests must retain their current behavior.

Publish the port as a reviewable fork branch with a root Cube manifest. Keep
upstream source changes small. Do not publish a Cube release or restart any
user machine. Validate with unit/process tests and a browser against isolated
state, then open a PR recording any unavailable checks.
