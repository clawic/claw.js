import { CUSTOM_APP_REDACTION_POLICY_ID } from "./custom-app-redaction-policy.ts";
import { CUSTOM_APP_SDK_SCHEMA_REFS } from "./custom-app-sdk-contracts.ts";

export type ClawCapabilitySurface = "sdk" | "cli" | "serviceApi" | "mcp" | "relay" | "hostBridge";
export type ClawCapabilitySurfaceStatus = "available" | "pending" | "blocked" | "notApplicable";
export type ClawCapabilityRiskTier = "low" | "medium" | "high" | "critical";
export type ClawCapabilityExecutionMode = "sync" | "async" | "stream";
export type ClawCapabilityCustomAppAccess = "localWide" | "declared" | "approvalRequired" | "blocked";
export type ClawCapabilityDispatchStatus = "available" | "unavailable";
export type ClawCapabilityDispatchMode =
  | "localWideRead"
  | "approvalRequiredPlanOnly"
  | "approvalRequiredDispatch"
  | "approvalRequiredNoRunner"
  | "approvalRequiredNoPlaintextBroker"
  | "blocked"
  | "unknown";

export interface ClawCapabilitySurfaceBinding {
  surface: ClawCapabilitySurface;
  status: ClawCapabilitySurfaceStatus;
  ref?: string;
  reason?: string;
}

export interface ClawCapabilityRisk {
  tier: ClawCapabilityRiskTier;
  readsUserData?: boolean;
  writesUserData?: boolean;
  mutatesExternalState?: boolean;
  destructive?: boolean;
  costBearing?: boolean;
  touchesSecrets?: boolean;
  touchesNativeHost?: boolean;
  touchesPhysicalWorld?: boolean;
  regulatedReview?: boolean;
  interruptiveApproval: boolean;
}

export interface ClawCapabilityDispatch {
  status: ClawCapabilityDispatchStatus;
  mode: ClawCapabilityDispatchMode;
  approvalRequired: boolean;
  runner: string;
  reason: string;
  externalValidation?: "EXTERNAL PENDING";
}

export interface ClawCapabilityDescriptor {
  id: string;
  domain: string;
  title: string;
  summary: string;
  operation: "read" | "write" | "action" | "admin";
  executionMode: ClawCapabilityExecutionMode;
  cancelable: boolean;
  streamable: boolean;
  timeoutMs: number;
  customAppAccess: ClawCapabilityCustomAppAccess;
  risk: ClawCapabilityRisk;
  dispatch?: ClawCapabilityDispatch;
  surfaces: ClawCapabilitySurfaceBinding[];
  inputSchemaRef?: string;
  outputSchemaRef?: string;
  redactionPolicyRef?: string;
  eventSchemaRefs?: {
    cancel?: string;
    progress?: string;
    partial?: string;
  };
}

export interface ClawCustomAppCapabilityRiskMap {
  authorityModel: "localWideReadsHighRiskApproval";
  capabilityIds: string[];
  ordinaryAccess: string[];
  approvalRequired: string[];
  blocked: string[];
  highRisk: string[];
}

const sdkFirstSource = "docs/adr/0032-sdk-first-custom-surfaces-and-nonblocking-shell.md";

function surfaces(input: Partial<Record<ClawCapabilitySurface, string | ClawCapabilitySurfaceStatus>>): ClawCapabilitySurfaceBinding[] {
  return (["sdk", "cli", "serviceApi", "mcp", "relay", "hostBridge"] as const).map((surface) => {
    const value = input[surface];
    if (!value) return { surface, status: "pending" as const, reason: "surface parity pending" };
    if (value === "pending" || value === "blocked" || value === "notApplicable" || value === "available") {
      return { surface, status: value };
    }
    return { surface, status: "available" as const, ref: value };
  });
}

const lowReadRisk: ClawCapabilityRisk = {
  tier: "low",
  readsUserData: true,
  interruptiveApproval: false,
};

