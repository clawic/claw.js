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
  | "retiredPath"
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
  | "retiredReadOnly"
  | "testOnly"
  | "externalReadOnly";
export type ClawPersistentSurfacePrivacy = "public" | "userData" | "secretReference" | "secretMaterial" | "externalReadOnly";
export type ClawPersistentSurfaceLifecycle = "durable" | "rebuildable" | "ephemeral" | "external";
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
export type ClawSurfaceParityStatus = "required" | "optional" | "local-only" | "remote-safe" | "blocked" | "pending" | "not applicable";
export type ClawSurfaceEdgeType = "owns" | "consumes" | "exposes" | "brokers";
export type ClawSurfaceConnectionVisibility = "internal" | "public" | "private" | "external";

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
  dataType?: string;
  nullable?: boolean;
  humanSurfaces?: ClawSurfaceParitySurface[];
  programmaticSurfaces?: ClawSurfaceParitySurface[];
  surfaceGaps?: ClawSurfaceParityGap[];
  notes?: string;
  warnings?: string[];
}

export interface ClawSurfaceEdge {
  id: string;
  type: ClawSurfaceEdgeType;
  fromId: string;
  toId: string;
  owner: ClawPersistentSurfaceOwner;
  visibility: ClawSurfaceConnectionVisibility;
  contractId?: string;
  transport?: string;
  validation?: string;
  source?: ClawPersistentSurfaceSource;
  notes?: string;
}

export interface ClawSurfaceRouteStep {
  fromId: string;
  toId: string;
  edgeType: ClawSurfaceEdgeType;
  edgeId?: string;
  contractId?: string;
  owner?: ClawPersistentSurfaceOwner;
  visibility?: ClawSurfaceConnectionVisibility;
  transport?: string;
  validation?: string;
  gaps?: string[];
}

export interface ClawSurfaceRoute {
  id: string;
  name: string;
  summary: string;
  fromId: string;
  toId: string;
  owner: ClawPersistentSurfaceOwner;
  visibility: ClawSurfaceConnectionVisibility;
  transport?: string;
  validation: string;
  steps: ClawSurfaceRouteStep[];
  tests?: string[];
  docs?: string[];
  adrs?: string[];
  gaps?: string[];
  source?: ClawPersistentSurfaceSource;
  notes?: string;
}

