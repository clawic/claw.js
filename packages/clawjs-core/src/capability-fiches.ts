export type ClawCapabilityFicheGapStatus =
  | "deferred"
  | "external_pending"
  | "blocked"
  | "not_applicable";

export interface ClawCapabilityFicheSurfaces {
  sdk: string[];
  cli: string[];
  serviceApi: string[];
  mcp: string[];
  relay: string[];
  hostBridge: string[];
}

export interface ClawCapabilityFicheGap {
  area: string;
  status: ClawCapabilityFicheGapStatus;
  reason: string;
  reentry?: string;
}

export interface ClawCapabilityFicheSource {
  file: string;
  language: "typescript" | "swift" | "javascript" | "json" | "sql" | "markdown";
}

export interface ClawCapabilityFiche {
  id: string;
  system: string;
  title: string;
  summary: string;
  does: string[];
  inputs: string[];
  outputs: string[];
  touchedResources: string[];
  permissions: string[];
  routes: string[];
  events: string[];
  storage: string[];
  ui: string[];
  cliApiMcpRelay: ClawCapabilityFicheSurfaces;
  errorStates: string[];
  fixtures: string[];
  limits: string[];
  validation: string[];
  gaps: ClawCapabilityFicheGap[];
  source: ClawCapabilityFicheSource;
}

const source: ClawCapabilityFicheSource = {
  file: "packages/clawjs-core/src/capability-fiches.ts",
  language: "typescript",
};

const noUi = ["No dedicated human UI is required for this capability slice."];
const inspectFixture = "packages/clawjs/src/inspect-cli.test.ts";
const coreFixture = "packages/clawjs-core/src/index.test.ts";
const capabilityFixture = "packages/clawjs-core/src/capability-catalog.test.ts";
const bridgeFixture = "macOS bridge daemon E2E fixture";
const externalPendingGap: ClawCapabilityFicheGap = {
  area: "live external validation",
  status: "external_pending",
  reason: "Live provider, physical device, or signed-host validation is outside this local-complete fiche slice.",
  reentry: "Run the relevant live/provider/signed-host validation only after explicit approval and available credentials or device access.",
};

function surfaces(input: Partial<ClawCapabilityFicheSurfaces>): ClawCapabilityFicheSurfaces {
  return {
    sdk: input.sdk ?? [],
    cli: input.cli ?? [],
    serviceApi: input.serviceApi ?? [],
    mcp: input.mcp ?? [],
    relay: input.relay ?? [],
    hostBridge: input.hostBridge ?? [],
  };
}

function fiche(input: Omit<ClawCapabilityFiche, "source"> & { source?: ClawCapabilityFicheSource }): ClawCapabilityFiche {
  return {
    ...input,
    source: input.source ?? source,
  };
}

function syncFiche(input: {
  id: string;
  title: string;
  resourceNode: string;
  storageNode: string;
  summary: string;
  fixture: string;
}): ClawCapabilityFiche {
  return fiche({
    id: input.id,
    system: "sync",
    title: input.title,
    summary: input.summary,
    does: [
      "Describes the Sync driver route for a resource class.",
      "Binds resource authority, manifests, changelogs, conflict policy, and validation to an inspectable capability fiche.",
    ],
    inputs: ["Sync manifest request", "driver selection", "resource authority scope", "cursor or changelog state"],
    outputs: ["sync manifest", "sync plan", "conflict or application result", "audit-ready route evidence"],
    touchedResources: ["claw.connector", "claw.sync", input.resourceNode],
    permissions: ["connector route policy", "resource authority grant", "conflict elevation when required"],
    routes: [input.id],
    events: ["claw.api.sync.manifests", "claw.api.sync.changes"],
    storage: [input.storageNode],
    ui: ["humanUi parity is available through generated inspect/docs and host projections."],
    cliApiMcpRelay: surfaces({
      cli: ["claw sync manifest --driver <driver> --json", "claw sync plan --driver <driver> --json"],
      serviceApi: ["claw.api.sync.manifests", "claw.api.sync.changes"],
      relay: ["Gateway/Connector projected Sync route"],
    }),
    errorStates: ["missing driver", "authority mismatch", "conflict requires elevation", "external application unavailable"],
    fixtures: [input.fixture, inspectFixture],
    limits: ["No silent overwrite", "physical driver application remains gated", "secret material is not synchronized as plaintext"],
    validation: ["Sync route graph tests", "Sync driver catalog checks", "inspect route tests"],
    gaps: [externalPendingGap],
  });
}