export function customAppDispatchForCapability(
  capability: Pick<ClawCapabilityDescriptor, "id" | "operation" | "customAppAccess" | "risk">,
): ClawCapabilityDispatch {
  if (capability.customAppAccess === "localWide" && capability.operation === "read") {
    return {
      status: "available",
      mode: "localWideRead",
      approvalRequired: false,
      runner: "sdkHostBridgeOrServiceAdapter",
      reason: "Ordinary local-wide reads use SDK/host/service adapters directly; rich UIs do not need a CLI process.",
    };
  }

  switch (capability.id) {
    case "mac.action.plan":
      return {
        status: "available",
        mode: "approvalRequiredPlanOnly",
        approvalRequired: true,
        runner: "signedHostMacActionPlan",
        reason: "Returns a dry-run Mac Control plan after approval; signed-host execution remains a separate boundary.",
      };
    case "iot.device.action.invoke":
      return {
        status: "available",
        mode: "approvalRequiredDispatch",
        approvalRequired: true,
        runner: "hostIoTAdapter",
        externalValidation: "EXTERNAL PENDING",
        reason: "Dispatches through the host IoT adapter after approval; live provider or physical-device validation is external pending.",
      };
    case "actions.invoke":
      return {
        status: "unavailable",
        mode: "approvalRequiredNoRunner",
        approvalRequired: true,
        runner: "pending",
        reason: "Generic framework action dispatch still needs an allowlisted safe runner.",
      };
    case "secrets.broker":
      return {
        status: "unavailable",
        mode: "approvalRequiredNoPlaintextBroker",
        approvalRequired: true,
        runner: "pending",
        reason: "Secrets broker dispatch still needs a safe lease/ref runner and must not expose plaintext.",
      };
    default:
      return {
        status: capability.customAppAccess === "blocked" ? "unavailable" : "unavailable",
        mode: capability.customAppAccess === "blocked" ? "blocked" : "unknown",
        approvalRequired: capability.risk.interruptiveApproval,
        runner: "pending",
        reason: "No custom-app dispatcher is registered for this capability.",
      };
  }
}

