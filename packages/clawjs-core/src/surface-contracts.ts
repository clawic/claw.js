import { compactStableClawCliCommandNames } from "./compact-catalogs.ts";

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

export interface ClawSurfaceNarrative {
  concept: string;
  authorizingDecision: {
    ref: string;
    path: string;
  };
  completingSurface: {
    human: string;
    programmatic: string;
  };
  nonInference: string;
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
  surfaceNarrative?: ClawSurfaceNarrative;
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
  surfaceNarrative?: ClawSurfaceNarrative;
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
  storageMetrics: "/v1/storage/metrics",
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
  storageMetrics: clawDatabaseApiRoutes.storageMetrics,
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

export interface ClawStableContractCatalogEntry<TValue extends string | number = string | number> {
  readonly id: string;
  readonly kind: ClawPersistentSurfaceKind;
  readonly name: string;
  readonly value: TValue;
  readonly node: ClawPersistentSurfaceNode;
  readonly key?: string;
  readonly route?: string;
  readonly method?: string;
  readonly port?: number;
}

export type ClawStableContractCatalog<TEntries extends Record<string, ClawStableContractCatalogEntry>> = Readonly<TEntries> & {
  readonly nodes: readonly ClawPersistentSurfaceNode[];
  readonly values: Readonly<{ [TKey in keyof TEntries]: TEntries[TKey]["value"] }>;
};

export function clawStableContractCatalogEntry<TValue extends string | number>(
  input: Omit<SurfaceBuilderInput<ClawPersistentSurfaceKind>, "value"> & { kind: ClawPersistentSurfaceKind; value: TValue },
): ClawStableContractCatalogEntry<TValue> {
  const nodeInput = { ...input, value: String(input.value) };
  const node = input.kind === "envVar" || input.kind === "envOverride"
    ? clawPersistentSurface.envVar(nodeInput as SurfaceBuilderInput<"envVar" | "envOverride">)
    : clawPersistentSurface.contract(nodeInput as Parameters<typeof clawPersistentSurface.contract>[0]);

  return Object.freeze({
    id: node.id,
    kind: node.kind,
    name: node.name,
    value: input.value,
    node,
    ...(node.key ? { key: node.key } : {}),
    ...(node.route ? { route: node.route } : {}),
    ...(node.method ? { method: node.method } : {}),
    ...(typeof input.value === "number" ? { port: input.value } : {}),
  });
}

export function defineClawStableContractCatalog<TEntries extends Record<string, ClawStableContractCatalogEntry>>(
  entries: TEntries,
): ClawStableContractCatalog<TEntries> {
  const nodes = Object.freeze(Object.values(entries).map((entry) => entry.node));
  const values = Object.freeze(Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, entry.value]))) as {
    readonly [TKey in keyof TEntries]: TEntries[TKey]["value"];
  };
  return Object.freeze({ ...entries, nodes, values }) as ClawStableContractCatalog<TEntries>;
}

function defineStableCatalogFromEntries(
  entries: Iterable<readonly [string, ClawStableContractCatalogEntry]>,
): ClawStableContractCatalog<Record<string, ClawStableContractCatalogEntry>> {
  return defineClawStableContractCatalog(Object.fromEntries(entries));
}

const cliCommands = [...compactStableClawCliCommandNames];

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