export interface ClawPersistentSurfaceRegistry {
  version: number;
  nodes: ClawPersistentSurfaceNode[];
  edges?: ClawSurfaceEdge[];
  routes?: ClawSurfaceRoute[];
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
  path(input: Omit<SurfaceBuilderInput<"folder" | "file" | "socket" | "statusFile" | "cache" | "fixture" | "persistentTemp" | "retiredPath" | "externalReadOnlySource">, "kind"> & { kind: "folder" | "file" | "socket" | "statusFile" | "cache" | "fixture" | "persistentTemp" | "retiredPath" | "externalReadOnlySource" }): ClawPersistentSurfaceNode {
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

export const clawSharedJsonFields = {
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

export const clawStorageFiles = {
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
const surfaceRouteGraphSource: ClawPersistentSurfaceSource = { file: "packages/clawjs-core/src/surface-registry.ts", language: "typescript" };

const contractDefaults = { storageClass: "external" as const, canonicality: "canonical" as const, privacy: "public" as const, lifecycle: "durable" as const, source: registrySource };

const cliCommands = clawCliCommandRegistry.commands.map((entry) => entry.name);

const agentsV1RouteContracts = [
  ["claw.cli.agents.v1", "Agents V1 CLI contract"],
  ["claw.agent_assignment.runtime.v1", "Agent assignment runtime handoff contract"],
  ["claw.agent_assignment.internal_mac.v1", "Internal Mac agent assignment contract"],
  ["claw.agent_assignment.external.v1", "External agent assignment contract"],
  ["claw.mcp.agents.v1", "MCP Agents V1 assignment contract"],
] as const;

const macControlRouteContracts = [
  ["claw.mac.actionRequest.v1", "Mac action request contract"],
  ["claw.mac.actionPlan.v1", "Mac action plan contract"],
  ["claw.mac.actionReceipt.v1", "Mac action receipt contract"],
  ["claw.mac.permissionState.v1", "Mac permission state contract"],
  ["claw.mac.policyGrant.v1", "Mac policy grant contract"],
] as const;

const agentCoreTables = [
  "agent_assignments",
  "agent_execution_profiles",
  "agent_resource_grants",
  "agent_memory_policies",
  "agent_budgets",
  "agent_config_revisions",
  "agent_evaluations",
  "agent_incidents",
  "agent_blueprints",
  "agent_runs",
] as const;

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
  ["claw.api.relay.remote", "WS", "/v1/relay/remote", "Remote Relay client channel"],
  ["claw.api.relay.connector", "WS", "/v1/relay/connectors", "Relay workspace connector channel"],
  ["claw.api.remote.classifications", "GET", "/v1/remote/classifications", "Remote surface classification contract"],
  ["claw.api.remote.conformance", "GET", "/v1/remote/conformance", "Remote conformance report contract"],
  ["claw.api.remote.externalValidationChecklist", "GET", "/v1/remote/external-validation-checklist", "Remote physical/provider validation checklist contract"],
  ["claw.api.remote.externalValidationTemplate", "POST", "/v1/remote/external-validation-template", "Remote physical/provider validation evidence template contract"],
  ["claw.api.remote.externalValidationArtifact", "POST", "/v1/remote/external-validation-artifact", "Remote physical/provider validation evidence artifact contract"],
  ["claw.api.remote.externalValidationReport", "POST", "/v1/remote/external-validation-report", "Remote physical/provider validation evidence report contract"],
  ["claw.api.remote.sourceQaTemplate", "POST", "/v1/remote/source-qa-template", "Remote source Q/A review template contract"],
  ["claw.api.remote.closureGate", "POST", "/v1/remote/closure-gate", "Remote goal closure gate contract"],
  ["claw.api.remote.providerDeviceE2EPlan", "GET", "/v1/remote/provider-device-e2e-plan", "Remote provider/device E2E validation plan contract"],
  ["claw.api.sync.manifests", "GET", "/v1/sync/manifests", "Sync resource manifest contract"],
  ["claw.api.sync.manifests.create", "POST", "/v1/sync/manifests", "Sync resource manifest dry-run creation contract"],
  ["claw.api.sync.changes", "GET", "/v1/sync/changes", "Sync changelog and cursor contract"],
  ["claw.api.sync.plan", "POST", "/v1/sync/plan", "Sync dry-run planning contract"],
  ["claw.api.sync.conflicts", "POST", "/v1/sync/conflicts", "Sync conflict inspection contract"],
  ["claw.api.sync.applications", "POST", "/v1/sync/applications", "Sync driver application receipt contract"],
  ["claw.api.nodes", "GET", "/v1/nodes", "Node identity and trust contract"],
  ["claw.api.nodes.pair", "POST", "/v1/nodes/pair", "Node pairing dry-run contract"],
  ["claw.api.nodes.trust", "POST", "/v1/nodes/trust", "Node trust dry-run contract"],
  ["claw.api.nodes.revoke", "POST", "/v1/nodes/revoke", "Node revocation dry-run contract"],
  ["claw.api.mesh.invitations", "POST", "/v1/mesh/invitations", "Inter-mesh invitation dry-run contract"],
  ["claw.api.mesh.shares", "POST", "/v1/mesh/shares", "Inter-mesh scoped resource share dry-run contract"],
  ["claw.api.mesh.revocations", "POST", "/v1/mesh/revocations", "Inter-mesh share/invitation revocation dry-run contract"],
  ["claw.api.gateway.conformance", "GET", "/v1/gateway/conformance", "Gateway hosted/self-hosted conformance contract"],
  ["claw.api.gateway.agentServiceEvaluate", "POST", "/v1/gateway/agent-service/evaluate", "Gateway multi-tenant agent service evaluation contract"],
] as const;

const corePrivateRouteValues = "/api/attachments /api/auth/token /api/capture /api/captures /api/chat/feedback /api/comments /api/config/profile /api/config/reset /api/config/workspace-files /api/connectors/catalog /api/context /api/custom-fields /api/cycles /api/discover/local /api/e2e/seed /api/epics /api/export /api/field-values /api/goals /api/graph /api/hot-topics/seed /api/images /api/instances /api/integrations/auth /api/integrations/enable /api/integrations/gateway /api/integrations/install /api/integrations/install-stream /api/integrations/reveal /api/integrations/slack/connect /api/integrations/slack/test /api/integrations/telegram/connect /api/integrations/telegram/test /api/integrations/uninstall /api/integrations/whatsapp/cleanup /api/integrations/whatsapp/connect /api/lists /api/memory/person /api/milestones /api/monitors /api/notes/ /api/notify/actions /api/people /api/projects /api/promote /api/recurrences /api/row /api/saved-views /api/search /api/sections /api/seed /api/sessions /api/setup /api/skills/install /api/skills/remove /api/skills/sources /api/sources/refresh /api/stats /api/telegram/account /api/templates /api/timeline /api/tools/conclude /api/tools/get/ /api/tools/search /api/tools/status /api/tts /api/tts/providers /api/users /api/activity /api/apps/{appId}/dashboard /api/apps/{appId}/assets /api/auth.test /api/chat/sessions /api/claw/status /api/companies /api/config /api/config/local /api/connectors/subscriptions /api/contacts /api/data /api/dm /api/e2e/reset /api/e2e/status /api/events /api/health /api/images/backends /api/inbox /api/inspect/preview /api/integrations/setup /api/integrations/status /api/integrations/whatsapp/chats /api/memory /api/notes /api/notify/dashboard /api/personas /api/plugins /api/routines /api/rules /api/schema /api/skills/list /api/sources /api/spaces /api/summary /api/tasks /api/tools/save /api/ui /api/usage".split(" ");

const corePrivateRoutes = corePrivateRouteValues.map((route) => [`claw.privateApi.${stableRouteSurfaceKey(route)}`, "GET", route, `${route} private API route`] as const);

const stableJsonFields = [
  ["claw.schema.common.field.schemaVersion", clawSharedJsonFields.schemaVersion, "Persisted/exported data version field"],
  ["claw.schema.common.field.protocolVersion", clawSharedJsonFields.protocolVersion, "Wire protocol version field"],
  ["claw.schema.common.field.sessionId", clawSharedJsonFields.sessionId, "Framework conversation identity"],
  ["claw.schema.common.field.requestId", clawSharedJsonFields.requestId, "Request correlation identity"],
  ["claw.schema.common.field.runtimeId", clawSharedJsonFields.runtimeId, "Runtime identity"],
  ["claw.schema.common.field.agentId", clawSharedJsonFields.agentId, "Agent identity"],
  ["claw.schema.common.field.providerId", clawSharedJsonFields.providerId, "Provider identity"],
  ["claw.schema.common.field.modelId", clawSharedJsonFields.modelId, "Model identity"],
  ["claw.schema.common.field.createdAt", clawSharedJsonFields.createdAt, "Creation instant"],
  ["claw.schema.common.field.updatedAt", clawSharedJsonFields.updatedAt, "Update instant"],
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
  ["claw.package.node", "@clawjs/node", "Node runtime package"],
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

const stableEnvVarValues = "CLAW_ALLOWED_ORIGINS CLAW_AUDIO_BLOBS_DIR CLAW_AUDIO_DATA_DIR CLAW_AUDIO_HOST CLAW_AUDIO_PORT CLAW_AUDIO_SHARED_SECRET CLAW_BIN CLAW_CALENDAR_MOCK CLAW_CODEX_PATH CLAW_CODE_HOME CLAW_COMPANY_FAKE_AGENT_RUNS CLAW_COMPANY_OPENCLAW_AGENT_ID CLAW_COMPONENTS_SOURCE_DIR CLAW_CONNECTOR_CATALOG_PATH CLAW_CONNECTOR_SUBSCRIPTIONS_PATH CLAW_CONTENT_TOKEN CLAW_CONTENT_URL CLAW_DATABASE_ADMIN_EMAIL CLAW_DATABASE_ADMIN_PASSWORD CLAW_DATABASE_CORS_ORIGINS CLAW_DATABASE_DATA_DIR CLAW_DATABASE_DIR CLAW_DATABASE_FILES_DIR CLAW_DATABASE_HOST CLAW_DATABASE_JWT_SECRET CLAW_DATABASE_NAMESPACE CLAW_DATABASE_PORT CLAW_DATABASE_URL CLAW_DATA_DIR CLAW_DAY_ROOT CLAW_DB_PATH CLAW_DEBUG_CHAT_PERF CLAW_DEMO_DATA_DIR CLAW_DEVICE_TEST_COMMAND CLAW_DOMAINS_ACTIVE CLAW_DOMAIN_SHARE_URL CLAW_DRIVE_BACKEND CLAW_DRIVE_BASE CLAW_DRIVE_CLOUDFLARED CLAW_DRIVE_CONVERTER_MODE CLAW_DRIVE_CORS_ORIGINS CLAW_DRIVE_DATA_DIR CLAW_DRIVE_DB_PATH CLAW_DRIVE_EMAIL CLAW_DRIVE_EMBED_SIDECAR CLAW_DRIVE_HOST CLAW_DRIVE_JWT_SECRET CLAW_DRIVE_OCR_SIDECAR CLAW_DRIVE_PASSWORD CLAW_DRIVE_PORT CLAW_DRIVE_PUBLIC_BASE_URL CLAW_DRIVE_STATUS_FILE CLAW_DRIVE_TOKEN CLAW_DRIVE_UI_DIST_DIR CLAW_E2E CLAW_E2E_DISABLE_EXTERNAL_CALLS CLAW_E2E_FIXTURE_MODE CLAW_E2E_REUSE_SERVER CLAW_EMAIL_MOCK CLAW_ERP_DIR CLAW_FILES_DIR CLAW_FIND_COMMAND_STRICT_PATH CLAW_GUIDANCE_DIR CLAW_HOME CLAW_HOST_APP_BUNDLE CLAW_HOST_APP_SUPPORT_NAME CLAW_HOST_BIN_DIR CLAW_HOST_BUNDLE_ID CLAW_HOST_CLI_NAME CLAW_HOST_DAEMON_NAME CLAW_HOST_DISABLE_SOCKET_FALLBACK CLAW_HOST_DISPLAY_NAME CLAW_HOST_HOME CLAW_HOST_ID CLAW_HOST_LAUNCH_AGENTS_DIR CLAW_HOST_LAUNCH_AGENT_LABEL CLAW_HOST_LOG_SUBSYSTEM CLAW_HOST_MACH_SERVICE CLAW_HOST_OBSIDIAN_VAULT CLAW_HOST_PERMISSION_NAME CLAW_HOST_PERMISSION_REQUEST_DRY_RUN CLAW_HOST_PERMISSION_REQUEST_LOG CLAW_HOST_RUNTIME_TRANSPORT CLAW_HOST_SAFE CLAW_HOST_TEST_CALENDAR CLAW_HOST_TEST_COMMAND CLAW_HOST_TEST_MAILBOX CLAW_HOST_TEST_MODE CLAW_HOST_TEST_NOTES_FOLDER CLAW_HOST_TEST_REMINDERS_LIST CLAW_HOST_TEST_SAFARI_WINDOW CLAW_HOST_TEST_THINGS_PROJECT CLAW_HOST_VALIDATION_MODE CLAW_IMAGE_LIBRARY_DIR CLAW_IOT_BASE_URL CLAW_IOT_DIR CLAW_LIBRARY_DIR CLAW_LIVE_BROKER_COMMAND CLAW_LOCAL_ADMIN_BOOTSTRAP_STDIN CLAW_MEMORY_BASE CLAW_MEMORY_EDITOR CLAW_MEMORY_HOST CLAW_MEMORY_PORT CLAW_MEMORY_WORKSPACE CLAW_MONITOR_COLLECT_INTERVAL_MS CLAW_MONITOR_CORS_ORIGINS CLAW_MONITOR_HOST CLAW_MONITOR_LOCAL_DISCOVERY_INTERVAL_MS CLAW_MONITOR_LOCAL_SCAN_PORTS CLAW_MONITOR_MODE CLAW_MONITOR_PORT CLAW_MONITOR_RELAY_TOKEN CLAW_MONITOR_RELAY_URL CLAW_MONITOR_RETENTION_DAYS CLAW_NODE CLAW_OPENCLAW_PATH CLAW_OPEN_WORKSPACE CLAW_PREVIEW_CLOUDFLARE_URL CLAW_PUBLISHING_CORS_ORIGINS CLAW_PUBLISHING_DATA_DIR CLAW_PUBLISHING_DB_PATH CLAW_PUBLISHING_DIR CLAW_PUBLISHING_DRIVE_URL CLAW_PUBLISHING_HEALTH_PROBE_MS CLAW_PUBLISHING_HOST CLAW_PUBLISHING_LOG_LEVEL CLAW_PUBLISHING_PIPELINE_ENABLED CLAW_PUBLISHING_PORT CLAW_PUBLISHING_PRINT_TOKEN CLAW_PUBLISHING_PUBLIC_BASE_URL CLAW_PUBLISHING_RECURRENCE_TICK_MS CLAW_PUBLISHING_SCHEDULER_TICK_MS CLAW_PUBLISHING_STATUS_FILE CLAW_PUBLISHING_TOKEN CLAW_PUBLISHING_TOKEN_STORE CLAW_PUBLISHING_URL CLAW_PUBLISHING_VAULT_URL CLAW_PUBLISHING_WORKER_TICK_MS CLAW_PUBLISHING_WORKSPACE CLAW_RELAY_ACCESS_TOKEN CLAW_RELAY_AGENT_ID CLAW_RELAY_TENANT_ID CLAW_RELAY_URL CLAW_RELAY_WORKSPACE_ID CLAW_REPORT_GITHUB_TOKEN CLAW_RESOURCES_DIR CLAW_RULES_DIR CLAW_RUNTIME_HOME CLAW_RUNTIME_PORT CLAW_RUNTIME_SESSIONS_URL CLAW_SEARCH_ADMIN_TOKEN CLAW_SEARCH_BASE CLAW_SEARCH_CODEX_BINARY CLAW_SEARCH_CORS_ORIGINS CLAW_SEARCH_DATA_DIR CLAW_SEARCH_HOST CLAW_SEARCH_JWT_SECRET CLAW_SEARCH_PORT CLAW_SEARCH_RUN_TIMEOUT_MS CLAW_SEARCH_SCHEDULER_TICK_MS CLAW_SEARCH_TOKEN CLAW_SEARCH_WORKER_CONCURRENCY CLAW_SECRETS_ADMIN_TOKEN CLAW_SECRETS_BACKEND CLAW_SECRETS_BASE CLAW_SECRETS_BASE_URL CLAW_SECRETS_BOOTSTRAP_STDIN CLAW_SECRETS_CORS_ORIGINS CLAW_SECRETS_DATA_DIR CLAW_SECRETS_DB_PATH CLAW_SECRETS_ENABLE_UNSAFE_EXTERNAL_PLUGINS CLAW_SECRETS_HOST CLAW_SECRETS_HOST_ASSERTION_KEY_BASE64 CLAW_SECRETS_JWT_SECRET CLAW_SECRETS_KEK_BASE64 CLAW_SECRETS_PLUGINS_DIR CLAW_SECRETS_PORT CLAW_SECRETS_PROXY_PATH CLAW_SECRETS_PUBLIC_BASE_URL CLAW_SECRETS_SIDECAR_PATH CLAW_SECRETS_SIGNED_HOST_TOKEN CLAW_SECRETS_TENANT CLAW_SECRETS_TENANT_ID CLAW_SECRETS_TOKEN CLAW_SECRETS_UI_DIST_DIR CLAW_SESSIONS_CODEX_DIR CLAW_SESSIONS_DATA_DIR CLAW_SESSIONS_DISABLE_CODEX CLAW_SESSIONS_DISABLE_HERMES CLAW_SESSIONS_HERMES_DB CLAW_SESSIONS_HOST CLAW_SESSIONS_PORT CLAW_SESSIONS_SHARED_SECRET CLAW_SKILLS_AUTO_IMPORT CLAW_SLIDES_DISABLE_BROWSER CLAW_TELEGRAM_BACKEND CLAW_TELEGRAM_DOMAIN_SHARE_URL CLAW_TELEGRAM_HOST CLAW_TELEGRAM_LOG_LEVEL CLAW_TELEGRAM_PORT CLAW_TELEGRAM_WORKSPACE CLAW_TEMPLATE_DISABLE_BROWSER CLAW_TEST_LIVE CLAW_TEST_LIVE_PACKAGE CLAW_TEST_WORKSPACE CLAW_TIME_DATA_DIR CLAW_TIME_DB_FILE CLAW_TIME_DEFAULT_TIMEZONE CLAW_TIME_HOST CLAW_TIME_NOTIFY_SOURCE_TOKEN CLAW_TIME_NOTIFY_URL CLAW_TIME_PORT CLAW_TIME_SCHEDULER_INTERVAL_MS CLAW_TIME_TOKEN CLAW_TIME_URL CLAW_WACLI_PATH CLAW_WORKSPACE".split(" ");

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
  ["claw.contracts.versionGovernance", "Pre-V1 version governance", "schema", ["cli", "sdk"]],
] as const;

const runtimeCriticalNodes = [
  {
    id: "claw.cli.public",
    owner: "claw",
    name: "Public claw CLI",
    path: "claw",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["cli"],
    notes: "`claw` is the single public framework CLI and primary local agent inspection surface.",
  },
  {
    id: "claw.cli.commandIntentRegistry",
    owner: "claw",
    name: "CLI command intent registry",
    path: "claw/commands",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["cli", "persistence"],
    notes: "Deterministic action-vocabulary layer for phrases agents try in the CLI. It records demand and resolution state without executing unknown phrases.",
  },
  {
    id: "claw.mcp.surface",
    owner: "claw",
    name: "MCP model-native surface",
    path: "mcp",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["mcp", "sdk", "serviceApi"],
    notes: "MCP tools/resources/prompts derive from framework contracts; MCP is not a separate source of truth.",
  },
  {
    id: "claw.agents",
    owner: "claw",
    name: "Agents V1 domain",
    path: "agents",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp", "relay", "persistence"],
    notes: "Canonical durable digital employee model. Assignments, not deployments, describe where an agent acts.",
  },
  {
    id: "claw.agents.assignments",
    owner: "claw",
    name: "Agent assignments",
    path: "agents/assignments",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp", "relay", "persistence"],
    notes: "Internal chat, external channels, workflows, automations, subagents, MCP/API, and support placements all enter through scoped assignments.",
  },
  {
    id: "claw.agents.resourceGrants",
    owner: "claw",
    name: "Agent resource grants",
    path: "agents/resource-grants",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp", "persistence"],
    notes: "Unified resource + action + scope grants. Effective access is the strict intersection of agent, assignment, execution, connector, host, and run scope.",
  },
  {
    id: "claw.agents.executionProfiles",
    owner: "claw",
    name: "Agent execution profiles",
    path: "agents/execution-profiles",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "persistence"],
    notes: "Runtime, model, sandbox, network, host-access, and sync/async execution profile for a run.",
  },
  {
    id: "claw.agents.memoryPolicies",
    owner: "claw",
    name: "Agent memory policies",
    path: "agents/memory-policies",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "persistence"],
    notes: "Private, team, project, customer, global, read-only, and write-scoped memory combinations with tenant/context boundaries.",
  },
  {
    id: "claw.agents.runs",
    owner: "claw",
    name: "Agent runs",
    path: "agents/runs",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "persistence"],
    notes: "Operational execution records separate from conversational sessions.",
  },
  {
    id: "claw.support.inbox",
    owner: "claw",
    name: "Support inbox projection",
    path: "support/inbox",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "persistence"],
    notes: "External conversations project into support/inbox records; runtime sessions remain execution trace.",
  },
  {
    id: "claw.storage.canonical",
    owner: "claw",
    name: "Canonical storage boundary",
    path: "storage",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "persistence"],
    notes: "Framework global data, workspace data, and host operational state stay separated by the ownership boundary.",
  },
  {
    id: "claw.host.signed",
    owner: "claw",
    name: "Active signed host",
    path: "host",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["cli", "serviceApi"],
    notes: "Signed host identity that owns native permission prompts and sensitive execution.",
  },
  {
    id: "claw.host.permissions",
    owner: "claw",
    name: "Host permissions",
    path: "host/permissions",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["cli", "serviceApi"],
    notes: "Sensitive native permission requests are brokered by the active signed host, never Node-only code.",
  },
  {
    id: "claw.host.grants",
    owner: "claw",
    name: "Host grants",
    path: "host/grants",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["cli", "serviceApi"],
    notes: "Destructive or sensitive grants belong to the signed host and are represented through framework contracts.",
  },
  {
    id: "claw.host.approvals",
    owner: "claw",
    name: "Host approvals",
    path: "host/approvals",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["cli", "serviceApi"],
    notes: "Human approvals for sensitive or cost-bearing actions are host-owned and audit-backed.",
  },
  {
    id: "claw.host.audit",
    owner: "claw",
    name: "Host audit",
    path: "host/audit",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["cli", "serviceApi", "persistence"],
    notes: "Host-specific audit logs record signed-host decisions and sensitive execution.",
  },
  {
    id: "claw.mac.controlPlane",
    owner: "claw",
    name: "Mac Control Plane",
    path: "mac",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp"],
    notes: "Canonical local macOS capability surface. Direct roots such as wifi and window resolve here before any signed-host action.",
  },
  {
    id: "claw.mac.capabilityAtlas",
    owner: "claw",
    name: "Mac capability atlas",
    path: "mac/atlas",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp", "persistence"],
    notes: "Typed coverage map for every known macOS action family, backend, permission requirement, related surface, risk tier, and validation state.",
  },
  {
    id: "claw.mac.permissionBroker",
    owner: "claw",
    name: "Mac Permission Broker",
    path: "permissions",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp", "persistence"],
    notes: "Central just-in-time macOS permission and framework grant lifecycle. Feature code consumes this broker instead of owning prompts.",
  },
  {
    id: "claw.mac.actionBroker",
    owner: "claw",
    name: "Mac Action Broker",
    path: "mac/action-broker",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp"],
    notes: "Signed-host execution boundary for sensitive macOS actions. It emits redacted receipts and audit records for each mutation.",
  },
  {
    id: "clawix.ui.chat",
    owner: "clawix",
    name: "Clawix agent chat UI",
    path: "Clawix/chat",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["serviceApi"],
    notes: "Human entrypoint for local desktop agent chat. It must not own canonical runtime/session state.",
  },
  {
    id: "clawix.companion.client",
    owner: "clawix",
    name: "Companion client",
    path: "Clawix/companion",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["serviceApi"],
    notes: "iPhone, Android, Web, and future companion clients that connect to the local bridge.",
  },
  {
    id: "clawix.bridge.local",
    owner: "clawix",
    name: "Clawix local bridge",
    path: "clawix-bridge",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["serviceApi"],
    notes: "Signed-host bridge on port 24080. It brokers local and companion traffic to the daemon/runtime owner.",
  },
  {
    id: "claw.daemon.local",
    owner: "claw",
    name: "Claw daemon",
    path: "daemon",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "serviceApi", "cli"],
    notes: "Daemon-first owner of backend/runtime behavior when background bridge mode is active.",
  },
  {
    id: "claw.runtime.agent",
    owner: "claw",
    name: "Agent runtime",
    path: "runtime/agent",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp"],
    notes: "Framework runtime that executes agent turns and adapts providers without becoming host-owned.",
  },
  {
    id: "claw.sessions",
    owner: "claw",
    name: "Sessions service",
    path: "sessions",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "persistence"],
    notes: "Canonical session and message persistence/event surface.",
  },
  {
    id: "claw.remote.client",
    owner: "external",
    name: "Remote client",
    path: "remote-client",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["relay"],
    notes: "External browser/device/client using the remote-safe Relay subset.",
  },
  {
    id: "claw.relay",
    owner: "claw",
    name: "Relay control plane",
    path: "relay",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["relay", "serviceApi"],
    notes: "Remote access and control plane. Relay is a critical surface, not the canonical local API.",
  },
  {
    id: "claw.relay.connector",
    owner: "claw",
    name: "Relay workspace connector",
    path: "relay/connector",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["relay", "serviceApi"],
    notes: "Workspace-side connector that materializes remote assignments and tunnels remote-safe traffic.",
  },
  {
    id: "claw.coordinator",
    owner: "claw",
    name: "Coordinator",
    path: "remote/coordinator",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "relay"],
    notes: "Identity, pairing, preauth, magic links, heartbeat, discovery, rendezvous, signaling, and Iroh relay metadata.",
  },
  {
    id: "claw.gateway",
    owner: "claw",
    name: "Gateway",
    path: "remote/gateway",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "relay"],
    notes: "Remote projection of registered local SDK/service/CLI contracts. It must not invent a parallel business API.",
  },
  {
    id: "claw.connector",
    owner: "claw",
    name: "Connector",
    path: "remote/connector",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "relay"],
    notes: "Host-side link into runtime, storage, services, policy, and conformance. Current Relay connector routes are compatibility adapters for this layer.",
  },
  {
    id: "claw.sync",
    owner: "claw",
    name: "Sync",
    path: "sync",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "persistence", "relay"],
    notes: "Framework synchronization layer with resource authority manifests, changelogs, cursors, conflict elevation, drivers, and audit.",
  },
  {
    id: "claw.transport.iroh",
    owner: "claw",
    name: "Iroh transport adapter",
    path: "remote/transports/iroh",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "relay"],
    notes: "Preferred v1 P2P/rendezvous/relay-fallback adapter. The canonical remote contract stays transport-agnostic.",
  },
  {
    id: "claw.headlessHost",
    owner: "claw",
    name: "Headless host",
    path: "host/headless",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp", "relay", "persistence"],
    notes: "A complete ClawJS host on VPS/Linux/Windows/macOS without UI: runtime, storage, policies, audit, CLI/API, gateway/connector, and optional sync.",
  },
  {
    id: "claw.remoteCache",
    owner: "claw",
    name: "Encrypted remote client cache",
    path: "remote/cache",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "serviceApi", "persistence", "relay"],
    notes: "Minimal encrypted client snapshots and outbound sync queues with TTL; never secret material or authoritative state.",
  },
  {
    id: "claw.remote.classification",
    owner: "claw",
    name: "Remote surface classification",
    path: "remote/classification",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp", "relay"],
    notes: "Every stable capability is classified as remote-safe, local-only, blocked, or pending before it is treated as complete.",
  },
  {
    id: "claw.search",
    owner: "claw",
    name: "Root Search",
    path: "search",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp", "relay", "persistence"],
    notes: "Remote-safe search is a projected contract with local authority and explicit classification.",
  },
  {
    id: "claw.secrets.broker",
    owner: "claw",
    name: "Secrets broker",
    path: "secrets/broker",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp", "relay"],
    notes: "Remote and sync paths use secret references plus brokered leases. Plaintext secret replication is not a valid route.",
  },
  {
    id: "claw.drive.files",
    owner: "claw",
    name: "Drive and files",
    path: "drive/files",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp", "relay", "persistence"],
    notes: "File, blob, document, and drive resources synchronize through manifests and domain drivers.",
  },
  {
    id: "claw.memory.userModel",
    owner: "claw",
    name: "Memory and user model",
    path: "memory/user-model",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp", "relay", "persistence"],
    notes: "Global/shared memory and user-model state synchronize by resource authority, not by ad hoc Relay storage.",
  },
  {
    id: "claw.skills.library",
    owner: "claw",
    name: "Skills and library",
    path: "skills/library",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "mcp", "relay", "persistence"],
    notes: "Skills created or imported on one host can be synchronized to another through the Sync layer when configured.",
  },
  {
    id: "claw.mesh.share",
    owner: "claw",
    name: "Inter-mesh sharing primitives",
    path: "mesh/share",
    humanSurfaces: ["humanUi"],
    programmaticSurfaces: ["sdk", "cli", "serviceApi", "relay"],
    notes: "Invitation, scoped resource sharing, and revocation primitives for mesh collaboration.",
  },
] as const;

