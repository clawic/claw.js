import { CUSTOM_APP_REDACTION_POLICY_ID } from "./custom-app-redaction-policy.ts";
import { CUSTOM_APP_SDK_SCHEMA_REFS } from "./custom-app-sdk-contracts.ts";

export type ClawCapabilitySurface = "sdk" | "cli" | "serviceApi" | "mcp" | "relay" | "hostBridge";
export type ClawCapabilitySurfaceStatus = "available" | "blocked" | "notApplicable";
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
  | "unclassifiedBlocked";

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
const customAppSDKMCPMetadataProjection = "clawjs.custom_app_sdk metadata-only contract projection";
const customAppSDKRelayMetadataProjection = "relay.remote.custom_app_sdk metadata-only contract projection";

function surfaces(input: Record<ClawCapabilitySurface, string | ClawCapabilitySurfaceStatus>): ClawCapabilitySurfaceBinding[] {
  return (["sdk", "cli", "serviceApi", "mcp", "relay", "hostBridge"] as const).map((surface) => {
    const value = input[surface];
    if (value === undefined) throw new Error(`Missing capability surface binding: ${surface}`);
    if (value === "pending") throw new Error(`Pending capability surface binding is not allowed: ${surface}`);
    if (value === "available") throw new Error(`Available capability surface binding requires a ref: ${surface}`);
    if (value === "blocked" || value === "notApplicable") {
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
    case "system.telemetry.control.plan":
    case "mac.action.plan":
      return {
        status: "available",
        mode: "approvalRequiredPlanOnly",
        approvalRequired: true,
        runner: capability.id === "system.telemetry.control.plan" ? "signedHostSystemTelemetryControlPlan" : "signedHostMacActionPlan",
        reason:
          capability.id === "system.telemetry.control.plan"
            ? "Returns a fail-closed system telemetry control plan; signed-host execution remains separate and external-pending until exact approval and receipt evidence exist."
            : "Returns a dry-run Mac Control plan after approval; signed-host execution remains a separate boundary.",
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
    case "jobs.start":
    case "jobs.cancel":
      return {
        status: "available",
        mode: "approvalRequiredDispatch",
        approvalRequired: true,
        runner: "runtimeJobsApi",
        reason: "Dispatches through the runtime jobs API after host approval and audit.",
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
        status: "unavailable",
        mode: capability.customAppAccess === "blocked" ? "blocked" : "unclassifiedBlocked",
        approvalRequired: capability.risk.interruptiveApproval,
        runner: "pending",
        reason:
          capability.customAppAccess === "blocked"
            ? "This custom-app capability is an explicit blocked gap until a safe backend contract and host adapter exist."
            : "This custom-app capability has not been classified for custom-app dispatch and is blocked until it has an explicit contract, policy, runner, and tests.",
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
      sdk: "@clawjs/claw:capabilities metadata + claw.search.query.v1 schema",
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
      sdk: "@clawjs/claw:capabilities metadata + claw.db.query.v1 schema",
      cli: "claw db <collection> query --json",
      serviceApi: "@clawjs/database",
      mcp: customAppSDKMCPMetadataProjection,
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
      relay: customAppSDKRelayMetadataProjection,
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
      relay: customAppSDKRelayMetadataProjection,
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
    id: "nodes.inventory",
    domain: "nodes",
    title: "Node inventory",
    summary: "Read node identities, fingerprints, observed locators, trust status, and bounded operational summaries without granting transport authority.",
    operation: "read",
    executionMode: "async",
    cancelable: true,
    streamable: false,
    timeoutMs: 2_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:nodes.inventory",
      cli: "claw get nodes --json",
      serviceApi: "claw.api.nodes",
      mcp: customAppSDKMCPMetadataProjection,
      relay: "remote.routeContracts nodes metadata projection",
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.nodesInventoryRequest,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.nodesInventory,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "resources.location",
    domain: "resources",
    title: "Resource location",
    summary: "Read resource location, authority, and risk projections through registered inventories instead of filesystem or database bypasses.",
    operation: "read",
    executionMode: "async",
    cancelable: true,
    streamable: false,
    timeoutMs: 2_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:resources.location",
      cli: "claw get|describe|where|risk --json",
      serviceApi: "claw.api.resources.location",
      mcp: customAppSDKMCPMetadataProjection,
      relay: customAppSDKRelayMetadataProjection,
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.resourcesLocationRequest,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.resourcesLocation,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "localForge.inventory",
    domain: "local_forge",
    title: "Local forge inventory",
    summary: "Read local forge worktrees, claims, snapshots, reviews, merge plans, recovery receipts, and stale-claim evaluations from the configured data root.",
    operation: "read",
    executionMode: "async",
    cancelable: true,
    streamable: false,
    timeoutMs: 2_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:localForge.inventory",
      cli: "claw project forge-status --json",
      serviceApi: "claw.api.localForge.inventory",
      mcp: customAppSDKMCPMetadataProjection,
      relay: customAppSDKRelayMetadataProjection,
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.localForgeInventoryRequest,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.localForgeInventory,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "cluster.controlPlane.inspect",
    domain: "cluster",
    title: "Cluster control plane inspect",
    summary: "Read coordinator, standby, policy snapshot, logical service, storage policy, and export/restore preview receipts without physical promotion.",
    operation: "read",
    executionMode: "async",
    cancelable: true,
    streamable: false,
    timeoutMs: 2_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:cluster.controlPlane.inspect",
      cli: "claw describe node|resource --json",
      serviceApi: "claw.api.cluster.controlPlane",
      mcp: customAppSDKMCPMetadataProjection,
      relay: "remote.routeContracts cluster metadata projection",
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.clusterControlPlaneInspectRequest,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.clusterControlPlaneInspect,
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
      relay: customAppSDKRelayMetadataProjection,
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
      relay: customAppSDKRelayMetadataProjection,
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
    id: "system.telemetry.metrics",
    domain: "system",
    title: "System telemetry metrics",
    summary: "Read the system telemetry metric catalog, privacy tiers, support modes, grants, and availability metadata.",
    operation: "read",
    executionMode: "sync",
    cancelable: false,
    streamable: false,
    timeoutMs: 1_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:system.telemetry.metrics",
      cli: "claw system metrics list --json",
      serviceApi: "claw.api.system.metrics",
      mcp: "system.metrics",
      relay: customAppSDKRelayMetadataProjection,
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryMetricsRequest,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryMetrics,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "system.telemetry.widgets",
    domain: "system",
    title: "System telemetry widgets",
    summary: "Read portable system/context widget definitions for menu bar, combined panel, and chart-capable render modes.",
    operation: "read",
    executionMode: "sync",
    cancelable: false,
    streamable: false,
    timeoutMs: 1_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:system.telemetry.widgets",
      cli: "claw system widgets list --json",
      serviceApi: "claw.api.system.widgets",
      mcp: "system.widgets",
      relay: customAppSDKRelayMetadataProjection,
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryWidgetsRequest,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryWidgets,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "system.telemetry.providers",
    domain: "system",
    title: "System telemetry providers",
    summary: "Read mock, offline, live, host, and context provider slots without connecting to external services or exposing credentials.",
    operation: "read",
    executionMode: "sync",
    cancelable: false,
    streamable: false,
    timeoutMs: 1_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:system.telemetry.providers",
      cli: "claw system providers list --json",
      serviceApi: "claw.api.system.providers",
      mcp: "system.providers",
      relay: customAppSDKRelayMetadataProjection,
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryProvidersRequest,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryProviders,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "system.telemetry.control.plan",
    domain: "system",
    title: "System telemetry control plan",
    summary: "Plan system telemetry control actions through the signed-host broker without executing hardware or OS mutations.",
    operation: "action",
    executionMode: "async",
    cancelable: true,
    streamable: false,
    timeoutMs: 10_000,
    customAppAccess: "approvalRequired",
    risk: {
      tier: "high",
      touchesNativeHost: true,
      touchesPhysicalWorld: true,
      destructive: true,
      interruptiveApproval: true,
    },
    surfaces: surfaces({
      sdk: "@clawjs/claw:system.telemetry.control.plan",
      cli: "claw system controls plan <control-id> --json",
      serviceApi: "claw.api.system.controls.plan",
      mcp: "system.controls.plan",
      relay: customAppSDKRelayMetadataProjection,
      hostBridge: "signed host system telemetry control broker",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryControlPlanRequest,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryControlPlan,
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
      mcp: customAppSDKMCPMetadataProjection,
      relay: customAppSDKRelayMetadataProjection,
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
      mcp: customAppSDKMCPMetadataProjection,
      relay: customAppSDKRelayMetadataProjection,
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
      mcp: customAppSDKMCPMetadataProjection,
      relay: customAppSDKRelayMetadataProjection,
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
    summary: "Read runtime job events through the SDK/host bridge stream contract without starting or cancelling work.",
    operation: "read",
    executionMode: "stream",
    cancelable: true,
    streamable: true,
    timeoutMs: 30_000,
    customAppAccess: "localWide",
    risk: lowReadRisk,
    surfaces: surfaces({
      sdk: "@clawjs/claw:jobs.stream",
      cli: "blocked",
      serviceApi: "claw.api.runtime.jobs",
      mcp: customAppSDKMCPMetadataProjection,
      relay: customAppSDKRelayMetadataProjection,
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.jobsStream,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.jobsStreamResult,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
    eventSchemaRefs: {
      cancel: CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel,
      progress: CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress,
      partial: CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial,
    },
  },
  {
    id: "jobs.start",
    domain: "jobs",
    title: "Jobs start",
    summary: "Start an allowlisted runtime job through host approval, audit, and the runtime jobs API.",
    operation: "action",
    executionMode: "async",
    cancelable: true,
    streamable: true,
    timeoutMs: 30_000,
    customAppAccess: "approvalRequired",
    risk: {
      tier: "high",
      writesUserData: true,
      costBearing: true,
      interruptiveApproval: true,
    },
    surfaces: surfaces({
      sdk: "@clawjs/claw:jobs.start",
      cli: "blocked",
      serviceApi: "claw.api.runtime.jobs",
      mcp: customAppSDKMCPMetadataProjection,
      relay: customAppSDKRelayMetadataProjection,
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.jobsStart,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.jobsStartResult,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
  },
  {
    id: "jobs.cancel",
    domain: "jobs",
    title: "Jobs cancel",
    summary: "Cancel a runtime job through host approval, audit, and the runtime jobs API.",
    operation: "action",
    executionMode: "async",
    cancelable: true,
    streamable: true,
    timeoutMs: 30_000,
    customAppAccess: "approvalRequired",
    risk: {
      tier: "high",
      writesUserData: true,
      destructive: true,
      interruptiveApproval: true,
    },
    surfaces: surfaces({
      sdk: "@clawjs/claw:jobs.cancel",
      cli: "blocked",
      serviceApi: "claw.api.runtime.jobs",
      mcp: customAppSDKMCPMetadataProjection,
      relay: customAppSDKRelayMetadataProjection,
      hostBridge: "clawix.bridge.local",
    }),
    inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.jobsCancel,
    outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.jobsCancelResult,
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
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
      sdk: "@clawjs/claw:capabilities metadata + claw.actions.invoke.v1 schema",
      cli: "brokered claw <domain> <action> --json",
      serviceApi: "connector/control-plane + domain APIs",
      mcp: customAppSDKMCPMetadataProjection,
      relay: customAppSDKRelayMetadataProjection,
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
      sdk: "@clawjs/claw:capabilities metadata + claw.mac.actionRequest.v1 schema",
      cli: "claw wifi/window/permissions/system mac --json",
      serviceApi: "MacControlWire",
      mcp: "Mac Control MCP tools",
      relay: customAppSDKRelayMetadataProjection,
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
      mcp: customAppSDKMCPMetadataProjection,
      relay: customAppSDKRelayMetadataProjection,
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