function customAppFiche(input: {
  id: string;
  system: string;
  title: string;
  summary: string;
  operation: "read" | "write" | "action" | "admin";
  resourceNodes: string[];
  routeIds?: string[];
  cli?: string[];
  serviceApi?: string[];
  mcp?: string[];
  relay?: string[];
  hostBridge?: string[];
  inputs?: string[];
  outputs?: string[];
  storage?: string[];
  permissions?: string[];
  errorStates?: string[];
  limits?: string[];
  gaps?: ClawCapabilityFicheGap[];
}): ClawCapabilityFiche {
  return fiche({
    id: input.id,
    system: input.system,
    title: input.title,
    summary: input.summary,
    does: [
      `Declares a custom-app ${input.operation} capability with risk and surface parity.`,
      "Maps SDK-visible capability metadata to framework routes, resources, and validation evidence.",
    ],
    inputs: input.inputs ?? ["declared app capability", "policy context", "redaction policy", "request payload"],
    outputs: input.outputs ?? ["redacted response payload", "dispatch metadata", "capability risk evidence"],
    touchedResources: input.resourceNodes,
    permissions: input.permissions ?? ["custom-app declaration", "host bridge policy", "redaction policy"],
    routes: input.routeIds ?? [],
    events: ["claw.customApp.request.partial.v1"],
    storage: input.storage ?? input.resourceNodes,
    ui: ["custom app activation ficha", "SDK host bridge risk map"],
    cliApiMcpRelay: surfaces({
      sdk: [`@clawjs/claw:${input.id}`],
      cli: input.cli,
      serviceApi: input.serviceApi,
      mcp: input.mcp,
      relay: input.relay,
      hostBridge: input.hostBridge ?? ["clawix.bridge.local"],
    }),
    errorStates: input.errorStates ?? ["capability undeclared", "policy denied", "schema validation failed", "redaction required"],
    fixtures: [capabilityFixture, inspectFixture],
    limits: input.limits ?? ["No direct SQLite access", "No plaintext secret exposure", "High-risk dispatch requires approval"],
    validation: ["capability catalog tests", "custom-app SDK inspection tests", "inspect capability tests"],
    gaps: input.gaps ?? [],
  });
}

const routeFixtures = [inspectFixture, "packages/clawjs/src/index.test.ts"];

export const criticalCapabilityFicheIds = [
  "chat.localDesktop",
  "chat.companionBridge",
  "chat.remoteRelay",
  "remote.chatGateway",
  "remote.searchGateway",
  "remote.secretBrokeredOperation",
  "sync.sessions",
  "sync.skills",
  "sync.memoryUserModel",
  "sync.driveFiles",
  "sync.sqliteResources",
  "sync.sidecars",
  "sync.agentConfig",
  "sync.workspaceState",
  "sync.searchIndex",
  "mac.directCliAction",
  "mac.permissionLifecycle",
  "mac.action.plan",
  "system.telemetryAgentContext",
  "system.telemetrySignedHostControl",
  "system.telemetry.snapshot",
  "system.telemetry.history",
  "search.query",
  "db.query",
  "resources.list",
  "resources.read",
  "jobs.list",
  "jobs.get",
  "jobs.events",
  "jobs.stream",
  "jobs.start",
  "jobs.cancel",
  "actions.invoke",
  "secrets.broker",
  "iot.device.action.invoke",
] as const;

export type CriticalCapabilityFicheId = typeof criticalCapabilityFicheIds[number];

