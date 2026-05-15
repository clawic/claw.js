export type NeedRouteMaturityState =
  | "idea"
  | "observed_gap"
  | "candidate"
  | "accepted"
  | "planned"
  | "active"
  | "validating"
  | "shipped"
  | "parked"
  | "rejected";

export type NeedOpportunityKind =
  | "feature"
  | "subfeature"
  | "bug"
  | "refactor"
  | "test"
  | "docs"
  | "data"
  | "surface"
  | "validation"
  | "security"
  | "perf"
  | "research";

export type NeedOpportunityRelationKind =
  | "depends_on"
  | "duplicates"
  | "blocks"
  | "extends"
  | "validates"
  | "documents";

export type NeedScenarioGenerationMode = "deterministic" | "llm_lateral_dry_run";

export interface NeedDimensionValue {
  id: string;
  label: string;
  notes: string;
}

export interface NeedDimension {
  id: string;
  label: string;
  purpose: string;
  values: NeedDimensionValue[];
}

export interface NeedRoute {
  schemaVersion: 1;
  id: string;
  title: string;
  pilotPackId: string;
  dimensions: Record<string, string>;
  humanNeed: string;
  expectedOutcome: string;
  acceptanceSignals: string[];
  validationMode: "dry_run" | "fixture" | "host_required" | "external_pending";
}

export interface NeedOpportunityScore {
  severity: number;
  humanScope: number;
  frequency: number;
  routeBlocker: number;
  constitutionalRisk: number;
  effort: number;
  reuseLeverage: number;
  confidence: number;
  total: number;
}

export interface NeedCapabilityNode {
  id: string;
  label: string;
  surface: "framework" | "cli" | "storage" | "ui" | "validation" | "governance" | "skills";
}

export interface NeedCapabilityEdge {
  from: string;
  to: string;
  relation: "feeds" | "stores" | "evaluates" | "promotes" | "documents" | "validates";
}

export interface NeedCapabilityGraph {
  schemaVersion: 1;
  nodes: NeedCapabilityNode[];
  edges: NeedCapabilityEdge[];
}

export interface NeedOpportunityRelation {
  kind: NeedOpportunityRelationKind;
  targetId: string;
  reason: string;
}

export interface NeedOpportunity {
  schemaVersion: 1;
  id: string;
  title: string;
  kind: NeedOpportunityKind;
  state: NeedRouteMaturityState;
  routeId: string;
  pilotPackId: string;
  summary: string;
  evidence: string[];
  affectedSurfaces: string[];
  source: "deterministic_route_eval" | "known_discovery_gap";
  externalPending: boolean;
  score: NeedOpportunityScore;
  relations: NeedOpportunityRelation[];
  fingerprint: string;
}

export interface RoutePilotPack {
  id: string;
  title: string;
  scope: string;
  routeSeeds: Array<Omit<NeedRoute, "schemaVersion" | "pilotPackId">>;
}

export interface NeedRouteEvaluation {
  schemaVersion: 1;
  route: NeedRoute;
  opportunities: NeedOpportunity[];
  capabilityGraph: NeedCapabilityGraph;
  summary: {
    opportunityCount: number;
    externalPendingCount: number;
    topOpportunityIds: string[];
  };
}

export interface NeedRouteGenerationPlan {
  schemaVersion: 1;
  mode: NeedScenarioGenerationMode;
  routes: NeedRoute[];
  lateralExpansion: {
    status: "not_requested" | "dry_run_only";
    reason: string;
    normalizedInputs: string[];
    blockedRealActions: string[];
  };
}

export interface NeedOpportunityDedupeResult {
  schemaVersion: 1;
  unique: NeedOpportunity[];
  duplicates: Array<{
    fingerprint: string;
    canonicalId: string;
    duplicateIds: string[];
  }>;
}

export const NEED_ROUTE_MATURITY_STATES: NeedRouteMaturityState[] = [
  "idea",
  "observed_gap",
  "candidate",
  "accepted",
  "planned",
  "active",
  "validating",
  "shipped",
  "parked",
  "rejected",
];

