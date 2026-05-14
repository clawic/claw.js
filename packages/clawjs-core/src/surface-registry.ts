export const clawSurfaceRegistryVersion = 1;

export type ClawPersistentSurfaceKind =
  | "root"
  | "database"
  | "sidecar"
  | "table"
  | "column"
  | "index"
  | "folder"
  | "file"
  | "socket"
  | "statusFile"
  | "preferenceKey"
  | "appStorageKey"
  | "browserStorageKey"
  | "envOverride"
  | "cache"
  | "fixture"
  | "persistentTemp"
  | "legacyPath"
  | "externalReadOnlySource";

export type ClawPersistentSurfaceOwner = "claw" | "clawix" | "external";
export type ClawPersistentSurfaceStorageClass =
  | "frameworkGlobal"
  | "workspace"
  | "hostOperational"
  | "nativeAppData"
  | "sidecar"
  | "secretVault"
  | "cache"
  | "fixture"
  | "persistentTemp"
  | "external";
export type ClawPersistentSurfaceCanonicality =
  | "canonical"
  | "hostOnly"
  | "cache"
  | "generated"
  | "legacyReadOnly"
  | "testOnly"
  | "externalReadOnly";
export type ClawPersistentSurfacePrivacy = "public" | "userData" | "secretReference" | "secretMaterial" | "externalReadOnly";
export type ClawPersistentSurfaceLifecycle = "durable" | "rebuildable" | "ephemeral" | "legacy" | "external";

export interface ClawPersistentSurfaceSource {
  file: string;
  line?: number;
  language?: "typescript" | "swift" | "javascript" | "json" | "sql" | "markdown";
}

export interface ClawPersistentSurfaceNode {
  id: string;
  kind: ClawPersistentSurfaceKind;
  owner: ClawPersistentSurfaceOwner;
  repo?: string;
  project?: string;
  provider?: string;
  language?: "typescript" | "swift" | "javascript" | "json" | "sql" | "markdown";
  name: string;
  path?: string;
  key?: string;
  storageClass: ClawPersistentSurfaceStorageClass;
  canonicality: ClawPersistentSurfaceCanonicality;
  privacy: ClawPersistentSurfacePrivacy;
  lifecycle: ClawPersistentSurfaceLifecycle;
  parentId?: string;
  children?: string[];
  source?: ClawPersistentSurfaceSource;
  envOverrides?: string[];
  databaseId?: string;
  dataType?: string;
  nullable?: boolean;
  notes?: string;
  warnings?: string[];
}

export interface ClawPersistentSurfaceRegistry {
  version: number;
  nodes: ClawPersistentSurfaceNode[];
}

type SurfaceDefaults = Pick<
  ClawPersistentSurfaceNode,
  "owner" | "storageClass" | "canonicality" | "privacy" | "lifecycle"
>;

type SurfaceBuilderInput<TKind extends ClawPersistentSurfaceKind> =
  Omit<ClawPersistentSurfaceNode, "kind" | keyof SurfaceDefaults> &
  Partial<SurfaceDefaults> &
  { kind?: TKind };

function surfaceNode(input: Omit<ClawPersistentSurfaceNode, keyof SurfaceDefaults> & Partial<SurfaceDefaults>): ClawPersistentSurfaceNode {
  return {
    owner: input.owner ?? "claw",
    storageClass: input.storageClass ?? "frameworkGlobal",
    canonicality: input.canonicality ?? "canonical",
    privacy: input.privacy ?? "userData",
    lifecycle: input.lifecycle ?? "durable",
    ...input,
  };
}

export const clawPersistentSurface = {
  root(input: SurfaceBuilderInput<"root">): ClawPersistentSurfaceNode {
    return surfaceNode({ ...input, kind: "root" });
  },
  database(input: SurfaceBuilderInput<"database" | "sidecar">): ClawPersistentSurfaceNode {
    return surfaceNode({ ...input, kind: input.kind ?? "database" });
  },
  table(input: SurfaceBuilderInput<"table">): ClawPersistentSurfaceNode {
    return surfaceNode({ ...input, kind: "table" });
  },
  column(input: SurfaceBuilderInput<"column">): ClawPersistentSurfaceNode {
    return surfaceNode({ ...input, kind: "column" });
  },
  index(input: SurfaceBuilderInput<"index">): ClawPersistentSurfaceNode {
    return surfaceNode({ ...input, kind: "index" });
  },
  path(input: Omit<SurfaceBuilderInput<"folder" | "file" | "socket" | "statusFile" | "cache" | "fixture" | "persistentTemp" | "legacyPath" | "externalReadOnlySource">, "kind"> & { kind: "folder" | "file" | "socket" | "statusFile" | "cache" | "fixture" | "persistentTemp" | "legacyPath" | "externalReadOnlySource" }): ClawPersistentSurfaceNode {
    return surfaceNode(input);
  },
  preference(input: SurfaceBuilderInput<"preferenceKey" | "appStorageKey" | "browserStorageKey">): ClawPersistentSurfaceNode {
    return surfaceNode({ ...input, kind: input.kind ?? "preferenceKey" });
  },
  envOverride(input: SurfaceBuilderInput<"envOverride">): ClawPersistentSurfaceNode {
    return surfaceNode({ ...input, kind: "envOverride", privacy: input.privacy ?? "public" });
  },
};

