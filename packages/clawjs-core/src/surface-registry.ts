import { clawCliCommandRegistry } from "./cli-command-registry.ts";

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
  | "envVar"
  | "envOverride"
  | "cache"
  | "fixture"
  | "persistentTemp"
  | "legacyPath"
  | "externalReadOnlySource"
  | "apiRoute"
  | "privateApiRoute"
  | "apiMethod"
  | "apiParameter"
  | "webhook"
  | "webhookEvent"
  | "eventTopic"
  | "queueTopic"
  | "jsonSchema"
  | "jsonField"
  | "enumValue"
  | "errorCode"
  | "packageName"
  | "packageExport"
  | "packageBin"
  | "nativeIdentity"
  | "fileFormat"
  | "cliCommand"
  | "cliFlag"
  | "cliOutputField"
  | "protocol"
  | "protocolFrame"
  | "protocolField"
  | "idNamespace"
  | "idPrefix"
  | "deepLink"
  | "hostname"
  | "port"
  | "externalDependency"
  | "externalMapping";

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
export type ClawStableSurfaceClass =
  | "persistent"
  | "api"
  | "protocol"
  | "event"
  | "schema"
  | "id"
  | "cli"
  | "config"
  | "package"
  | "native"
  | "format"
  | "external";
export type ClawStableSurfaceStability = "v1" | "preV1Reset" | "internalCrossVersion" | "externalDependency";
export type ClawStableSurfaceDirection = "inbound" | "outbound" | "bidirectional" | "local" | "generated";
export type ClawSurfaceParitySurface = "humanUi" | "sdk" | "cli" | "serviceApi" | "mcp" | "relay" | "persistence";
export type ClawSurfaceParityStatus = "required" | "optional" | "local-only" | "remote-safe" | "blocked" | "not applicable";

export interface ClawSurfaceParityGap {
  surface: ClawSurfaceParitySurface;
  status: ClawSurfaceParityStatus;
  reason?: string;
}

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
  surfaceClass?: ClawStableSurfaceClass;
  stability?: ClawStableSurfaceStability;
  direction?: ClawStableSurfaceDirection;
  version?: string | number;
  value?: string;
  method?: string;
  route?: string;
  schemaId?: string;
  fieldPath?: string;
  enumType?: string;
  idPattern?: string;
  externalProvider?: string;
  replacement?: string;
  introducedIn?: string;
  deprecatedIn?: string;
  dataType?: string;
  nullable?: boolean;
  humanSurfaces?: ClawSurfaceParitySurface[];
  programmaticSurfaces?: ClawSurfaceParitySurface[];
  surfaceGaps?: ClawSurfaceParityGap[];
  notes?: string;
  warnings?: string[];
}

export interface ClawPersistentSurfaceRegistry {
  version: number;
  nodes: ClawPersistentSurfaceNode[];
}

export type ClawStableSurfaceKind = ClawPersistentSurfaceKind;
export type ClawStableSurfaceNode = ClawPersistentSurfaceNode;
export type ClawStableSurfaceRegistry = ClawPersistentSurfaceRegistry;

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
  envVar(input: SurfaceBuilderInput<"envVar" | "envOverride">): ClawPersistentSurfaceNode {
    return surfaceNode({ ...input, kind: input.kind ?? "envVar", privacy: input.privacy ?? "public", surfaceClass: input.surfaceClass ?? "config" });
  },
  envOverride(input: SurfaceBuilderInput<"envOverride">): ClawPersistentSurfaceNode {
    return this.envVar({ ...input, kind: "envOverride" });
  },
  contract(input: SurfaceBuilderInput<"apiRoute" | "privateApiRoute" | "apiMethod" | "apiParameter" | "webhook" | "webhookEvent" | "eventTopic" | "queueTopic" | "jsonSchema" | "jsonField" | "enumValue" | "errorCode" | "packageName" | "packageExport" | "packageBin" | "nativeIdentity" | "fileFormat" | "cliCommand" | "cliFlag" | "cliOutputField" | "protocol" | "protocolFrame" | "protocolField" | "idNamespace" | "idPrefix" | "deepLink" | "hostname" | "port" | "externalDependency" | "externalMapping"> & { kind: "apiRoute" | "privateApiRoute" | "apiMethod" | "apiParameter" | "webhook" | "webhookEvent" | "eventTopic" | "queueTopic" | "jsonSchema" | "jsonField" | "enumValue" | "errorCode" | "packageName" | "packageExport" | "packageBin" | "nativeIdentity" | "fileFormat" | "cliCommand" | "cliFlag" | "cliOutputField" | "protocol" | "protocolFrame" | "protocolField" | "idNamespace" | "idPrefix" | "deepLink" | "hostname" | "port" | "externalDependency" | "externalMapping" }): ClawPersistentSurfaceNode {
    return surfaceNode({
      ...input,
      storageClass: input.storageClass ?? "external",
      privacy: input.privacy ?? "public",
      lifecycle: input.lifecycle ?? "durable",
      surfaceClass: input.surfaceClass ?? stableSurfaceClassForKind(input.kind),
      stability: input.stability ?? "v1",
    });
  },
};

export const clawStableSurface = clawPersistentSurface;

function stableSurfaceClassForKind(kind: ClawPersistentSurfaceKind | undefined): ClawStableSurfaceClass {
  if (!kind) return "persistent";
  if (["apiRoute", "privateApiRoute", "apiMethod", "apiParameter", "webhook", "webhookEvent"].includes(kind)) return "api";
  if (["protocol", "protocolFrame", "protocolField"].includes(kind)) return "protocol";
  if (["eventTopic", "queueTopic"].includes(kind)) return "event";
  if (["jsonSchema", "jsonField", "enumValue", "errorCode"].includes(kind)) return "schema";
  if (["idNamespace", "idPrefix"].includes(kind)) return "id";
  if (["cliCommand", "cliFlag", "cliOutputField"].includes(kind)) return "cli";
  if (["envVar", "envOverride", "deepLink", "hostname", "port"].includes(kind)) return "config";
  if (["packageName", "packageExport", "packageBin"].includes(kind)) return "package";
  if (kind === "nativeIdentity") return "native";
  if (kind === "fileFormat") return "format";
  if (["externalDependency", "externalMapping", "externalReadOnlySource"].includes(kind)) return "external";
  return "persistent";
}

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

export function clawApiPath(path = ""): string {
  const suffix = path.replace(/^\/+/, "");
  return suffix ? `${clawPublicApiPrefix}/${suffix}` : clawPublicApiPrefix;
}