export const NEED_OPPORTUNITY_KINDS: NeedOpportunityKind[] = [
  "feature",
  "subfeature",
  "bug",
  "refactor",
  "test",
  "docs",
  "data",
  "surface",
  "validation",
  "security",
  "perf",
  "research",
];

export const NEED_SCENARIO_GENERATION_MODES: NeedScenarioGenerationMode[] = [
  "deterministic",
  "llm_lateral_dry_run",
];

export const NEED_ROUTE_CAPABILITY_GRAPH: NeedCapabilityGraph = {
  schemaVersion: 1,
  nodes: [
    { id: "need.dimensions", label: "Composable dimensions", surface: "framework" },
    { id: "need.routes", label: "Generated routes", surface: "framework" },
    { id: "need.evaluation", label: "Dry-run route evaluation", surface: "validation" },
    { id: "need.opportunities", label: "Scored opportunities", surface: "governance" },
    { id: "need.ledger", label: "Local opportunity ledger", surface: "storage" },
    { id: "need.cli", label: "claw needs CLI", surface: "cli" },
    { id: "need.skills", label: "Role skill pack", surface: "skills" },
    { id: "need.report_bridge", label: "Report promotion packet", surface: "governance" },
    { id: "need.ui_contract", label: "UI/surface contract gaps", surface: "ui" },
  ],
  edges: [
    { from: "need.dimensions", to: "need.routes", relation: "feeds" },
    { from: "need.routes", to: "need.evaluation", relation: "evaluates" },
    { from: "need.evaluation", to: "need.opportunities", relation: "feeds" },
    { from: "need.opportunities", to: "need.ledger", relation: "stores" },
    { from: "need.cli", to: "need.ledger", relation: "stores" },
    { from: "need.skills", to: "need.opportunities", relation: "documents" },
    { from: "need.opportunities", to: "need.report_bridge", relation: "promotes" },
    { from: "need.evaluation", to: "need.ui_contract", relation: "validates" },
  ],
};

