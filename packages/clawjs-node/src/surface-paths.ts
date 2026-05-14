import os from "os";
import path from "path";

import { resolveClawPersistentSurfacePath } from "@clawjs/core";

export function resolveClawGlobalDataRoot(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAW_DATA_DIR ?? env.CLAWIX_CLAW_DATA_DIR;
  if (explicit) return expandHome(explicit);
  if (env.CLAW_HOME) return path.join(expandHome(env.CLAW_HOME), "data");
  return expandHome(resolveClawPersistentSurfacePath("claw.global.data"));
}

export function resolveClawGlobalSurfacePath(id: string, env: NodeJS.ProcessEnv = process.env, ...children: string[]): string {
  const resolved = resolveClawPersistentSurfacePath(id, "", ...children);
  if (env.CLAW_HOME && (resolved === "~/.claw" || resolved.startsWith("~/.claw/"))) {
    const relative = resolved === "~/.claw" ? "" : resolved.slice("~/.claw/".length);
    return path.join(expandHome(env.CLAW_HOME), relative);
  }
  return expandHome(resolved);
}

export function resolveClawWorkspaceSurfacePath(id: string, workspaceDir: string, ...children: string[]): string {
  return resolveClawPersistentSurfacePath(id, workspaceDir, ...children);
}

export function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
