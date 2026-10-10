// Cube port: browser equivalents of essential Electron preload operations.
import type { KeybindingOverrides } from "../../shared/shortcuts";
import type { AoBridge } from "../../preload";
import type { DaemonStatus } from "../../shared/daemon-status";
import { coerceUiSettings, DEFAULT_UI_SETTINGS } from "../../shared/ui-locale";
export async function cubeDaemonStatus(): Promise<DaemonStatus> {
  const res = await fetch("/cube/status", { cache: "no-store" });
  if (!res.ok) throw Error("Could not reach the Cube app supervisor");
  return res.json();
}
export async function cubeRpc<T>(method: string, input?: unknown): Promise<T> {
  const res = await fetch("/cube/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, input }),
  });
  const body = await res.json();
  if (!res.ok) throw Error(body.error || "Cube operation failed");
  return body.result;
}
export type DirectoryRequest = {
  initialPath: string;
  resolve: (path: string | null) => void;
};
let directoryRequest: DirectoryRequest | null = null;
const directoryListeners = new Set<() => void>();
export const subscribeCubeDirectory = (fn: () => void) => {
  directoryListeners.add(fn);
  return () => {
    directoryListeners.delete(fn);
  };
};
export const getCubeDirectory = () => directoryRequest;
export function finishCubeDirectory(path: string | null) {
  const request = directoryRequest;
  directoryRequest = null;
  for (const fn of directoryListeners) fn();
  request?.resolve(path);
}
function chooseDirectory(input?: string | { defaultPath?: string }) {
  finishCubeDirectory(null);
  return new Promise<string | null>((resolve) => {
    directoryRequest = {
      initialPath: typeof input === "object" ? input.defaultPath || "" : "",
      resolve,
    };
    for (const fn of directoryListeners) fn();
  });
}
function readSetting(key: string, fallback: unknown) {
  try {
    return (
      JSON.parse(localStorage.getItem("ao.cube." + key) || "null") ?? fallback
    );
  } catch {
    return fallback;
  }
}
function writeSetting<T>(key: string, value: T): T {
  localStorage.setItem("ao.cube." + key, JSON.stringify(value));
  return value;
}
export function createCubeBridge(base: AoBridge): AoBridge {
  const explainUnavailable = async () => {
    const { useUiStore } = await import("../stores/ui-store");
    useUiStore
      .getState()
      .showGlobalToast(
        "Desktop feature unavailable",
        "Manage this app through Cube. AO Cloud and desktop updates are not available in this port.",
      );
  };
  const unavailable = async () => {
    throw Error("This desktop feature is unavailable in the Cube port.");
  };
  return {
    ...base,
    app: {
      ...base.app,
      getVersion: async () => "0.13.0-cube",
      chooseDirectory,
      checkGitRepository: (input) => cubeRpc("checkGitRepository", input),
      scanImportFolder: (input) => cubeRpc("scanImportFolder", input),
      checkAncestorRepo: (input) => cubeRpc("checkAncestorRepo", input),
      getRepositoryBranch: (input) => cubeRpc("getRepositoryBranch", input),
      getGitHubLogin: (input) => cubeRpc("getGitHubLogin", input),
      getCachedGitHubOwners: () => cubeRpc("getCachedGitHubOwners"),
      refreshGitHubOwners: () => cubeRpc("refreshGitHubOwners"),
      checkGitHubRepositoryAvailability: (input) =>
        cubeRpc("checkGitHubRepositoryAvailability", input),
    },
    daemon: {
      ...base.daemon,
      getStatus: cubeDaemonStatus,
      start: cubeDaemonStatus,
      restart: unavailable,
      stop: unavailable,
    },
    uiSettings: {
      get: async () => coerceUiSettings(readSetting("ui", DEFAULT_UI_SETTINGS)),
      set: async (settings) =>
        writeSetting(
          "ui",
          coerceUiSettings({
            ...(readSetting("ui", DEFAULT_UI_SETTINGS) as object),
            ...settings,
          }),
        ),
    },
    keybindings: {
      ...base.keybindings,
      get: async () => readSetting("keys", {}) as KeybindingOverrides,
      set: async (settings) => writeSetting("keys", settings),
    },
    appState: {
      ...base.appState,
      getMigration: async () =>
        ({ status: "declined" }) as Awaited<
          ReturnType<AoBridge["appState"]["getMigration"]>
        >,
    },
    browserProfiles: {
      ...base.browserProfiles,
      create: unavailable,
      rename: unavailable,
      clear: unavailable,
      delete: unavailable,
      import: unavailable,
    },
    cloud: { ...base.cloud, signIn: explainUnavailable },
    updates: {
      ...base.updates,
      check: explainUnavailable,
      download: explainUnavailable,
      install: explainUnavailable,
    },
  };
}
