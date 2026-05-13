import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface SourceLocation {
  id: string;
  label: string;
  kind: "sqlite" | "memory" | "telegram";
  path: string | null;
  candidates: string[];
}

function firstExisting(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveClawjsDataRoot(): string {
  if (process.env.CLAW_DATA_DIR) return expandHome(process.env.CLAW_DATA_DIR);
  if (process.env.CLAWIX_CLAW_DATA_DIR) return expandHome(process.env.CLAWIX_CLAW_DATA_DIR);
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Clawix", "clawjs");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Clawix", "clawjs");
  }
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "Clawix", "clawjs");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

export function discoverSources(workspace: string): SourceLocation[] {
  const dataDir = path.join(workspace, ".data");
  const clawjsMainDb = process.env.CLAW_DB_PATH ?? path.join(resolveClawjsDataRoot(), "clawjs.sqlite");
  const definitions: Array<Omit<SourceLocation, "path">> = [
    {
      id: "relay",
      label: "Relay",
      kind: "sqlite",
      candidates: [
        process.env.RELAY_DB_PATH,
        path.join(workspace, "infra.sqlite"),
        path.join(dataDir, "infra.sqlite"),
        path.join(workspace, "relay", "infra.sqlite"),
      ].filter(Boolean) as string[],
    },
    {
      id: "execution",
      label: "Execution",
      kind: "sqlite",
      candidates: [
        process.env.EXECUTION_PLANE_DB_FILE,
        path.join(workspace, "execution", ".data", "infra.sqlite"),
        path.join(dataDir, "infra.sqlite"),
      ].filter(Boolean) as string[],
    },
    {
      id: "notify",
      label: "Notify",
      kind: "sqlite",
      candidates: [
        process.env.NOTIFY_DB_PATH,
        path.join(dataDir, "notify.sqlite"),
        path.join(workspace, "notify.sqlite"),
      ].filter(Boolean) as string[],
    },
    {
      id: "feed",
      label: "Feed",
      kind: "sqlite",
      candidates: [
        process.env.FEED_DB_PATH,
        path.join(dataDir, "feed.sqlite"),
        path.join(resolveClawjsDataRoot(), "feed.sqlite"),
      ].filter(Boolean) as string[],
    },
    {
      id: "wiki",
      label: "Wiki",
      kind: "sqlite",
      candidates: [
        process.env.WIKI_DB_PATH,
        clawjsMainDb,
      ].filter(Boolean) as string[],
    },
    {
      id: "content",
      label: "Content",
      kind: "sqlite",
      candidates: [
        process.env.CONTENT_DB_PATH,
        clawjsMainDb,
      ].filter(Boolean) as string[],
    },
    {
      id: "erp",
      label: "ERP",
      kind: "sqlite",
      candidates: [
        process.env.ERP_DB_PATH,
        clawjsMainDb,
      ].filter(Boolean) as string[],
    },
    {
      id: "delegation",
      label: "Delegation",
      kind: "sqlite",
      candidates: [
        process.env.DELEGATION_PLANE_DATABASE_FILE,
        path.join(resolveClawjsDataRoot(), "runtime.sqlite"),
      ].filter(Boolean) as string[],
    },
    {
      id: "memory",
      label: "Memory",
      kind: "memory",
      candidates: [path.join(workspace, ".memory")],
    },
    {
      id: "telegram",
      label: "Telegram",
      kind: "telegram",
      candidates: [path.join(workspace, ".clawjs", "observed", "channels.json")],
    },
  ];

  return definitions.map((def) => ({
    ...def,
    path: firstExisting(def.candidates),
  }));
}

export function workspaceFromCwd(): string {
  return process.env.CLAWJS_OPEN_WORKSPACE || process.cwd();
}