export const clawixPortRange = { start: 24080, end: 24099 } as const;
export const clawPortRange = { start: 24100, end: 24199 } as const;

export const clawCorePorts = {
  runtime: 24100,
  sessions: 24101,
  database: 24102,
  secrets: 24103,
  drive: 24104,
  memory: 24105,
  search: 24106,
  mcp: 24107,
  mesh: 24108,
  notify: 24109,
  signals: 24110,
  publishing: 24111,
  remote: 24112,
  remoteStatus: 24113,
  monitor: 24114,
} as const;

export const clawAppPorts = {
  showcase: 24120,
  agenda: 24121,
  board: 24122,
  channels: 24123,
  notify: 24124,
} as const;

export const clawPortSubranges = {
  core: { start: 24100, end: 24119 },
  apps: { start: 24120, end: 24149 },
  integrations: { start: 24150, end: 24179 },
  labs: { start: 24180, end: 24199 },
} as const;

export const clawixBridgePort = 24080;
export const clawDefaultBindAddress = "127.0.0.1";

export const clawLocalHostnames = {
  showcase: "showcase.claw.localhost",
  agenda: "agenda.claw.localhost",
  board: "board.claw.localhost",
  channels: "channels.claw.localhost",
  notify: "notify.claw.localhost",
} as const;

export const clawPublicApiPrefix = "/v1";
export const clawPrivateAppApiPrefix = "/api";
export const clawEventsPath = "/v1/events";

export const clawDeepLinkSchemes = {
  host: "clawix",
  frameworkReserved: "claw",
} as const;

export const clawixDeepLinkRoutes = {
  authCallback: "auth/callback",
  pair: "pair",
  session: "session",
  settings: "settings",
} as const;

export const clawDataFiles = {
  mainDatabase: "core.sqlite",
  sessionsDatabase: "sessions.sqlite",
  driveDatabase: "drive.sqlite",
  secretsDatabase: "secrets.sqlite",
  searchDatabase: "search.sqlite",
} as const;

export const clawExportExtensions = {
  export: ".clawexport",
  backup: ".clawbackup",
  secrets: ".clawsecrets",
} as const;

export const clawWorkspaceLayout = {
  root: ".claw",
  manifest: ".claw/manifest.json",
  desiredState: ".claw/state/desired",
  observedState: ".claw/state/observed",
  projections: ".claw/projections",
  sessions: ".claw/sessions",
  audit: ".claw/audit",
  locks: ".claw/locks",
  backups: ".claw/backups",
  browser: ".claw/browser",
} as const;

export const clawGlobalHomeLayout = {
  root: "~/.claw",
  config: "~/.claw/config.yaml",
  data: "~/.claw/data",
  state: "~/.claw/state",
  cache: "~/.claw/cache",
  logs: "~/.claw/logs",
  run: "~/.claw/run",
  tmp: "~/.claw/tmp",
  skills: "~/.claw/skills",
} as const;

export const clawixHomeLayout = {
  root: "~/.clawix",
  data: "~/.clawix/data",
  state: "~/.clawix/state",
  cache: "~/.clawix/cache",
  logs: "~/.clawix/logs",
  run: "~/.clawix/run",
  tmp: "~/.clawix/tmp",
  bridgeSocket: "~/.clawix/run/clawix-bridge.sock",
  windowsBridgePipe: String.raw`\\.\pipe\clawix-bridge`,
} as const;

export function clawServiceSocketName(service: string): string {
  return `claw-${service}.sock`;
}

export function clawServiceSocketPath(service: string): string {
  return `~/.claw/run/${clawServiceSocketName(service)}`;
}

export function clawServiceWindowsPipe(service: string): string {
  return String.raw`\\.\pipe\claw-${service}`;
}

