import { CUSTOM_APP_REDACTION_POLICY_ID } from "./custom-app-redaction-policy.ts";

export type ClawCapabilitySurface = "sdk" | "cli" | "serviceApi" | "mcp" | "relay" | "hostBridge";
export type ClawCapabilitySurfaceStatus = "available" | "pending" | "blocked" | "notApplicable";
export type ClawCapabilityRiskTier = "low" | "medium" | "high" | "critical";
export type ClawCapabilityExecutionMode = "sync" | "async" | "stream";
export type ClawCapabilityCustomAppAccess = "localWide" | "declared" | "approvalRequired" | "blocked";

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
  surfaces: ClawCapabilitySurfaceBinding[];
  inputSchemaRef?: string;
  outputSchemaRef?: string;
  redactionPolicyRef?: string;
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
    inputSchemaRef: "claw.search.query.v1",
    outputSchemaRef: "claw.search.results.v1",
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
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
    inputSchemaRef: "claw.db.query.v1",
    outputSchemaRef: "claw.db.records.v1",
    redactionPolicyRef: CUSTOM_APP_REDACTION_POLICY_ID,
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
    inputSchemaRef: "claw.resources.read.v1",
    outputSchemaRef: "claw.resources.payload.v1",
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