export const NEED_ROUTE_DIMENSIONS: NeedDimension[] = [
  {
    id: "human_intent",
    label: "Human intent",
    purpose: "Captures what the person actually wants to accomplish, independent of implementation.",
    values: [
      { id: "create_app", label: "Create app", notes: "Build a usable digital product or internal tool." },
      { id: "operate_workflow", label: "Operate workflow", notes: "Run or improve an ongoing personal or business workflow." },
      { id: "control_environment", label: "Control environment", notes: "Observe or control devices, spaces, or physical integrations." },
      { id: "discover_gaps", label: "Discover gaps", notes: "Stress the framework to find missing capabilities." },
    ],
  },
  {
    id: "autonomy_preference",
    label: "Autonomy preference",
    purpose: "Models whether the human wants iterative clarification or agentic execution with minimal interruption.",
    values: [
      { id: "iterative_questions", label: "Iterative questions", notes: "Agent asks before narrowing product shape or constraints." },
      { id: "autonomous_no_questions", label: "Autonomous no questions", notes: "Agent proceeds from intent and records assumptions." },
      { id: "approval_gated", label: "Approval gated", notes: "Agent works independently but asks before risky transitions." },
    ],
  },
  {
    id: "domain",
    label: "Domain",
    purpose: "Keeps scenarios generic while still mapping to recognizable need families.",
    values: [
      { id: "agent_work", label: "Agent work", notes: "Chat, tasks, files, sessions, goals, and decisions." },
      { id: "app_delivery", label: "App delivery", notes: "Design, code, database, deploy, preview, and demos." },
      { id: "infra_remote", label: "Infra remote", notes: "Remote servers, domains, monitoring, and access." },
      { id: "iot_home", label: "IoT home", notes: "Devices, permissions, local network, and controls." },
    ],
  },
  {
    id: "target_surface",
    label: "Target surface",
    purpose: "Separates framework, CLI, host, UI, and external client expectations.",
    values: [
      { id: "framework_cli", label: "Framework CLI", notes: "Claw command surface and machine-readable JSON." },
      { id: "clawix_ui", label: "Clawix UI", notes: "Human application surfaces consuming framework capabilities." },
      { id: "ios_demo", label: "iOS demo", notes: "Simulator or device demo with visible deployment state." },
      { id: "remote_client", label: "Remote client", notes: "Browser or client accessing a local/remote bridge." },
    ],
  },
  {
    id: "agent_topology",
    label: "Agent topology",
    purpose: "Describes whether one agent, several roles, or a network needs to coordinate.",
    values: [
      { id: "single_agent", label: "Single agent", notes: "One agent owns discovery and implementation." },
      { id: "role_pack", label: "Role pack", notes: "Generator, auditor, triager, and publisher roles cooperate." },
      { id: "agent_network", label: "Agent network", notes: "Multiple agents exchange findings, handoffs, and evidence." },
    ],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    purpose: "Captures deployment and runtime constraints without binding to one provider.",
    values: [
      { id: "local_only", label: "Local only", notes: "Everything stays on the local machine or workspace." },
      { id: "remote_vps", label: "Remote VPS", notes: "A small number of remote hosts carry multiple services." },
      { id: "signed_host", label: "Signed host", notes: "Native signed host brokers sensitive operations." },
      { id: "physical_device", label: "Physical device", notes: "Hardware or local network integration is required." },
    ],
  },
  {
    id: "data_state",
    label: "Data state",
    purpose: "Models whether the scenario starts empty, from fixtures, or from an existing workspace.",
    values: [
      { id: "empty", label: "Empty", notes: "No existing records are assumed." },
      { id: "fixtures", label: "Fixtures", notes: "The scenario runs against deterministic test data." },
      { id: "existing_workspace", label: "Existing workspace", notes: "The route must dedupe and inspect what already exists." },
    ],
  },
  {
    id: "permission_risk",
    label: "Permission risk",
    purpose: "Forces routes to declare whether work is safe, approval-gated, host-owned, or externally risky.",
    values: [
      { id: "safe_local", label: "Safe local", notes: "Read/write local project state only." },
      { id: "approval_required", label: "Approval required", notes: "Human must approve promotion or mutation." },
      { id: "host_brokered", label: "Host brokered", notes: "Signed host must request permissions." },
      { id: "external_cost_or_data", label: "External cost or data", notes: "External services, cost, or production data are involved." },
    ],
  },
  {
    id: "deliverable",
    label: "Deliverable",
    purpose: "Defines the concrete output expected from the route.",
    values: [
      { id: "gap_report", label: "Gap report", notes: "Structured gap/opportunity list with evidence and dedupe." },
      { id: "working_feature", label: "Working feature", notes: "Implemented capability with tests and docs." },
      { id: "demo_surface", label: "Demo surface", notes: "Visible UI/client demo with status evidence." },
      { id: "promotion_packet", label: "Promotion packet", notes: "Ready-to-review backlog/report payload." },
    ],
  },
  {
    id: "validation_mode",
    label: "Validation mode",
    purpose: "Keeps route execution safe and explicit.",
    values: [
      { id: "dry_run", label: "Dry-run", notes: "No real services, permissions, or data mutations." },
      { id: "fixtures", label: "Fixtures", notes: "Hermetic fixtures and mocked integrations." },
      { id: "host_required", label: "Host required", notes: "Needs signed host validation before completion." },
      { id: "external_pending", label: "External pending", notes: "Physical/external integration cannot be completed locally." },
    ],
  },
];

