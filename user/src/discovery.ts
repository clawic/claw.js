import fs from "node:fs";
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

export function discoverSources(workspace: string): SourceLocation[] {
  const dataDir = path.join(workspace, ".data");
  const definitions: Array<Omit<SourceLocation, "path">> = [
    {
      id: "relay",
      label: "Relay",
      kind: "sqlite",
      candidates: [
        process.env.RELAY_DB_PATH,
        path.join(workspace, "relay.sqlite"),
        path.join(dataDir, "relay.sqlite"),
        path.join(workspace, "relay", "relay.sqlite"),
      ].filter(Boolean) as string[],
    },
    {
      id: "execution-plane",
      label: "Execution Plane",
      kind: "sqlite",
      candidates: [
        process.env.EXECUTION_PLANE_DB_FILE,
        path.join(workspace, "execution-plane", ".data", "execution-plane.sqlite"),
        path.join(dataDir, "execution-plane.sqlite"),
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
        path.join(workspace, "feed.sqlite"),
      ].filter(Boolean) as string[],
    },
    {
      id: "wiki",
      label: "Wiki",
      kind: "sqlite",
      candidates: [
        process.env.WIKI_DB_PATH,
        path.join(dataDir, "wiki.sqlite"),
        path.join(workspace, "wiki.sqlite"),
      ].filter(Boolean) as string[],
    },
    {
      id: "content",
      label: "Content",
      kind: "sqlite",
      candidates: [
        process.env.CONTENT_DB_PATH,
        path.join(dataDir, "content.sqlite"),
        path.join(workspace, "content.sqlite"),
      ].filter(Boolean) as string[],
    },
    {
      id: "erp",
      label: "ERP",
      kind: "sqlite",
      candidates: [
        process.env.ERP_DB_PATH,
        path.join(dataDir, "erp.sqlite"),
        path.join(workspace, "erp.sqlite"),
      ].filter(Boolean) as string[],
    },
    {
      id: "delegation-plane",
      label: "Delegation Plane",
      kind: "sqlite",
      candidates: [
        process.env.DELEGATION_PLANE_DATABASE_FILE,
        path.join(dataDir, "delegation.sqlite"),
        path.join(workspace, "delegation.sqlite"),
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