export const clawCommonJsonFields = {
  schemaVersion: "schemaVersion",
  protocolVersion: "protocolVersion",
  sessionId: "sessionId",
  requestId: "requestId",
  runtimeId: "runtimeId",
  agentId: "agentId",
  providerId: "providerId",
  modelId: "modelId",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;

export const clawHostApiRoutes = {
  commands: "/v1/commands",
} as const;

export const clawStorageApiRoutes = {
  ownerToken: "/v1/storage/owner-token",
  buckets: "/v1/storage/buckets",
  objects: "/v1/storage/objects",
  objectPrefix: "/v1/storage/objects/",
  shares: "/v1/storage/shares",
  apiPrefix: "/v1/storage/",
  sharedPrefix: "/shared/storage/",
} as const;

export const clawDatabaseApiRoutes = {
  realtime: "/v1/realtime",
  health: "/v1/health",
  adminLogin: "/v1/auth/admin/login",
  namespaces: "/v1/namespaces",
  namespaceCollections(namespaceId: string): string {
    return `/v1/namespaces/${encodeURIComponent(namespaceId)}/collections`;
  },
  collection(namespaceId: string, collectionName: string): string {
    return `/v1/namespaces/${encodeURIComponent(namespaceId)}/collections/${encodeURIComponent(collectionName)}`;
  },
  records(namespaceId: string, collectionName: string): string {
    return `${this.collection(namespaceId, collectionName)}/records`;
  },
  record(namespaceId: string, collectionName: string, recordId: string): string {
    return `${this.records(namespaceId, collectionName)}/${encodeURIComponent(recordId)}`;
  },
  namespaceTokens(namespaceId: string): string {
    return `/v1/namespaces/${encodeURIComponent(namespaceId)}/tokens`;
  },
  revokeToken(namespaceId: string, tokenId: string): string {
    return `${this.namespaceTokens(namespaceId)}/${encodeURIComponent(tokenId)}/revoke`;
  },
  namespaceFiles(namespaceId: string): string {
    return `/v1/namespaces/${encodeURIComponent(namespaceId)}/files`;
  },
  files: "/v1/files",
  file(fileId: string): string {
    return `/v1/files/${encodeURIComponent(fileId)}`;
  },
} as const;

export const clawDatabaseApiRoutePatterns = {
  realtime: clawDatabaseApiRoutes.realtime,
  health: clawDatabaseApiRoutes.health,
  adminLogin: clawDatabaseApiRoutes.adminLogin,
  adminBootstrap: "/v1/auth/admin/bootstrap",
  me: "/v1/auth/me",
  settings: "/v1/settings",
  namespaces: clawDatabaseApiRoutes.namespaces,
  namespace: "/v1/namespaces/:namespaceId",
  namespaceCollections: "/v1/namespaces/:namespaceId/collections",
  collection: "/v1/namespaces/:namespaceId/collections/:collectionName",
  records: "/v1/namespaces/:namespaceId/collections/:collectionName/records",
  record: "/v1/namespaces/:namespaceId/collections/:collectionName/records/:recordId",
  namespaceFiles: "/v1/namespaces/:namespaceId/files",
  files: clawDatabaseApiRoutes.files,
  file: "/v1/files/:fileId",
  namespaceTokens: "/v1/namespaces/:namespaceId/tokens",
  revokeToken: "/v1/namespaces/:namespaceId/tokens/:tokenId/revoke",
} as const;

export const clawDatabaseRecordEvents = {
  created: "record.created",
  updated: "record.updated",
  deleted: "record.deleted",
} as const;

export const clawSearchApiRoutes = {
  realtime: "/v1/realtime",
  health: "/v1/health",
  types: "/v1/types",
  entitiesUpsert: "/v1/entities/upsert",
  entity(id: string): string {
    return `/v1/entities/${encodeURIComponent(id)}`;
  },
  entityHistory(id: string): string {
    return `${this.entity(id)}/history`;
  },
  entitiesQuery: "/v1/entities/query",
  entitiesSearch: "/v1/entities/search",
  searches: "/v1/searches",
  runSearch(id: string): string {
    return `/v1/searches/${encodeURIComponent(id)}/run`;
  },
  monitors: "/v1/monitors",
  fireMonitor(id: string): string {
    return `/v1/monitors/${encodeURIComponent(id)}/fire`;
  },
  runs: "/v1/runs",
  run(id: string): string {
    return `/v1/runs/${encodeURIComponent(id)}`;
  },
  alerts: "/v1/alerts",
  ackAlert(id: string): string {
    return `/v1/alerts/${encodeURIComponent(id)}/ack`;
  },
  tagsApply: "/v1/tags/apply",
} as const;

export const clawTimeApiRoutes = {
  items: "/v1/items",
  item(id: string): string {
    return `/v1/items/${encodeURIComponent(id)}`;
  },
  itemPause(id: string): string {
    return `${this.item(id)}/pause`;
  },
  itemResume(id: string): string {
    return `${this.item(id)}/resume`;
  },
  itemRun(id: string): string {
    return `${this.item(id)}/run`;
  },
  executions: "/v1/executions",
  runLog: "/v1/run-log",
  calendarView: "/v1/views/calendar",
  timelineView: "/v1/views/timeline",
  signals: "/v1/signals",
  legacyEvents: "/v1/legacy/events",
  legacyRoutines: "/v1/legacy/routines",
} as const;

export const clawNotifyApiRoutes = {
  notifications: "/v1/notifications",
} as const;

export const clawTemporalEvents = {
  itemDue: "temporal.item.due",
} as const;

export const clawSessionEvents = {
  projectUpdated: "project.updated",
  updated: "session.updated",
  messageAppended: "message.appended",
  messageUpdated: "message.updated",
  turnStarted: "turn.started",
  turnFinished: "turn.finished",
} as const;

export const clawChannelEvents = {
  messageReceived: "channel.message.received",
  targetDiscovered: "channel.target.discovered",
  messageSent: "channel.message.sent",
  listenerStarted: "channel.listener.started",
  listenerError: "channel.listener.error",
  listenerStopped: "channel.listener.stopped",
  processorInvoked: "channel.processor.invoked",
} as const;

export const clawWorkspaceAuditEvents = {
  workspaceCreated: "workspace.created",
  filesSynced: "files.synced",
  auditChild: "audit.child",
  tasksCreated: "tasks.created",
  notesCreated: "notes.created",
  tasksUpdated: "tasks.updated",
} as const;

export const clawNotifyEventTypes = {
  sdkAlert: "sdk.alert",
  deploymentFailed: "deployment.failed",
  deploymentRecovered: "deployment.recovered",
  summaryReady: "summary.ready",
  manualTriggered: "manual.triggered",
} as const;

export const clawExternalWebhookEventSamples = {
  blueskyFeedPost: "app.bsky.feed.post",
  notionPageContentUpdated: "page.content_updated",
  stripeCheckoutSessionCompleted: "checkout.session.completed",
} as const;

export const clawCodexExternalEventSamples = {
  threadStarted: "thread.started",
  itemCompleted: "item.completed",
  turnCompleted: "turn.completed",
} as const;

export const clawBrowserStorageKeys = {
  databaseTheme: "claw-db-theme",
  showcaseTheme: "clawjs-theme",
} as const;

export const clawChatAppStorageKeys = {
  selectedAppearance: "selectedAppearance",
  appLanguage: "appLanguage",
  notificationsEnabled: "notificationsEnabled",
  soundEnabled: "soundEnabled",
  hapticEnabled: "hapticEnabled",
  relayBaseURL: "relayBaseURL",
  relayTenantId: "relayTenantId",
  relayEmail: "relayEmail",
  relayPassword: "relayPassword",
  mainWindowFrame: "NSWindow Frame main",
  swiftUiWindowFrame: "NSWindow Frame SwiftUI",
} as const;

export const clawDriveApiRoutes = {
  realtime: "/v1/realtime",
  health: "/v1/health",
  adminLogin: "/v1/auth/admin/login",
  bootstrap: "/v1/bootstrap",
  items: "/v1/items",
  search: "/v1/search",
  item(itemId: string): string {
    return `/v1/items/${encodeURIComponent(itemId)}`;
  },
  itemMove(itemId: string): string {
    return `${this.item(itemId)}/move`;
  },
  itemCopy(itemId: string): string {
    return `${this.item(itemId)}/copy`;
  },
  itemContent(itemId: string): string {
    return `${this.item(itemId)}/content`;
  },
  itemView(itemId: string): string {
    return `${this.item(itemId)}/view`;
  },
  itemTrash(itemId: string): string {
    return `${this.item(itemId)}/trash`;
  },
  itemRestore(itemId: string): string {
    return `${this.item(itemId)}/restore`;
  },
  itemComments(itemId: string): string {
    return `${this.item(itemId)}/comments`;
  },
  itemRevisions(itemId: string): string {
    return `${this.item(itemId)}/revisions`;
  },
  itemRevisionRestore(itemId: string, revisionId: string): string {
    return `${this.itemRevisions(itemId)}/${encodeURIComponent(revisionId)}/restore`;
  },
  itemShares(itemId: string): string {
    return `${this.item(itemId)}/shares`;
  },
  itemShareRevoke(itemId: string, shareId: string): string {
    return `${this.itemShares(itemId)}/${encodeURIComponent(shareId)}/revoke`;
  },
  tokens: "/v1/tokens",
  tokenRevoke(tokenId: string): string {
    return `/v1/tokens/${encodeURIComponent(tokenId)}/revoke`;
  },
  uploads: "/v1/uploads",
  itemDownload(itemId: string): string {
    return `${this.item(itemId)}/download`;
  },
  itemExport(itemId: string): string {
    return `${this.item(itemId)}/export`;
  },
} as const;

export const clawDriveApiRoutePatterns = {
  realtime: clawDriveApiRoutes.realtime,
  health: clawDriveApiRoutes.health,
  adminLogin: clawDriveApiRoutes.adminLogin,
  bootstrap: clawDriveApiRoutes.bootstrap,
  items: clawDriveApiRoutes.items,
  search: clawDriveApiRoutes.search,
  item: "/v1/items/:itemId",
  itemMove: "/v1/items/:itemId/move",
  itemCopy: "/v1/items/:itemId/copy",
  itemContent: "/v1/items/:itemId/content",
  itemView: "/v1/items/:itemId/view",
  itemTrash: "/v1/items/:itemId/trash",
  itemRestore: "/v1/items/:itemId/restore",
  itemComments: "/v1/items/:itemId/comments",
  itemRevisions: "/v1/items/:itemId/revisions",
  itemRevisionRestore: "/v1/items/:itemId/revisions/:revisionId/restore",
  itemShares: "/v1/items/:itemId/shares",
  itemShareRevoke: "/v1/items/:itemId/shares/:shareId/revoke",
  itemSharesAll: "/v1/items/:itemId/shares/all",
  tokens: clawDriveApiRoutes.tokens,
  tokenRevoke: "/v1/tokens/:tokenId/revoke",
  uploads: clawDriveApiRoutes.uploads,
  itemDownload: "/v1/items/:itemId/download",
  itemExport: "/v1/items/:itemId/export",
  itemThumbnail: "/v1/items/:itemId/thumbnail",
  itemExif: "/v1/items/:itemId/exif",
  semanticSearch: "/v1/search/semantic",
  audit: "/v1/audit",
  encryptedFolders: "/v1/encrypted-folders",
  projectEnsureFolder: "/v1/projects/:slug/ensure-folder",
} as const;

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
  browserProfileCache: ".claw-browser",
  demoCache: ".claw-demo",
  e2eCache: ".claw-e2e",
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

const registrySource: ClawPersistentSurfaceSource = { file: "packages/clawjs-core/src/surface-registry.ts", language: "typescript" };

const contractDefaults = { storageClass: "external" as const, canonicality: "canonical" as const, privacy: "public" as const, lifecycle: "durable" as const, source: registrySource };

const cliCommands = clawCliCommandRegistry.commands.map((entry) => entry.name);

function stableRouteSurfaceKey(route: string): string {
  return route.replace(/^\/(?:v\d+|api)\/?/, "").split(/[^A-Za-z0-9]+/).filter(Boolean).map((part, index) => index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)).join("") || "root";
}