const registrySource: ClawPersistentSurfaceSource = { file: "packages/clawjs-core/src/surface-contracts.ts", language: "typescript" };
const contractDefaults = { storageClass: "external" as const, canonicality: "canonical" as const, privacy: "public" as const, lifecycle: "durable" as const, source: registrySource };

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
  ["claw.api.database.storageMetrics", "GET", clawDatabaseApiRoutes.storageMetrics, "Database and sessions storage worker metrics"],
  ["claw.api.drive.health", "GET", clawDriveApiRoutes.health, "Drive health endpoint"],
  ["claw.api.drive.login", "POST", clawDriveApiRoutes.adminLogin, "Drive admin login"],
  ["claw.api.drive.items", "GET", clawDriveApiRoutes.items, "Drive item list"],
  ["claw.api.drive.search", "GET", clawDriveApiRoutes.search, "Drive search endpoint"],
  ["claw.api.search.types", "GET", clawSearchApiRoutes.types, "Search/index type list"],
  ["claw.api.search.entitiesUpsert", "POST", clawSearchApiRoutes.entitiesUpsert, "Search/index entity upsert"],
  ["claw.api.search.searches", "GET", clawSearchApiRoutes.searches, "Search definition list"],
  ["claw.api.search.monitors", "GET", clawSearchApiRoutes.monitors, "Search monitor list"],
  ["claw.api.system.snapshot", "GET", "/v1/system/snapshot", "System telemetry snapshot contract"],
  ["claw.api.system.metrics", "GET", "/v1/system/metrics", "System telemetry metric catalog contract"],
  ["claw.api.system.widgets", "GET", "/v1/system/widgets", "System context widget catalog contract"],
  ["claw.api.system.providers", "GET", "/v1/system/providers", "System telemetry provider catalog contract"],
  ["claw.api.system.providersPlan", "POST", "/v1/system/providers/plan", "System telemetry fail-closed provider plan contract"],
  ["claw.api.system.controls", "GET", "/v1/system/controls", "System telemetry plan-first control catalog contract"],
  ["claw.api.system.controlsPlan", "POST", "/v1/system/controls/plan", "System telemetry fail-closed control plan contract"],
  ["claw.api.system.history", "GET", "/v1/system/history/{metricKey}", "System telemetry Monitor history contract"],
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
  ["claw.api.remote.classificationReceipts", "POST", "/v1/remote/classifications/receipts", "Remote surface classification receipt contract"],
  ["claw.api.remote.conformance", "GET", "/v1/remote/conformance", "Remote conformance report contract"],
  ["claw.api.remote.offlineCommandInspect", "GET", "/v1/remote/offline-command", "Remote interactive command fail-fast inspection contract"],
  ["claw.api.remote.offlineCommand", "POST", "/v1/remote/offline-command", "Remote interactive command fail-fast contract"],
  ["claw.api.remote.externalPending", "GET", "/v1/remote/external-pending", "Remote external pending requirement register contract"],
  ["claw.api.remote.externalValidationChecklist", "GET", "/v1/remote/external-validation-checklist", "Remote physical/provider validation checklist contract"],
  ["claw.api.remote.externalValidationTemplateRead", "GET", "/v1/remote/external-validation-template", "Remote physical/provider validation evidence template read contract"],
  ["claw.api.remote.externalValidationTemplate", "POST", "/v1/remote/external-validation-template", "Remote physical/provider validation evidence template contract"],
  ["claw.api.remote.externalValidationArtifactRead", "GET", "/v1/remote/external-validation-artifact", "Remote physical/provider validation evidence artifact read contract"],
  ["claw.api.remote.externalValidationArtifact", "POST", "/v1/remote/external-validation-artifact", "Remote physical/provider validation evidence artifact contract"],
  ["claw.api.remote.externalValidationRunbook", "GET", "/v1/remote/external-validation-runbook", "Remote physical/provider validation runbook contract"],
  ["claw.api.remote.externalValidationReadinessRead", "GET", "/v1/remote/external-validation-readiness", "Remote physical/provider validation readiness read contract"],
  ["claw.api.remote.externalValidationReadiness", "POST", "/v1/remote/external-validation-readiness", "Remote physical/provider validation readiness contract"],
  ["claw.api.remote.externalValidationApprovalRequestRead", "GET", "/v1/remote/external-validation-approval-request", "Remote physical/provider validation approval request read contract"],
  ["claw.api.remote.externalValidationApprovalRequest", "POST", "/v1/remote/external-validation-approval-request", "Remote physical/provider validation approval request contract"],
  ["claw.api.remote.externalValidationReportRead", "GET", "/v1/remote/external-validation-report", "Remote physical/provider validation evidence report read contract"],
  ["claw.api.remote.externalValidationReport", "POST", "/v1/remote/external-validation-report", "Remote physical/provider validation evidence report contract"],
  ["claw.api.remote.sourceQaTemplateRead", "GET", "/v1/remote/source-qa-template", "Remote source Q/A review template read contract"],
  ["claw.api.remote.sourceQaTemplate", "POST", "/v1/remote/source-qa-template", "Remote source Q/A review template contract"],
  ["claw.api.remote.decisionReviewRead", "GET", "/v1/remote/decision-review", "Remote source Q/A decision review read contract"],
  ["claw.api.remote.decisionReview", "POST", "/v1/remote/decision-review", "Remote source Q/A decision review contract"],
  ["claw.api.remote.closureGateRead", "GET", "/v1/remote/closure-gate", "Remote goal closure gate read contract"],
  ["claw.api.remote.closureGate", "POST", "/v1/remote/closure-gate", "Remote goal closure gate contract"],
  ["claw.api.remote.routeContracts", "GET", "/v1/remote/route-contracts", "Remote route contract catalog contract"],
  ["claw.api.remote.providerDeviceE2EPlan", "GET", "/v1/remote/provider-device-e2e-plan", "Remote provider/device E2E validation plan contract"],
  ["claw.api.remote.compatibilityAdapters", "GET", "/v1/remote/compatibility/adapters", "Remote compatibility adapter catalog contract"],
  ["claw.api.remote.compatibilityAdaptersCreate", "POST", "/v1/remote/compatibility/adapters", "Remote compatibility adapter receipt dry-run contract"],
  ["claw.api.sync.drivers", "GET", "/v1/sync/drivers", "Sync driver catalog contract"],
  ["claw.api.sync.manifests", "GET", "/v1/sync/manifests", "Sync resource manifest contract"],
  ["claw.api.sync.manifests.create", "POST", "/v1/sync/manifests", "Sync resource manifest dry-run creation contract"],
  ["claw.api.sync.changes", "GET", "/v1/sync/changes", "Sync changelog and cursor contract"],
  ["claw.api.sync.plan", "POST", "/v1/sync/plan", "Sync dry-run planning contract"],
  ["claw.api.sync.conflicts", "POST", "/v1/sync/conflicts", "Sync conflict inspection contract"],
  ["claw.api.sync.applications", "POST", "/v1/sync/applications", "Sync driver application receipt contract"],
  ["claw.api.sync.authorityHandoffs", "POST", "/v1/sync/authority-handoffs", "Sync authority handoff receipt contract"],
  ["claw.api.nodes", "GET", "/v1/nodes", "Node identity and trust contract"],
  ["claw.api.nodes.pair", "POST", "/v1/nodes/pair", "Node pairing dry-run contract"],
  ["claw.api.nodes.trust", "POST", "/v1/nodes/trust", "Node trust dry-run contract"],
  ["claw.api.nodes.revoke", "POST", "/v1/nodes/revoke", "Node revocation dry-run contract"],
  ["claw.api.mesh.invitations", "POST", "/v1/mesh/invitations", "Inter-mesh invitation dry-run contract"],
  ["claw.api.mesh.invitationsAccept", "POST", "/v1/mesh/invitations/accept", "Inter-mesh invitation acceptance dry-run contract"],
  ["claw.api.mesh.shares", "POST", "/v1/mesh/shares", "Inter-mesh scoped resource share dry-run contract"],
  ["claw.api.mesh.revocations", "POST", "/v1/mesh/revocations", "Inter-mesh share/invitation revocation dry-run contract"],
  ["claw.api.gateway.conformance", "GET", "/v1/gateway/conformance", "Gateway hosted/self-hosted conformance contract"],
  ["claw.api.gateway.agentServiceEvaluate", "POST", "/v1/gateway/agent-service/evaluate", "Gateway multi-tenant agent service evaluation contract"],
  ["claw.api.gateway.agentServiceExecutions", "POST", "/v1/gateway/agent-service/executions", "Gateway multi-tenant agent service execution receipt contract"],
  ["claw.api.gateway.auditReceipts", "POST", "/v1/gateway/audit/receipts", "Gateway signed host audit receipt contract"],
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
  "packages/clawjs/src/cli-network-command.ts",
  "packages/clawjs/src/cli-search-command.ts",
  "packages/clawjs/src/cli-system-command.ts",
  "packages/clawjs/src/v1-data-core.ts",
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
  "packages/clawjs-search/src/store.ts",
  "publishing/src/server/db/schema.ts",
] as const;