function relayClassificationGap(programmaticSurfaces: readonly ClawSurfaceParitySurface[]): ClawSurfaceParityGap[] {
  if (programmaticSurfaces.includes("relay")) return [];
  return [{
    surface: "relay",
    status: "local-only",
    reason: "No direct remote exposure. Remote access must go through an explicitly classified Gateway/Connector/Sync route.",
  }];
}

export const clawSurfaceGraphEdges: ClawSurfaceEdge[] = [
  { id: "claw.edge.commands.consumes.intentSchema", type: "consumes", fromId: "claw.cli.command.commands", toId: "claw.schema.commandIntents.v1", owner: "claw", visibility: "public", contractId: "claw.schema.commandIntents.v1", transport: "local deterministic registry", validation: "CLI command-intent fixture tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.commands.owns.intentLedger", type: "owns", fromId: "claw.cli.command.commands", toId: "claw.workspace.command_intents.ledger", owner: "claw", visibility: "private", contractId: "claw.workspace.command_intents.ledger", transport: "workspace JSON ledger", validation: "CLI command-intent record/list tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.commands.brokers.needs", type: "brokers", fromId: "claw.cli.command.commands", toId: "claw.cli.command.needs", owner: "claw", visibility: "public", contractId: "claw.cli.command.needs", transport: "NeedOpportunity-compatible projection", validation: "CLI command-intent opportunities tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.commands.brokers.report", type: "brokers", fromId: "claw.cli.command.commands", toId: "claw.cli.command.report", owner: "claw", visibility: "public", contractId: "claw.cli.command.report", transport: "approval-gated report promotion packet", validation: "CLI command-intent promote tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.agents.cli.exposes.domain", type: "exposes", fromId: "claw.cli.command.agents", toId: "claw.agents", owner: "claw", visibility: "public", contractId: "claw.cli.agents.v1", transport: "local CLI + core.sqlite projection", validation: "Agents V1 CLI schema and access tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.agents.owns.assignments", type: "owns", fromId: "claw.agents", toId: "claw.agents.assignments", owner: "claw", visibility: "public", contractId: "claw.database.core.table.agent_assignments", transport: "core.sqlite", validation: "builtin schema + database projection tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.agents.owns.resourceGrants", type: "owns", fromId: "claw.agents", toId: "claw.agents.resourceGrants", owner: "claw", visibility: "public", contractId: "claw.database.core.table.agent_resource_grants", transport: "core.sqlite", validation: "effective access unit tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.agents.owns.executionProfiles", type: "owns", fromId: "claw.agents", toId: "claw.agents.executionProfiles", owner: "claw", visibility: "public", contractId: "claw.database.core.table.agent_execution_profiles", transport: "core.sqlite", validation: "schema registry tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.agents.owns.memoryPolicies", type: "owns", fromId: "claw.agents", toId: "claw.agents.memoryPolicies", owner: "claw", visibility: "public", contractId: "claw.database.core.table.agent_memory_policies", transport: "core.sqlite", validation: "schema registry tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.assignments.brokers.runtime", type: "brokers", fromId: "claw.agents.assignments", toId: "claw.runtime.agent", owner: "claw", visibility: "public", contractId: "claw.agent_assignment.runtime.v1", transport: "policy-gated runtime request", validation: "Agents V1 effective access + route graph tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.runtime.owns.agentRuns", type: "owns", fromId: "claw.runtime.agent", toId: "claw.agents.runs", owner: "claw", visibility: "internal", contractId: "claw.database.core.table.agent_runs", transport: "core.sqlite", validation: "runtime/run separation tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.assignments.exposes.supportInbox", type: "exposes", fromId: "claw.agents.assignments", toId: "claw.support.inbox", owner: "claw", visibility: "public", contractId: "claw.database.support", transport: "support/inbox projection", validation: "external support assignment fixture", source: surfaceRouteGraphSource },
  { id: "claw.edge.mcp.consumes.assignments", type: "consumes", fromId: "claw.mcp.surface", toId: "claw.agents.assignments", owner: "claw", visibility: "public", contractId: "claw.mcp.agents.v1", transport: "MCP tool/resource policy gate", validation: "inspect route tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.mac.cli.exposes.controlPlane", type: "exposes", fromId: "claw.cli.command.mac", toId: "claw.mac.controlPlane", owner: "claw", visibility: "public", contractId: "claw.mac.actionPlan.v1", transport: "local CLI plan/coverage/doctor portal", validation: "Mac CLI control-plane tests and inspect route tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.mac.directWifi.exposes.controlPlane", type: "exposes", fromId: "claw.cli.command.wifi", toId: "claw.mac.controlPlane", owner: "claw", visibility: "public", contractId: "claw.mac.actionRequest.v1", transport: "direct intuitive CLI root", validation: "Mac CLI direct-root tests and inspect route tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.mac.permissionsCli.exposes.permissionBroker", type: "exposes", fromId: "claw.cli.command.permissions", toId: "claw.mac.permissionBroker", owner: "claw", visibility: "public", contractId: "claw.mac.permissionState.v1", transport: "central permission CLI root", validation: "Mac permission CLI tests and inspect route tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.mac.control.consumes.atlas", type: "consumes", fromId: "claw.mac.controlPlane", toId: "claw.mac.capabilityAtlas", owner: "claw", visibility: "public", contractId: "claw.mac.actionRequest.v1", transport: "typed capability registry lookup", validation: "Mac atlas completeness tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.mac.control.brokers.permission", type: "brokers", fromId: "claw.mac.controlPlane", toId: "claw.mac.permissionBroker", owner: "claw", visibility: "public", contractId: "claw.mac.permissionState.v1", transport: "plan-first permission preflight", validation: "Mac permission broker schema tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.mac.permission.brokers.hostPermissions", type: "brokers", fromId: "claw.mac.permissionBroker", toId: "claw.host.permissions", owner: "claw", visibility: "internal", contractId: "claw.mac.permissionState.v1", transport: "signed-host OS permission state check/request guidance", validation: "host permission contract guard and Mac permission tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.mac.permission.owns.audit", type: "owns", fromId: "claw.mac.permissionBroker", toId: "claw.host.audit", owner: "claw", visibility: "internal", contractId: "claw.mac.permissionState.v1", transport: "redacted permission lifecycle audit", validation: "host permission contract guard and Mac permission tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.mac.control.brokers.action", type: "brokers", fromId: "claw.mac.controlPlane", toId: "claw.mac.actionBroker", owner: "claw", visibility: "internal", contractId: "claw.mac.actionPlan.v1", transport: "policy-gated action plan handoff", validation: "Mac action plan schema tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.mac.action.brokers.host", type: "brokers", fromId: "claw.mac.actionBroker", toId: "claw.host.signed", owner: "claw", visibility: "internal", contractId: "claw.mac.actionReceipt.v1", transport: "active signed-host native execution", validation: "host permission contract guard and Mac action broker tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.mac.action.owns.audit", type: "owns", fromId: "claw.mac.actionBroker", toId: "claw.host.audit", owner: "claw", visibility: "internal", contractId: "claw.mac.actionReceipt.v1", transport: "redacted action receipt and durable audit event", validation: "Mac receipt schema tests and host audit contract tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.chat.ui.consumes.assignment", type: "consumes", fromId: "clawix.ui.chat", toId: "claw.agents.assignments", owner: "clawix", visibility: "internal", contractId: "claw.agent_assignment.internal_mac.v1", transport: "local assignment selection", validation: "internal Mac assignment fixture", source: surfaceRouteGraphSource },
  { id: "claw.edge.relay.brokers.assignments", type: "brokers", fromId: "claw.relay", toId: "claw.agents.assignments", owner: "claw", visibility: "external", contractId: "claw.agent_assignment.external.v1", transport: "remote-safe assignment selection", validation: "external support assignment fixture", source: surfaceRouteGraphSource },
  { id: "claw.edge.chat.ui.consumes.bridge", type: "consumes", fromId: "clawix.ui.chat", toId: "clawix.bridge.local", owner: "clawix", visibility: "internal", contractId: "clawix.protocol.bridge.v1", transport: "local bridge RPC", validation: "macOS bridge daemon E2E fixture", source: surfaceRouteGraphSource },
  { id: "claw.edge.bridge.brokers.daemon", type: "brokers", fromId: "clawix.bridge.local", toId: "claw.daemon.local", owner: "clawix", visibility: "internal", contractId: "claw.protocol.hostCommand.v1", transport: "localhost/process bridge", validation: "daemon bridge fixture", source: surfaceRouteGraphSource },
  { id: "claw.edge.daemon.brokers.runtime", type: "brokers", fromId: "claw.daemon.local", toId: "claw.runtime.agent", owner: "claw", visibility: "internal", contractId: "claw.protocol.hostCommand.v1", transport: "framework runtime adapter", validation: "runtime fixture", source: surfaceRouteGraphSource },
  { id: "claw.edge.runtime.owns.sessions", type: "owns", fromId: "claw.runtime.agent", toId: "claw.sessions", owner: "claw", visibility: "internal", contractId: "claw.database.sessions", transport: "sessions service/events", validation: "sessions fixture", source: surfaceRouteGraphSource },
  { id: "claw.edge.sessions.exposes.bridge", type: "exposes", fromId: "claw.sessions", toId: "clawix.bridge.local", owner: "claw", visibility: "internal", contractId: "claw.event.sessions.message.appended", transport: "session event frames", validation: "bridge frame round-trip tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.bridge.exposes.ui", type: "exposes", fromId: "clawix.bridge.local", toId: "clawix.ui.chat", owner: "clawix", visibility: "internal", contractId: "clawix.protocol.bridge.v1", transport: "local bridge RPC", validation: "Clawix chat workflow fixture", source: surfaceRouteGraphSource },
  { id: "claw.edge.companion.consumes.bridge", type: "consumes", fromId: "clawix.companion.client", toId: "clawix.bridge.local", owner: "clawix", visibility: "public", contractId: "clawix.protocol.bridge.v1", transport: "WebSocket localhost:24080", validation: "companion bridge fixture", source: surfaceRouteGraphSource },
  { id: "claw.edge.bridge.exposes.companion", type: "exposes", fromId: "clawix.bridge.local", toId: "clawix.companion.client", owner: "clawix", visibility: "public", contractId: "clawix.protocol.bridge.v1", transport: "WebSocket localhost:24080", validation: "companion bridge frame round-trip", source: surfaceRouteGraphSource },
  { id: "claw.edge.remote.consumes.relay", type: "consumes", fromId: "claw.remote.client", toId: "claw.relay", owner: "claw", visibility: "external", contractId: "claw.api.relay.remote", transport: "HTTPS/WebSocket Relay", validation: "relay E2E fixture", source: surfaceRouteGraphSource },
  { id: "claw.edge.relay.brokers.connector", type: "brokers", fromId: "claw.relay", toId: "claw.relay.connector", owner: "claw", visibility: "external", contractId: "claw.api.relay.connector", transport: "connector WebSocket", validation: "relay connector E2E fixture", source: surfaceRouteGraphSource },
  { id: "claw.edge.connector.brokers.workspace", type: "brokers", fromId: "claw.relay.connector", toId: "claw.workspace", owner: "claw", visibility: "internal", contractId: "claw.workspace.manifest", transport: "workspace materialization", validation: "relay workspace fixture", source: surfaceRouteGraphSource },
  { id: "claw.edge.connector.brokers.runtime", type: "brokers", fromId: "claw.relay.connector", toId: "claw.runtime.agent", owner: "claw", visibility: "internal", contractId: "claw.protocol.hostCommand.v1", transport: "local runtime adapter", validation: "relay codex connector E2E", source: surfaceRouteGraphSource },
  { id: "claw.edge.sessions.exposes.relay", type: "exposes", fromId: "claw.sessions", toId: "claw.relay", owner: "claw", visibility: "external", contractId: "claw.event.sessions.message.appended", transport: "remote-safe session events", validation: "relay E2E fixture", source: surfaceRouteGraphSource },
  { id: "claw.edge.relay.exposes.remote", type: "exposes", fromId: "claw.relay", toId: "claw.remote.client", owner: "claw", visibility: "external", contractId: "claw.api.relay.remote", transport: "HTTPS/WebSocket Relay", validation: "relay E2E fixture", source: surfaceRouteGraphSource },
  { id: "claw.edge.remote.consumes.coordinator", type: "consumes", fromId: "claw.remote.client", toId: "claw.coordinator", owner: "claw", visibility: "external", contractId: "claw.api.nodes", transport: "HTTPS/WebSocket/Iroh rendezvous metadata", validation: "remote sync inspect tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.coordinator.brokers.gateway", type: "brokers", fromId: "claw.coordinator", toId: "claw.gateway", owner: "claw", visibility: "external", contractId: "claw.api.remote.conformance", transport: "governed gateway admission", validation: "remote conformance inspect tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.gateway.brokers.connector", type: "brokers", fromId: "claw.gateway", toId: "claw.connector", owner: "claw", visibility: "external", contractId: "claw.api.remote.classifications", transport: "projected registered API contract", validation: "gateway conformance inspect tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.connector.brokers.runtime.hostAdapter", type: "brokers", fromId: "claw.connector", toId: "claw.runtime.agent", owner: "claw", visibility: "internal", contractId: "claw.protocol.hostCommand.v1", transport: "host-side runtime adapter", validation: "connector runtime conformance tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.connector.brokers.search", type: "brokers", fromId: "claw.connector", toId: "claw.search", owner: "claw", visibility: "external", contractId: "claw.api.search.searches", transport: "remote-safe projected search route", validation: "remote search conformance tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.connector.brokers.secrets", type: "brokers", fromId: "claw.connector", toId: "claw.secrets.broker", owner: "claw", visibility: "external", contractId: "claw.api.secrets", transport: "secret refs plus brokered lease", validation: "secret lease rejection/acceptance tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.connector.brokers.sync", type: "brokers", fromId: "claw.connector", toId: "claw.sync", owner: "claw", visibility: "external", contractId: "claw.api.sync.manifests", transport: "sync manifest/changelog/cursor route", validation: "sync manifest conformance tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.sync.owns.skills", type: "owns", fromId: "claw.sync", toId: "claw.skills.library", owner: "claw", visibility: "public", contractId: "claw.api.sync.manifests", transport: "skills sync driver", validation: "skills sync hermetic E2E", source: surfaceRouteGraphSource },
  { id: "claw.edge.sync.owns.memory", type: "owns", fromId: "claw.sync", toId: "claw.memory.userModel", owner: "claw", visibility: "public", contractId: "claw.api.sync.manifests", transport: "memory/user-model sync driver", validation: "memory sync hermetic E2E", source: surfaceRouteGraphSource },
  { id: "claw.edge.sync.owns.sessions", type: "owns", fromId: "claw.sync", toId: "claw.sessions", owner: "claw", visibility: "public", contractId: "claw.api.sync.manifests", transport: "sessions sync driver", validation: "sessions sync route contract tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.sync.owns.driveFiles", type: "owns", fromId: "claw.sync", toId: "claw.drive.files", owner: "claw", visibility: "public", contractId: "claw.api.sync.manifests", transport: "drive/files sync driver", validation: "drive file sync hermetic E2E", source: surfaceRouteGraphSource },
  { id: "claw.edge.sync.owns.blobs", type: "owns", fromId: "claw.sync", toId: "claw.drive.files", owner: "claw", visibility: "public", contractId: "claw.api.sync.manifests", transport: "blob sync driver", validation: "blob sync route contract tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.sync.owns.searchIndex", type: "owns", fromId: "claw.sync", toId: "claw.search", owner: "claw", visibility: "public", contractId: "claw.api.sync.manifests", transport: "search-index sync driver", validation: "search-index sync route contract tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.sync.owns.sqlite", type: "owns", fromId: "claw.sync", toId: "claw.database.core", owner: "claw", visibility: "public", contractId: "claw.api.sync.changes", transport: "SQLite full/partial table manifests", validation: "SQLite resource sync tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.sync.owns.sidecars", type: "owns", fromId: "claw.sync", toId: "claw.database.runtime", owner: "claw", visibility: "public", contractId: "claw.api.sync.manifests", transport: "sidecar database manifests", validation: "sidecar sync route contract tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.sync.owns.agentConfig", type: "owns", fromId: "claw.sync", toId: "claw.agents", owner: "claw", visibility: "public", contractId: "claw.api.sync.manifests", transport: "agent config sync driver", validation: "agent config sync route contract tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.sync.owns.workspaceState", type: "owns", fromId: "claw.sync", toId: "claw.workspace", owner: "claw", visibility: "public", contractId: "claw.api.sync.manifests", transport: "workspace state sync driver", validation: "workspace state sync route contract tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.sync.owns.remoteCache", type: "owns", fromId: "claw.sync", toId: "claw.remoteCache", owner: "claw", visibility: "public", contractId: "claw.api.sync.manifests", transport: "encrypted TTL cache and outbound queue", validation: "client cache TTL tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.gateway.exposes.headlessHost", type: "exposes", fromId: "claw.gateway", toId: "claw.headlessHost", owner: "claw", visibility: "public", contractId: "claw.api.gateway.conformance", transport: "headless service projection", validation: "headless gateway conformance tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.headlessHost.brokers.assignments", type: "brokers", fromId: "claw.headlessHost", toId: "claw.agents.assignments", owner: "claw", visibility: "public", contractId: "claw.api.gateway.agentServiceEvaluate", transport: "multi-tenant governed assignment routing", validation: "multi-tenant assignment isolation tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.coordinator.consumes.iroh", type: "consumes", fromId: "claw.coordinator", toId: "claw.transport.iroh", owner: "claw", visibility: "external", contractId: "claw.api.nodes", transport: "Iroh adapter for P2P/rendezvous/relay fallback", validation: "Iroh fallback conformance tests", source: surfaceRouteGraphSource },
  { id: "claw.edge.meshShare.brokers.sync", type: "brokers", fromId: "claw.mesh.share", toId: "claw.sync", owner: "claw", visibility: "external", contractId: "claw.api.mesh.shares", transport: "invite/share/revoke primitives", validation: "inter-mesh sharing primitive tests", source: surfaceRouteGraphSource },
];

