// Cube integration, added by Collabs. Reuse the upstream filesystem scanner.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { isAbsolute } from "node:path";
import {
  scanImportFolder,
  ancestorRepositorySetupWarning,
  resolveCheckedOutBranch,
} from "../frontend/src/main/import-folder-scan.ts";
const exec = promisify(execFile);
const options = { timeout: 10000, maxBuffer: 1024 * 1024 };
function path(value) {
  if (typeof value !== "string" || !isAbsolute(value) || value.includes("\0"))
    throw Error("Choose an absolute path on the Cube machine");
  return value;
}
export async function rpc({ method, input } = {}) {
  switch (method) {
    case "scanImportFolder":
      if (!["project", "workspace"].includes(input?.mode))
        throw Error("Invalid scan mode");
      return scanImportFolder(path(input.path), input.mode, {homeDir: homedir()});
    case "checkAncestorRepo":
      return ancestorRepositorySetupWarning(path(input), {homeDir: homedir()});
    case "getRepositoryBranch":
      return resolveCheckedOutBranch(path(input));
    case "checkGitRepository": {
      if (
        typeof input !== "string" ||
        !/^(https:\/\/|ssh:\/\/|git@[\w.-]+:)/.test(input)
      )
        throw Error("Use an HTTPS or SSH repository URL");
      try {
        await exec(
          "git",
          ["ls-remote", "--quiet", "--", input, "HEAD"],
          options,
        );
        return true;
      } catch {
        return false;
      }
    }
    case "getGitHubLogin":
      try {
        return (
          await exec("gh", ["api", "user", "--jq", ".login"], options)
        ).stdout.trim();
      } catch {
        return "";
      }
    case "getCachedGitHubOwners":
    case "refreshGitHubOwners": {
      try {
        const login = (
          await exec("gh", ["api", "user", "--jq", ".login"], options)
        ).stdout.trim();
        return login
          ? [
              {
                login,
                avatarUrl: `https://github.com/${encodeURIComponent(login)}.png`,
              },
            ]
          : [];
      } catch {
        return [];
      }
    }
    case "checkGitHubRepositoryAvailability": {
      if (
        !input ||
        !/^[\w.-]+$/.test(input.owner) ||
        !/^[\w.-]+$/.test(input.name)
      )
        throw Error("Invalid repository name");
      try {
        await exec(
          "gh",
          ["api", `repos/${input.owner}/${input.name}`],
          options,
        );
        return { available: false, message: "Repository already exists" };
      } catch (e) {
        if (String(e.stderr).includes("404")) return { available: true };
        throw Error("Could not check GitHub repository availability");
      }
    }
    default:
      throw Error("Unsupported Cube operation");
  }
}
