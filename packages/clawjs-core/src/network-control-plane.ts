import { z } from "zod";

export const clawNetworkControlPlaneRegistryVersion = 1;

export const networkSubjectKindSchema = z.enum([
  "app_process",
  "claw_agent",
  "provider",
  "connector",
  "gateway",
  "route",
  "automation",
]);
export const networkEndpointKindSchema = z.enum(["domain", "host", "ip", "cidr", "local_network", "dns_server", "gateway_route", "provider_endpoint"]);
export const networkRuleActionSchema = z.enum(["allow", "deny", "ask", "notify", "hide", "routeVia", "requireVpn"]);
export const networkRuleSourceSchema = z.enum(["human", "agent_suggestion", "manifest", "gateway", "adapter", "system_default"]);
export const networkRuleLifetimeSchema = z.enum(["session", "ttl", "permanent", "until_app_quit"]);
export const networkAdapterKindSchema = z.enum(["clawRuntime", "gateway", "macContentFilter", "macDnsProxy", "macEndpointSecurity", "vpn", "blocklist"]);
export const networkAdapterStatusSchema = z.enum(["ready", "planned", "external_pending", "disabled"]);
export const networkDecisionSchema = z.enum(["allow", "deny", "ask", "notify", "hide", "routeVia", "requireVpn"]);
export const networkDirectionSchema = z.enum(["outbound", "inbound", "loopback"]);
export const networkRedactionLevelSchema = z.enum(["aggregate", "process_domain_opt_in"]);

export const networkSubjectSchema = z.object({
  kind: networkSubjectKindSchema,
  id: z.string().min(1),
  displayName: z.string().min(1).optional(),
  process: z.object({
    pid: z.number().int().positive().optional(),
    executablePath: z.string().min(1).optional(),
    bundleId: z.string().min(1).optional(),
    codeSignature: z.string().min(1).optional(),
  }).optional(),
  claw: z.object({
    agentId: z.string().min(1).optional(),
    providerId: z.string().min(1).optional(),
    connectorId: z.string().min(1).optional(),
    gatewayId: z.string().min(1).optional(),
    routeId: z.string().min(1).optional(),
    assignmentId: z.string().min(1).optional(),
  }).optional(),
});

export const networkEndpointSchema = z.object({
  kind: networkEndpointKindSchema,
  value: z.string().min(1),
  port: z.number().int().positive().max(65535).optional(),
  protocol: z.enum(["tcp", "udp", "icmp", "http", "https", "unknown"]).default("unknown"),
  purpose: z.string().min(1).optional(),
});

export const networkRuleSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  action: networkRuleActionSchema,
  subject: networkSubjectSchema.partial().optional(),
  endpoint: networkEndpointSchema.partial().optional(),
  networkPolicyProfileId: z.string().min(1).default("default"),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
  lifetime: networkRuleLifetimeSchema.default("permanent"),
  expiresAt: z.string().datetime().optional(),
  routeVia: z.string().min(1).optional(),
  vpnProfileId: z.string().min(1).optional(),
  ruleSteward: z.object({
    kind: z.enum(["human", "agent", "system"]),
    id: z.string().min(1),
  }).default({ kind: "system", id: "claw.network" }),
  source: networkRuleSourceSchema.default("system_default"),
  notes: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const networkPolicyProfileSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  label: z.string().min(1),
  defaultAction: networkDecisionSchema.default("ask"),
  detailOptIn: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

export const networkAdapterSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  kind: networkAdapterKindSchema,
  label: z.string().min(1),
  status: networkAdapterStatusSchema,
  enforcement: z.enum(["observe", "enforce", "plan_only"]),
  externalPending: z.boolean().default(false),
  reason: z.string().min(1).optional(),
  reentryCondition: z.string().min(1).optional(),
});