const corePublicRouteValues = "/v1/chat/completions /v1/app/ /v1/connector/connect /v1/families /v1/me/devices /v1/responses /v1/secrets /v1/secrets/setup /v1/storage /v1/storage/objects/workspace/agents/agent-a/remote/note.txt /v1/items/item-1/shares /v1/items/item-1/shares/share-1/revoke /v1/storage/shares /v1/system/status /v1/uploads /v1/workspaces".split(" ");

const corePublicRoutes = [
  ...corePublicRouteValues.map((route) => [`claw.api.${stableRouteSurfaceKey(route)}`, "GET", route, `${route} API route`] as const),
  ["claw.api.events", "GET", clawEventsPath, "Public framework event stream"],
  ["claw.api.host.commands", "POST", clawHostApiRoutes.commands, "Host command endpoint"],
  ["claw.api.storage.ownerToken", "GET", clawStorageApiRoutes.ownerToken, "Storage owner token endpoint"],
  ["claw.api.storage.buckets", "GET", clawStorageApiRoutes.buckets, "Storage bucket list"],
  ["claw.api.storage.objects", "GET", clawStorageApiRoutes.objects, "Storage object list"],
  ["claw.api.storage.shares", "POST", clawStorageApiRoutes.shares, "Storage share creation"],
  ["claw.api.database.namespaces", "GET", clawDatabaseApiRoutes.namespaces, "Database namespace list"],
  ["claw.api.database.collections", "GET", "/v1/namespaces/{namespace}/collections", "Database collection list"],
  ["claw.api.database.records", "GET", "/v1/namespaces/{namespace}/collections/{collection}/records", "Database record list"],
  ["claw.api.database.adminLogin", "POST", clawDatabaseApiRoutes.adminLogin, "Database admin login"],
  ["claw.api.database.realtime", "GET", clawDatabaseApiRoutes.realtime, "Database realtime websocket"],
  ["claw.api.drive.health", "GET", clawDriveApiRoutes.health, "Drive health endpoint"],
  ["claw.api.drive.login", "POST", clawDriveApiRoutes.adminLogin, "Drive admin login"],
  ["claw.api.drive.items", "GET", clawDriveApiRoutes.items, "Drive item list"],
  ["claw.api.drive.search", "GET", clawDriveApiRoutes.search, "Drive search endpoint"],
  ["claw.api.search.types", "GET", clawSearchApiRoutes.types, "Search/index type list"],
  ["claw.api.search.entitiesUpsert", "POST", clawSearchApiRoutes.entitiesUpsert, "Search/index entity upsert"],
  ["claw.api.search.searches", "GET", clawSearchApiRoutes.searches, "Search definition list"],
  ["claw.api.search.monitors", "GET", clawSearchApiRoutes.monitors, "Search monitor list"],
  ["claw.api.time.items", "GET", clawTimeApiRoutes.items, "Time item list"],
  ["claw.api.time.executions", "GET", clawTimeApiRoutes.executions, "Time execution list"],
  ["claw.api.time.calendar", "GET", clawTimeApiRoutes.calendarView, "Time calendar view"],
  ["claw.api.time.timeline", "GET", clawTimeApiRoutes.timelineView, "Time timeline view"],
  ["claw.api.notify.notifications", "POST", clawNotifyApiRoutes.notifications, "Notification dispatch endpoint"],
  ["claw.api.webhooks.providerEvent", "POST", "/v1/webhooks/{provider}/{event}", "Provider webhook ingress"],
  ["claw.api.integrations.callback", "GET", "/v1/integrations/{provider}/callback", "OAuth integration callback"],
] as const;