export const clawCapabilityCatalog: readonly ClawCapabilityDescriptor[] = [
  {
    id: "search.query",
    domain: "search",
    title: "Search query",
    summary: "Federated framework search with timeouts, partial results, facets, redaction, and source metadata.",
    operation: "read",
    executionMode: "async",
    cancelable: true,
    streamable: true,
    timeoutMs: 2_500,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:capabilities + future search facade",
      cli: "claw search query --json",
      serviceApi: "claw.api.search.searches",
      mcp: "clawjs-search-mcp",
      relay: "remote.searchGateway",
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.searchQuery,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.searchResults,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "db.query",
    domain: "database",
    title: "Database query",
    summary: "Structured collection query DSL for local-first records without direct SQLite access from custom apps.",
    operation: "read",
    executionMode: "async",
    cancelable: true,
    streamable: false,
    timeoutMs: 2_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:capabilities + future db facade",
      cli: "claw db <collection> query --json",
      serviceApi: "@clawjs/database",
      mcp: "pending",
      relay: "sync.sqliteResources",
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.dbQuery,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.dbRecords,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "resources.list",
    domain: "resources",
    title: "Resource list",
    summary: "List registered resources through the resource registry without filesystem or database bypasses.",
    operation: "read",
    executionMode: "async",
    cancelable: true,
    streamable: true,
    timeoutMs: 2_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:resources.list",
      cli: "claw resources list --json",
      serviceApi: "claw.api.resources",
      mcp: "MCP resources",
      relay: "remote-safe when classified",
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.resourcesList,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.resourcesListResult,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "resources.read",
    domain: "resources",
    title: "Resource read",
    summary: "Read registered resources through the resource registry instead of filesystem or database bypasses.",
    operation: "read",
    executionMode: "async",
    cancelable: true,
    streamable: true,
    timeoutMs: 2_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:resources.read",
      cli: "claw resources read --json",
      serviceApi: "claw.api.resources",
      mcp: "MCP resources",
      relay: "remote-safe when classified",
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.resourcesRead,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.resourcesPayload,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "system.telemetry.snapshot",
    domain: "system",
    title: "System telemetry snapshot",
    summary: "Read the safe local system telemetry snapshot contract for agent and custom-app context without recording history or executing controls.",
    operation: "read",
    executionMode: "async",
    cancelable: true,
    streamable: false,
    timeoutMs: 2_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:system.telemetry.snapshot",
      cli: "claw system snapshot --json",
      serviceApi: "claw.api.system.snapshot",
      mcp: "system.snapshot",
      relay: "local-only",
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetrySnapshotRequest,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetrySnapshot,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "system.telemetry.history",
    domain: "system",
    title: "System telemetry history",
    summary: "Read retained Monitor-backed metric history, chart points, incidents, and sparkline render for approved system/context metrics.",
    operation: "read",
    executionMode: "async",
    cancelable: true,
    streamable: false,
    timeoutMs: 2_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:system.telemetry.history",
      cli: "claw system history <metric-key> --range 1h|24h --json",
      serviceApi: "claw.api.system.history",
      mcp: "system.history",
      relay: "local-only",
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryHistoryRequest,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryHistory,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "jobs.list",
    domain: "jobs",
    title: "Jobs list",
    summary: "Read recent framework jobs and run records through SDK/host adapters without starting or cancelling work.",
    operation: "read",
    executionMode: "async",
    cancelable: true,
    streamable: true,
    timeoutMs: 2_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:jobs.list",
      cli: "blocked",
      serviceApi: "claw.api.runtime.jobs",
      mcp: "pending",
      relay: "local-only",
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.jobsList,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.jobsListResult,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "jobs.get",
    domain: "jobs",
    title: "Jobs detail",
    summary: "Read one framework job/run detail with redacted entity summaries through SDK/host adapters without starting or cancelling work.",
    operation: "read",
    executionMode: "async",
    cancelable: true,
    streamable: true,
    timeoutMs: 2_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:jobs.get",
      cli: "blocked",
      serviceApi: "claw.api.runtime.jobs",
      mcp: "pending",
      relay: "local-only",
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.jobsGet,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.jobsDetail,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "jobs.events",
    domain: "jobs",
    title: "Jobs events",
    summary: "Read a redacted job/run event timeline derived from framework run records without starting, cancelling, or streaming work.",
    operation: "read",
    executionMode: "async",
    cancelable: true,
    streamable: true,
    timeoutMs: 2_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:jobs.events",
      cli: "blocked",
      serviceApi: "claw.api.runtime.jobs",
      mcp: "pending",
      relay: "local-only",
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.jobsEvents,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.jobsEventsResult,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "jobs.stream",
    domain: "jobs",
    title: "Jobs stream",
    summary: "Blocked custom-app gap for true live job/run event streams until a backend stream, policy, audit, and host adapter exist.",
    operation: "read",
    executionMode: "stream",
    cancelable: true,
    streamable: true,
    timeoutMs: 30_000,
    customAppAccess: "blocked",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "blocked",
      cli: "pending",
      serviceApi: "pending",
      mcp: "pending",
      relay: "pending",
      hostBridge: "blocked",
    }),
  },
  {
    id: "jobs.start",
    domain: "jobs",
    title: "Jobs start",
    summary: "Blocked custom-app gap for starting jobs until a mutation contract, policy, audit, and host adapter exist.",
    operation: "action",
    executionMode: "async",
    cancelable: true,
    streamable: true,
    timeoutMs: 30_000,
    customAppAccess: "blocked",
    risk: {
      tier: "high",
      writesUserData: true,
      costBearing: true,
      interruptiveApproval: false,
    },
    surfaces: surfaces({
      sdk: "blocked",
      cli: "pending",
      serviceApi: "pending",
      mcp: "pending",
      relay: "pending",
      hostBridge: "blocked",
    }),
  },
  {
    id: "jobs.cancel",
    domain: "jobs",
    title: "Jobs cancel",
    summary: "Blocked custom-app gap for cancelling jobs until a mutation contract, policy, audit, and host adapter exist.",
    operation: "action",
    executionMode: "async",
    cancelable: true,
    streamable: true,
    timeoutMs: 30_000,
    customAppAccess: "blocked",
    risk: {
      tier: "high",
      writesUserData: true,
      destructive: true,
      interruptiveApproval: false,
    },
    surfaces: surfaces({
      sdk: "blocked",
      cli: "pending",
      serviceApi: "pending",
      mcp: "pending",
      relay: "pending",
      hostBridge: "blocked",
    }),
  },
  {
    id: "actions.invoke",
    domain: "actions",
    title: "Framework action invoke",
    summary: "Plan-first invocation boundary for framework actions that may mutate user, external, native, or physical state.",
    operation: "action",
    executionMode: "async",
    cancelable: true,
    streamable: true,
    timeoutMs: 30_000,
    customAppAccess: "approvalRequired",
    risk: {
      tier: "high",
      writesUserData: true,
      mutatesExternalState: true,
      costBearing: true,
      interruptiveApproval: true,
    },
    surfaces: surfaces({
      sdk: "@clawjs/claw:future actions facade",
      cli: "brokered claw <domain> <action> --json",
      serviceApi: "connector/control-plane + domain APIs",
      mcp: "MCP tools when policy grants allow",
      relay: "remote-safe only when classified",
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: "claw.actions.invoke.v1",
    outputSchemaRef: "claw.actions.receipt.v1",
  },
  {
    id: "secrets.broker",
    domain: "secrets",
    title: "Secrets broker",
    summary: "Secret references, leases, and brokered operations without exposing plaintext material to custom apps.",
    operation: "action",
    executionMode: "async",
    cancelable: false,
    streamable: false,
    timeoutMs: 15_000,
    customAppAccess: "approvalRequired",
    risk: {
      tier: "critical",
      touchesSecrets: true,
      touchesNativeHost: true,
      mutatesExternalState: true,
      interruptiveApproval: true,
    },
    surfaces: surfaces({
      sdk: "@clawjs/claw:secrets",
      cli: "claw secrets ... --json",
      serviceApi: "claw.api.secrets",
      mcp: "blocked",
      relay: "remote.secretBrokeredOperation",
      hostBridge: "signed host secrets broker",
    }),
    inputSchemaRef: "claw.secrets.broker.v1",
    outputSchemaRef: "claw.secrets.receipt.v1",
  },
  {
    id: "mac.action.plan",
    domain: "mac",
    title: "Mac action plan",
    summary: "Plan and evaluate native Mac actions before signed-host execution.",
    operation: "action",
    executionMode: "async",
    cancelable: true,
    streamable: false,
    timeoutMs: 10_000,
    customAppAccess: "approvalRequired",
    risk: {
      tier: "high",
      touchesNativeHost: true,
      destructive: true,
      interruptiveApproval: true,
    },
    surfaces: surfaces({
      sdk: "@clawjs/claw:future mac facade",
      cli: "claw wifi/window/permissions/system mac --json",
      serviceApi: "MacControlWire",
      mcp: "Mac Control MCP tools",
      relay: "local-only unless explicitly classified",
      hostBridge: "signed host MacControlActionBroker",
    }),
    inputSchemaRef: "claw.mac.actionRequest.v1",
    outputSchemaRef: "claw.mac.actionPlan.v1",
  },
  {
    id: "iot.device.action.invoke",
    domain: "iot",
    title: "IoT device action",
    summary: "Invoke registered IoT device actions through policy, plan, and audit instead of custom app direct device control.",
    operation: "action",
    executionMode: "async",
    cancelable: true,
    streamable: true,
    timeoutMs: 30_000,
    customAppAccess: "approvalRequired",
    risk: {
      tier: "high",
      touchesPhysicalWorld: true,
      mutatesExternalState: true,
      interruptiveApproval: true,
    },
    surfaces: surfaces({
      sdk: "@clawjs/claw:iot",
      cli: "claw iot ... --json",
      serviceApi: "iot service API",
      mcp: "pending",
      relay: "local-only unless explicitly classified",
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: "claw.iot.action.v1",
    outputSchemaRef: "claw.iot.actionResult.v1",
  },
];

export function listClawCapabilities(): ClawCapabilityDescriptor[] {
  return clawCapabilityCatalog.map((capability) => ({
    ...capability,
    risk: { ...capability.risk },
    dispatch: { ...customAppDispatchForCapability(capability) },
    surfaces: capability.surfaces.map((surface) => ({ ...surface })),
  }));
}

export function getClawCapability(id: string): ClawCapabilityDescriptor | null {
  return listClawCapabilities().find((capability) => capability.id === id) ?? null;
}

export function buildCustomAppCapabilityRiskMap(capabilityIds?: readonly string[]): ClawCustomAppCapabilityRiskMap {
  const selected = capabilityIds?.length
    ? listClawCapabilities().filter((capability) => capabilityIds.includes(capability.id))
    : listClawCapabilities();
  return {
    authorityModel: "localWideReadsHighRiskApproval",
    capabilityIds: selected.map((capability) => capability.id),
    ordinaryAccess: selected.filter((capability) => capability.customAppAccess === "localWide").map((capability) => capability.id),
    approvalRequired: selected.filter((capability) => capability.customAppAccess === "approvalRequired").map((capability) => capability.id),
    blocked: selected.filter((capability) => capability.customAppAccess === "blocked").map((capability) => capability.id),
    highRisk: selected.filter((capability) => capability.risk.interruptiveApproval).map((capability) => capability.id),
  };
}

export function sdkFirstCapabilityCatalogSource(): string {
  return sdkFirstSource;
}