function routeStep(edgeId: string, gaps: string[] = []): ClawSurfaceRouteStep {
  const edge = clawSurfaceGraphEdges.find((candidate) => candidate.id === edgeId);
  if (!edge) throw new Error(`Missing surface route edge ${edgeId}`);
  return {
    edgeId: edge.id,
    fromId: edge.fromId,
    toId: edge.toId,
    edgeType: edge.type,
    contractId: edge.contractId,
    owner: edge.owner,
    visibility: edge.visibility,
    transport: edge.transport,
    validation: edge.validation,
    ...(gaps.length ? { gaps } : {}),
  };
}

export const clawSurfaceGraphRoutes: ClawSurfaceRoute[] = [
  {
    id: "cli.commandIntentResolution",
    name: "CLI command intent resolution",
    summary: "The public CLI resolves arbitrary agent action phrases through a deterministic command-intent registry, optional workspace ledger, Need-compatible opportunities, and approval-gated report promotion packets without executing unknown phrases.",
    fromId: "claw.cli.command.commands",
    toId: "claw.cli.command.report",
    owner: "claw",
    visibility: "public",
    transport: "local CLI registry plus workspace JSON ledger",
    validation: "Fixture tests for resolve, record, list, opportunities, promote, unknown fallback metadata, and inspect command-intents.",
    steps: [
      routeStep("claw.edge.commands.consumes.intentSchema"),
      routeStep("claw.edge.commands.owns.intentLedger"),
      routeStep("claw.edge.commands.brokers.needs"),
      routeStep("claw.edge.commands.brokers.report"),
    ],
    tests: ["packages/clawjs-core/src/cli-command-intents.test.ts", "packages/clawjs/src/cli-commands.test.ts", "packages/clawjs/src/cli-discovery.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/cli.md", "docs/adr/0018-cli-action-intent-registry.md"],
    adrs: ["docs/adr/0007-cli-agent-interface.md", "docs/adr/0011-report-governance-v1.md", "docs/adr/0014-need-route-lab-v1.md", "docs/adr/0018-cli-action-intent-registry.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "mac.directCliAction",
    name: "Mac direct CLI action",
    summary: "An intuitive root such as `claw wifi connect` resolves through the Mac atlas, central permission broker, signed-host action broker, and redacted audit receipt instead of calling macOS directly.",
    fromId: "claw.cli.command.wifi",
    toId: "claw.host.audit",
    owner: "claw",
    visibility: "public",
    transport: "local CLI direct root plus signed-host broker",
    validation: "Mac CLI direct-root tests, atlas tests, host permission guard, and inspect route tests",
    steps: [
      routeStep("claw.edge.mac.directWifi.exposes.controlPlane"),
      routeStep("claw.edge.mac.control.consumes.atlas"),
      routeStep("claw.edge.mac.control.brokers.permission"),
      routeStep("claw.edge.mac.permission.brokers.hostPermissions"),
      routeStep("claw.edge.mac.control.brokers.action"),
      routeStep("claw.edge.mac.action.brokers.host"),
      routeStep("claw.edge.mac.action.owns.audit"),
    ],
    tests: ["packages/clawjs-core/src/mac-control-plane.test.ts", "packages/clawjs/src/cli-mac-control-command.test.ts", "packages/clawjs/src/inspect-cli.test.ts", "scripts/verify-host-permission-contract.mjs"],
    docs: ["docs/mac-control-plane.md", "docs/adr/0023-mac-control-plane-v1.md", "docs/adr/0024-mac-permission-broker-v1.md"],
    adrs: ["docs/adr/0012-surface-route-graph.md", "docs/adr/0023-mac-control-plane-v1.md", "docs/adr/0024-mac-permission-broker-v1.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "mac.permissionLifecycle",
    name: "Mac permission lifecycle",
    summary: "`claw permissions` centralizes OS permission state, framework grants, just-in-time request plans, and lifecycle audit for every Mac capability family.",
    fromId: "claw.cli.command.permissions",
    toId: "claw.host.audit",
    owner: "claw",
    visibility: "public",
    transport: "central permission CLI root plus signed-host permission broker",
    validation: "Mac permission tests, host permission guard, and inspect route tests",
    steps: [
      routeStep("claw.edge.mac.permissionsCli.exposes.permissionBroker"),
      routeStep("claw.edge.mac.permission.brokers.hostPermissions"),
      routeStep("claw.edge.mac.permission.owns.audit"),
    ],
    tests: ["packages/clawjs-core/src/mac-control-plane.test.ts", "packages/clawjs/src/cli-mac-control-command.test.ts", "packages/clawjs/src/inspect-cli.test.ts", "scripts/verify-host-permission-contract.mjs"],
    docs: ["docs/mac-control-plane.md", "docs/adr/0024-mac-permission-broker-v1.md"],
    adrs: ["docs/adr/0012-surface-route-graph.md", "docs/adr/0024-mac-permission-broker-v1.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "chat.localDesktop",
    name: "Local desktop agent chat",
    summary: "Clawix macOS UI sends an agent turn through the local bridge/daemon into the framework runtime and sessions stream.",
    fromId: "clawix.ui.chat",
    toId: "claw.sessions",
    owner: "claw",
    visibility: "internal",
    transport: "local bridge RPC plus framework runtime/session events",
    validation: "Fixture + hermetic E2E for local desktop chat",
    steps: [
      routeStep("claw.edge.chat.ui.consumes.bridge"),
      routeStep("claw.edge.bridge.brokers.daemon"),
      routeStep("claw.edge.daemon.brokers.runtime"),
      routeStep("claw.edge.runtime.owns.sessions"),
      routeStep("claw.edge.sessions.exposes.bridge"),
      routeStep("claw.edge.bridge.exposes.ui"),
    ],
    tests: ["packages/clawjs/src/inspect-cli.test.ts", "macos/Helpers/Bridged/Tests/e2e_bridge_daemon.py"],
    docs: ["docs/adr/0012-surface-route-graph.md", "docs/host-ownership.md"],
    adrs: ["docs/adr/0004-persistent-surface-registry-and-inspection.md", "docs/adr/0009-dual-human-programmatic-surfaces.md", "docs/adr/0012-surface-route-graph.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "agents.internalMacAssignment",
    name: "Internal Mac agent assignment",
    summary: "A Mac UI-visible agent is selected through an internal assignment, policy-checked, run through the runtime, and recorded as both an operational run and a conversational session.",
    fromId: "clawix.ui.chat",
    toId: "claw.sessions",
    owner: "claw",
    visibility: "internal",
    transport: "local UI assignment plus runtime/session events",
    validation: "Fixture + hermetic E2E for internal Mac assignment",
    steps: [
      routeStep("claw.edge.chat.ui.consumes.assignment"),
      routeStep("claw.edge.agents.owns.resourceGrants"),
      routeStep("claw.edge.agents.owns.executionProfiles"),
      routeStep("claw.edge.agents.owns.memoryPolicies"),
      routeStep("claw.edge.assignments.brokers.runtime"),
      routeStep("claw.edge.runtime.owns.agentRuns"),
      routeStep("claw.edge.runtime.owns.sessions"),
    ],
    tests: ["packages/clawjs-core/src/agents-v1.test.ts", "packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/cli.md", "docs/adr/0020-agents-v1-refactor.md"],
    adrs: ["docs/adr/0012-surface-route-graph.md", "docs/adr/0020-agents-v1-refactor.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "agents.externalSupportAssignment",
    name: "External support assignment",
    summary: "A web/chat/channel visitor reaches only an active external assignment; identity, grants, privacy, support projection, runtime run, and session trace stay scoped to that assignment.",
    fromId: "claw.remote.client",
    toId: "claw.support.inbox",
    owner: "claw",
    visibility: "external",
    transport: "external channel/Relay to assignment policy gate",
    validation: "Fake external support assignment fixture",
    steps: [
      routeStep("claw.edge.remote.consumes.relay"),
      routeStep("claw.edge.relay.brokers.connector"),
      routeStep("claw.edge.relay.brokers.assignments"),
      routeStep("claw.edge.agents.owns.resourceGrants"),
      routeStep("claw.edge.assignments.exposes.supportInbox"),
      routeStep("claw.edge.assignments.brokers.runtime"),
      routeStep("claw.edge.runtime.owns.sessions"),
    ],
    tests: ["packages/clawjs-core/src/agents-v1.test.ts", "packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/cli.md", "docs/adr/0020-agents-v1-refactor.md"],
    adrs: ["docs/adr/0012-surface-route-graph.md", "docs/adr/0020-agents-v1-refactor.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "agents.mcpApiAssignment",
    name: "MCP/API agent assignment",
    summary: "MCP and service API callers consume the same assignment and grant policy instead of receiving a separate privileged agent path.",
    fromId: "claw.mcp.surface",
    toId: "claw.runtime.agent",
    owner: "claw",
    visibility: "public",
    transport: "MCP/service API policy gate",
    validation: "Inspect route and Agents V1 policy tests",
    steps: [
      routeStep("claw.edge.mcp.consumes.assignments"),
      routeStep("claw.edge.agents.owns.resourceGrants"),
      routeStep("claw.edge.assignments.brokers.runtime"),
    ],
    tests: ["packages/clawjs-core/src/agents-v1.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/adr/0020-agents-v1-refactor.md"],
    adrs: ["docs/adr/0012-surface-route-graph.md", "docs/adr/0020-agents-v1-refactor.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "chat.companionBridge",
    name: "Companion bridge chat",
    summary: "Companion clients use pairing/auth and the bridge WebSocket on port 24080 before the same daemon/runtime/session path.",
    fromId: "clawix.companion.client",
    toId: "claw.sessions",
    owner: "claw",
    visibility: "public",
    transport: "WebSocket localhost:24080 plus framework runtime/session events",
    validation: "Fixture + hermetic E2E for companion bridge traffic",
    steps: [
      routeStep("claw.edge.companion.consumes.bridge"),
      routeStep("claw.edge.bridge.brokers.daemon"),
      routeStep("claw.edge.daemon.brokers.runtime"),
      routeStep("claw.edge.runtime.owns.sessions"),
      routeStep("claw.edge.sessions.exposes.bridge"),
      routeStep("claw.edge.bridge.exposes.companion"),
    ],
    tests: ["packages/clawjs/src/inspect-cli.test.ts", "packages/ClawixCore/Tests/ClawixCoreTests/BridgeFrameRoundTripTests.swift"],
    docs: ["docs/adr/0012-surface-route-graph.md", "docs/relay.md"],
    adrs: ["docs/adr/0009-dual-human-programmatic-surfaces.md", "docs/adr/0012-surface-route-graph.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "chat.remoteRelay",
    name: "Remote Relay chat",
    summary: "Remote clients use Relay auth/project-agent assignment and a workspace connector before local runtime execution and remote-safe session responses.",
    fromId: "claw.remote.client",
    toId: "claw.sessions",
    owner: "claw",
    visibility: "external",
    transport: "Relay HTTPS/WebSocket plus workspace connector",
    validation: "Fixture + hermetic Relay E2E without production services",
    steps: [
      routeStep("claw.edge.remote.consumes.relay"),
      routeStep("claw.edge.relay.brokers.connector"),
      routeStep("claw.edge.connector.brokers.workspace"),
      routeStep("claw.edge.connector.brokers.runtime"),
      routeStep("claw.edge.runtime.owns.sessions"),
      routeStep("claw.edge.sessions.exposes.relay"),
      routeStep("claw.edge.relay.exposes.remote"),
    ],
    tests: ["packages/clawjs/src/inspect-cli.test.ts", "relay/tests/e2e/relay.e2e.test.ts", "relay/tests/e2e/codex-connector.e2e.test.ts"],
    docs: ["docs/adr/0012-surface-route-graph.md", "docs/relay.md"],
    adrs: ["docs/adr/0009-dual-human-programmatic-surfaces.md", "docs/adr/0012-surface-route-graph.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "remote.chatGateway",
    name: "Remote chat through Gateway",
    summary: "Remote clients enter through Coordinator/Gateway/Connector and reach the same assignment, runtime, and sessions path as local chat.",
    fromId: "claw.remote.client",
    toId: "claw.sessions",
    owner: "claw",
    visibility: "external",
    transport: "Coordinator/Gateway/Connector over HTTPS/WebSocket or Iroh adapter",
    validation: "Remote conformance, inspect, and hermetic chat tests",
    steps: [
      routeStep("claw.edge.remote.consumes.coordinator"),
      routeStep("claw.edge.coordinator.brokers.gateway"),
      routeStep("claw.edge.gateway.brokers.connector"),
      routeStep("claw.edge.connector.brokers.runtime.hostAdapter"),
      routeStep("claw.edge.runtime.owns.sessions"),
    ],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0012-surface-route-graph.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "remote.searchGateway",
    name: "Remote search through Gateway",
    summary: "Remote-safe search projects the registered Search contract through Gateway and Connector without a separate mobile-only search API.",
    fromId: "claw.remote.client",
    toId: "claw.search",
    owner: "claw",
    visibility: "external",
    transport: "Gateway projected service API",
    validation: "Remote search conformance tests",
    steps: [
      routeStep("claw.edge.remote.consumes.coordinator"),
      routeStep("claw.edge.coordinator.brokers.gateway"),
      routeStep("claw.edge.gateway.brokers.connector"),
      routeStep("claw.edge.connector.brokers.search"),
    ],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/search.md", "docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0019-search-v1-1-architecture.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "remote.secretBrokeredOperation",
    name: "Remote secret brokered operation",
    summary: "Remote actors can use secret references and audited broker leases for approved operations, but never receive plaintext secret replication.",
    fromId: "claw.remote.client",
    toId: "claw.secrets.broker",
    owner: "claw",
    visibility: "external",
    transport: "Gateway projected secret-reference operation",
    validation: "Secret ref rejection and broker lease acceptance tests",
    steps: [
      routeStep("claw.edge.remote.consumes.coordinator"),
      routeStep("claw.edge.coordinator.brokers.gateway"),
      routeStep("claw.edge.gateway.brokers.connector"),
      routeStep("claw.edge.connector.brokers.secrets"),
    ],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts", "secrets/src/server/security.test.ts"],
    docs: ["docs/secrets-security.md", "docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0008-secrets-security-v1.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "sync.skills",
    name: "Skills sync",
    summary: "Skills created or imported on one host synchronize to configured peer hosts through manifests, changelogs, cursors, and conflict elevation.",
    fromId: "claw.sync",
    toId: "claw.skills.library",
    owner: "claw",
    visibility: "public",
    transport: "Sync manifest/changelog plus skills driver",
    validation: "Skills two-host sync tests",
    steps: [routeStep("claw.edge.connector.brokers.sync"), routeStep("claw.edge.sync.owns.skills")],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "sync.memoryUserModel",
    name: "Memory and user-model sync",
    summary: "Shared memory and user-model state synchronize by resource authority and configured residency, not through ad hoc Relay storage.",
    fromId: "claw.sync",
    toId: "claw.memory.userModel",
    owner: "claw",
    visibility: "public",
    transport: "Sync manifest/changelog plus memory driver",
    validation: "Memory/user-model sync tests",
    steps: [routeStep("claw.edge.connector.brokers.sync"), routeStep("claw.edge.sync.owns.memory")],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "sync.sessions",
    name: "Sessions sync",
    summary: "Session metadata, transcripts, and conversation state synchronize through Sync manifests instead of relying on the chat Gateway as storage.",
    fromId: "claw.sync",
    toId: "claw.sessions",
    owner: "claw",
    visibility: "public",
    transport: "Sync manifest/changelog plus sessions driver",
    validation: "Sessions sync route contract tests",
    steps: [routeStep("claw.edge.connector.brokers.sync"), routeStep("claw.edge.sync.owns.sessions")],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "sync.driveFiles",
    name: "Drive and files sync",
    summary: "Drive, files, and documents use configured sync drivers with explicit authority, cache policy, and conflict policy.",
    fromId: "claw.sync",
    toId: "claw.drive.files",
    owner: "claw",
    visibility: "public",
    transport: "Sync manifest/changelog plus drive/file driver",
    validation: "Drive/file sync tests",
    steps: [routeStep("claw.edge.connector.brokers.sync"), routeStep("claw.edge.sync.owns.driveFiles")],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "sync.blobs",
    name: "Blob sync",
    summary: "Blob resources synchronize through a dedicated Sync route with explicit authority, cache policy, and conflict policy.",
    fromId: "claw.sync",
    toId: "claw.drive.files",
    owner: "claw",
    visibility: "public",
    transport: "Sync manifest/changelog plus blob driver",
    validation: "Blob sync route contract tests",
    steps: [routeStep("claw.edge.connector.brokers.sync"), routeStep("claw.edge.sync.owns.blobs")],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "sync.sqliteResources",
    name: "SQLite resource sync",
    summary: "Core database resources can synchronize as full database, table, or partial-resource manifests with no silent overwrite.",
    fromId: "claw.sync",
    toId: "claw.database.core",
    owner: "claw",
    visibility: "public",
    transport: "SQLite full/partial sync manifests",
    validation: "SQLite manifest and conflict tests",
    steps: [routeStep("claw.edge.connector.brokers.sync"), routeStep("claw.edge.sync.owns.sqlite"), routeStep("claw.edge.sync.owns.remoteCache")],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/database.md", "docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0005-canonical-data-catalog.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "sync.sidecars",
    name: "Sidecar sync",
    summary: "Sidecar databases synchronize through dedicated manifests instead of being hidden inside SQLite table routes.",
    fromId: "claw.sync",
    toId: "claw.database.runtime",
    owner: "claw",
    visibility: "public",
    transport: "Sync manifest/changelog plus sidecar driver",
    validation: "Sidecar sync route contract tests",
    steps: [routeStep("claw.edge.connector.brokers.sync"), routeStep("claw.edge.sync.owns.sidecars")],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "sync.agentConfig",
    name: "Agent config sync",
    summary: "Agent configuration state synchronizes through explicit manifests so remote/headless hosts use the same agent setup contract.",
    fromId: "claw.sync",
    toId: "claw.agents",
    owner: "claw",
    visibility: "public",
    transport: "Sync manifest/changelog plus agent-config driver",
    validation: "Agent config sync route contract tests",
    steps: [routeStep("claw.edge.connector.brokers.sync"), routeStep("claw.edge.sync.owns.agentConfig")],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0020-agents-v1-refactor.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "sync.workspaceState",
    name: "Workspace state sync",
    summary: "Workspace state synchronizes through explicit manifests for headless and multi-node installs.",
    fromId: "claw.sync",
    toId: "claw.workspace",
    owner: "claw",
    visibility: "public",
    transport: "Sync manifest/changelog plus workspace-state driver",
    validation: "Workspace state sync route contract tests",
    steps: [routeStep("claw.edge.connector.brokers.sync"), routeStep("claw.edge.sync.owns.workspaceState")],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0001-claw-framework-host-boundary.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "sync.searchIndex",
    name: "Search index sync",
    summary: "Search indexes and rebuild-state metadata synchronize through the Sync plane while query execution remains a Gateway-projected search contract.",
    fromId: "claw.sync",
    toId: "claw.search",
    owner: "claw",
    visibility: "public",
    transport: "Sync manifest/changelog plus search-index driver",
    validation: "Search index sync route contract tests",
    steps: [routeStep("claw.edge.connector.brokers.sync"), routeStep("claw.edge.sync.owns.searchIndex")],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/search.md", "docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0019-search-v1-1-architecture.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "gateway.headlessAgentHost",
    name: "Headless agent host",
    summary: "A VPS or UI-less computer runs ClawJS as a full host with runtime, storage, policy, audit, CLI/API, and optional Gateway/Connector.",
    fromId: "claw.gateway",
    toId: "claw.headlessHost",
    owner: "claw",
    visibility: "public",
    transport: "Gateway conformance API plus headless host runtime",
    validation: "Headless host conformance tests",
    steps: [routeStep("claw.edge.gateway.exposes.headlessHost"), routeStep("claw.edge.connector.brokers.runtime.hostAdapter")],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/host-ownership.md", "docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0001-claw-framework-host-boundary.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "gateway.multiTenantAgentService",
    name: "Multi-tenant agent service",
    summary: "A governed host can serve agents to multiple tenants through assignments, budgets, isolation, and audit with no hosted-only capabilities.",
    fromId: "claw.headlessHost",
    toId: "claw.agents.assignments",
    owner: "claw",
    visibility: "public",
    transport: "Gateway assignment policy and conformance contract",
    validation: "Multi-tenant assignment isolation tests",
    steps: [
      routeStep("claw.edge.headlessHost.brokers.assignments"),
      routeStep("claw.edge.agents.owns.resourceGrants"),
      routeStep("claw.edge.agents.owns.executionProfiles"),
      routeStep("claw.edge.assignments.brokers.runtime"),
    ],
    tests: ["packages/clawjs-core/src/agents-v1.test.ts", "packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["docs/adr/0020-agents-v1-refactor.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0020-agents-v1-refactor.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
  {
    id: "mesh.resourceShare",
    name: "Inter-mesh resource share",
    summary: "Two meshes collaborate through invitation, scoped resource sharing, and revocation primitives while each mesh stays sovereign.",
    fromId: "claw.mesh.share",
    toId: "claw.sync",
    owner: "claw",
    visibility: "external",
    transport: "Coordinator invitation plus Sync scoped share/revoke",
    validation: "Inter-mesh sharing primitive tests",
    steps: [
      routeStep("claw.edge.remote.consumes.coordinator"),
      routeStep("claw.edge.coordinator.consumes.iroh"),
      routeStep("claw.edge.meshShare.brokers.sync"),
    ],
    tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/inspect-cli.test.ts"],
    docs: ["CONSTITUTION.md", "docs/relay.md", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    adrs: ["docs/adr/0022-remote-gateway-sync-redesign.md"],
    source: surfaceRouteGraphSource,
  },
];

export const clawPersistentSurfaceRegistry: ClawPersistentSurfaceRegistry = {
  version: clawSurfaceRegistryVersion,
  nodes: [
    clawPersistentSurface.root({
      id: "claw.contracts",
      name: "Claw stable contract surface",
      path: "contracts",
      storageClass: "external",
      privacy: "public",
      surfaceClass: "schema",
      stability: "v1",
      humanSurfaces: ["humanUi"],
      programmaticSurfaces: ["cli", "persistence"],
      surfaceGaps: relayClassificationGap(["cli", "persistence"]),
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
      surfaceGaps: [
        { surface: "humanUi", status: "optional", reason: "Category nodes are inspected through generated docs and CLI output." },
        ...relayClassificationGap(programmaticSurfaces),
      ],
      source: registrySource,
    })),
    ...runtimeCriticalNodes.map((node) => clawPersistentSurface.root({
      id: node.id,
      owner: node.owner as ClawPersistentSurfaceOwner,
      name: node.name,
      path: node.path,
      storageClass: "external",
      canonicality: node.owner === "clawix" ? "hostOnly" : node.owner === "external" ? "externalReadOnly" : "canonical",
      privacy: node.owner === "external" ? "externalReadOnly" : "public",
      lifecycle: node.owner === "external" ? "external" : "durable",
      surfaceClass: "protocol",
      stability: node.owner === "external" ? "externalDependency" : "v1",
      humanSurfaces: [...node.humanSurfaces] as ClawSurfaceParitySurface[],
      programmaticSurfaces: [...node.programmaticSurfaces] as ClawSurfaceParitySurface[],
      surfaceGaps: relayClassificationGap(node.programmaticSurfaces),
      source: registrySource,
      notes: node.notes,
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
    clawPersistentSurface.contract({
      ...contractDefaults,
      id: "clawix.protocol.bridge.v1",
      kind: "protocol",
      owner: "clawix",
      name: "Clawix bridge protocol v1",
      parentId: "claw.contracts.protocol",
      value: "clawix-bridge-v1",
      version: 1,
      direction: "bidirectional",
      notes: "Host bridge frame contract used by Clawix and companion clients. Framework routes may inspect it, but Clawix owns the signed-host implementation.",
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
    ...agentsV1RouteContracts.map(([id, name]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id,
      kind: "protocol",
      name,
      value: id,
      parentId: "claw.contracts.protocol",
      surfaceClass: "protocol",
      direction: "bidirectional",
    })),
    ...macControlRouteContracts.map(([id, name]) => clawPersistentSurface.contract({
      ...contractDefaults,
      id,
      kind: "jsonSchema",
      name,
      value: id,
      parentId: "claw.contracts.schemas",
      surfaceClass: "schema",
      direction: "bidirectional",
      notes: "Mac Control Plane schema exported from packages/clawjs-core/src/mac-control-plane.ts.",
    })),
    clawPersistentSurface.contract({
      ...contractDefaults,
      id: "claw.schema.commandIntents.v1",
      kind: "jsonSchema",
      name: "CLI command intent schema v1",
      value: "claw.cli.commandIntents.v1",
      parentId: "claw.contracts.schemas",
      surfaceClass: "schema",
      direction: "bidirectional",
      notes: "Stable V1 JSON shape for actionable CLI intent registry entries, local ledger entries, and unknown-command resolution metadata.",
    }),
    clawPersistentSurface.contract({
      ...contractDefaults,
      id: "claw.versionGovernance.preV1",
      kind: "jsonSchema",
      name: "Pre-V1 version governance policy",
      value: "claw.versionGovernance.pre_v1_mutable",
      parentId: "claw.contracts.versionGovernance",
      surfaceClass: "schema",
      stability: "preV1Reset",
      direction: "bidirectional",
      notes: "Machine-readable policy for pre-public mutable work. Owned version bumps require explicit user approval until V1 is frozen.",
    }),
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
      path: `${clawGlobalHomeLayout.data}/${clawStorageFiles.mainDatabase}`,
      parentId: "claw.global",
      source: registrySource,
      notes: "User-facing structured records and framework metadata that belong in the canonical relational graph.",
      envOverrides: ["CLAW_DATABASE_DB_PATH", "CLAW_DB_PATH", "CLAW_DATA_DIR", "CLAW_HOME"],
    }),
    clawPersistentSurface.database({
      id: "claw.database.support",
      kind: "sidecar",
      name: "Support inbox projection database",
      path: `${clawGlobalHomeLayout.data}/support.sqlite`,
      parentId: "claw.global",
      storageClass: "sidecar",
      source: registrySource,
      notes: "Projection target for external support assignment inbox state.",
    }),
    clawPersistentSurface.table({
      id: "claw.database.core.table.workspace_records",
      name: "workspace_records",
      parentId: "claw.database.core",
      databaseId: "claw.database.core",
      source: registrySource,
      notes: "JSON payload table backing local-first productivity collections.",
    }),
    ...agentCoreTables.map((name) => clawPersistentSurface.table({
      id: `claw.database.core.table.${name}`,
      name,
      parentId: "claw.database.core",
      databaseId: "claw.database.core",
      source: registrySource,
      notes: "Agents V1 canonical table in core.sqlite.",
    })),
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
      path: `${clawGlobalHomeLayout.data}/${clawStorageFiles.sessionsDatabase}`,
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
      path: `${clawGlobalHomeLayout.data}/${clawStorageFiles.searchDatabase}`,
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
      id: "claw.workspace.command_intents",
      kind: "folder",
      name: "command-intents",
      path: `${clawWorkspaceLayout.root}/command-intents`,
      parentId: "claw.workspace",
      storageClass: "workspace",
      source: registrySource,
      notes: "Explicit local records of actionable CLI phrases, purposes, statuses, and promotion state.",
    }),
    clawPersistentSurface.path({
      id: "claw.workspace.command_intents.ledger",
      kind: "file",
      name: "command intent ledger",
      path: `${clawWorkspaceLayout.root}/command-intents/command-intents.json`,
      parentId: "claw.workspace.command_intents",
      storageClass: "workspace",
      source: registrySource,
      notes: "Raw local command-intent phrases and purposes stay in the workspace ledger. Promotion uses report redaction and approval gates.",
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
  edges: clawSurfaceGraphEdges,
  routes: clawSurfaceGraphRoutes,
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

export function listClawSurfaceEdges(nodeId?: string): ClawSurfaceEdge[] {
  return nodeId ? clawSurfaceGraphEdges.filter((edge) => edge.fromId === nodeId || edge.toId === nodeId) : [...clawSurfaceGraphEdges];
}

export function listClawSurfaceRoutes(nodeId?: string): ClawSurfaceRoute[] {
  if (!nodeId) return [...clawSurfaceGraphRoutes];
  return clawSurfaceGraphRoutes.filter((route) => route.fromId === nodeId || route.toId === nodeId || route.steps.some((step) => step.fromId === nodeId || step.toId === nodeId));
}

export function findClawSurfaceRoute(routeId: string): ClawSurfaceRoute | undefined {
  return clawSurfaceGraphRoutes.find((route) => route.id === routeId);
}