const corePrivateRouteValues = "/api/attachments /api/auth/token /api/capture /api/captures /api/chat/feedback /api/comments /api/config/profile /api/config/reset /api/config/workspace-files /api/connectors/catalog /api/context /api/custom-fields /api/cycles /api/discover/local /api/e2e/seed /api/epics /api/export /api/field-values /api/goals /api/graph /api/hot-topics/seed /api/images /api/instances /api/integrations/auth /api/integrations/enable /api/integrations/gateway /api/integrations/install /api/integrations/install-stream /api/integrations/reveal /api/integrations/slack/connect /api/integrations/slack/test /api/integrations/telegram/connect /api/integrations/telegram/test /api/integrations/uninstall /api/integrations/whatsapp/cleanup /api/integrations/whatsapp/connect /api/lists /api/memory/person /api/milestones /api/monitors /api/notes/ /api/notify/actions /api/people /api/projects /api/promote /api/recurrences /api/row /api/saved-views /api/search /api/sections /api/seed /api/sessions /api/setup /api/skills/install /api/skills/remove /api/skills/sources /api/sources/refresh /api/stats /api/telegram/account /api/templates /api/timeline /api/tools/conclude /api/tools/get/ /api/tools/search /api/tools/status /api/tts /api/tts/providers /api/users /api/activity /api/apps/{appId}/dashboard /api/apps/{appId}/assets /api/auth.test /api/chat/sessions /api/claw/status /api/companies /api/config /api/config/local /api/connectors/subscriptions /api/contacts /api/data /api/dm /api/e2e/reset /api/e2e/status /api/events /api/health /api/images/backends /api/inbox /api/inspect/preview /api/integrations/setup /api/integrations/status /api/integrations/whatsapp/chats /api/memory /api/notes /api/notify/dashboard /api/personas /api/plugins /api/routines /api/rules /api/schema /api/skills/list /api/sources /api/spaces /api/summary /api/tasks /api/tools/save /api/ui /api/usage".split(" ");

const corePrivateRoutes = corePrivateRouteValues.map((route) => [`claw.privateApi.${stableRouteSurfaceKey(route)}`, "GET", route, `${route} private API route`] as const);

const stableJsonFields = [
  ["claw.schema.common.field.schemaVersion", clawCommonJsonFields.schemaVersion, "Persisted/exported data version field"],
  ["claw.schema.common.field.protocolVersion", clawCommonJsonFields.protocolVersion, "Wire protocol version field"],
  ["claw.schema.common.field.sessionId", clawCommonJsonFields.sessionId, "Framework conversation identity"],
  ["claw.schema.common.field.requestId", clawCommonJsonFields.requestId, "Request correlation identity"],
  ["claw.schema.common.field.runtimeId", clawCommonJsonFields.runtimeId, "Runtime identity"],
  ["claw.schema.common.field.agentId", clawCommonJsonFields.agentId, "Agent identity"],
  ["claw.schema.common.field.providerId", clawCommonJsonFields.providerId, "Provider identity"],
  ["claw.schema.common.field.modelId", clawCommonJsonFields.modelId, "Model identity"],
  ["claw.schema.common.field.createdAt", clawCommonJsonFields.createdAt, "Creation instant"],
  ["claw.schema.common.field.updatedAt", clawCommonJsonFields.updatedAt, "Update instant"],
] as const;

const stableErrorCodes = [
  ["claw.error.inspect_manifest_error", "inspect_manifest_error", "Inspect manifest read/parse failure"],
  ["claw.error.inspect_codebase_manifest_error", "inspect_codebase_manifest_error", "Codebase manifest read/parse failure"],
  ["claw.error.inspect_not_found", "inspect_not_found", "Inspect target not found"],
  ["claw.error.usage_error", "usage_error", "CLI usage error"],
] as const;

const stablePackageNames = [
  ["claw.package.core", "@clawjs/core", "ClawJS core package"],
  ["claw.package.cli", "@clawjs/cli", "Claw CLI package"],
  ["claw.package.claw", "@clawjs/claw", "Claw SDK package"],
  ["claw.package.workspace", "@clawjs/workspace", "Workspace package"],
  ["claw.package.node", "@clawjs/node", "Node compatibility package"],
  ["claw.package.database", "@clawjs/database", "Database package"],
  ["claw.package.agents", "@clawjs/agents", "Agents package"],
  ["claw.package.integrations", "@clawjs/integrations", "Integrations package"],
  ["claw.package.marketplace", "@clawjs/marketplace", "Marketplace package"],
  ["claw.package.profile", "@clawjs/profile", "Profile package"],
  ["claw.package.audio", "@clawjs/audio", "Audio package"],
  ["claw.package.sessions", "@clawjs/sessions", "Sessions package"],
  ["claw.package.userModel", "@clawjs/user-model", "User model package"],
  ["claw.package.runtime", "@clawjs/runtime", "Runtime package"],
  ["claw.package.sandbox", "@clawjs/sandbox", "Sandbox package"],
  ["claw.package.mcp", "@clawjs/mcp", "MCP package"],
  ["claw.package.voice", "@clawjs/voice", "Voice package"],
  ["claw.package.channelBase", "@clawjs/channel-base", "Channel base package"],
  ["claw.package.mesh", "@clawjs/mesh", "Mesh package"],
  ["claw.package.signals", "@clawjs/signals", "Signals package"],
  ["claw.package.signalsCore", "@clawjs/signals-core", "Signals core package"],
  ["claw.package.createApp", "create-claw-app", "Create Claw app generator"],
  ["claw.package.createAgent", "create-claw-agent", "Create Claw agent generator"],
  ["claw.package.createServer", "create-claw-server", "Create Claw server generator"],
  ["claw.package.createPlugin", "create-claw-plugin", "Create Claw plugin generator"],
  ["claw.package.eslintConfig", "eslint-config-claw", "ESLint config package"],
] as const;