export const NEED_ROUTE_PILOT_PACKS: RoutePilotPack[] = [
  {
    id: "agent_workflow",
    title: "Agent workflow",
    scope: "Chat, tasks, files, sessions, decisions, and repeated agent work.",
    routeSeeds: [{
      id: "route_agent_spotlight_tasks",
      title: "Agent command center for tasks and context",
      dimensions: {
        human_intent: "operate_workflow",
        autonomy_preference: "iterative_questions",
        domain: "agent_work",
        target_surface: "clawix_ui",
        agent_topology: "single_agent",
        infrastructure: "local_only",
        data_state: "existing_workspace",
        permission_risk: "safe_local",
        deliverable: "gap_report",
        validation_mode: "dry_run",
      },
      humanNeed: "A person wants a fast agent surface that filters tasks, files, sessions, and next actions without losing context.",
      expectedOutcome: "The framework can describe the route, identify UI/data gaps, and record opportunities without touching private data.",
      acceptanceSignals: ["CLI JSON route is stable", "dedupe finds repeated task/context gaps", "UI expectations are represented as surface gaps"],
      validationMode: "dry_run",
    }],
  },
  {
    id: "app_building_deploy",
    title: "App building and deploy",
    scope: "Human asks for an app, database, demo, and deployment evidence.",
    routeSeeds: [{
      id: "route_ios_demo_database_deploy_receipt",
      title: "iOS demo with database and deployment receipt",
      dimensions: {
        human_intent: "create_app",
        autonomy_preference: "autonomous_no_questions",
        domain: "app_delivery",
        target_surface: "ios_demo",
        agent_topology: "role_pack",
        infrastructure: "signed_host",
        data_state: "fixtures",
        permission_risk: "approval_required",
        deliverable: "demo_surface",
        validation_mode: "fixtures",
      },
      humanNeed: "A person wants the agent to create an app demo and show database/deploy status without extra product questions.",
      expectedOutcome: "The framework records assumptions, required receipts, validation status, and approval gates before any real deploy.",
      acceptanceSignals: ["assumptions are explicit", "database/deploy receipt requirements are modeled", "promotion remains approval-gated"],
      validationMode: "fixture",
    }],
  },
  {
    id: "infra_remote",
    title: "Remote infrastructure",
    scope: "Small remote host topology, bridge access, monitoring, and safe deploy planning.",
    routeSeeds: [{
      id: "route_two_remote_hosts_bridge_monitor",
      title: "Two-host remote bridge and monitor plan",
      dimensions: {
        human_intent: "operate_workflow",
        autonomy_preference: "approval_gated",
        domain: "infra_remote",
        target_surface: "remote_client",
        agent_topology: "role_pack",
        infrastructure: "remote_vps",
        data_state: "fixtures",
        permission_risk: "external_cost_or_data",
        deliverable: "promotion_packet",
        validation_mode: "dry_run",
      },
      humanNeed: "A person wants a bounded remote setup where a small number of hosts run everything and remain inspectable.",
      expectedOutcome: "The route produces a safe deploy plan, monitoring requirements, and external pending markers for provider access.",
      acceptanceSignals: ["host limits are captured", "monitoring is separate from ops", "external provider execution is blocked"],
      validationMode: "dry_run",
    }],
  },
  {
    id: "iot_home",
    title: "IoT and home",
    scope: "Detecting and controlling a new physical device through host-brokered permissions.",
    routeSeeds: [{
      id: "route_new_light_control_surface",
      title: "New controllable light with local UI",
      dimensions: {
        human_intent: "control_environment",
        autonomy_preference: "approval_gated",
        domain: "iot_home",
        target_surface: "clawix_ui",
        agent_topology: "agent_network",
        infrastructure: "physical_device",
        data_state: "fixtures",
        permission_risk: "host_brokered",
        deliverable: "working_feature",
        validation_mode: "external_pending",
      },
      humanNeed: "A person buys a controllable light and expects the agent to detect, model, and expose controls safely.",
      expectedOutcome: "The framework can represent hardware discovery, host permissions, UI controls, and external pending validation.",
      acceptanceSignals: ["physical validation is marked EXTERNAL PENDING", "permission ownership stays host-brokered", "device controls map to capabilities"],
      validationMode: "external_pending",
    }],
  },
];