export const clawCapabilityFiches: readonly ClawCapabilityFiche[] = [
  fiche({
    id: "chat.localDesktop",
    system: "chat",
    title: "Local desktop agent chat",
    summary: "Clawix macOS chat sends a local turn through bridge, daemon, runtime, and sessions back to the UI.",
    does: ["Routes a local user turn into the agent runtime.", "Streams session events back to the desktop chat surface."],
    inputs: ["chat message", "selected workspace/session", "local assignment context"],
    outputs: ["assistant message stream", "session event records", "UI bridge frames"],
    touchedResources: ["clawix.ui.chat", "clawix.bridge.local", "claw.daemon.local", "claw.runtime.agent", "claw.sessions"],
    permissions: ["local bridge access", "runtime policy", "session write authority"],
    routes: ["chat.localDesktop"],
    events: ["claw.event.sessions.message.appended"],
    storage: ["claw.database.sessions"],
    ui: ["clawix.ui.chat"],
    cliApiMcpRelay: surfaces({ hostBridge: ["clawix.bridge.local"] }),
    errorStates: ["bridge unavailable", "daemon unavailable", "runtime rejected turn", "session write failed"],
    fixtures: [bridgeFixture, ...routeFixtures],
    limits: ["Local-only", "No paid/provider prompt is required for route inspection", "Bridge validation is fixture-backed unless host validation is explicit"],
    validation: ["chat.localDesktop route graph", "bridge frame fixture", "inspect route tests"],
    gaps: [],
  }),
  fiche({
    id: "chat.companionBridge",
    system: "chat",
    title: "Companion bridge chat",
    summary: "A companion client uses the local bridge WebSocket to reach daemon, runtime, sessions, and companion responses.",
    does: ["Accepts companion chat traffic through the local bridge.", "Returns remote-control-safe session frames to the companion client."],
    inputs: ["companion client frame", "pairing or local trust state", "chat payload"],
    outputs: ["companion response frame", "session event updates"],
    touchedResources: ["clawix.companion.client", "clawix.bridge.local", "claw.daemon.local", "claw.runtime.agent", "claw.sessions"],
    permissions: ["companion bridge trust", "local WebSocket access", "session write authority"],
    routes: ["chat.companionBridge"],
    events: ["claw.event.sessions.message.appended"],
    storage: ["claw.database.sessions"],
    ui: ["clawix.companion.client"],
    cliApiMcpRelay: surfaces({ hostBridge: ["clawix.bridge.local"] }),
    errorStates: ["pairing rejected", "bridge frame invalid", "daemon unavailable", "session event delivery failed"],
    fixtures: ["companion bridge fixture", ...routeFixtures],
    limits: ["Local bridge only", "No Relay promotion without explicit remote route classification"],
    validation: ["chat.companionBridge route graph", "companion bridge frame round-trip", "inspect route tests"],
    gaps: [],
  }),
  fiche({
    id: "chat.remoteRelay",
    system: "chat",
    title: "Remote Relay chat",
    summary: "Remote clients use Relay and connector routes to reach workspace runtime and remote-safe session responses.",
    does: ["Brokers remote chat through Relay and connector.", "Projects session responses without making Relay the canonical local API."],
    inputs: ["remote client request", "Relay tenant/workspace context", "connector session command"],
    outputs: ["remote-safe session response", "Relay stream frames"],
    touchedResources: ["claw.remote.client", "claw.relay", "claw.relay.connector", "claw.workspace", "claw.runtime.agent", "claw.sessions"],
    permissions: ["Relay auth", "connector workspace authority", "remote-safe session classification"],
    routes: ["chat.remoteRelay"],
    events: ["claw.event.sessions.message.appended"],
    storage: ["claw.database.sessions", "claw.workspace"],
    ui: ["remote client UI"],
    cliApiMcpRelay: surfaces({ relay: ["claw.api.relay.remote", "claw.api.relay.connector"], serviceApi: ["claw.api.relay.remote"] }),
    errorStates: ["Relay unavailable", "connector offline", "workspace materialization failed", "remote-safe policy denied"],
    fixtures: ["relay E2E fixture", ...routeFixtures],
    limits: ["Remote-safe projection only", "No plaintext secrets", "Connector remains the workspace authority"],
    validation: ["chat.remoteRelay route graph", "Relay connector fixture", "inspect route tests"],
    gaps: [externalPendingGap],
  }),
  fiche({
    id: "remote.chatGateway",
    system: "remote",
    title: "Remote chat gateway",
    summary: "Coordinator, Gateway, Connector, runtime, and sessions provide the governed remote chat route.",
    does: ["Admits remote chat through Gateway conformance.", "Routes only through registered Connector/runtime contracts."],
    inputs: ["remote chat request", "node trust metadata", "Gateway conformance policy"],
    outputs: ["runtime command", "session update", "remote conformance evidence"],
    touchedResources: ["claw.remote.client", "claw.coordinator", "claw.gateway", "claw.connector", "claw.runtime.agent", "claw.sessions"],
    permissions: ["node trust", "Gateway policy", "connector runtime authority"],
    routes: ["remote.chatGateway"],
    events: ["claw.event.sessions.message.appended"],
    storage: ["claw.database.sessions"],
    ui: noUi,
    cliApiMcpRelay: surfaces({ serviceApi: ["claw.api.remote.conformance"], relay: ["Gateway/Connector remote chat route"] }),
    errorStates: ["node trust missing", "Gateway policy denied", "connector offline", "runtime unavailable"],
    fixtures: ["remote chat conformance fixture", ...routeFixtures],
    limits: ["No parallel mobile-only API", "Remote access must stay classified"],
    validation: ["remote.chatGateway inspect route tests", "remote conformance checks"],
    gaps: [externalPendingGap],
  }),
  fiche({
    id: "remote.searchGateway",
    system: "remote",
    title: "Remote search gateway",
    summary: "Remote search is a Gateway/Connector projection of the registered Root Search contract.",
    does: ["Projects search through Gateway and Connector.", "Preserves local authority and registered search route contracts."],
    inputs: ["remote search query", "Gateway policy", "Connector search request"],
    outputs: ["redacted search results", "route contract evidence"],
    touchedResources: ["claw.remote.client", "claw.coordinator", "claw.gateway", "claw.connector", "claw.search"],
    permissions: ["remote-safe search classification", "connector search authority", "redaction policy"],
    routes: ["remote.searchGateway"],
    events: ["claw.api.search.searches"],
    storage: ["claw.search"],
    ui: noUi,
    cliApiMcpRelay: surfaces({ cli: ["claw search query --json"], serviceApi: ["claw.api.search.searches"], relay: ["remote.searchGateway"] }),
    errorStates: ["query rejected", "Gateway policy denied", "Connector search unavailable", "redaction failed"],
    fixtures: ["remote search conformance tests", ...routeFixtures],
    limits: ["Timeout-bound", "Redacted results only", "No direct remote database access"],
    validation: ["remote.searchGateway inspect route tests", "Root Search tests"],
    gaps: [externalPendingGap],
  }),
  fiche({
    id: "remote.secretBrokeredOperation",
    system: "remote",
    title: "Remote secret brokered operation",
    summary: "Remote secret operations use secret references and brokered leases without exposing plaintext material.",
    does: ["Routes remote secret work through the Secrets broker.", "Keeps plaintext secret material out of Relay and custom apps."],
    inputs: ["secret reference", "brokered operation request", "Gateway policy"],
    outputs: ["lease or operation receipt", "redacted audit evidence"],
    touchedResources: ["claw.remote.client", "claw.gateway", "claw.connector", "claw.secrets.broker"],
    permissions: ["secret reference grant", "broker approval", "Gateway policy"],
    routes: ["remote.secretBrokeredOperation"],
    events: ["claw.api.secrets"],
    storage: ["claw.secrets.broker"],
    ui: noUi,
    cliApiMcpRelay: surfaces({ cli: ["claw secrets ... --json"], serviceApi: ["claw.api.secrets"], relay: ["remote.secretBrokeredOperation"] }),
    errorStates: ["secret ref missing", "lease denied", "plaintext request rejected", "broker unavailable"],
    fixtures: ["secret lease rejection/acceptance tests", ...routeFixtures],
    limits: ["No plaintext replication", "Brokered operation only", "Approval required for high-risk access"],
    validation: ["remote.secretBrokeredOperation route graph", "Secrets broker tests"],
    gaps: [externalPendingGap],
  }),
  syncFiche({ id: "sync.sessions", title: "Session sync", resourceNode: "claw.sessions", storageNode: "claw.database.sessions", summary: "Session resources synchronize through explicit manifests and changelogs." , fixture: "sessions sync route contract tests" }),
  syncFiche({ id: "sync.skills", title: "Skills sync", resourceNode: "claw.skills.library", storageNode: "claw.skills.library", summary: "Skill library resources synchronize through configured Sync drivers." , fixture: "skills sync hermetic E2E" }),
  syncFiche({ id: "sync.memoryUserModel", title: "Memory and user model sync", resourceNode: "claw.memory.userModel", storageNode: "claw.memory.userModel", summary: "Memory and user-model state synchronize by explicit resource authority." , fixture: "memory sync hermetic E2E" }),
  syncFiche({ id: "sync.driveFiles", title: "Drive and files sync", resourceNode: "claw.drive.files", storageNode: "claw.drive.files", summary: "Drive, files, documents, and blobs synchronize through driver-backed manifests." , fixture: "drive file sync hermetic E2E" }),
  syncFiche({ id: "sync.sqliteResources", title: "SQLite resource sync", resourceNode: "claw.database.core", storageNode: "claw.database.core", summary: "Core database resources synchronize as full, table, or partial-resource manifests." , fixture: "SQLite resource sync tests" }),
  syncFiche({ id: "sync.sidecars", title: "Sidecar sync", resourceNode: "claw.database.runtime", storageNode: "claw.database.runtime", summary: "Sidecar databases synchronize through dedicated manifests." , fixture: "sidecar sync route contract tests" }),
  syncFiche({ id: "sync.agentConfig", title: "Agent config sync", resourceNode: "claw.agents", storageNode: "claw.agents", summary: "Agent configuration synchronizes through explicit manifests for remote/headless hosts." , fixture: "agent config sync route contract tests" }),
  syncFiche({ id: "sync.workspaceState", title: "Workspace state sync", resourceNode: "claw.workspace", storageNode: "claw.workspace", summary: "Workspace state synchronizes for headless and multi-node installs." , fixture: "workspace state sync route contract tests" }),
  syncFiche({ id: "sync.searchIndex", title: "Search index sync", resourceNode: "claw.search", storageNode: "claw.search", summary: "Search index and rebuild-state metadata synchronize through Sync." , fixture: "search-index sync route contract tests" }),
  fiche({
    id: "mac.directCliAction",
    system: "mac",
    title: "Mac direct CLI action",
    summary: "Direct Mac roots resolve through the atlas, permission broker, action broker, signed host, and audit receipt.",
    does: ["Plans direct Mac actions without ad hoc native calls.", "Connects CLI roots to permission and action brokers."],
    inputs: ["direct CLI intent", "Mac atlas capability id", "actor assertion", "dry-run or confirmation flag"],
    outputs: ["action plan", "signed-host action receipt", "redacted audit record"],
    touchedResources: ["claw.cli.command.wifi", "claw.mac.controlPlane", "claw.mac.capabilityAtlas", "claw.mac.permissionBroker", "claw.mac.actionBroker", "claw.host.signed", "claw.host.audit"],
    permissions: ["Mac permission broker state", "signed-host execution approval", "policy grant"],
    routes: ["mac.directCliAction"],
    events: ["claw.host.audit"],
    storage: ["claw.host.audit"],
    ui: ["humanUi permission/review surfaces"],
    cliApiMcpRelay: surfaces({ cli: ["claw wifi/window/shortcut/app/permissions ... --json"], serviceApi: ["MacControlWire"], mcp: ["Mac Control MCP tools"], hostBridge: ["signed host MacControlActionBroker"] }),
    errorStates: ["capability unknown", "permission missing", "confirmation required", "signed host unavailable", "action rejected"],
    fixtures: ["packages/clawjs-core/src/mac-control-plane.test.ts", "packages/clawjs/src/cli-mac-control-command.test.ts", inspectFixture, "scripts/verify-host-permission-contract.mjs"],
    limits: ["Plan-first", "No direct macOS mutation from framework CLI", "Live signed-host validation can be external pending"],
    validation: ["Mac atlas tests", "Mac CLI direct-root tests", "host permission contract guard", "inspect route tests"],
    gaps: [externalPendingGap],
  }),
  fiche({
    id: "mac.permissionLifecycle",
    system: "mac",
    title: "Mac permission lifecycle",
    summary: "`claw permissions` centralizes OS permission state, framework grants, just-in-time plans, and lifecycle audit.",
    does: ["Inspects and plans Mac permission requests.", "Records lifecycle audit without prompting at install time."],
    inputs: ["permission command", "capability id", "actor assertion", "request confirmation"],
    outputs: ["permission state", "request plan", "lifecycle audit record"],
    touchedResources: ["claw.cli.command.permissions", "claw.mac.permissionBroker", "claw.host.permissions", "claw.host.audit"],
    permissions: ["OS permission state", "framework grant", "request confirmation"],
    routes: ["mac.permissionLifecycle"],
    events: ["claw.host.audit"],
    storage: ["claw.host.audit"],
    ui: ["humanUi permission/review surfaces"],
    cliApiMcpRelay: surfaces({ cli: ["claw permissions ... --json"], serviceApi: ["claw.mac.permissionState.v1"], mcp: ["Mac permissions MCP tools"], hostBridge: ["signed host permission broker"] }),
    errorStates: ["permission unknown", "confirmation required", "host permission unavailable", "audit write failed"],
    fixtures: ["packages/clawjs-core/src/mac-control-plane.test.ts", "packages/clawjs/src/cli-mac-control-command.test.ts", inspectFixture, "scripts/verify-host-permission-contract.mjs"],
    limits: ["Just-in-time request model", "No install-time permission prompts", "Live host prompt validation can be external pending"],
    validation: ["Mac permission tests", "host permission guard", "inspect route tests"],
    gaps: [externalPendingGap],
  }),
  customAppFiche({
    id: "mac.action.plan",
    system: "mac",
    title: "Mac action plan",
    summary: "Custom apps can request approval-gated, dry-run Mac action plans before signed-host execution.",
    operation: "action",
    resourceNodes: ["claw.mac.controlPlane", "claw.mac.actionBroker", "claw.host.audit"],
    routeIds: ["mac.directCliAction"],
    cli: ["claw wifi/window/permissions/system mac --json"],
    serviceApi: ["claw.mac.actionRequest.v1", "claw.mac.actionPlan.v1"],
    mcp: ["Mac Control MCP tools"],
    hostBridge: ["signed host MacControlActionBroker"],
    permissions: ["approval required", "signed-host execution remains separate", "Mac permission broker"],
    limits: ["Plan-only custom-app projection", "No direct native mutation"],
    gaps: [externalPendingGap],
  }),
  fiche({
    id: "system.telemetryAgentContext",
    system: "system",
    title: "System telemetry agent context",
    summary: "`claw system` exposes safe snapshots, provider catalogs, widgets, rules, and Monitor-backed history for local agents.",
    does: ["Provides read-only system/context telemetry.", "Records approved metric history through Monitor storage."],
    inputs: ["metric key", "range", "provider plan", "redacted credential projection"],
    outputs: ["system snapshot", "metric history", "widget definitions", "provider status"],
    touchedResources: ["claw.cli.command.system", "claw.mcp.surface", "claw.systemTelemetry", "claw.systemTelemetry.contextProviders", "claw.database.monitor"],
    permissions: ["safe telemetry read policy", "provider credential redaction", "Monitor retention policy"],
    routes: ["system.telemetryAgentContext"],
    events: ["claw.systemTelemetry.providers.v1"],
    storage: ["claw.database.monitor"],
    ui: ["humanUi telemetry widgets", "Clawix menu bar system indicators"],
    cliApiMcpRelay: surfaces({ cli: ["claw system snapshot --json", "claw system history <metric-key> --json"], serviceApi: ["claw.api.system.snapshot", "claw.api.system.history", "claw.api.system.widgets"], mcp: ["system.snapshot", "system.history"], hostBridge: ["clawix.bridge.local"] }),
    errorStates: ["provider unavailable", "credential redacted or missing", "metric not retained", "Monitor write failed"],
    fixtures: ["packages/clawjs-core/src/system-telemetry.test.ts", "packages/clawjs/src/index.test.ts", "packages/clawjs-mcp/src/control-plane.test.ts", inspectFixture],
    limits: ["Read-only unless routed through signed-host control", "Provider credentials are redacted", "History respects retention"],
    validation: ["system telemetry CLI tests", "MCP tests", "Monitor tests", "inspect route tests"],
    gaps: [],
  }),
  fiche({
    id: "system.telemetrySignedHostControl",
    system: "system",
    title: "System telemetry signed-host control",
    summary: "System controls remain plan-first publicly and execute only through signed-host brokers with receipt/audit metadata.",
    does: ["Plans system controls through telemetry policy.", "Brokers approved native control through the signed host."],
    inputs: ["system control request", "approval context", "signed-host command"],
    outputs: ["control plan", "host snapshot", "redacted audit receipt"],
    touchedResources: ["claw.cli.command.system", "claw.systemTelemetry", "claw.host.signed", "claw.host.audit"],
    permissions: ["approval required", "signed-host native control", "audit policy"],
    routes: ["system.telemetrySignedHostControl"],
    events: ["claw.systemTelemetry.audit.v1"],
    storage: ["claw.host.audit"],
    ui: ["humanUi control review surfaces"],
    cliApiMcpRelay: surfaces({ cli: ["claw system controls --json"], serviceApi: ["claw.api.system.controls"], hostBridge: ["signed-host system telemetry broker"] }),
    errorStates: ["control denied", "confirmation required", "signed host unavailable", "audit receipt failed"],
    fixtures: ["packages/clawjs/src/index.test.ts", "apps/host/Tests/CommanderE2ETests/CommanderE2ETests.swift", inspectFixture],
    limits: ["Plan-first", "No direct public native control", "Live signed-host execution can be external pending"],
    validation: ["system telemetry signed-host control tests", "audit receipt checks", "inspect route tests"],
    gaps: [externalPendingGap],
  }),
  customAppFiche({
    id: "system.telemetry.snapshot",
    system: "system",
    title: "System telemetry snapshot",
    summary: "Read safe local system telemetry snapshots for custom-app and agent context.",
    operation: "read",
    resourceNodes: ["claw.systemTelemetry"],
    routeIds: ["system.telemetryAgentContext"],
    cli: ["claw system snapshot --json"],
    serviceApi: ["claw.api.system.snapshot"],
    mcp: ["system.snapshot"],
    relay: ["local-only"],
    inputs: ["claw.system.telemetry.snapshot.request.v1"],
    outputs: ["claw.system.telemetry.snapshot.v1"],
    storage: ["claw.systemTelemetry"],
    limits: ["Read-only", "Local-only Relay classification"],
  }),
  customAppFiche({
    id: "system.telemetry.history",
    system: "system",
    title: "System telemetry history",
    summary: "Read retained Monitor-backed metric history, chart points, incidents, and sparkline renders.",
    operation: "read",
    resourceNodes: ["claw.systemTelemetry", "claw.database.monitor"],
    routeIds: ["system.telemetryAgentContext"],
    cli: ["claw system history <metric-key> --range 1h|24h --json"],
    serviceApi: ["claw.api.system.history"],
    mcp: ["system.history"],
    relay: ["local-only"],
    inputs: ["claw.system.telemetry.history.request.v1"],
    outputs: ["claw.system.telemetry.history.v1"],
    storage: ["claw.database.monitor"],
    limits: ["Read-only", "History retention applies", "Local-only Relay classification"],
  }),
  customAppFiche({ id: "search.query", system: "search", title: "Search query", summary: "Federated framework search with timeouts, partial results, facets, redaction, and source metadata.", operation: "read", resourceNodes: ["claw.search"], routeIds: ["remote.searchGateway"], cli: ["claw search query --json"], serviceApi: ["claw.api.search.searches"], mcp: ["clawjs-search-mcp"], relay: ["remote.searchGateway"], limits: ["Timeout-bound", "Redacted results", "No direct source bypass"] }),
  customAppFiche({ id: "db.query", system: "database", title: "Database query", summary: "Structured collection query DSL without direct SQLite access from custom apps.", operation: "read", resourceNodes: ["claw.database.core"], routeIds: ["sync.sqliteResources"], cli: ["claw db <collection> query --json"], serviceApi: ["@clawjs/database"], mcp: ["clawjs.custom_app_sdk metadata-only contract projection"], relay: ["sync.sqliteResources"], limits: ["No direct SQLite action surface", "Registered collections only"] }),
  customAppFiche({ id: "resources.list", system: "resources", title: "Resource list", summary: "List registered resources through the resource registry without filesystem or database bypasses.", operation: "read", resourceNodes: ["claw.workspace", "claw.drive.files"], routeIds: ["sync.driveFiles"], cli: ["claw resources list --json"], serviceApi: ["claw.api.resources"], mcp: ["MCP resources"], relay: ["remote-safe when classified"] }),
  customAppFiche({ id: "resources.read", system: "resources", title: "Resource read", summary: "Read registered resources through the resource registry instead of raw filesystem or database access.", operation: "read", resourceNodes: ["claw.workspace", "claw.drive.files"], routeIds: ["sync.driveFiles"], cli: ["claw resources read --json"], serviceApi: ["claw.api.resources"], mcp: ["MCP resources"], relay: ["remote-safe when classified"] }),
  customAppFiche({ id: "jobs.list", system: "jobs", title: "Jobs list", summary: "Read recent framework jobs and run records through SDK/host adapters without starting or cancelling work.", operation: "read", resourceNodes: ["claw.runtime.agent", "claw.agents.runs"], routeIds: [], cli: ["blocked until a public jobs read CLI contract exists"], serviceApi: ["claw.api.runtime.jobs"], mcp: ["clawjs.custom_app_sdk metadata-only contract projection"], relay: ["local-only"], gaps: [{ area: "registered route", status: "deferred", reason: "Jobs list is a custom-app read projection; no dedicated route graph entry is required in the critical slice." }, { area: "public CLI", status: "blocked", reason: "Internal runtime job sidecars are removed from the public CLI and must not be advertised as a jobs read surface." }] }),
  customAppFiche({ id: "jobs.get", system: "jobs", title: "Jobs detail", summary: "Read one framework job/run detail with redacted entity summaries through SDK/host adapters.", operation: "read", resourceNodes: ["claw.runtime.agent", "claw.agents.runs"], routeIds: [], cli: ["blocked until a public jobs detail CLI contract exists"], serviceApi: ["claw.api.runtime.jobs"], mcp: ["clawjs.custom_app_sdk metadata-only contract projection"], relay: ["local-only"], gaps: [{ area: "registered route", status: "deferred", reason: "Jobs detail is a custom-app read projection; no dedicated route graph entry is required in the critical slice." }, { area: "public CLI", status: "blocked", reason: "Internal runtime job sidecars are removed from the public CLI and must not be advertised as a jobs detail surface." }] }),
  customAppFiche({ id: "jobs.events", system: "jobs", title: "Jobs events", summary: "Read job/run event summaries without granting custom apps a live stream.", operation: "read", resourceNodes: ["claw.runtime.agent", "claw.agents.runs"], routeIds: [], cli: ["blocked until a public jobs events CLI contract exists"], serviceApi: ["claw.api.runtime.jobs"], mcp: ["clawjs.custom_app_sdk metadata-only contract projection"], relay: ["local-only"], gaps: [{ area: "live stream", status: "deferred", reason: "Live stream execution is intentionally separated from read-only event summaries." }, { area: "public CLI", status: "blocked", reason: "Internal runtime event sidecars are removed from the public CLI and must not be advertised as a jobs events surface." }] }),
  customAppFiche({ id: "jobs.stream", system: "jobs", title: "Jobs stream", summary: "Blocked custom-app gap for true live job/run streams until stream backend, policy, audit, and host adapters exist.", operation: "read", resourceNodes: ["claw.runtime.agent", "claw.agents.runs"], routeIds: [], cli: ["blocked until stream contract exists"], serviceApi: ["blocked until stream contract exists"], mcp: ["blocked until stream contract exists"], relay: ["blocked until stream contract exists"], hostBridge: ["blocked"], permissions: ["blocked until stream policy and audit exist"], errorStates: ["capability blocked", "no stream runner", "policy unavailable"], limits: ["No SDK execution", "No host bridge execution"], gaps: [{ area: "execution", status: "blocked", reason: "No live stream backend, policy, audit, or host adapter exists yet." }] }),
  customAppFiche({ id: "jobs.start", system: "jobs", title: "Jobs start", summary: "Blocked custom-app gap for starting jobs until runner policy, audit, and host adapters exist.", operation: "action", resourceNodes: ["claw.runtime.agent", "claw.agents.runs"], routeIds: [], cli: ["blocked until job start contract exists"], serviceApi: ["blocked until job start contract exists"], mcp: ["blocked until job start contract exists"], relay: ["blocked until job start contract exists"], hostBridge: ["blocked"], permissions: ["blocked until job start policy and audit exist"], errorStates: ["capability blocked", "no start runner", "policy unavailable"], limits: ["No SDK execution", "No host bridge execution", "No job mutation"], gaps: [{ area: "execution", status: "blocked", reason: "No approved job start runner, policy, audit, or host adapter exists yet." }] }),
  customAppFiche({ id: "jobs.cancel", system: "jobs", title: "Jobs cancel", summary: "Blocked custom-app gap for cancelling jobs until runner policy, audit, and host adapters exist.", operation: "action", resourceNodes: ["claw.runtime.agent", "claw.agents.runs"], routeIds: [], cli: ["blocked until job cancel contract exists"], serviceApi: ["blocked until job cancel contract exists"], mcp: ["blocked until job cancel contract exists"], relay: ["blocked until job cancel contract exists"], hostBridge: ["blocked"], permissions: ["blocked until job cancel policy and audit exist"], errorStates: ["capability blocked", "no cancel runner", "policy unavailable"], limits: ["No SDK execution", "No host bridge execution", "No job cancellation"], gaps: [{ area: "execution", status: "blocked", reason: "No approved job cancel runner, policy, audit, or host adapter exists yet." }] }),
  customAppFiche({ id: "actions.invoke", system: "actions", title: "Framework action invoke", summary: "Plan-first invocation boundary for framework actions that may mutate user, external, native, or physical state.", operation: "action", resourceNodes: ["claw.runtime.agent", "claw.host.audit"], routeIds: [], cli: ["brokered claw <domain> <action> --json"], serviceApi: ["connector/control-plane + domain APIs"], mcp: ["MCP tools when grants allow"], relay: ["remote-safe only when classified"], permissions: ["approval required", "policy grant", "audit receipt"], gaps: [{ area: "generic runner", status: "deferred", reason: "Generic action dispatch still needs an allowlisted safe runner." }] }),
  customAppFiche({ id: "secrets.broker", system: "secrets", title: "Secrets broker", summary: "Secret references, leases, and brokered operations without exposing plaintext material to custom apps.", operation: "action", resourceNodes: ["claw.secrets.broker"], routeIds: ["remote.secretBrokeredOperation"], cli: ["claw secrets ... --json"], serviceApi: ["claw.api.secrets"], mcp: ["blocked"], relay: ["remote.secretBrokeredOperation"], hostBridge: ["signed host secrets broker"], permissions: ["approval required", "secret reference grant", "no plaintext lease without broker"], limits: ["No plaintext material", "Brokered lease/ref runner only"], gaps: [{ area: "plaintext access", status: "blocked", reason: "Plaintext secret exposure is not a valid capability surface." }] }),
  customAppFiche({ id: "iot.device.action.invoke", system: "iot", title: "IoT device action", summary: "Invoke registered IoT device actions through policy, plan, and audit instead of direct device control.", operation: "action", resourceNodes: ["claw.cli.command.iot", "claw.env.iotBaseUrl", "claw.env.iotDir"], routeIds: [], cli: ["claw iot ... --json"], serviceApi: ["iot service API"], mcp: ["clawjs.custom_app_sdk metadata-only contract projection"], relay: ["local-only unless classified"], permissions: ["approval required", "host IoT adapter policy", "physical-world action review"], errorStates: ["device unavailable", "provider unavailable", "approval required", "external validation pending"], gaps: [externalPendingGap] }),
];

