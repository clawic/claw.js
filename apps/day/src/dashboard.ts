import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { initializeWorkspace } from "@clawjs/claw";
import { createWorkspaceClaw, type WorkspaceClawInstance } from "@clawjs/workspace";

export const APP_ID = "claw-day";

export type CliFlags = Record<string, string | boolean>;

export function parseArgv(argv: string[]) {
  const flags: CliFlags = {};
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { flags, positionals };
}

export function resolveRoot(flags: CliFlags) {
  const explicitRoot =
    typeof flags.root === "string"
      ? flags.root
      : process.env.CLAW_DAY_ROOT ?? process.env.DAY_DASHBOARD_ROOT ?? process.cwd();
  return path.resolve(explicitRoot);
}

export function ensureWorkspace(rootDir: string) {
  mkdirSync(rootDir, { recursive: true });

  const manifestPath = path.join(rootDir, ".clawjs", "manifest.json");
  if (existsSync(manifestPath)) return;

  initializeWorkspace(
    {
      appId: APP_ID,
      workspaceId: APP_ID,
      agentId: APP_ID,
      rootDir,
    },
    "demo",
  );
}

export async function createDashboard(rootDir: string): Promise<WorkspaceClawInstance> {
  ensureWorkspace(rootDir);

  return createWorkspaceClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: APP_ID,
      workspaceId: APP_ID,
      agentId: APP_ID,
      rootDir,
    },
  });
}
