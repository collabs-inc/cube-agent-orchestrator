// Modified for Cube: route browser requests through the same-origin app gateway.
import { isCube } from "./cube-mode";
import { aoBridge } from "./bridge";
import { setApiBaseUrl, setApiDaemonStatus } from "./api-client";

export type DaemonStatus = Awaited<ReturnType<typeof aoBridge.daemon.getStatus>>;

export function applyDaemonStatus(nextStatus: DaemonStatus): void {
	setApiDaemonStatus(nextStatus);
	if (nextStatus.state === "ready" && nextStatus.port) {
		setApiBaseUrl(isCube ? window.location.origin : `http://127.0.0.1:${nextStatus.port}`);
	} else {
		setApiBaseUrl(null);
	}
}

export async function refreshDaemonStatus(): Promise<DaemonStatus> {
	const nextStatus = await readDaemonStatus();
	applyDaemonStatus(nextStatus);
	return nextStatus;
}

export function readDaemonStatus(): Promise<DaemonStatus> {
	return aoBridge.daemon.getStatus();
}