export const networkAccessManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  subject: networkSubjectSchema,
  expectedEndpoints: z.array(networkEndpointSchema),
  purposes: z.array(z.string().min(1)),
  defaultPolicy: networkDecisionSchema.default("ask"),
  reviewRequired: z.boolean().default(true),
});

export const networkEventSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  observedAt: z.string().datetime(),
  subject: networkSubjectSchema,
  endpoint: networkEndpointSchema,
  direction: networkDirectionSchema.default("outbound"),
  adapterId: z.string().min(1),
  matchedRuleIds: z.array(z.string().min(1)).default([]),
  decision: networkDecisionSchema,
  bytesIn: z.number().int().nonnegative().default(0),
  bytesOut: z.number().int().nonnegative().default(0),
  redaction: z.object({
    level: networkRedactionLevelSchema,
    processHidden: z.boolean(),
    domainHidden: z.boolean(),
  }),
});

export const networkPolicyEvaluationSchema = z.object({
  schemaVersion: z.literal(1),
  decision: networkDecisionSchema,
  matchedRule: networkRuleSchema.optional(),
  matchedRuleIds: z.array(z.string().min(1)).default([]),
  adapterId: z.string().min(1),
  explanation: z.string().min(1),
  requiresReview: z.boolean(),
  redaction: z.object({
    level: networkRedactionLevelSchema,
    detailOptInRequired: z.boolean(),
  }),
});

export type NetworkSubject = z.infer<typeof networkSubjectSchema>;
export type NetworkEndpoint = z.infer<typeof networkEndpointSchema>;
export type NetworkRule = z.infer<typeof networkRuleSchema>;
export type NetworkPolicyProfile = z.infer<typeof networkPolicyProfileSchema>;
export type NetworkAdapter = z.infer<typeof networkAdapterSchema>;
export type NetworkAccessManifest = z.infer<typeof networkAccessManifestSchema>;
export type NetworkEvent = z.infer<typeof networkEventSchema>;
export type NetworkPolicyEvaluation = z.infer<typeof networkPolicyEvaluationSchema>;

const DEFAULT_NETWORK_POLICY: NetworkPolicyProfile = networkPolicyProfileSchema.parse({
  schemaVersion: 1,
  id: "default",
  label: "Default",
  defaultAction: "ask",
  detailOptIn: false,
  enabled: true,
});

export const NETWORK_CONTROL_ADAPTERS: NetworkAdapter[] = [
  {
    schemaVersion: 1,
    id: "network.adapter.clawRuntime",
    kind: "clawRuntime",
    label: "Claw runtime",
    status: "ready",
    enforcement: "enforce",
    externalPending: false,
    reason: "Framework-owned agents, providers and routes can consume policy locally.",
  },
  {
    schemaVersion: 1,
    id: "network.adapter.gateway",
    kind: "gateway",
    label: "Gateway routes",
    status: "ready",
    enforcement: "enforce",
    externalPending: false,
    reason: "Gateway and remote route checks can evaluate shared policy before execution.",
  },
  {
    schemaVersion: 1,
    id: "network.adapter.macContentFilter",
    kind: "macContentFilter",
    label: "macOS content filter",
    status: "external_pending",
    enforcement: "plan_only",
    externalPending: true,
    reason: "Requires Network Extension entitlement and signed-host validation.",
    reentryCondition: "Entitlement, approved fixture, signed host receipt, and before/after evidence.",
  },
  {
    schemaVersion: 1,
    id: "network.adapter.macDnsProxy",
    kind: "macDnsProxy",
    label: "macOS DNS proxy",
    status: "external_pending",
    enforcement: "plan_only",
    externalPending: true,
    reason: "Requires DNS proxy entitlement and native validation.",
    reentryCondition: "Signed host, DNS proxy permission, fixture, rollback plan, and evidence.",
  },
  {
    schemaVersion: 1,
    id: "network.adapter.macEndpointSecurity",
    kind: "macEndpointSecurity",
    label: "macOS endpoint security",
    status: "external_pending",
    enforcement: "plan_only",
    externalPending: true,
    reason: "Requires endpoint security entitlement and explicit native validation.",
    reentryCondition: "Entitlement, host permission, non-destructive fixture, and audit receipt.",
  },
  {
    schemaVersion: 1,
    id: "network.adapter.vpn",
    kind: "vpn",
    label: "VPN routing",
    status: "planned",
    enforcement: "plan_only",
    externalPending: true,
    reason: "VPN route application needs host-specific adapter validation.",
    reentryCondition: "Approved VPN configuration fixture and continuity-breaker validation.",
  },
  {
    schemaVersion: 1,
    id: "network.adapter.blocklist",
    kind: "blocklist",
    label: "Blocklists",
    status: "planned",
    enforcement: "observe",
    externalPending: false,
    reason: "Local opt-in blocklists can share the policy model; remote subscriptions need a later trust policy.",
  },
].map((adapter) => networkAdapterSchema.parse(adapter));