const stablePackageBins = [
  ["claw.package.bin.claw", "claw", "Public framework CLI"],
  ["claw.package.bin.createClawApp", "create-claw-app", "Create app generator CLI"],
  ["claw.package.bin.createClawAgent", "create-claw-agent", "Create agent generator CLI"],
  ["claw.package.bin.createClawServer", "create-claw-server", "Create server generator CLI"],
  ["claw.package.bin.createClawPlugin", "create-claw-plugin", "Create plugin generator CLI"],
] as const;

function stableEnvVarId(value: string): string { return `claw.env.${value.replace(/^CLAW_/, "").toLowerCase().replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())}`; }
function stableEnvVarName(value: string): string { return `${value.replace(/^CLAW_/, "").toLowerCase().replace(/_/g, " ")} environment variable`; }

const stableEnvVarValues = "CLAW_ALLOWED_ORIGINS CLAW_AUDIO_BLOBS_DIR CLAW_AUDIO_DATA_DIR CLAW_AUDIO_HOST CLAW_AUDIO_PORT CLAW_AUDIO_SHARED_SECRET CLAW_BIN CLAW_CALENDAR_MOCK CLAW_CODEX_PATH CLAW_CODE_HOME CLAW_COMPANY_FAKE_AGENT_RUNS CLAW_COMPANY_OPENCLAW_AGENT_ID CLAW_COMPONENTS_SOURCE_DIR CLAW_CONNECTOR_CATALOG_PATH CLAW_CONNECTOR_SUBSCRIPTIONS_PATH CLAW_CONTENT_TOKEN CLAW_CONTENT_URL CLAW_DATABASE_ADMIN_EMAIL CLAW_DATABASE_ADMIN_PASSWORD CLAW_DATABASE_CORS_ORIGINS CLAW_DATABASE_DATA_DIR CLAW_DATABASE_DIR CLAW_DATABASE_FILES_DIR CLAW_DATABASE_HOST CLAW_DATABASE_JWT_SECRET CLAW_DATABASE_NAMESPACE CLAW_DATABASE_PORT CLAW_DATABASE_URL CLAW_DATA_DIR CLAW_DAY_ROOT CLAW_DB_PATH CLAW_DEBUG_CHAT_PERF CLAW_DEMO_DATA_DIR CLAW_DEVICE_TEST_COMMAND CLAW_DOMAINS_ACTIVE CLAW_DOMAIN_SHARE_URL CLAW_DRIVE_BACKEND CLAW_DRIVE_BASE CLAW_DRIVE_CLOUDFLARED CLAW_DRIVE_CONVERTER_MODE CLAW_DRIVE_CORS_ORIGINS CLAW_DRIVE_DATA_DIR CLAW_DRIVE_DB_PATH CLAW_DRIVE_EMAIL CLAW_DRIVE_EMBED_SIDECAR CLAW_DRIVE_HOST CLAW_DRIVE_JWT_SECRET CLAW_DRIVE_OCR_SIDECAR CLAW_DRIVE_PASSWORD CLAW_DRIVE_PORT CLAW_DRIVE_PUBLIC_BASE_URL CLAW_DRIVE_STATUS_FILE CLAW_DRIVE_TOKEN CLAW_DRIVE_UI_DIST_DIR CLAW_E2E CLAW_E2E_DISABLE_EXTERNAL_CALLS CLAW_E2E_FIXTURE_MODE CLAW_E2E_REUSE_SERVER CLAW_EMAIL_MOCK CLAW_ERP_DIR CLAW_FILES_DIR CLAW_FIND_COMMAND_STRICT_PATH CLAW_GUIDANCE_DIR CLAW_HOME CLAW_HOST_APP_BUNDLE CLAW_HOST_APP_SUPPORT_NAME CLAW_HOST_BIN_DIR CLAW_HOST_BUNDLE_ID CLAW_HOST_CLI_NAME CLAW_HOST_DAEMON_NAME CLAW_HOST_DISABLE_LEGACY_SOCKET_FALLBACK CLAW_HOST_DISPLAY_NAME CLAW_HOST_HOME CLAW_HOST_ID CLAW_HOST_LAUNCH_AGENTS_DIR CLAW_HOST_LAUNCH_AGENT_LABEL CLAW_HOST_LOG_SUBSYSTEM CLAW_HOST_MACH_SERVICE CLAW_HOST_OBSIDIAN_VAULT CLAW_HOST_PERMISSION_NAME CLAW_HOST_PERMISSION_REQUEST_DRY_RUN CLAW_HOST_PERMISSION_REQUEST_LOG CLAW_HOST_RUNTIME_TRANSPORT CLAW_HOST_SAFE CLAW_HOST_TEST_CALENDAR CLAW_HOST_TEST_COMMAND CLAW_HOST_TEST_MAILBOX CLAW_HOST_TEST_MODE CLAW_HOST_TEST_NOTES_FOLDER CLAW_HOST_TEST_REMINDERS_LIST CLAW_HOST_TEST_SAFARI_WINDOW CLAW_HOST_TEST_THINGS_PROJECT CLAW_HOST_VALIDATION_MODE CLAW_IMAGE_LIBRARY_DIR CLAW_IOT_BASE_URL CLAW_IOT_DIR CLAW_LIBRARY_DIR CLAW_LIVE_BROKER_COMMAND CLAW_LOCAL_ADMIN_BOOTSTRAP_STDIN CLAW_MEMORY_BASE CLAW_MEMORY_EDITOR CLAW_MEMORY_HOST CLAW_MEMORY_PORT CLAW_MEMORY_WORKSPACE CLAW_MONITOR_COLLECT_INTERVAL_MS CLAW_MONITOR_CORS_ORIGINS CLAW_MONITOR_HOST CLAW_MONITOR_LOCAL_DISCOVERY_INTERVAL_MS CLAW_MONITOR_LOCAL_SCAN_PORTS CLAW_MONITOR_MODE CLAW_MONITOR_PORT CLAW_MONITOR_RELAY_TOKEN CLAW_MONITOR_RELAY_URL CLAW_MONITOR_RETENTION_DAYS CLAW_NODE CLAW_OPENCLAW_PATH CLAW_OPEN_WORKSPACE CLAW_PREVIEW_CLOUDFLARE_URL CLAW_PUBLISHING_CORS_ORIGINS CLAW_PUBLISHING_DATA_DIR CLAW_PUBLISHING_DB_PATH CLAW_PUBLISHING_DIR CLAW_PUBLISHING_DRIVE_URL CLAW_PUBLISHING_HEALTH_PROBE_MS CLAW_PUBLISHING_HOST CLAW_PUBLISHING_LOG_LEVEL CLAW_PUBLISHING_PIPELINE_ENABLED CLAW_PUBLISHING_PORT CLAW_PUBLISHING_PRINT_TOKEN CLAW_PUBLISHING_PUBLIC_BASE_URL CLAW_PUBLISHING_RECURRENCE_TICK_MS CLAW_PUBLISHING_SCHEDULER_TICK_MS CLAW_PUBLISHING_STATUS_FILE CLAW_PUBLISHING_TOKEN CLAW_PUBLISHING_TOKEN_STORE CLAW_PUBLISHING_URL CLAW_PUBLISHING_VAULT_URL CLAW_PUBLISHING_WORKER_TICK_MS CLAW_PUBLISHING_WORKSPACE CLAW_RELAY_ACCESS_TOKEN CLAW_RELAY_AGENT_ID CLAW_RELAY_TENANT_ID CLAW_RELAY_URL CLAW_RELAY_WORKSPACE_ID CLAW_REPORT_GITHUB_TOKEN CLAW_RESOURCES_DIR CLAW_RULES_DIR CLAW_RUNTIME_HOME CLAW_RUNTIME_PORT CLAW_RUNTIME_SESSIONS_URL CLAW_SEARCH_ADMIN_TOKEN CLAW_SEARCH_BASE CLAW_SEARCH_CODEX_BINARY CLAW_SEARCH_CORS_ORIGINS CLAW_SEARCH_DATA_DIR CLAW_SEARCH_HOST CLAW_SEARCH_JWT_SECRET CLAW_SEARCH_PORT CLAW_SEARCH_RUN_TIMEOUT_MS CLAW_SEARCH_SCHEDULER_TICK_MS CLAW_SEARCH_TOKEN CLAW_SEARCH_WORKER_CONCURRENCY CLAW_SECRETS_ADMIN_TOKEN CLAW_SECRETS_BACKEND CLAW_SECRETS_BASE CLAW_SECRETS_BASE_URL CLAW_SECRETS_BOOTSTRAP_STDIN CLAW_SECRETS_CORS_ORIGINS CLAW_SECRETS_DATA_DIR CLAW_SECRETS_DB_PATH CLAW_SECRETS_ENABLE_UNSAFE_EXTERNAL_PLUGINS CLAW_SECRETS_HOST CLAW_SECRETS_HOST_ASSERTION_KEY_BASE64 CLAW_SECRETS_JWT_SECRET CLAW_SECRETS_KEK_BASE64 CLAW_SECRETS_PLUGINS_DIR CLAW_SECRETS_PORT CLAW_SECRETS_PROXY_PATH CLAW_SECRETS_PUBLIC_BASE_URL CLAW_SECRETS_SIDECAR_PATH CLAW_SECRETS_SIGNED_HOST_TOKEN CLAW_SECRETS_TENANT CLAW_SECRETS_TENANT_ID CLAW_SECRETS_TOKEN CLAW_SECRETS_UI_DIST_DIR CLAW_SESSIONS_CODEX_DIR CLAW_SESSIONS_DATA_DIR CLAW_SESSIONS_DISABLE_CODEX CLAW_SESSIONS_DISABLE_HERMES CLAW_SESSIONS_HERMES_DB CLAW_SESSIONS_HOST CLAW_SESSIONS_PORT CLAW_SESSIONS_SHARED_SECRET CLAW_SKILLS_AUTO_IMPORT CLAW_SLIDES_DISABLE_BROWSER CLAW_TELEGRAM_BACKEND CLAW_TELEGRAM_DOMAIN_SHARE_URL CLAW_TELEGRAM_HOST CLAW_TELEGRAM_LOG_LEVEL CLAW_TELEGRAM_PORT CLAW_TELEGRAM_WORKSPACE CLAW_TEMPLATE_DISABLE_BROWSER CLAW_TEST_LIVE CLAW_TEST_LIVE_PACKAGE CLAW_TEST_WORKSPACE CLAW_TIME_DATA_DIR CLAW_TIME_DB_FILE CLAW_TIME_DEFAULT_TIMEZONE CLAW_TIME_HOST CLAW_TIME_NOTIFY_SOURCE_TOKEN CLAW_TIME_NOTIFY_URL CLAW_TIME_PORT CLAW_TIME_SCHEDULER_INTERVAL_MS CLAW_TIME_TOKEN CLAW_TIME_URL CLAW_WACLI_PATH CLAW_WORKSPACE".split(" ");