const registrySource: ClawPersistentSurfaceSource = {
  file: "packages/clawjs-core/src/surface-registry.ts",
  language: "typescript",
};

export const clawPersistentSurfaceRegistry: ClawPersistentSurfaceRegistry = {
  version: clawSurfaceRegistryVersion,
  nodes: [
    clawPersistentSurface.root({
      id: "claw.global",
      name: "Claw global home",
      path: clawGlobalHomeLayout.root,
      storageClass: "frameworkGlobal",
      source: registrySource,
    }),
    clawPersistentSurface.root({
      id: "claw.workspace",
      name: "Claw workspace state",
      path: clawWorkspaceLayout.root,
      storageClass: "workspace",
      source: registrySource,
    }),
    clawPersistentSurface.root({
      id: "clawix.home",
      owner: "clawix",
      name: "Clawix host home",
      path: clawixHomeLayout.root,
      storageClass: "hostOperational",
      canonicality: "hostOnly",
      source: registrySource,
    }),
    clawPersistentSurface.database({
      id: "claw.database.core",
      name: "Framework main database",
      path: `${clawGlobalHomeLayout.data}/${clawDataFiles.mainDatabase}`,
      parentId: "claw.global",
      source: registrySource,
      notes: "User-facing structured records and framework metadata that belong in the canonical relational graph.",
      envOverrides: ["CLAW_DATABASE_DB_PATH", "CLAW_DB_PATH", "CLAW_DATA_DIR", "CLAW_HOME"],
    }),
    clawPersistentSurface.database({
      id: "claw.database.legacy_productivity",
      kind: "sidecar",
      name: "Legacy productivity workspace database",
      path: `${clawWorkspaceLayout.root}/data/productivity.sqlite`,
      parentId: "claw.workspace",
      storageClass: "workspace",
      canonicality: "legacyReadOnly",
      lifecycle: "legacy",
      source: registrySource,
      warnings: ["Read only for migration into the canonical workspace store."],
    }),
    clawPersistentSurface.table({
      id: "claw.database.core.table.workspace_records",
      name: "workspace_records",
      parentId: "claw.database.core",
      databaseId: "claw.database.core",
      source: registrySource,
      notes: "JSON payload table backing local-first productivity collections.",
    }),
    ...["collection_name", "record_id", "payload_json", "updated_at", "archived_at"].map((name) => clawPersistentSurface.column({
      id: `claw.database.core.table.workspace_records.column.${name}`,
      name,
      parentId: "claw.database.core.table.workspace_records",
      databaseId: "claw.database.core",
      dataType: "TEXT",
      nullable: name === "updated_at" || name === "archived_at",
      source: registrySource,
    })),
    clawPersistentSurface.index({
      id: "claw.database.core.table.workspace_records.index.workspace_records_collection_updated_idx",
      name: "workspace_records_collection_updated_idx",
      parentId: "claw.database.core.table.workspace_records",
      databaseId: "claw.database.core",
      source: registrySource,
    }),
    clawPersistentSurface.table({
      id: "claw.database.core.table.workspace_meta",
      name: "workspace_meta",
      parentId: "claw.database.core",
      databaseId: "claw.database.core",
      source: registrySource,
    }),
    ...["meta_key", "meta_value"].map((name) => clawPersistentSurface.column({
      id: `claw.database.core.table.workspace_meta.column.${name}`,
      name,
      parentId: "claw.database.core.table.workspace_meta",
      databaseId: "claw.database.core",
      dataType: "TEXT",
      nullable: false,
      source: registrySource,
    })),
    clawPersistentSurface.database({
      id: "claw.database.runtime",
      kind: "sidecar",
      name: "Runtime sidecar database",
      path: `${clawGlobalHomeLayout.data}/runtime.sqlite`,
      parentId: "claw.global",
      storageClass: "sidecar",
      source: registrySource,
      envOverrides: ["RUNTIME_DB_PATH", "RUNTIME_DATA_DIR", "CLAW_DATA_DIR", "CLAW_HOME"],
    }),
    clawPersistentSurface.database({
      id: "claw.database.sessions",
      kind: "sidecar",
      name: "Sessions sidecar database",
      path: `${clawGlobalHomeLayout.data}/${clawDataFiles.sessionsDatabase}`,
      parentId: "claw.global",
      storageClass: "sidecar",
      source: registrySource,
      envOverrides: ["CLAW_SESSIONS_DB_PATH", "CLAW_SESSIONS_DATA_DIR", "CLAW_DATA_DIR", "CLAW_HOME"],
    }),
    clawPersistentSurface.database({
      id: "claw.database.audio",
      kind: "sidecar",
      name: "Audio sidecar database",
      path: `${clawGlobalHomeLayout.data}/audio.sqlite`,
      parentId: "claw.global",
      storageClass: "sidecar",
      source: registrySource,
      envOverrides: ["CLAW_AUDIO_DB_PATH", "CLAW_AUDIO_DATA_DIR", "CLAW_DATA_DIR", "CLAW_HOME"],
    }),
    clawPersistentSurface.database({
      id: "claw.database.search",
      kind: "sidecar",
      name: "Search sidecar database",
      path: `${clawGlobalHomeLayout.data}/${clawDataFiles.searchDatabase}`,
      parentId: "claw.global",
      storageClass: "sidecar",
      source: registrySource,
      envOverrides: ["CLAW_SEARCH_DB_PATH", "CLAW_SEARCH_DATA_DIR", "CLAW_DATA_DIR", "CLAW_HOME"],
    }),
    clawPersistentSurface.database({
      id: "claw.database.notify",
      kind: "sidecar",
      name: "Notify sidecar database",
      path: `${clawGlobalHomeLayout.data}/notify.sqlite`,
      parentId: "claw.global",
      storageClass: "sidecar",
      source: registrySource,
      envOverrides: ["NOTIFY_DB_PATH", "NOTIFY_DATA_DIR", "CLAW_DATA_DIR", "CLAW_HOME"],
    }),
    clawPersistentSurface.database({
      id: "claw.database.feed",
      kind: "sidecar",
      name: "Feed sidecar database",
      path: `${clawGlobalHomeLayout.data}/feed.sqlite`,
      parentId: "claw.global",
      storageClass: "sidecar",
      source: registrySource,
      envOverrides: ["FEED_DB_PATH", "FEED_DATA_DIR", "CLAW_DATA_DIR", "CLAW_HOME"],
    }),
    clawPersistentSurface.database({
      id: "claw.database.monitor",
      kind: "sidecar",
      name: "Monitor sidecar database",
      path: `${clawGlobalHomeLayout.data}/monitor.sqlite`,
      parentId: "claw.global",
      storageClass: "sidecar",
      source: registrySource,
      envOverrides: ["CLAW_MONITOR_DB_PATH", "CLAW_MONITOR_DATA_DIR", "CLAW_DATA_DIR", "CLAW_HOME"],
    }),
    clawPersistentSurface.path({
      id: "claw.workspace.manifest",
      kind: "file",
      name: "Workspace manifest",
      path: clawWorkspaceLayout.manifest,
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
    }),
    ...Object.entries(clawWorkspaceLayout)
      .filter(([name]) => name !== "root" && name !== "manifest")
      .map(([name, surfacePath]) => clawPersistentSurface.path({
        id: `claw.workspace.${name}`,
        kind: "folder",
        name,
        path: surfacePath,
        parentId: "claw.workspace",
        storageClass: "workspace",
        source: registrySource,
      })),
    clawPersistentSurface.path({
      id: "claw.workspace.styles",
      kind: "folder",
      name: "styles",
      path: `${clawWorkspaceLayout.root}/styles`,
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
    }),
    clawPersistentSurface.path({
      id: "claw.workspace.templates",
      kind: "folder",
      name: "templates",
      path: `${clawWorkspaceLayout.root}/templates`,
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
    }),
    clawPersistentSurface.path({
      id: "claw.workspace.references",
      kind: "folder",
      name: "references",
      path: `${clawWorkspaceLayout.root}/references`,
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
    }),
    clawPersistentSurface.path({
      id: "claw.workspace.slides",
      kind: "folder",
      name: "slides",
      path: `${clawWorkspaceLayout.root}/slides`,
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
    }),
    clawPersistentSurface.path({
      id: "claw.workspace.dashboard_database",
      kind: "folder",
      name: "dashboard-database",
      path: `${clawWorkspaceLayout.root}/dashboard-database`,
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
      notes: "Ephemeral internal database dashboard workspace data directory.",
    }),
    clawPersistentSurface.path({
      id: "claw.workspace.channel_run",
      kind: "folder",
      name: "channel run state",
      path: `${clawWorkspaceLayout.root}/run/channels`,
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
    }),
    clawPersistentSurface.path({
      id: "claw.workspace.telegram_codex_bridge_state",
      kind: "file",
      name: "telegram-codex bridge state",
      path: `${clawWorkspaceLayout.root}/telegram-codex-bridge.json`,
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
    }),
    clawPersistentSurface.path({
      id: "claw.workspace.channel_runs_state",
      kind: "file",
      name: "channel-runs state",
      path: `${clawWorkspaceLayout.root}/channel-runs.json`,
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
    }),
    ...["intents", "compat", "documents", "data"].map((name) => clawPersistentSurface.path({
      id: `claw.workspace.${name}`,
      kind: "folder",
      name,
      path: `${clawWorkspaceLayout.root}/${name}`,
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
    })),
    clawPersistentSurface.path({
      id: "claw.workspace.generations_tmp",
      kind: "persistentTemp",
      name: "generation temp assets",
      path: `${clawWorkspaceLayout.root}/tmp/generations`,
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
    }),
    ...Object.entries(clawGlobalHomeLayout)
      .filter(([name]) => name !== "root")
      .map(([name, surfacePath]) => clawPersistentSurface.path({
        id: `claw.global.${name}`,
        kind: "folder",
        name,
        path: surfacePath,
        parentId: "claw.global",
        storageClass: "frameworkGlobal",
        source: registrySource,
      })),
    ...[
      ["library", "~/.claw/library"],
      ["rules", "~/.claw/rules"],
      ["image_library", "~/.claw/image-library"],
      ["runtime_home", "~/.claw-runtime"],
      ["demo_home", "~/.claw-demo"],
    ].map(([name, surfacePath]) => clawPersistentSurface.path({
      id: `claw.global.${name}`,
      kind: "folder",
      name,
      path: surfacePath,
      parentId: "claw.global",
      storageClass: "frameworkGlobal",
      source: registrySource,
    })),
    ...Object.entries(clawixHomeLayout)
      .filter(([name]) => name !== "root" && name !== "windowsBridgePipe")
      .map(([name, surfacePath]) => clawPersistentSurface.path({
        id: `clawix.home.${name}`,
        kind: name === "bridgeSocket" ? "socket" : "folder",
        owner: "clawix",
        name,
        path: surfacePath,
        parentId: "clawix.home",
        storageClass: "hostOperational",
        canonicality: "hostOnly",
        source: registrySource,
      })),
    clawPersistentSurface.path({
      id: "claw.external.codex",
      kind: "externalReadOnlySource",
      owner: "external",
      name: "Codex home",
      path: "~/.codex",
      storageClass: "external",
      canonicality: "externalReadOnly",
      privacy: "externalReadOnly",
      lifecycle: "external",
      source: registrySource,
      warnings: ["Read, mirror, and index only. Writes require explicit AGENTS.md opt-in."],
    }),
    clawPersistentSurface.path({
      id: "claw.legacy.workspace.clawjs",
      kind: "legacyPath",
      name: "Legacy pre-public workspace root",
      path: ".clawjs",
      storageClass: "workspace",
      canonicality: "legacyReadOnly",
      lifecycle: "legacy",
      source: registrySource,
      warnings: ["New canonical workspace writes must use .claw/."],
    }),
  ],
};