export const NETWORK_CONTROL_DEFAULT_RULES: NetworkRule[] = [
  networkRuleSchema.parse({
    schemaVersion: 1,
    id: "network.rule.claw-gateway-known-routes",
    action: "allow",
    subject: { kind: "gateway" },
    endpoint: { kind: "gateway_route" },
    networkPolicyProfileId: "default",
    priority: 100,
    enabled: true,
    lifetime: "permanent",
    ruleSteward: { kind: "system", id: "claw.network" },
    source: "system_default",
    notes: "Allow declared Claw Gateway routes while preserving audit and redaction.",
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
  }),
  networkRuleSchema.parse({
    schemaVersion: 1,
    id: "network.rule.provider-unknown-endpoint-review",
    action: "ask",
    subject: { kind: "provider" },
    networkPolicyProfileId: "default",
    priority: 10,
    enabled: true,
    lifetime: "permanent",
    ruleSteward: { kind: "system", id: "claw.network" },
    source: "system_default",
    notes: "Providers without an explicit manifest require review before broad network access.",
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
  }),
];

export const NETWORK_CONTROL_ACCESS_MANIFESTS: NetworkAccessManifest[] = [
  networkAccessManifestSchema.parse({
    schemaVersion: 1,
    id: "network.manifest.gateway",
    subject: { kind: "gateway", id: "gateway.*", displayName: "Gateway routes" },
    expectedEndpoints: [{ kind: "gateway_route", value: "remote.*", protocol: "unknown" }],
    purposes: ["remote route transport", "agent service evaluation", "audited secret leases"],
    defaultPolicy: "allow",
    reviewRequired: false,
  }),
  networkAccessManifestSchema.parse({
    schemaVersion: 1,
    id: "network.manifest.provider",
    subject: { kind: "provider", id: "provider.*", displayName: "Provider runtime" },
    expectedEndpoints: [{ kind: "provider_endpoint", value: "declared-provider-endpoints", protocol: "https" }],
    purposes: ["provider API access after account and network grants"],
    defaultPolicy: "ask",
    reviewRequired: true,
  }),
];

export const clawNetworkControlPlaneRegistry = {
  version: clawNetworkControlPlaneRegistryVersion,
  defaultPrivacy: {
    redactionLevel: "aggregate" as const,
    detailOptInRequired: true,
    packetPayloadInspection: false,
    tlsDecryption: false,
  },
  authority: {
    agentRuleApplication: "suggest_only" as const,
    humanOrExplicitGrantApplies: true,
  },
  networkPolicyProfiles: [DEFAULT_NETWORK_POLICY],
  adapters: NETWORK_CONTROL_ADAPTERS,
  manifests: NETWORK_CONTROL_ACCESS_MANIFESTS,
  defaultRules: NETWORK_CONTROL_DEFAULT_RULES,
};

export function listNetworkAdapters(): NetworkAdapter[] {
  return [...NETWORK_CONTROL_ADAPTERS];
}

