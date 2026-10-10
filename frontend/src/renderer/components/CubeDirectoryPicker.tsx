// Cube port: use the existing directory picker against the machine's local API.
import { useSyncExternalStore } from "react";
import {
  getCubeDirectory,
  subscribeCubeDirectory,
  finishCubeDirectory,
} from "../lib/cube-bridge";
import { RemoteDirectoryPicker } from "./RemoteDirectoryPicker";
export function CubeDirectoryPicker() {
  const request = useSyncExternalStore(
    subscribeCubeDirectory,
    getCubeDirectory,
  );
  return request ? (
    <RemoteDirectoryPicker
      hostLabel="Cube machine"
      connected
      initialPath={request.initialPath}
      onChoose={finishCubeDirectory}
      onClose={() => finishCubeDirectory(null)}
    />
  ) : null;
}