export function listClawPersistentSurfaceNodes(parentId?: string): ClawPersistentSurfaceNode[] {
  const nodes = withSurfaceChildren(clawPersistentSurfaceRegistry.nodes);
  return parentId ? nodes.filter((node) => node.parentId === parentId) : nodes;
}

export function findClawPersistentSurfaceNode(idOrPath: string): ClawPersistentSurfaceNode | undefined {
  const nodes = withSurfaceChildren(clawPersistentSurfaceRegistry.nodes);
  return nodes.find((node) => node.id === idOrPath || node.path === idOrPath || `/${node.id.replace(/\./g, "/")}` === idOrPath);
}

export function resolveClawPersistentSurfacePath(idOrPath: string, rootDir = "", ...children: string[]): string {
  const node = findClawPersistentSurfaceNode(idOrPath);
  const surfacePath = node?.path ?? idOrPath;
  const parts = [rootDir, surfacePath, ...children].filter(Boolean);
  return parts.join("/").replace(/\/+/g, "/").replace(/\/$/, "");
}

export function withSurfaceChildren(nodes: ClawPersistentSurfaceNode[]): ClawPersistentSurfaceNode[] {
  const childMap = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    childMap.set(node.parentId, [...(childMap.get(node.parentId) ?? []), node.id]);
  }
  return nodes.map((node) => ({
    ...node,
    ...(childMap.has(node.id) ? { children: childMap.get(node.id) } : {}),
  }));
}