export function listNetworkPolicyProfiles(): NetworkPolicyProfile[] {
  return [DEFAULT_NETWORK_POLICY];
}

export function listNetworkAccessManifests(): NetworkAccessManifest[] {
  return [...NETWORK_CONTROL_ACCESS_MANIFESTS];
}

export function listNetworkDefaultRules(): NetworkRule[] {
  return [...NETWORK_CONTROL_DEFAULT_RULES];
}

function fieldMatches(expected: unknown, actual: unknown): boolean {
  if (expected === undefined || expected === null || expected === "") return true;
  if (typeof expected !== "string") return expected === actual;
  if (expected.endsWith(".*") && typeof actual === "string") return actual.startsWith(expected.slice(0, -1));
  return expected === actual;
}

function subjectMatches(rule: NetworkRule, subject: NetworkSubject): boolean {
  if (!rule.subject) return true;
  if (!fieldMatches(rule.subject.kind, subject.kind)) return false;
  if (!fieldMatches(rule.subject.id, subject.id)) return false;
  if (!fieldMatches(rule.subject.displayName, subject.displayName)) return false;
  const ruleClaw = rule.subject.claw;
  if (ruleClaw) {
    const actual = subject.claw ?? {};
    for (const [key, value] of Object.entries(ruleClaw)) {
      if (!fieldMatches(value, actual[key as keyof typeof actual])) return false;
    }
  }
  return true;
}

function endpointMatches(rule: NetworkRule, endpoint: NetworkEndpoint): boolean {
  if (!rule.endpoint) return true;
  if (!fieldMatches(rule.endpoint.kind, endpoint.kind)) return false;
  if (!fieldMatches(rule.endpoint.value, endpoint.value)) return false;
  if (!fieldMatches(rule.endpoint.port, endpoint.port)) return false;
  if (!fieldMatches(rule.endpoint.protocol, endpoint.protocol)) return false;
  return true;
}

function isRuleActive(rule: NetworkRule, now: string): boolean {
  if (!rule.enabled) return false;
  if (rule.expiresAt && Date.parse(rule.expiresAt) <= Date.parse(now)) return false;
  return true;
}

export function evaluateNetworkPolicy(input: {
  subject: NetworkSubject;
  endpoint: NetworkEndpoint;
  rules?: readonly NetworkRule[];
  networkPolicyProfile?: NetworkPolicyProfile;
  adapterId?: string;
  now?: string;
}): NetworkPolicyEvaluation {
  const now = input.now ?? new Date().toISOString();
  const networkPolicy = input.networkPolicyProfile ?? DEFAULT_NETWORK_POLICY;
  const rules = [...(input.rules ?? NETWORK_CONTROL_DEFAULT_RULES)]
    .filter((rule) => rule.networkPolicyProfileId === networkPolicy.id && isRuleActive(rule, now))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const matchedRule = rules.find((rule) => subjectMatches(rule, input.subject) && endpointMatches(rule, input.endpoint));
  const decision = matchedRule?.action ?? networkPolicy.defaultAction;
  return networkPolicyEvaluationSchema.parse({
    schemaVersion: 1,
    decision,
    matchedRule,
    matchedRuleIds: matchedRule ? [matchedRule.id] : [],
    adapterId: input.adapterId ?? "network.adapter.clawRuntime",
    explanation: matchedRule
      ? `Matched ${matchedRule.id}: ${matchedRule.action}.`
      : `No matching rule; network policy ${networkPolicy.id} default is ${networkPolicy.defaultAction}.`,
    requiresReview: decision === "ask",
    redaction: {
      level: networkPolicy.detailOptIn ? "process_domain_opt_in" : "aggregate",
      detailOptInRequired: !networkPolicy.detailOptIn,
    },
  });
}