const stableEnvVars = stableEnvVarValues.map((value) => [stableEnvVarId(value), value, stableEnvVarName(value)] as const);

const stableFileFormats = [
  ["claw.format.export", ".clawexport", "General Claw export archive"],
  ["claw.format.backup", ".clawbackup", "Full restorable Claw backup archive"],
  ["claw.format.secrets", ".clawsecrets", "Encrypted secrets backup archive"],
  ["claw.format.archiveManifest", "manifest.json", "Internal archive manifest file"],
] as const;

const stableNativeIdentities = [
  ["claw.native.app.bundle", "com.example.claw", "Public placeholder Claw.app bundle identifier"],
  ["claw.native.host.launchAgent", "com.example.claw.host", "Public placeholder Claw host LaunchAgent label"],
  ["claw.native.host.machService", "com.example.claw.host.xpc", "Public placeholder Claw host Mach service"],
  ["clawix.native.app.bundle", "com.example.clawix", "Public placeholder Clawix bundle identifier"],
  ["clawix.native.bridge.launchAgent", "clawix.bridge", "Clawix bridge LaunchAgent/service suite label"],
  ["clawix.native.bridge.service", "clawix-bridge", "Clawix bridge service name"],
  ["clawix.native.bridge.bonjour", "_clawix-bridge._tcp", "Clawix bridge Bonjour service type"],
  ["clawix.native.bridge.pipe", String.raw`\\.\pipe\clawix-bridge`, "Clawix bridge Windows pipe"],
] as const;

export const clawRegisteredDdlSources = [
  "packages/clawjs-database/src/store.ts",
  "packages/clawjs-audio/src/store.ts",
  "packages/clawjs-channel-base/src/index.ts",
  "packages/clawjs-profile/src/storage.ts",
  "packages/clawjs-mcp/src/store.ts",
  "packages/clawjs-runtime/src/store.ts",
  "packages/clawjs-sandbox/src/store.ts",
  "packages/clawjs-sessions/src/store.ts",
  "packages/clawjs-user-model/src/store.ts",
  "packages/clawjs-voice/src/store.ts",
  "packages/mesh/src/audit-store.ts",
  "packages/mesh/src/host-store.ts",
  "packages/mesh/src/identity-store.ts",
  "packages/mesh/src/ssh-secret-store.ts",
  "packages/mesh/src/workspace-store.ts",
  "packages/signals/src/store.ts",
  "modules/feed/src/server/db.ts",
  "modules/erp/src/server/db.ts",
  "wiki/src/server/db.ts",
  "secrets/src/server/db.ts",
  "delegation/src/server/db.ts",
  "execution/src/server/db.ts",
  "relay/src/server/db-schema.ts",
  "memory/src/service.ts",
  "content/src/server/db.ts",
  "iot/src/server/db.ts",
  "drive/src/server/db.ts",
  "packages/clawjs-index/src/db/schema.sql",
  "publishing/src/server/db/schema.ts",
] as const;