export const clawStrictDdlObjectSources = [
  "packages/clawjs/src/cli-network-command.ts",
  "packages/clawjs/src/cli-search-command.ts",
  "packages/clawjs/src/cli-system-command.ts",
  "packages/clawjs/src/v1-data-core.ts",
  "packages/clawjs-search/src/store.ts",
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

const stableEventTopics: ReadonlyArray<{
  id: string;
  value: string;
  name: string;
  direction: "generated" | "inbound";
  notes?: string;
}> = [
  ..."workspace.initialized compat.refreshed telegram.webhook_configured models.default-set auth.login-started".split(" ").map((event) => ({
    id: `claw.event.${event.replace(/[^a-zA-Z0-9]+/g, ".")}`,
    value: event,
    name: event,
    direction: "generated" as const,
  })),
  ...Object.values(clawDatabaseRecordEvents).map((event) => ({
    id: `claw.event.database.${event.replace(/[^a-zA-Z0-9]+/g, ".")}`,
    value: event,
    name: event,
    direction: "generated" as const,
    notes: "Database realtime event topic emitted for persistent record changes.",
  })),
  ...Object.values(clawTemporalEvents).map((event) => ({
    id: `claw.event.time.${event.replace(/[^a-zA-Z0-9]+/g, ".")}`,
    value: event,
    name: event,
    direction: "generated" as const,
    notes: "Temporal runtime event emitted for due items and notification routing.",
  })),
  ...Object.values(clawSessionEvents).map((event) => ({
    id: `claw.event.sessions.${event.replace(/[^a-zA-Z0-9]+/g, ".")}`,
    value: event,
    name: event,
    direction: "generated" as const,
    notes: "Sessions service event emitted over the registered session event stream.",
  })),
  ...Object.values(clawChannelEvents).map((event) => ({
    id: `claw.event.channels.${event.replace(/[^a-zA-Z0-9]+/g, ".")}`,
    value: event,
    name: event,
    direction: "generated" as const,
    notes: "Channel runtime event emitted by listener, transport, and processor surfaces.",
  })),
  ...Object.values(clawWorkspaceAuditEvents).map((event) => ({
    id: `claw.event.workspaceAudit.${event.replace(/[^a-zA-Z0-9]+/g, ".")}`,
    value: event,
    name: event,
    direction: "generated" as const,
    notes: "Workspace audit event persisted in the canonical workspace audit log.",
  })),
  ...Object.values(clawNotifyEventTypes).map((event) => ({
    id: `claw.event.notify.${event.replace(/[^a-zA-Z0-9]+/g, ".")}`,
    value: event,
    name: event,
    direction: "inbound" as const,
    notes: "Notify event type accepted by source apps and dashboard actions.",
  })),
] as const;

function cliFlagCatalogKey(flag: string): string {
  return flag.slice(2).replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

export const clawPublicApiRouteContractCatalog = defineStableCatalogFromEntries(corePublicRoutes.map(([id, method, route, name]) => [id, clawStableContractCatalogEntry({
  ...contractDefaults,
  id,
  kind: "apiRoute",
  name,
  route,
  method,
  value: `${method} ${route}`,
  parentId: "claw.contracts.api",
  direction: "inbound",
})]));

export const clawPrivateApiRouteContractCatalog = defineStableCatalogFromEntries(corePrivateRoutes.map(([id, method, route, name]) => [id, clawStableContractCatalogEntry({
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
})]));

export const clawEventTopicContractCatalog = defineStableCatalogFromEntries(stableEventTopics.map((event) => [event.id, clawStableContractCatalogEntry({
  ...contractDefaults,
  id: event.id,
  kind: "eventTopic",
  name: event.name,
  value: event.value,
  parentId: "claw.contracts.events",
  surfaceClass: "event",
  direction: event.direction,
  ...("notes" in event && event.notes ? { notes: event.notes } : {}),
})]));

export const clawJsonFieldContractCatalog = defineStableCatalogFromEntries(stableJsonFields.map(([id, field, name]) => [field, clawStableContractCatalogEntry({
  ...contractDefaults,
  id,
  kind: "jsonField",
  name,
  key: field,
  fieldPath: field,
  value: field,
  parentId: "claw.contracts.schemas",
  surfaceClass: "schema",
  direction: "bidirectional",
})]));

export const clawErrorCodeContractCatalog = defineStableCatalogFromEntries(stableErrorCodes.map(([id, code, name]) => [code, clawStableContractCatalogEntry({
  ...contractDefaults,
  id,
  kind: "errorCode",
  name,
  value: code,
  parentId: "claw.contracts.schemas",
  surfaceClass: "schema",
  direction: "outbound",
})]));

export const clawIdNamespaceContractCatalog = defineStableCatalogFromEntries(stableIdNamespaces.map(([id, field, name]) => [field, clawStableContractCatalogEntry({
  ...contractDefaults,
  id,
  kind: "idNamespace",
  name,
  key: field,
  value: field,
  parentId: "claw.contracts.ids",
  surfaceClass: "id",
  direction: "bidirectional",
})]));

export const clawEnvVarContractCatalog = defineStableCatalogFromEntries(stableEnvVars.map(([id, value, name]) => [value, clawStableContractCatalogEntry({
  ...contractDefaults,
  id,
  kind: "envVar",
  name,
  value,
  key: value,
  parentId: "claw.contracts.config",
  direction: "inbound",
})]));

export const clawPackageNameContractCatalog = defineStableCatalogFromEntries(stablePackageNames.map(([id, value, name]) => [id, clawStableContractCatalogEntry({
  ...contractDefaults,
  id,
  kind: "packageName",
  name,
  value,
  parentId: "claw.contracts.packages",
  surfaceClass: "package",
  direction: "outbound",
})]));

export const clawPackageBinContractCatalog = defineStableCatalogFromEntries(stablePackageBins.map(([id, value, name]) => [value, clawStableContractCatalogEntry({
  ...contractDefaults,
  id,
  kind: "packageBin",
  name,
  value,
  parentId: "claw.contracts.packages",
  surfaceClass: "package",
  direction: "outbound",
})]));

export const clawFileFormatContractCatalog = defineStableCatalogFromEntries(stableFileFormats.map(([id, value, name]) => [value, clawStableContractCatalogEntry({
  ...contractDefaults,
  id,
  kind: "fileFormat",
  name,
  value,
  parentId: "claw.contracts.formats",
  surfaceClass: "format",
  direction: "bidirectional",
})]));

export const clawNativeIdentityContractCatalog = defineStableCatalogFromEntries(stableNativeIdentities.map(([id, value, name]) => [id, clawStableContractCatalogEntry({
  ...contractDefaults,
  id,
  kind: "nativeIdentity",
  name,
  value,
  parentId: "claw.contracts.native",
  surfaceClass: "native",
  direction: "bidirectional",
  notes: "Public repo value is a placeholder or public service name. Real signing identities, Team IDs, and release credentials stay outside the public repository.",
})]));

export const clawDeepLinkContractCatalog = defineStableCatalogFromEntries(Object.entries(clawDeepLinkSchemes).map(([name, scheme]) => [name, clawStableContractCatalogEntry({
  ...contractDefaults,
  id: `claw.deeplink.scheme.${name}`,
  kind: "deepLink",
  name: `${scheme}://`,
  value: `${scheme}://`,
  parentId: "claw.contracts.api",
  surfaceClass: "config",
  direction: "inbound",
})]));

export const clawHostnameContractCatalog = defineStableCatalogFromEntries(Object.entries(clawLocalHostnames).map(([name, hostname]) => [name, clawStableContractCatalogEntry({
  ...contractDefaults,
  id: `claw.hostname.${name}`,
  kind: "hostname",
  name: hostname,
  value: hostname,
  parentId: "claw.contracts.api",
  surfaceClass: "config",
  direction: "inbound",
})]));

export const clawPortContractCatalog = defineStableCatalogFromEntries(Object.entries({ ...clawCorePorts, ...clawAppPorts, clawixBridge: clawixBridgePort }).map(([name, port]) => [name, clawStableContractCatalogEntry({
  ...contractDefaults,
  id: `claw.port.${name}`,
  kind: "port",
  name,
  value: port,
  parentId: "claw.contracts.api",
  surfaceClass: "config",
  direction: "inbound",
})]));

export const clawCliCommandContractCatalog = defineStableCatalogFromEntries(cliCommands.map((command) => [command, clawStableContractCatalogEntry({
  ...contractDefaults,
  id: `claw.cli.command.${command}`,
  kind: "cliCommand",
  name: command,
  value: command,
  parentId: "claw.contracts.cli",
  surfaceClass: "cli",
  direction: "inbound",
})]));

export const clawCliFlagContractCatalog = defineStableCatalogFromEntries(["--json", "--dry-run", "--workspace", "--runtime", "--help", "--guidance", "--actor-assertion"].map((flag) => [cliFlagCatalogKey(flag), clawStableContractCatalogEntry({
  ...contractDefaults,
  id: `claw.cli.flag.${flag.slice(2)}`,
  kind: "cliFlag",
  name: flag,
  value: flag,
  parentId: "claw.contracts.cli",
  surfaceClass: "cli",
  direction: "inbound",
})]));

export const clawStableContractCatalogs = Object.freeze({
  publicApiRoutes: clawPublicApiRouteContractCatalog,
  privateApiRoutes: clawPrivateApiRouteContractCatalog,
  eventTopics: clawEventTopicContractCatalog,
  jsonFields: clawJsonFieldContractCatalog,
  errorCodes: clawErrorCodeContractCatalog,
  idNamespaces: clawIdNamespaceContractCatalog,
  envVars: clawEnvVarContractCatalog,
  packageNames: clawPackageNameContractCatalog,
  packageBins: clawPackageBinContractCatalog,
  fileFormats: clawFileFormatContractCatalog,
  nativeIdentities: clawNativeIdentityContractCatalog,
  deepLinks: clawDeepLinkContractCatalog,
  hostnames: clawHostnameContractCatalog,
  ports: clawPortContractCatalog,
  cliCommands: clawCliCommandContractCatalog,
  cliFlags: clawCliFlagContractCatalog,
});

const clawPersistentSurfacePathMap: Readonly<Record<string, string>> = {
  "claw.contracts": "contracts",
  "claw.contracts.api": "contracts/api",
  "claw.contracts.protocol": "contracts/protocol",
  "claw.contracts.events": "contracts/events",
  "claw.contracts.schemas": "contracts/schemas",
  "claw.contracts.ids": "contracts/ids",
  "claw.contracts.cli": "contracts/cli",
  "claw.contracts.config": "contracts/config",
  "claw.contracts.packages": "contracts/packages",
  "claw.contracts.native": "contracts/native",
  "claw.contracts.formats": "contracts/formats",
  "claw.contracts.external": "contracts/external",
  "claw.contracts.versionGovernance": "contracts/versionGovernance",
  "claw.contracts.evolution": "contracts/evolution",
  "claw.cli.public": "claw",
  "claw.cli.commandIntentRegistry": "claw/commands",
  "claw.mcp.surface": "mcp",
  "claw.agents": "agents",
  "claw.agents.assignments": "agents/assignments",
  "claw.agents.resourceGrants": "agents/resource-grants",
  "claw.agents.executionProfiles": "agents/execution-profiles",
  "claw.agents.memoryPolicies": "agents/memory-policies",
  "claw.agents.runs": "agents/runs",
  "claw.support.inbox": "support/inbox",
  "claw.storage.canonical": "storage",
  "claw.host.signed": "host",
  "claw.host.permissions": "host/permissions",
  "claw.host.grants": "host/grants",
  "claw.host.approvals": "host/approvals",
  "claw.host.audit": "host/audit",
  "claw.systemTelemetry": "system",
  "claw.systemTelemetry.contextProviders": "system/providers",
  "clawix.menuBar.systemIndicators": "macos/menu-bar/system",
  "claw.mac.controlPlane": "mac",
  "claw.mac.capabilityAtlas": "mac/atlas",
  "claw.mac.permissionBroker": "permissions",
  "claw.mac.actionBroker": "mac/action-broker",
  "clawix.ui.chat": "Clawix/chat",
  "clawix.companion.client": "Clawix/companion",
  "clawix.bridge.local": "clawix-bridge",
  "claw.daemon.local": "daemon",
  "claw.runtime.agent": "runtime/agent",
  "claw.sessions": "sessions",
  "claw.remote.client": "remote-client",
  "claw.relay": "relay",
  "claw.relay.connector": "relay/connector",
  "claw.coordinator": "remote/coordinator",
  "claw.gateway": "remote/gateway",
  "claw.connector": "remote/connector",
  "claw.sync": "sync",
  "claw.transport.iroh": "remote/transports/iroh",
  "claw.headlessHost": "host/headless",
  "claw.remoteCache": "remote/cache",
  "claw.remote.classification": "remote/classification",
  "claw.search": "search",
  "claw.secrets.broker": "secrets/broker",
  "claw.drive.files": "drive/files",
  "claw.memory.userModel": "memory/user-model",
  "claw.skills.library": "skills/library",
  "claw.mesh.share": "mesh/share",
  "claw.global": "~/.claw",
  "claw.workspace": ".claw",
  "clawix.home": "~/.clawix",
  "claw.database.core": "~/.claw/data/core.sqlite",
  "claw.database.support": "~/.claw/data/support.sqlite",
  "claw.database.runtime": "~/.claw/data/runtime.sqlite",
  "claw.database.sessions": "~/.claw/data/sessions.sqlite",
  "claw.database.audio": "~/.claw/data/audio.sqlite",
  "claw.database.search": "~/.claw/data/search.sqlite",
  "claw.database.notify": "~/.claw/data/notify.sqlite",
  "claw.database.feed": "~/.claw/data/feed.sqlite",
  "claw.database.monitor": "~/.claw/data/monitor.sqlite",
  "claw.workspace.manifest": ".claw/manifest.json",
  "claw.workspace.desiredState": ".claw/state/desired",
  "claw.workspace.projections": ".claw/projections",
  "claw.workspace.sessions": ".claw/sessions",
  "claw.workspace.audit": ".claw/audit",
  "claw.workspace.locks": ".claw/locks",
  "claw.workspace.backups": ".claw/backups",
  "claw.workspace.browser": ".claw/browser",
  "claw.workspace.browserProfileCache": ".claw-browser",
  "claw.workspace.demoCache": ".claw-demo",
  "claw.workspace.e2eCache": ".claw-e2e",
  "claw.workspace.styles": ".claw/styles",
  "claw.workspace.templates": ".claw/templates",
  "claw.workspace.references": ".claw/references",
  "claw.workspace.reports": ".claw/reports",
  "claw.workspace.reports.governance_state": ".claw/reports/report-governance.json",
  "claw.workspace.need_routes": ".claw/need-routes",
  "claw.workspace.need_routes.ledger": ".claw/need-routes/need-route-lab.json",
  "claw.workspace.command_intents": ".claw/command-intents",
  "claw.workspace.command_intents.ledger": ".claw/command-intents/command-intents.json",
  "claw.workspace.slides": ".claw/slides",
  "claw.workspace.dashboard_database": ".claw/dashboard-database",
  "claw.workspace.channel_run": ".claw/run/channels",
  "claw.workspace.telegram_codex_bridge_state": ".claw/telegram-codex-bridge.json",
  "claw.workspace.channel_runs_state": ".claw/channel-runs.json",
  "claw.workspace.observedState": ".claw/observed",
  "claw.workspace.intents": ".claw/intents",
  "claw.workspace.compat": ".claw/compat",
  "claw.workspace.evolution": ".claw/evolution",
  "claw.workspace.documents": ".claw/documents",
  "claw.workspace.data": ".claw/data",
  "claw.workspace.generations_tmp": ".claw/tmp/generations",
  "claw.global.config": "~/.claw/config.yaml",
  "claw.global.data": "~/.claw/data",
  "claw.global.state": "~/.claw/state",
  "claw.global.cache": "~/.claw/cache",
  "claw.global.logs": "~/.claw/logs",
  "claw.global.run": "~/.claw/run",
  "claw.global.tmp": "~/.claw/tmp",
  "claw.global.skills": "~/.claw/skills",
  "claw.global.library": "~/.claw/library",
  "claw.global.rules": "~/.claw/rules",
  "claw.global.guidance": "~/.claw/guidance",
  "claw.global.resources": "~/.claw/resources",
  "claw.global.image_library": "~/.claw/image-library",
  "claw.global.runtime_home": "~/.claw-runtime",
  "claw.global.demo_home": "~/.claw-demo",
  "clawix.home.data": "~/.clawix/data",
  "clawix.home.state": "~/.clawix/state",
  "clawix.home.cache": "~/.clawix/cache",
  "clawix.home.logs": "~/.clawix/logs",
  "clawix.home.run": "~/.clawix/run",
  "clawix.home.tmp": "~/.clawix/tmp",
  "clawix.home.bridgeSocket": "~/.clawix/run/clawix-bridge.sock",
  "claw.external.codex": "~/.codex"
} as const;

export function resolveClawPersistentSurfacePath(idOrPath: string, rootDir = "", ...children: string[]): string {
  const surfacePath = clawPersistentSurfacePathMap[idOrPath] ?? idOrPath;
  const parts = [rootDir, surfacePath, ...children].filter(Boolean);
  return parts.join("/").replace(/\/+/g, "/").replace(/\/$/, "");
}