export function createNetworkEvent(input: {
  id: string;
  observedAt?: string;
  subject: NetworkSubject;
  endpoint: NetworkEndpoint;
  direction?: NetworkEvent["direction"];
  adapterId?: string;
  evaluation?: NetworkPolicyEvaluation;
  bytesIn?: number;
  bytesOut?: number;
  detailOptIn?: boolean;
}): NetworkEvent {
  const evaluation = input.evaluation ?? evaluateNetworkPolicy({
    subject: input.subject,
    endpoint: input.endpoint,
    adapterId: input.adapterId,
    networkPolicyProfile: input.detailOptIn ? { ...DEFAULT_NETWORK_POLICY, detailOptIn: true } : DEFAULT_NETWORK_POLICY,
  });
  return networkEventSchema.parse({
    schemaVersion: 1,
    id: input.id,
    observedAt: input.observedAt ?? new Date().toISOString(),
    subject: input.subject,
    endpoint: input.endpoint,
    direction: input.direction ?? "outbound",
    adapterId: input.adapterId ?? evaluation.adapterId,
    matchedRuleIds: evaluation.matchedRuleIds,
    decision: evaluation.decision,
    bytesIn: input.bytesIn ?? 0,
    bytesOut: input.bytesOut ?? 0,
    redaction: {
      level: input.detailOptIn ? "process_domain_opt_in" : "aggregate",
      processHidden: !input.detailOptIn,
      domainHidden: !input.detailOptIn,
    },
  });
}

export function redactNetworkEvent(event: NetworkEvent, detailOptIn = false): NetworkEvent {
  if (detailOptIn) {
    return networkEventSchema.parse({
      ...event,
      redaction: { level: "process_domain_opt_in", processHidden: false, domainHidden: false },
    });
  }
  return networkEventSchema.parse({
    ...event,
    subject: {
      ...event.subject,
      displayName: event.subject.kind,
      process: undefined,
    },
    endpoint: {
      ...event.endpoint,
      value: event.endpoint.kind,
      purpose: event.endpoint.purpose,
    },
    redaction: { level: "aggregate", processHidden: true, domainHidden: true },
  });
}

export function createNetworkRuleSuggestion(input: {
  event: NetworkEvent;
  action?: NetworkRule["action"];
  ruleStewardAgentId?: string;
  now?: string;
}): NetworkRule {
  const now = input.now ?? new Date().toISOString();
  const action = input.action ?? (input.event.decision === "ask" ? "allow" : input.event.decision);
  return networkRuleSchema.parse({
    schemaVersion: 1,
    id: `network.rule.suggested.${input.event.id.replace(/[^a-zA-Z0-9._-]+/g, "_")}`,
    action,
    subject: {
      kind: input.event.subject.kind,
      id: input.event.subject.id,
      claw: input.event.subject.claw,
    },
    endpoint: {
      kind: input.event.endpoint.kind,
      value: input.event.endpoint.value,
      port: input.event.endpoint.port,
      protocol: input.event.endpoint.protocol,
    },
    networkPolicyProfileId: "default",
    priority: 50,
    enabled: false,
    lifetime: "permanent",
    ruleSteward: { kind: "agent", id: input.ruleStewardAgentId ?? "agent.network-review" },
    source: "agent_suggestion",
    notes: "Suggestion only; human or explicit grant must apply it.",
    createdAt: now,
    updatedAt: now,
  });
}

export function evaluateGatewayNetworkAccess(input: {
  routeId: string;
  agentId?: string;
  endpoint?: string;
  rules?: readonly NetworkRule[];
  now?: string;
}): NetworkPolicyEvaluation {
  return evaluateNetworkPolicy({
    now: input.now,
    rules: input.rules,
    adapterId: "network.adapter.gateway",
    subject: {
      kind: "gateway",
      id: input.agentId ? `gateway.${input.agentId}` : "gateway",
      claw: {
        agentId: input.agentId,
        gatewayId: "gateway",
        routeId: input.routeId,
      },
    },
    endpoint: {
      kind: "gateway_route",
      value: input.endpoint ?? input.routeId,
      protocol: "unknown",
    },
  });
}