const stableIdNamespaces = [
  ["claw.id.session", "sessionId", "Framework agent session identifiers"],
  ["claw.id.thread.external", "threadId", "External runtime thread identifiers"],
  ["claw.id.host", "hostId", "Signed host identifiers"],
  ["claw.id.device", "deviceId", "Device identifiers"],
  ["claw.id.installation", "installationId", "Installation identifiers"],
  ["claw.id.record", "recordId", "Database record identifiers"],
  ["claw.id.resource", "resourceId", "Opaque registered resource identifiers"],
] as const;

const stableSurfaceRoots = [
  ["claw.contracts.api", "API routes", "api", ["serviceApi"]],
  ["claw.contracts.protocol", "Wire protocols", "protocol", ["serviceApi"]],
  ["claw.contracts.events", "Events and queues", "event", ["serviceApi"]],
  ["claw.contracts.schemas", "Schemas and JSON fields", "schema", ["sdk", "serviceApi", "persistence"]],
  ["claw.contracts.ids", "Persistent IDs", "id", ["sdk", "serviceApi", "persistence"]],
  ["claw.contracts.cli", "CLI commands and flags", "cli", ["cli"]],
  ["claw.contracts.config", "Configuration and environment", "config", ["cli", "serviceApi"]],
  ["claw.contracts.packages", "Packages, exports, and bins", "package", ["sdk", "cli"]],
  ["claw.contracts.native", "Native identities", "native", ["humanUi", "serviceApi"]],
  ["claw.contracts.formats", "Import/export formats", "format", ["cli", "persistence"]],
  ["claw.contracts.external", "External dependencies and owned mappings", "external", ["sdk", "serviceApi", "mcp"]],
] as const;