export function listClawCapabilityFiches(): ClawCapabilityFiche[] {
  return clawCapabilityFiches.map((entry) => ({
    ...entry,
    does: [...entry.does],
    inputs: [...entry.inputs],
    outputs: [...entry.outputs],
    touchedResources: [...entry.touchedResources],
    permissions: [...entry.permissions],
    routes: [...entry.routes],
    events: [...entry.events],
    storage: [...entry.storage],
    ui: [...entry.ui],
    cliApiMcpRelay: {
      sdk: [...entry.cliApiMcpRelay.sdk],
      cli: [...entry.cliApiMcpRelay.cli],
      serviceApi: [...entry.cliApiMcpRelay.serviceApi],
      mcp: [...entry.cliApiMcpRelay.mcp],
      relay: [...entry.cliApiMcpRelay.relay],
      hostBridge: [...entry.cliApiMcpRelay.hostBridge],
    },
    errorStates: [...entry.errorStates],
    fixtures: [...entry.fixtures],
    limits: [...entry.limits],
    validation: [...entry.validation],
    gaps: entry.gaps.map((gap) => ({ ...gap })),
    source: { ...entry.source },
  }));
}

export function getClawCapabilityFiche(id: string): ClawCapabilityFiche | null {
  return listClawCapabilityFiches().find((entry) => entry.id === id) ?? null;
}