export function listNeedDimensions(): NeedDimension[] {
  return NEED_ROUTE_DIMENSIONS.map((dimension) => ({
    ...dimension,
    values: dimension.values.map((value) => ({ ...value })),
  }));
}

export function listNeedRoutePilotPacks(): RoutePilotPack[] {
  return NEED_ROUTE_PILOT_PACKS.map((pack) => ({
    ...pack,
    routeSeeds: pack.routeSeeds.map((route) => ({
      ...route,
      dimensions: { ...route.dimensions },
      acceptanceSignals: [...route.acceptanceSignals],
    })),
  }));
}

export function listNeedCapabilityGraph(): NeedCapabilityGraph {
  return {
    schemaVersion: 1,
    nodes: NEED_ROUTE_CAPABILITY_GRAPH.nodes.map((node) => ({ ...node })),
    edges: NEED_ROUTE_CAPABILITY_GRAPH.edges.map((edge) => ({ ...edge })),
  };
}

export function generateNeedRoutes(options: { pilotPackId?: string; limit?: number; mode?: NeedScenarioGenerationMode } = {}): NeedRoute[] {
  const packs = options.pilotPackId
    ? NEED_ROUTE_PILOT_PACKS.filter((pack) => pack.id === options.pilotPackId)
    : NEED_ROUTE_PILOT_PACKS;
  const routes = packs.flatMap((pack) => pack.routeSeeds.map((seed) => ({
    schemaVersion: 1 as const,
    pilotPackId: pack.id,
    ...seed,
    dimensions: { ...seed.dimensions },
    acceptanceSignals: [...seed.acceptanceSignals],
  })));
  return typeof options.limit === "number" && options.limit >= 0 ? routes.slice(0, options.limit) : routes;
}

export function planNeedRouteGeneration(options: { pilotPackId?: string; limit?: number; mode?: NeedScenarioGenerationMode } = {}): NeedRouteGenerationPlan {
  const mode = options.mode ?? "deterministic";
  const routes = generateNeedRoutes(options);
  return {
    schemaVersion: 1,
    mode,
    routes,
    lateralExpansion: mode === "llm_lateral_dry_run"
      ? {
        status: "dry_run_only",
        reason: "LLM lateral generation is represented as a normalized dry-run expansion plan in V1; no prompt is sent and no provider is called.",
        normalizedInputs: routes.map((route) => `${route.pilotPackId}:${route.id}:${Object.entries(route.dimensions).map(([key, value]) => `${key}=${value}`).join(",")}`),
        blockedRealActions: ["no_provider_prompt", "no_paid_api", "no_secret_access", "no_production_data"],
      }
      : {
        status: "not_requested",
        reason: "Deterministic registry generation only.",
        normalizedInputs: [],
        blockedRealActions: ["no_provider_prompt", "no_paid_api", "no_secret_access", "no_production_data"],
      },
  };
}

export function evaluateNeedRoute(route: NeedRoute): NeedRouteEvaluation {
  const opportunities = buildRouteOpportunities(route);
  const deduped = dedupeNeedOpportunities(opportunities).unique;
  return {
    schemaVersion: 1,
    route,
    opportunities: deduped,
    capabilityGraph: listNeedCapabilityGraph(),
    summary: {
      opportunityCount: deduped.length,
      externalPendingCount: deduped.filter((opportunity) => opportunity.externalPending).length,
      topOpportunityIds: [...deduped].sort((a, b) => b.score.total - a.score.total).slice(0, 3).map((opportunity) => opportunity.id),
    },
  };
}

export function evaluateNeedRoutes(routes: NeedRoute[]): NeedRouteEvaluation[] {
  return routes.map((route) => evaluateNeedRoute(route));
}

export function scoreNeedOpportunity(input: Omit<NeedOpportunityScore, "total">): NeedOpportunityScore {
  const invertedEffort = 10 - input.effort;
  const total = Math.round((
    input.severity * 0.18
    + input.humanScope * 0.14
    + input.frequency * 0.14
    + input.routeBlocker * 0.14
    + input.constitutionalRisk * 0.12
    + invertedEffort * 0.1
    + input.reuseLeverage * 0.1
    + input.confidence * 0.08
  ) * 10) / 10;
  return { ...input, total };
}