export const clawPersistentSurfaceRegistry: ClawPersistentSurfaceRegistry = {
  version: clawSurfaceRegistryVersion,
  nodes: [
    clawPersistentSurface.root({
      id: "claw.contracts",
      name: "Claw stable compatibility surface",
      path: "contracts",
      storageClass: "external",
      privacy: "public",
      surfaceClass: "schema",
      stability: "v1",
      humanSurfaces: ["humanUi"],
      programmaticSurfaces: ["cli", "persistence"],
      source: registrySource,
      notes: "Root for names, fields, routes, protocols, CLI commands, IDs, and external mappings that must not drift after V1 without versioning.",
    }),
    ...stableSurfaceRoots.map(([id, name, surfaceClass, programmaticSurfaces]) => clawPersistentSurface.root({
      id,
      name,
      path: id.replace("claw.contracts.", "contracts/"),
      parentId: "claw.contracts",
      storageClass: "external",
      privacy: "public",
      surfaceClass: surfaceClass as ClawStableSurfaceClass,
      stability: "v1",
      programmaticSurfaces: [...programmaticSurfaces],
      surfaceGaps: [{ surface: "humanUi", status: "optional", reason: "Category nodes are inspected through generated docs and CLI output." }],
      source: registrySource,
    })),
    ...corePublicRoutes.map(([id, method, route, name]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id,
      kind: "apiRoute",
      name,
      route,
      method,
      value: `${method} ${route}`,
      parentId: "claw.contracts.api",
      direction: "inbound",
    })),
    ...corePrivateRoutes.map(([id, method, route, name]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id,
      kind: "privateApiRoute",
      name,
      route,
      method,
      value: `${method} ${route}`,
      parentId: "claw.contracts.api",
      direction: "inbound",
      notes: "Private app/host UI route. It is still a stable owned surface and must be registered before V1.",
    })),
    clawPersistentSurface.contract({
      ...contractDefaults,
      id: "claw.protocol.hostCommand.v1",
      kind: "protocol",
      name: "Host command contract v1",
      parentId: "claw.contracts.protocol",
      value: "host-command-v1",
      version: 1,
      direction: "bidirectional",
      notes: "Shared framework/signed-host command envelope. Breaking changes after V1 require a new protocol version.",
    }),
    ...["schemaVersion", "requestId", "domain", "resource", "action", "payload"].map((field) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.protocol.hostCommand.v1.field.${field}`,
      kind: "protocolField",
      name: field,
      key: field,
      fieldPath: field,
      parentId: "claw.protocol.hostCommand.v1",
      schemaId: "host-command-v1",
      surfaceClass: "protocol",
      direction: "bidirectional",
    })),
    ...["workspace.initialized", "compat.refreshed", "telegram.webhook_configured", "models.default-set", "auth.login-started"].map((event) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.event.${event.replace(/[^a-zA-Z0-9]+/g, ".")}`,
      kind: "eventTopic",
      name: event,
      value: event,
      parentId: "claw.contracts.events",
      surfaceClass: "event",
      direction: "generated",
    })),
    ...Object.values(clawDatabaseRecordEvents).map((event) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.event.database.${event.replace(/[^a-zA-Z0-9]+/g, ".")}`,
      kind: "eventTopic",
      name: event,
      value: event,
      parentId: "claw.contracts.events",
      surfaceClass: "event",
      direction: "generated",
      notes: "Database realtime event topic emitted for persistent record changes.",
    })),
    ...Object.values(clawTemporalEvents).map((event) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.event.time.${event.replace(/[^a-zA-Z0-9]+/g, ".")}`,
      kind: "eventTopic",
      name: event,
      value: event,
      parentId: "claw.contracts.events",
      surfaceClass: "event",
      direction: "generated",
      notes: "Temporal runtime event emitted for due items and notification routing.",
    })),
    ...Object.values(clawSessionEvents).map((event) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.event.sessions.${event.replace(/[^a-zA-Z0-9]+/g, ".")}`,
      kind: "eventTopic",
      name: event,
      value: event,
      parentId: "claw.contracts.events",
      surfaceClass: "event",
      direction: "generated",
      notes: "Sessions service event emitted over the registered session event stream.",
    })),
    ...Object.values(clawChannelEvents).map((event) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.event.channels.${event.replace(/[^a-zA-Z0-9]+/g, ".")}`,
      kind: "eventTopic",
      name: event,
      value: event,
      parentId: "claw.contracts.events",
      surfaceClass: "event",
      direction: "generated",
      notes: "Channel runtime event emitted by listener, transport, and processor surfaces.",
    })),
    ...Object.values(clawWorkspaceAuditEvents).map((event) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.event.workspaceAudit.${event.replace(/[^a-zA-Z0-9]+/g, ".")}`,
      kind: "eventTopic",
      name: event,
      value: event,
      parentId: "claw.contracts.events",
      surfaceClass: "event",
      direction: "generated",
      notes: "Workspace audit event persisted in the canonical workspace audit log.",
    })),
    ...Object.values(clawNotifyEventTypes).map((event) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.event.notify.${event.replace(/[^a-zA-Z0-9]+/g, ".")}`,
      kind: "eventTopic",
      name: event,
      value: event,
      parentId: "claw.contracts.events",
      surfaceClass: "event",
      direction: "inbound",
      notes: "Notify event type accepted by source apps and dashboard actions.",
    })),
    ...Object.entries({ ...clawExternalWebhookEventSamples, ...clawCodexExternalEventSamples }).map(([name, event]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.external.mapping.event.${name}`,
      kind: "externalMapping",
      owner: "external",
      name: event,
      value: event,
      parentId: "claw.contracts.external",
      surfaceClass: "external",
      stability: "externalDependency",
      direction: "inbound",
      notes: "Sample external event value used by fixtures; Claw registers the dependency/mapping, not the provider schema.",
    })),
    ...stableJsonFields.map(([id, field, name]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id,
      kind: "jsonField",
      name,
      key: field,
      fieldPath: field,
      parentId: "claw.contracts.schemas",
      surfaceClass: "schema",
      direction: "bidirectional",
    })),
    ...stableErrorCodes.map(([id, code, name]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id,
      kind: "errorCode",
      name,
      value: code,
      parentId: "claw.contracts.schemas",
      surfaceClass: "schema",
      direction: "outbound",
    })),
    ...stableIdNamespaces.map(([id, field, name]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id,
      kind: "idNamespace",
      name,
      key: field,
      value: field,
      parentId: "claw.contracts.ids",
      surfaceClass: "id",
      direction: "bidirectional",
    })),
    ...stableEnvVars.map(([id, value, name]) => clawPersistentSurface.envVar({
      ...contractDefaults,
      id,
      kind: "envVar",
      name,
      value,
      key: value,
      parentId: "claw.contracts.config",
      direction: "inbound",
    })),
    ...stablePackageNames.map(([id, value, name]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id,
      kind: "packageName",
      name,
      value,
      parentId: "claw.contracts.packages",
      surfaceClass: "package",
      direction: "outbound",
    })),
    ...stablePackageBins.map(([id, value, name]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id,
      kind: "packageBin",
      name,
      value,
      parentId: "claw.contracts.packages",
      surfaceClass: "package",
      direction: "outbound",
    })),
    ...stableFileFormats.map(([id, value, name]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id,
      kind: "fileFormat",
      name,
      value,
      parentId: "claw.contracts.formats",
      surfaceClass: "format",
      direction: "bidirectional",
    })),
    ...stableNativeIdentities.map(([id, value, name]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id,
      kind: "nativeIdentity",
      name,
      value,
      parentId: "claw.contracts.native",
      surfaceClass: "native",
      direction: "bidirectional",
      notes: "Public repo value is a placeholder or public service name. Real signing identities, Team IDs, and release credentials stay outside the public repository.",
    })),
    ...Object.entries(clawDeepLinkSchemes).map(([name, scheme]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.deeplink.scheme.${name}`,
      kind: "deepLink",
      name: `${scheme}://`,
      value: `${scheme}://`,
      parentId: "claw.contracts.api",
      surfaceClass: "config",
      direction: "inbound",
    })),
    ...Object.entries(clawLocalHostnames).map(([name, hostname]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.hostname.${name}`,
      kind: "hostname",
      name: hostname,
      value: hostname,
      parentId: "claw.contracts.api",
      surfaceClass: "config",
      direction: "inbound",
    })),
    ...Object.entries({ ...clawCorePorts, ...clawAppPorts, clawixBridge: clawixBridgePort }).map(([name, port]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.port.${name}`,
      kind: "port",
      name,
      value: String(port),
      parentId: "claw.contracts.api",
      surfaceClass: "config",
      direction: "inbound",
    })),
    ...cliCommands.map((command) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.cli.command.${command}`,
      kind: "cliCommand",
      name: command,
      value: command,
      parentId: "claw.contracts.cli",
      surfaceClass: "cli",
      direction: "inbound",
    })),
    ...["--json", "--dry-run", "--workspace", "--runtime", "--help", "--guidance", "--actor-assertion"].map((flag) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.cli.flag.${flag.slice(2)}`,
      kind: "cliFlag",
      name: flag,
      value: flag,
      parentId: "claw.contracts.cli",
      surfaceClass: "cli",
      direction: "inbound",
    })),
    ...["openai", "anthropic", "stripe", "telegram", "slack", "google", "microsoft"].map((provider) => clawPersistentSurface.contract({
      ...contractDefaults,
      id: `claw.external.${provider}`,
      kind: "externalDependency",
      owner: "external",
      name: provider,
      value: provider,
      parentId: "claw.contracts.external",
      surfaceClass: "external",
      stability: "externalDependency",
      direction: "outbound",
      notes: "Register the dependency and Claw-owned mapping points; do not copy the full provider schema into the registry.",
    })),
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
      .filter(([name]) => name !== "root" && name !== "manifest" && name !== "observedState")
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
      id: "claw.workspace.reports",
      kind: "folder",
      name: "reports",
      path: `${clawWorkspaceLayout.root}/reports`,
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
      notes: "Sanitized agent-originated GitHub report drafts, quality gates, dedupe fingerprints, and submission receipts.",
    }),
    clawPersistentSurface.path({
      id: "claw.workspace.reports.governance_state",
      kind: "file",
      name: "report governance state",
      path: `${clawWorkspaceLayout.root}/reports/report-governance.json`,
      parentId: "claw.workspace.reports",
      storageClass: "workspace",
      source: registrySource,
      notes: "Stores only redacted report content and local salted fingerprints; raw logs and full attachment paths are not persisted.",
    }),
    clawPersistentSurface.path({
      id: "claw.workspace.need_routes",
      kind: "folder",
      name: "need-routes",
      path: `${clawWorkspaceLayout.root}/need-routes`,
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
      notes: "Local Need Route Lab scenarios, evaluations, dedupe fingerprints, and promotion packets.",
    }),
    clawPersistentSurface.path({
      id: "claw.workspace.need_routes.ledger",
      kind: "file",
      name: "need route lab ledger",
      path: `${clawWorkspaceLayout.root}/need-routes/need-route-lab.json`,
      parentId: "claw.workspace.need_routes",
      storageClass: "workspace",
      source: registrySource,
      notes: "Stores deterministic route evaluations and opportunities; promotion to reports/backlogs remains approval-gated.",
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
    clawPersistentSurface.path({
      id: "claw.workspace.observedState",
      kind: "folder",
      name: "observed state",
      path: ".claw/observed",
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
    }),
    ...["projections", "sessions", "audit", "backups", "locks", "intents", "compat", "documents", "data"].map((name) => clawPersistentSurface.path({
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
      ["guidance", "~/.claw/guidance"],
      ["resources", "~/.claw/resources"],
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
    ...Object.entries(clawBrowserStorageKeys).map(([name, key]) => clawPersistentSurface.preference({
      id: `claw.browserStorage.${name}`,
      kind: "browserStorageKey",
      name,
      key,
      parentId: "claw.contracts.schemas",
      storageClass: "nativeAppData",
      canonicality: "hostOnly",
      privacy: "public",
      source: registrySource,
      surfaceClass: "config",
    })),
    ...Object.entries(clawChatAppStorageKeys).map(([name, key]) => clawPersistentSurface.preference({
      id: `claw.chat.appStorage.${name}`,
      kind: "appStorageKey",
      name,
      key,
      parentId: "claw.contracts.schemas",
      storageClass: "nativeAppData",
      canonicality: "hostOnly",
      privacy: "userData",
      source: registrySource,
      surfaceClass: "config",
    })),
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