export function dedupeNeedOpportunities(opportunities: NeedOpportunity[]): NeedOpportunityDedupeResult {
  const byFingerprint = new Map<string, NeedOpportunity[]>();
  for (const opportunity of opportunities) {
    byFingerprint.set(opportunity.fingerprint, [...(byFingerprint.get(opportunity.fingerprint) ?? []), opportunity]);
  }
  const unique: NeedOpportunity[] = [];
  const duplicates: NeedOpportunityDedupeResult["duplicates"] = [];
  for (const [fingerprint, entries] of byFingerprint.entries()) {
    const sorted = [...entries].sort((a, b) => b.score.total - a.score.total || a.id.localeCompare(b.id));
    unique.push(sorted[0]);
    if (sorted.length > 1) {
      duplicates.push({
        fingerprint,
        canonicalId: sorted[0].id,
        duplicateIds: sorted.slice(1).map((entry) => entry.id),
      });
    }
  }
  return {
    schemaVersion: 1,
    unique: unique.sort((a, b) => b.score.total - a.score.total || a.id.localeCompare(b.id)),
    duplicates,
  };
}

function buildRouteOpportunities(route: NeedRoute): NeedOpportunity[] {
  const items: Array<Omit<NeedOpportunity, "schemaVersion" | "routeId" | "pilotPackId" | "score" | "fingerprint" | "relations"> & {
    score: Omit<NeedOpportunityScore, "total">;
    relationTargets?: string[];
  }> = [];

  if (route.dimensions.target_surface === "clawix_ui" || route.dimensions.target_surface === "ios_demo") {
    items.push({
      id: `${route.id}.surface_contract`,
      title: "Define route-to-surface contract",
      kind: "surface",
      state: "observed_gap",
      summary: "Human-visible routes need an explicit surface contract so UI, simulator, and CLI evidence stay aligned.",
      evidence: [route.humanNeed, `target_surface=${route.dimensions.target_surface}`],
      affectedSurfaces: ["claw.cli.needs", "clawix.ui", "docs/need-route-lab.md"],
      source: "deterministic_route_eval",
      externalPending: false,
      score: { severity: 8, humanScope: 8, frequency: 8, routeBlocker: 7, constitutionalRisk: 4, effort: 5, reuseLeverage: 8, confidence: 8 },
    });
  }

  if (route.dimensions.autonomy_preference === "autonomous_no_questions") {
    items.push({
      id: `${route.id}.assumption_ledger`,
      title: "Add assumption ledger for no-question routes",
      kind: "feature",
      state: "candidate",
      summary: "Autonomous routes must persist assumptions and expose them before promotion so humans can audit what the agent inferred.",
      evidence: [route.humanNeed, "autonomy_preference=autonomous_no_questions"],
      affectedSurfaces: ["claw.cli.needs", "claw.workspace.need_routes"],
      source: "deterministic_route_eval",
      externalPending: false,
      score: { severity: 9, humanScope: 8, frequency: 7, routeBlocker: 8, constitutionalRisk: 7, effort: 5, reuseLeverage: 8, confidence: 8 },
    });
  }

  if (route.dimensions.agent_topology === "role_pack" || route.dimensions.agent_topology === "agent_network") {
    items.push({
      id: `${route.id}.role_skills`,
      title: "Package route lab agent roles as skills",
      kind: "docs",
      state: "candidate",
      summary: "Scenario generator, coverage auditor, opportunity triager, and publication preparer need reusable skill instructions.",
      evidence: [route.humanNeed, `agent_topology=${route.dimensions.agent_topology}`],
      affectedSurfaces: ["skills/need-scenario-generator", "skills/need-coverage-auditor", "skills/need-opportunity-triager", "skills/need-publication-preparer"],
      source: "deterministic_route_eval",
      externalPending: false,
      score: { severity: 7, humanScope: 7, frequency: 8, routeBlocker: 5, constitutionalRisk: 3, effort: 3, reuseLeverage: 9, confidence: 9 },
    });
  }

  if (route.dimensions.infrastructure === "remote_vps") {
    items.push({
      id: `${route.id}.remote_topology_fixture`,
      title: "Model bounded remote topology as fixtures",
      kind: "validation",
      state: "candidate",
      summary: "Remote-host constraints need fixture coverage before real provider credentials, domains, or deploy actions are allowed.",
      evidence: [route.humanNeed, "infrastructure=remote_vps"],
      affectedSurfaces: ["claw.cli.needs", "monitor", "preview", "browser"],
      source: "deterministic_route_eval",
      externalPending: true,
      score: { severity: 8, humanScope: 7, frequency: 6, routeBlocker: 9, constitutionalRisk: 8, effort: 6, reuseLeverage: 7, confidence: 7 },
    });
  }

  if (route.dimensions.infrastructure === "physical_device" || route.dimensions.validation_mode === "external_pending") {
    items.push({
      id: `${route.id}.external_pending_protocol`,
      title: "Keep physical validation separate from local pass/fail",
      kind: "validation",
      state: "accepted",
      summary: "Hardware and local-network routes must record EXTERNAL PENDING instead of being counted as bugs or completed validation.",
      evidence: [route.humanNeed, `validation_mode=${route.dimensions.validation_mode}`],
      affectedSurfaces: ["claw.cli.needs", "iot", "host permissions"],
      source: "deterministic_route_eval",
      externalPending: true,
      score: { severity: 8, humanScope: 7, frequency: 5, routeBlocker: 9, constitutionalRisk: 8, effort: 4, reuseLeverage: 8, confidence: 9 },
    });
  }

  if (route.dimensions.data_state === "existing_workspace") {
    items.push({
      id: `${route.id}.dedupe_against_inspectable_state`,
      title: "Dedupe opportunities against inspectable state",
      kind: "data",
      state: "candidate",
      summary: "Routes that start from existing workspace data need canonical fingerprints and inspection before adding backlog noise.",
      evidence: [route.humanNeed, "data_state=existing_workspace"],
      affectedSurfaces: ["claw.cli.needs", "claw inspect", "claw search", "claw.workspace.need_routes"],
      source: "deterministic_route_eval",
      externalPending: false,
      score: { severity: 8, humanScope: 8, frequency: 9, routeBlocker: 8, constitutionalRisk: 5, effort: 5, reuseLeverage: 8, confidence: 8 },
    });
  }

  items.push({
    id: `${route.id}.collections_schema_inspectability`,
    title: "Track collection schema inspectability failures",
    kind: "bug",
    state: "observed_gap",
    summary: "Need discovery depends on schema inspection; failures such as a missing resource_id column must become deduped opportunities instead of disappearing into logs.",
    evidence: ["goal discovery observed `claw collections <collection> schema --json` failing with `no such column: resource_id`", route.humanNeed],
    affectedSurfaces: ["collections", "database", "inspect", "claw.cli.needs"],
    source: "known_discovery_gap",
    externalPending: false,
    score: { severity: 7, humanScope: 7, frequency: 6, routeBlocker: 8, constitutionalRisk: 5, effort: 4, reuseLeverage: 7, confidence: 6 },
  });

  return items.map((item) => {
    const fingerprint = stableOpportunityFingerprint(item.kind, item.title, item.affectedSurfaces);
    return {
      schemaVersion: 1,
      routeId: route.id,
      pilotPackId: route.pilotPackId,
      ...item,
      score: scoreNeedOpportunity(item.score),
      fingerprint,
      relations: (item.relationTargets ?? []).map((targetId) => ({
        kind: "depends_on" as const,
        targetId,
        reason: "Generated from the same route evaluation.",
      })),
    };
  });
}

function stableOpportunityFingerprint(kind: string, title: string, surfaces: string[]): string {
  return [kind, title, ...surfaces].join("|").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
