import fs from "fs";
import os from "os";
import path from "path";

import Database from "better-sqlite3";
import { GOVERNANCE_CAPABILITIES, GOVERNANCE_ENTITY_KINDS, GOVERNANCE_PRINCIPAL_KINDS, GOVERNANCE_SCOPE_KINDS, buildRemoteConformanceReport, buildRemoteExternalPendingRegister, buildRemoteOfflineCommandResult, buildRemoteRouteContractCatalog, buildSyncDriverCatalog, clawEvolutionPolicy, clawPreV1VersionGovernancePolicy, connectorExecutionPipeline, createAgentControlPanel, createAgentPrivacyLifecyclePlan, evaluateGovernanceAccess, evaluateGovernanceDelegation, remoteSyncRequiredRouteIds, resolveClawPersistentSurfacePath, summarizeGovernanceBindings, syncDriverSchema } from "@clawjs/core";
import { CLAW_CLI_COMMAND_INTENT_STATUSES, auditClawCapabilityMaturityRegistry, buildClawDebtLedger, buildCustomAppSDKInspectionPayload, buildRemoteDecisionReview, buildRemoteExternalValidationApprovalRequest, buildRemoteExternalValidationChecklist, buildRemoteExternalValidationEvidenceTemplate, buildRemoteExternalValidationReadiness, buildRemoteExternalValidationReport, buildRemoteGoalClosureGate, buildRemoteProviderDeviceE2EValidationPlan, buildRemoteSourceQaReviewTemplate, clawProfessionalRecordsAcceptanceFixture, clawProfessionalRecordsOsRegistry, clawPersistentSurfaceRegistry, findClawPersistentSurfaceNode, getClawCapabilityFiche, listClawCapabilityFiches, listClawCapabilityMaturityEntries, listClawCliAliases, listClawCliCommandIntentRegistry, listClawCliCommands, listClawProfessionalRecordsGapRegistryEntries, listClawProfessionalRecordsIntentEntries, listClawProfessionalRecordsSemanticViewEntries, parseRemoteExternalValidationEvidenceInput, parseRemoteSourceQaReviewInput, resolveClawCliCommand, searchClawCliRegistry, withSurfaceChildren, type RemoteExternalValidationEvidence, type RemoteSourceQaReviewItem } from "@clawjs/core/catalogs";
import type { AgentAuditEvent, ClawPersistentSurfaceNode, ClawPersistentSurfaceRegistry, ClawSurfaceEdge, ClawSurfaceRoute } from "@clawjs/core";
import type { ClawCapabilityFiche } from "@clawjs/core/catalogs";
import type { Agent } from "@clawjs/agents";
import { v1MainSchemaSurfaceNodes } from "./v1-data-surface.ts";
import { normalizeDbRow, resolveClawjsMainDbPath, type JsonRecord } from "./v1-data-core.ts";
import { writeJsonError, writeJsonOk, type CliJsonMeta } from "./cli-json.ts";
import { CliHandledError } from "./cli-errors.ts";

interface CliContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
}

const CLI_EXIT_OK = 0;
const CLI_EXIT_FAILURE = 1;
const CLI_EXIT_USAGE = 64;

class InspectCliError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(code: string, message: string, exitCode = CLI_EXIT_FAILURE) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

function cliErrorFromUnknown(error: unknown): InspectCliError {
  return error instanceof InspectCliError
    ? error
    : new InspectCliError("internal_error", error instanceof Error ? error.message : String(error));
}
interface InspectCliInput {
  argv?: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}

interface SurfaceInspectEvidence {
  declaration: {
    file: string;
    line?: number;
    symbol?: string;
    language?: string;
  };
  docs: string[];
  tests: string[];
  adrs: string[];
  inspectCommands: string[];
  searchCommands: string[];
  changePolicy: {
    consequence: string;
    guards: string[];
    routeIds: string[];
  };
}

interface AgentInspectFiche {
  schemaVersion: 1;
  agent: {
    id: string;
    name: string;
    role: string;
    runtime: string;
    model: string;
    autonomyLevel: string;
    avatar: Agent["avatar"];
    isBuiltin: boolean;
  };
  steward: {
    source: "legacy_agent_store" | "agents_v1_projection";
    stewardKind?: unknown;
    stewardId?: unknown;
    scopeType?: unknown;
    scopeId?: unknown;
    workspaceId?: unknown;
    projectId?: unknown;
    legacyOwnerKind?: unknown;
    legacyOwnerId?: unknown;
  };
  orgGraph: {
    reportsTo?: string;
    allowedSubagents: string[];
    scopeInherits: boolean;
  };
  assignments: unknown[];
  executionProfiles: unknown[];
  resourceGrants: unknown[];
  memoryPolicies: unknown[];
  budgets: unknown[];
  runs: unknown[];
  sessions: unknown[];
  evaluations: unknown[];
  incidents: unknown[];
  configRevisions: unknown[];
  routes: Array<{ id: string; visibility: string; validation: string }>;
  controlPanel: unknown;
  privacyLifecycle: unknown;
  risks: string[];
  gaps: string[];
  tests: string[];
  recentAudit: unknown[];
}

function inspectNodes(): ClawPersistentSurfaceNode[] {
  return withSurfaceChildren([...clawPersistentSurfaceRegistry.nodes, ...v1MainSchemaSurfaceNodes]);
}

function inspectRegistry(input: InspectCliInput): ClawPersistentSurfaceRegistry {
  const nodes = [...clawPersistentSurfaceRegistry.nodes, ...v1MainSchemaSurfaceNodes];
  const edges = [...(clawPersistentSurfaceRegistry.edges ?? [])];
  const routes = [...(clawPersistentSurfaceRegistry.routes ?? [])];
  for (const manifestPath of manifestPaths(input.flags)) {
    const manifest = readManifest(manifestPath, input.context.cwd);
    nodes.push(...manifest.nodes);
    edges.push(...(manifest.edges ?? []));
    routes.push(...(manifest.routes ?? []));
  }
  return {
    version: clawPersistentSurfaceRegistry.version,
    nodes,
    edges,
    routes,
  };
}

async function buildAgentInspectFiche(input: InspectCliInput, agentId: string, routes: ClawSurfaceRoute[]): Promise<AgentInspectFiche> {
  const { AgentStoreFS } = await import("@clawjs/agents");
  const store = new AgentStoreFS({ home: input.flags.home || input.flags["claw-home"] || process.env.CLAW_HOME });
  const agent = store.readAgent(agentId);
  if (!agent) throw new InspectCliError("inspect_not_found", `No agent found for ${agentId}.`, CLI_EXIT_USAGE);
  const dataRootEnv = input.flags["data-dir"] ? { ...process.env, CLAW_DATA_DIR: input.flags["data-dir"] } as NodeJS.ProcessEnv : process.env;
  const db = openReadonlyMainDb(dataRootEnv);
  try {
    const agentProjection = firstRowById(db, "agents", agent.id);
    const assignments = rowsByAgent(db, "agent_assignments", agent.id);
    const executionProfiles = rowsByAgent(db, "agent_execution_profiles", agent.id);
    const resourceGrants = rowsByAgent(db, "agent_resource_grants", agent.id);
    const memoryPolicies = rowsByAgent(db, "agent_memory_policies", agent.id);
    const budgets = rowsByAgent(db, "agent_budgets", agent.id);
    const runs = rowsByAgent(db, "agent_runs", agent.id);
    const sessions = rowsByAgent(db, "agent_sessions", agent.id);
    const evaluations = rowsByAgent(db, "agent_evaluations", agent.id);
    const incidents = rowsByAgent(db, "agent_incidents", agent.id);
    const configRevisions = rowsByAgent(db, "agent_config_revisions", agent.id);
    const auditEvents = readAgentAudit(agent.id, input.flags).slice(-50);
    const agentRoutes = routes.filter((route) => route.id.startsWith("agents."));
    const risks = agentRisks(agent, assignments, resourceGrants, memoryPolicies, executionProfiles, incidents);
    const gaps = agentGaps(agentProjection, assignments, resourceGrants, memoryPolicies, executionProfiles, budgets, agentRoutes);
    const panelAgent = agentProjection && typeof agentProjection === "object" ? agentProjection as JsonRecord : agent as unknown as JsonRecord;
    const controlPanel = createAgentControlPanel({
      agent: panelAgent,
      assignments: assignments as JsonRecord[],
      executionProfiles: executionProfiles as JsonRecord[],
      resourceGrants: resourceGrants as JsonRecord[],
      memoryPolicies: memoryPolicies as JsonRecord[],
      budgets: budgets as JsonRecord[],
      runs: runs as JsonRecord[],
      sessions: sessions as JsonRecord[],
      evaluations: evaluations as JsonRecord[],
      incidents: incidents as JsonRecord[],
      configRevisions: configRevisions as JsonRecord[],
      audits: auditEvents as AgentAuditEvent[],
      generatedAt: new Date(0).toISOString(),
      redaction: "strict",
    });
    const privacyLifecycle = createAgentPrivacyLifecyclePlan({
      operation: "export",
      subject: { scopeType: "agent", scopeId: agent.id },
      agent: panelAgent,
      assignments: assignments as JsonRecord[],
      runs: runs as JsonRecord[],
      sessions: sessions as JsonRecord[],
      evaluations: evaluations as JsonRecord[],
      incidents: incidents as JsonRecord[],
      configRevisions: configRevisions as JsonRecord[],
      audits: auditEvents as AgentAuditEvent[],
      requestedAt: new Date(0).toISOString(),
      redaction: "strict",
    });
    return {
      schemaVersion: 1,
      agent: {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        runtime: agent.runtime,
        model: agent.model,
        autonomyLevel: agent.autonomyLevel,
        avatar: agent.avatar,
        isBuiltin: agent.isBuiltin,
      },
      steward: {
        source: agentProjection ? "agents_v1_projection" : "legacy_agent_store",
        ...(agentProjection ? pickDefined(agentProjection as JsonRecord, ["stewardKind", "stewardId", "scopeType", "scopeId", "workspaceId", "projectId"]) : {}),
        ...(agentProjection ? pickLegacyOwnerProjection(agentProjection as JsonRecord) : {}),
      },
      orgGraph: {
        ...(agent.delegation.reportsTo ? { reportsTo: agent.delegation.reportsTo } : {}),
        allowedSubagents: agent.delegation.allowedSubagents,
        scopeInherits: agent.delegation.scopeInherits,
      },
      assignments,
      executionProfiles,
      resourceGrants,
      memoryPolicies,
      budgets,
      runs,
      sessions,
      evaluations,
      incidents,
      configRevisions,
      routes: agentRoutes.map((route) => ({ id: route.id, visibility: route.visibility, validation: route.validation })),
      controlPanel,
      privacyLifecycle,
      risks,
      gaps,
      tests: [
        "packages/clawjs-core/src/agents-v1.test.ts",
        "packages/clawjs/src/index-data.test.ts",
        "packages/clawjs/src/inspect-cli.test.ts",
      ],
      recentAudit: auditEvents.slice(-10),
    };
  } finally {
    db?.close();
  }
}

function openReadonlyMainDb(env: NodeJS.ProcessEnv): Database.Database | null {
  const dbPath = resolveClawjsMainDbPath(env);
  if (!fs.existsSync(dbPath)) return null;
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

function firstRowById(db: Database.Database | null, table: string, id: string): unknown | null {
  if (!db || !tableExists(db, table)) return null;
  return normalizeDbRow(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as JsonRecord | undefined) ?? null;
}

function rowsByAgent(db: Database.Database | null, table: string, agentId: string): unknown[] {
  if (!db || !tableExists(db, table)) return [];
  const order = tableColumns(db, table).includes("updated_at") ? " ORDER BY updated_at DESC" : "";
  return db.prepare(`SELECT * FROM ${table} WHERE agent_id = ?${order} LIMIT 100`).all(agentId).map(normalizeDbRow);
}

function tableExists(db: Database.Database, table: string): boolean {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?").get(table));
}

function tableColumns(db: Database.Database, table: string): string[] {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String((row as { name: unknown }).name));
}

function pickDefined(record: JsonRecord, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) out[key] = record[key];
  }
  return out;
}

function pickLegacyOwnerProjection(record: JsonRecord): Record<string, unknown> {
  const kind = record[["owner", "Kind"].join("")];
  const id = record[["owner", "Id"].join("")];
  return {
    ...(kind !== undefined && kind !== null ? { legacyOwnerKind: kind } : {}),
    ...(id !== undefined && id !== null ? { legacyOwnerId: id } : {}),
  };
}

function agentRisks(agent: Agent, assignments: unknown[], grants: unknown[], memoryPolicies: unknown[], executionProfiles: unknown[], incidents: unknown[]): string[] {
  const risks: string[] = [];
  if (agent.secretAllowlist.length > 0 || agent.secretTags.length > 0) risks.push("secret_refs_require_brokered_leases");
  if (agent.autonomyLevel === "act_full") risks.push("act_full_requires_assignment_and_run_scope_review");
  if (assignments.some((entry) => isExternalAssignment(entry) && (entry as JsonRecord).status === "active")) risks.push("external_assignment_requires_disclosure_identity_and_support_projection");
  if (grants.length === 0) risks.push("empty_grants_fail_closed");
  if (memoryPolicies.length === 0) risks.push("missing_memory_policy_defaults_to_no_memory");
  if (executionProfiles.length === 0) risks.push("missing_execution_profile_defaults_to_empty_sandbox");
  if (incidents.some((entry) => ["open", "investigating", "mitigating"].includes(String((entry as JsonRecord).status)))) risks.push("open_incidents_require_review");
  return risks;
}

function agentGaps(agentProjection: unknown | null, assignments: unknown[], grants: unknown[], memoryPolicies: unknown[], executionProfiles: unknown[], budgets: unknown[], routes: ClawSurfaceRoute[]): string[] {
  const gaps: string[] = [];
  if (!agentProjection) gaps.push("agents_v1_projection_missing");
  if (assignments.length === 0) gaps.push("no_assignments");
  if (!assignments.some((entry) => (entry as JsonRecord).status === "active")) gaps.push("no_active_assignments");
  if (grants.length === 0) gaps.push("no_resource_grants");
  if (memoryPolicies.length === 0) gaps.push("no_memory_policy");
  if (executionProfiles.length === 0) gaps.push("no_execution_profile");
  if (budgets.length === 0) gaps.push("no_budget");
  if (!routes.some((route) => route.id === "agents.internalMacAssignment")) gaps.push("internal_assignment_route_missing");
  if (!routes.some((route) => route.id === "agents.externalSupportAssignment")) gaps.push("external_support_assignment_route_missing");
  if (!routes.some((route) => route.id === "agents.mcpApiAssignment")) gaps.push("mcp_assignment_route_missing");
  return gaps;
}

function isExternalAssignment(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const kind = String((entry as JsonRecord).kind ?? "");
  return kind.startsWith("external_") || kind === "support_inbox";
}

function readAgentAudit(agentId: string, flags: Record<string, string>): unknown[] {
  const home = flags.home || flags["claw-home"] || process.env.CLAW_HOME || path.join(os.homedir(), resolveClawPersistentSurfacePath("claw.global.root").slice("~/".length));
  const auditPath = path.join(home, "agents", agentId, "audit.log");
  if (!fs.existsSync(auditPath)) return [];
  return fs.readFileSync(auditPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        return { raw: line };
      }
    });
}

function inspectAgentText(fiche: AgentInspectFiche): string {
  return [
    `${fiche.agent.id}\t${fiche.agent.name}\t${fiche.agent.role || "-"}`,
    `runtime\t${fiche.agent.runtime}\tmodel\t${fiche.agent.model}\tautonomy\t${fiche.agent.autonomyLevel}`,
    `steward\t${fiche.steward.stewardKind ?? "-"}\t${fiche.steward.stewardId ?? "-"}`,
    `scope\t${fiche.steward.scopeType ?? "-"}\t${fiche.steward.scopeId ?? "-"}`,
    `assignments\t${fiche.assignments.length}`,
    `resource_grants\t${fiche.resourceGrants.length}`,
    `memory_policies\t${fiche.memoryPolicies.length}`,
    `execution_profiles\t${fiche.executionProfiles.length}`,
    `routes\t${fiche.routes.map((route) => route.id).join(", ") || "-"}`,
    `risks\t${fiche.risks.join(", ") || "-"}`,
    `gaps\t${fiche.gaps.join(", ") || "-"}`,
  ].join("\n") + "\n";
}

function manifestPaths(flags: Record<string, string>): string[] {
  const raw = flags.manifest || process.env.CLAW_INSPECT_MANIFEST || "";
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function readManifest(manifestPath: string, cwd: string): ClawPersistentSurfaceRegistry {
  const absolutePath = path.resolve(cwd, manifestPath);
  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as ClawPersistentSurfaceRegistry;
    if (!Array.isArray(parsed.nodes)) {
      throw new Error("manifest does not contain a nodes array");
    }
    if (parsed.edges !== undefined && !Array.isArray(parsed.edges)) {
      throw new Error("manifest edges must be an array when present");
    }
    if (parsed.routes !== undefined && !Array.isArray(parsed.routes)) {
      throw new Error("manifest routes must be an array when present");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new InspectCliError("inspect_manifest_error", `Could not read inspect manifest ${manifestPath}: ${message}`, CLI_EXIT_USAGE);
  }
}

function defaultCodebaseManifestPaths(cwd: string): string[] {
  const candidates = [
    "docs/codebase-manifest.json",
    "../Clawix/clawix/docs/codebase-manifest.json",
  ];
  return candidates.filter((manifestPath) => fs.existsSync(path.resolve(cwd, manifestPath)));
}

function codebaseManifestPaths(input: InspectCliInput): string[] {
  const raw = input.flags["codebase-manifest"] || process.env.CLAW_CODEBASE_MANIFEST || "";
  if (raw) return raw.split(",").map((value) => value.trim()).filter(Boolean);
  return defaultCodebaseManifestPaths(input.context.cwd);
}

function readOneCodebaseManifest(manifestPath: string, cwd: string): Record<string, unknown> {
  const absolutePath = path.resolve(cwd, manifestPath);
  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("manifest must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new InspectCliError("inspect_codebase_manifest_error", `Could not read codebase manifest ${manifestPath}: ${message}`, CLI_EXIT_USAGE);
  }
}

function readCodebaseManifest(input: InspectCliInput): unknown {
  const manifestPaths = codebaseManifestPaths(input);
  if (manifestPaths.length === 0) {
    throw new InspectCliError("inspect_codebase_manifest_error", "Could not find a codebase manifest. Run `node scripts/codebase-manifest.mjs --write` to create the ignored local manifest, or pass --codebase-manifest <path>.", CLI_EXIT_USAGE);
  }
  const manifests = manifestPaths.map((manifestPath) => ({
    manifestPath,
    manifest: readOneCodebaseManifest(manifestPath, input.context.cwd),
  }));
  if (manifests.length === 1) return manifests[0].manifest;
  return combineCodebaseManifests(manifests);
}

function codebaseSummaryFromFiles(files: Array<Record<string, unknown>>) {
  const summary = {
    files: files.length,
    tests: 0,
    entrypoints: 0,
    languages: {
      typescript: 0,
      javascript: 0,
      swift: 0,
    },
  };
  for (const file of files) {
    if (file.test === true) summary.tests += 1;
    if (file.entrypoint === true) summary.entrypoints += 1;
    if (file.language === "typescript") summary.languages.typescript += 1;
    if (file.language === "javascript") summary.languages.javascript += 1;
    if (file.language === "swift") summary.languages.swift += 1;
  }
  return summary;
}

function declarationMatchesSymbol(file: Record<string, unknown>, symbol: string): boolean {
  const declarations = Array.isArray(file.declarations) ? file.declarations : [];
  const exports = Array.isArray(file.exports) ? file.exports : [];
  return declarations.some((entry) => typeof entry === "object" && entry !== null && (entry as { name?: unknown }).name === symbol)
    || exports.includes(symbol);
}

function filterCodebaseManifest(manifest: unknown, input: InspectCliInput): unknown {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return manifest;
  const manifestObject = manifest as Record<string, unknown>;
  const files = Array.isArray(manifestObject.files) ? manifestObject.files as Array<Record<string, unknown>> : [];
  const wantsSummary = input.argv?.includes("--summary") || input.flags.summary === "true";
  const pathPrefix = input.flags["path-prefix"];
  const symbol = input.flags.symbol;
  const language = input.flags.language;
  const tests = input.flags.tests;
  const limit = input.flags.limit ? Number(input.flags.limit) : undefined;
  const hasFilters = !!(pathPrefix || symbol || language || tests !== undefined || Number.isFinite(limit));
  if (!wantsSummary && !hasFilters) return manifest;

  let filteredFiles = files;
  if (pathPrefix) filteredFiles = filteredFiles.filter((file) => typeof file.path === "string" && file.path.startsWith(pathPrefix));
  if (symbol) filteredFiles = filteredFiles.filter((file) => declarationMatchesSymbol(file, symbol));
  if (language) filteredFiles = filteredFiles.filter((file) => file.language === language);
  if (tests !== undefined) {
    const wantsTests = tests === "true";
    filteredFiles = filteredFiles.filter((file) => file.test === wantsTests);
  }
  const totalMatched = filteredFiles.length;
  if (Number.isFinite(limit)) filteredFiles = filteredFiles.slice(0, Math.max(0, limit!));

  const filter = {
    ...(pathPrefix ? { pathPrefix } : {}),
    ...(symbol ? { symbol } : {}),
    ...(language ? { language } : {}),
    ...(tests !== undefined ? { tests: tests === "true" } : {}),
    ...(Number.isFinite(limit) ? { limit } : {}),
    totalMatched,
    returned: wantsSummary ? 0 : filteredFiles.length,
  };
  const base = {
    ...manifestObject,
    summary: hasFilters ? codebaseSummaryFromFiles(filteredFiles) : manifestObject.summary,
    filter,
  };
  if (wantsSummary) {
    const { files: _files, ...manifestWithoutFiles } = manifestObject as typeof manifestObject & { files?: unknown };
    return {
      ...manifestWithoutFiles,
      summary: hasFilters ? codebaseSummaryFromFiles(filteredFiles) : manifestObject.summary,
      filter,
    };
  }
  return {
    ...base,
    files: filteredFiles,
  };
}

function combineCodebaseManifests(entries: Array<{ manifestPath: string; manifest: Record<string, unknown> }>): unknown {
  const files = [];
  const summary = {
    files: 0,
    tests: 0,
    entrypoints: 0,
    languages: {
      typescript: 0,
      javascript: 0,
      swift: 0,
    },
  };
  const astCoverage: Record<string, unknown> = {};
  for (const entry of entries) {
    const manifest = entry.manifest as {
      repository?: unknown;
      root?: unknown;
      astCoverage?: Record<string, unknown>;
      summary?: {
        files?: unknown;
        tests?: unknown;
        entrypoints?: unknown;
        languages?: Record<string, unknown>;
      };
      files?: Array<Record<string, unknown>>;
    };
    const repository = typeof manifest.repository === "string" ? manifest.repository : path.basename(path.dirname(path.dirname(entry.manifestPath))) || "repository";
    if (manifest.astCoverage && typeof manifest.astCoverage === "object") {
      Object.assign(astCoverage, manifest.astCoverage);
    }
    const manifestSummary = manifest.summary ?? {};
    summary.files += typeof manifestSummary.files === "number" ? manifestSummary.files : 0;
    summary.tests += typeof manifestSummary.tests === "number" ? manifestSummary.tests : 0;
    summary.entrypoints += typeof manifestSummary.entrypoints === "number" ? manifestSummary.entrypoints : 0;
    const languages = manifestSummary.languages ?? {};
    summary.languages.typescript += typeof languages.typescript === "number" ? languages.typescript : 0;
    summary.languages.javascript += typeof languages.javascript === "number" ? languages.javascript : 0;
    summary.languages.swift += typeof languages.swift === "number" ? languages.swift : 0;
    for (const file of Array.isArray(manifest.files) ? manifest.files : []) {
      files.push({
        ...file,
        repository,
        manifestPath: entry.manifestPath,
      });
    }
  }
  return {
    schemaVersion: 1,
    scope: "workspace",
    summary,
    astCoverage,
    manifests: entries.map((entry) => ({
      manifestPath: entry.manifestPath,
      repository: typeof entry.manifest.repository === "string" ? entry.manifest.repository : undefined,
      root: entry.manifest.root,
      summary: entry.manifest.summary,
      astCoverage: entry.manifest.astCoverage,
    })),
    files,
  };
}

function readConnectorCatalog(input: InspectCliInput): unknown {
  const configuredPath = input.flags["connector-catalog"] || input.flags.catalog || process.env.CLAW_CONNECTOR_CATALOG_PATH || "";
  const candidates = configuredPath
    ? [configuredPath]
    : ["packages/clawjs-integrations/fixtures/started-provider-runtime-catalog.json"];
  for (const catalogPath of candidates) {
    const absolutePath = path.resolve(input.context.cwd, catalogPath);
    if (!fs.existsSync(absolutePath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("catalog must be a JSON object");
      }
      return summarizeConnectorCatalog(parsed, catalogPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InspectCliError("inspect_connector_catalog_error", `Could not read connector catalog ${catalogPath}: ${message}`, CLI_EXIT_USAGE);
    }
  }
  return {
    catalogPath: configuredPath || null,
    support: {
      state: "external_pending",
      reason: "No connector catalog path was configured and the default local fixture is unavailable.",
    },
    apps: [],
    summary: {
      apps: 0,
      operations: 0,
      supportedOperations: 0,
      completeExternalSchemas: 0,
    },
  };
}

function summarizeConnectorCatalog(input: unknown, catalogPath: string): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("catalog must be a JSON object");
  }
  const catalog = input as { version?: unknown; apps?: unknown };
  const apps = Array.isArray(catalog.apps) ? catalog.apps.filter(isRecord).map((app) => {
    const appAuthFieldNames = Array.isArray(app.authFieldNames) ? app.authFieldNames.filter((item) => typeof item === "string") : [];
    const operations = Array.isArray(app.operations) ? app.operations.filter(isRecord).map((operation) => ({
      id: typeof operation.id === "string" ? operation.id : "",
      kind: typeof operation.kind === "string" ? operation.kind : "",
      name: typeof operation.name === "string" ? operation.name : "",
      authFieldNames: Array.isArray(operation.authFieldNames) ? operation.authFieldNames.filter((item) => typeof item === "string") : [],
      support: isRecord(operation.support) ? operation.support : null,
      externalSchema: isRecord(operation.externalSchema) ? {
        status: operation.externalSchema.status,
        source: operation.externalSchema.source,
        providerVersion: operation.externalSchema.providerVersion,
        hasInputSchema: isJsonObject(operation.externalSchema.inputSchema),
        hasOutputSchema: isJsonObject(operation.externalSchema.outputSchema),
        evidence: Array.isArray(operation.externalSchema.evidence) ? operation.externalSchema.evidence.filter((item) => typeof item === "string") : [],
      } : null,
      executionPolicy: isRecord(operation.executionPolicy) ? operation.executionPolicy : null,
      runtime: isRecord(operation.runtime) ? operation.runtime : null,
    })).map((operation) => ({
      ...operation,
      controlPlane: summarizeConnectorControlPlaneOperation(operation, appAuthFieldNames),
    })) : [];
    return {
      id: typeof app.id === "string" ? app.id : "",
      name: typeof app.name === "string" ? app.name : "",
      authFieldNames: appAuthFieldNames,
      support: isRecord(app.support) ? app.support : null,
      operations,
    };
  }) : [];
  const operations = apps.flatMap((app) => app.operations);
  const blockedOperations = operations.filter((operation) => operation.controlPlane.state !== "ready");
  return {
    catalogPath,
    version: catalog.version,
    controlPlane: {
      version: 1,
      publicSurface: "connectors",
      discoveryAlias: "integrations",
      pipeline: connectorExecutionPipeline,
      blockByDefault: true,
    },
    apps,
    summary: {
      apps: apps.length,
      operations: operations.length,
      supportedOperations: operations.filter((operation) => operation.support && (operation.support as { state?: unknown }).state === "supported").length,
      completeExternalSchemas: operations.filter((operation) => operation.externalSchema?.status === "complete").length,
      authRequiredOperations: operations.filter((operation) => operation.executionPolicy && (operation.executionPolicy as { requiresAuth?: unknown }).requiresAuth === true).length,
      hostRequiredOperations: operations.filter((operation) => operation.executionPolicy && (operation.executionPolicy as { requiresHostApproval?: unknown }).requiresHostApproval === true).length,
      costRiskOperations: operations.filter((operation) => operation.executionPolicy && (operation.executionPolicy as { costRisk?: unknown }).costRisk === true).length,
      controlPlaneReadyOperations: operations.length - blockedOperations.length,
      controlPlaneBlockedOperations: blockedOperations.length,
      operationsMissingAuditPolicy: operations.filter((operation) => operation.controlPlane.issues.includes("missing_audit_policy")).length,
      operationsMissingCredentialScope: operations.filter((operation) => operation.controlPlane.issues.includes("missing_credential_scope")).length,
      operationsMissingRuntimeEvidence: operations.filter((operation) => operation.controlPlane.issues.includes("missing_runtime_evidence")).length,
    },
  };
}

function summarizeConnectorControlPlaneOperation(
  operation: {
    id: string;
    kind: string;
    authFieldNames: string[];
    support: Record<string, unknown> | null;
    externalSchema: { status: unknown } | null;
    executionPolicy: Record<string, unknown> | null;
    runtime: Record<string, unknown> | null;
  },
  appAuthFieldNames: string[],
): { state: "ready" | "blocked"; issues: string[] } {
  const issues: string[] = [];
  if (operation.support?.state !== "supported") {
    issues.push("unsupported_operation");
  }
  if (operation.externalSchema?.status !== "complete") {
    issues.push("incomplete_external_schema");
  }
  if (!operation.executionPolicy) {
    issues.push("missing_execution_policy");
  }
  if (operation.executionPolicy?.auditRequired !== true) {
    issues.push("missing_audit_policy");
  }
  if (operation.executionPolicy?.requiresAuth === true && operation.authFieldNames.length === 0 && appAuthFieldNames.length === 0) {
    issues.push("missing_credential_scope");
  }
  const hasRuntimeEvidence = operation.runtime?.hasRun === true || operation.runtime?.hasHooks === true;
  if (!hasRuntimeEvidence) {
    issues.push("missing_runtime_evidence");
  }
  return {
    state: issues.length === 0 ? "ready" : "blocked",
    issues,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonObject(value: unknown): boolean {
  return Boolean(value) && typeof value === "object";
}

function inspectPathToId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === "/") return "";
  if (normalized.startsWith("/database/")) return `claw.database.${normalized.split("/").filter(Boolean).slice(1).join(".")}`;
  if (normalized.startsWith("/storage/workspace")) return `claw.workspace${normalized.split("/").filter(Boolean).slice(2).join(".") ? `.${normalized.split("/").filter(Boolean).slice(2).join(".")}` : ""}`;
  if (normalized.startsWith("/storage/global")) return `claw.global${normalized.split("/").filter(Boolean).slice(2).join(".") ? `.${normalized.split("/").filter(Boolean).slice(2).join(".")}` : ""}`;
  if (normalized.startsWith("/storage/clawix")) return `clawix.home${normalized.split("/").filter(Boolean).slice(2).join(".") ? `.${normalized.split("/").filter(Boolean).slice(2).join(".")}` : ""}`;
  if (normalized.startsWith("/prefs/")) return normalized.split("/").filter(Boolean).join(".");
  return normalized.startsWith("/") ? normalized.slice(1).replace(/\//g, ".") : normalized;
}

function inspectFind(value: string, nodes = inspectNodes()): ClawPersistentSurfaceNode | undefined {
  const id = inspectPathToId(value);
  if (!id) return undefined;
  return findClawPersistentSurfaceNode(id) ?? nodes.find((node) => node.id === id || node.path === value || node.key === value);
}

function inspectList(value: string | undefined, nodes = inspectNodes()): ClawPersistentSurfaceNode[] {
  if (!value || value === "/") return nodes.filter((node) => !node.parentId);
  const node = inspectFind(value, nodes);
  if (!node) return [];
  return withSurfaceChildren(nodes).filter((candidate) => candidate.parentId === node.id);
}

function inspectText(nodes: ClawPersistentSurfaceNode[]): string {
  return nodes.map((node) => {
    const locator = node.path ?? node.route ?? node.key ?? node.value ?? node.name;
    return `${node.id}\t${node.kind}\t${node.owner}\t${node.surfaceClass ?? "persistent"}\t${formatSurfaceParity(node)}\t${locator}`;
  }).join("\n");
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function routesForSurfaceEvidence(nodeId: string, routes: ClawSurfaceRoute[]): ClawSurfaceRoute[] {
  return routes.filter((route) => route.fromId === nodeId || route.toId === nodeId || route.steps.some((step) => step.fromId === nodeId || step.toId === nodeId || step.contractId === nodeId));
}

function edgesForSurfaceEvidence(nodeId: string, edges: ClawSurfaceEdge[]): ClawSurfaceEdge[] {
  return edges.filter((edge) => edge.fromId === nodeId || edge.toId === nodeId || edge.contractId === nodeId);
}

function surfaceEvidence(node: ClawPersistentSurfaceNode, edges: ClawSurfaceEdge[], routes: ClawSurfaceRoute[], binName: string): SurfaceInspectEvidence {
  const relatedRoutes = routesForSurfaceEvidence(node.id, routes);
  const relatedEdges = edgesForSurfaceEvidence(node.id, edges);
  const docs = uniqueStrings([
    ...(node.kind === "cliCommand" ? ["docs/cli.md"] : []),
    ...(node.surfaceClass || relatedRoutes.length > 0 ? ["docs/persistent-surface.md", "docs/adr/0004-persistent-surface-registry-and-inspection.md"] : []),
    ...(relatedRoutes.length > 0 ? ["docs/adr/0012-surface-route-graph.md"] : []),
    ...relatedRoutes.flatMap((route) => route.docs ?? []),
  ]);
  const tests = uniqueStrings([
    ...(relatedRoutes.length > 0 ? ["packages/clawjs/src/inspect-cli.test.ts"] : []),
    ...(node.surfaceClass ? ["packages/clawjs-core/src/index.test.ts"] : []),
    ...relatedRoutes.flatMap((route) => route.tests ?? []),
  ]);
  const adrs = uniqueStrings([
    ...(node.surfaceClass || relatedRoutes.length > 0 ? ["docs/adr/0004-persistent-surface-registry-and-inspection.md"] : []),
    ...(relatedRoutes.length > 0 ? ["docs/adr/0012-surface-route-graph.md"] : []),
    ...relatedRoutes.flatMap((route) => route.adrs ?? []),
  ]);
  const routeIds = relatedRoutes.map((route) => route.id);
  const guards = uniqueStrings([
    "scripts/persistent-surface-guard.mjs",
    ...(relatedRoutes.length > 0 || relatedEdges.length > 0 ? ["scripts/surface-route-graph-guard.mjs"] : []),
    "scripts/surface-evidence-guard.mjs",
  ]);
  return {
    declaration: {
      file: node.source?.file ?? "packages/clawjs-core/src/surface-registry.ts",
      line: node.source?.line,
      symbol: node.source && "symbol" in node.source ? String((node.source as { symbol?: unknown }).symbol ?? "") || undefined : undefined,
      language: node.source?.language,
    },
    docs,
    tests,
    adrs,
    inspectCommands: [
      `${binName} inspect show ${node.id} --json`,
      `${binName} inspect neighbors ${node.id} --json`,
      ...(routeIds.length > 0 ? routeIds.map((routeId) => `${binName} inspect route ${routeId} --json`) : [`${binName} inspect routes ${node.id} --json`]),
    ],
    searchCommands: [
      `${binName} search query "${node.id}" --domains surfaces --json`,
      `${binName} search rebuild --source surfaces.registry --json`,
    ],
    changePolicy: {
      consequence: relatedRoutes.length > 0
        ? "Changing this surface can invalidate registered route steps, inspect/search evidence, and route tests."
        : "Changing this stable surface must keep the registry node, literal guard coverage, docs, tests, and CLI discovery aligned.",
      guards,
      routeIds,
    },
  };
}

function inspectEdgeText(edges: ClawSurfaceEdge[]): string {
  return edges.map((edge) => `${edge.id}\t${edge.type}\t${edge.fromId}\t${edge.toId}\t${edge.contractId ?? "-"}\t${edge.transport ?? "-"}`).join("\n");
}

function inspectRouteText(routes: ClawSurfaceRoute[]): string {
  return routes.map((route) => `${route.id}\t${route.fromId}\t${route.toId}\t${route.visibility}\t${route.validation}`).join("\n");
}

function inspectCapabilityFicheText(fiches: ClawCapabilityFiche[]): string {
  return fiches.map((fiche) => {
    const routeSummary = fiche.routes.join(",") || "-";
    const surfaces = [
      ...fiche.cliApiMcpRelay.cli.map((ref) => `cli:${ref}`),
      ...fiche.cliApiMcpRelay.serviceApi.map((ref) => `api:${ref}`),
      ...fiche.cliApiMcpRelay.mcp.map((ref) => `mcp:${ref}`),
      ...fiche.cliApiMcpRelay.relay.map((ref) => `relay:${ref}`),
      ...fiche.cliApiMcpRelay.hostBridge.map((ref) => `host:${ref}`),
    ].join(",") || "-";
    return `${fiche.id}\t${fiche.system}\t${fiche.title}\troutes=${routeSummary}\tsurfaces=${surfaces}\t${fiche.summary}`;
  }).join("\n");
}

function formatSurfaceParity(node: ClawPersistentSurfaceNode): string {
  const human = node.humanSurfaces?.join("+") ?? "-";
  const programmatic = node.programmaticSurfaces?.join("+") ?? "-";
  const gaps = node.surfaceGaps?.map((gap) => `${gap.surface}:${gap.status}`).join(",") ?? "-";
  return `human=${human};programmatic=${programmatic};gaps=${gaps}`;
}

function inspectJsonMeta(subcommand: string, extra: CliJsonMeta = {}): CliJsonMeta {
  return {
    schemaVersion: 1,
    canonicalCommand: "inspect",
    subcommand,
    ...extra,
  };
}

function renderInspectMarkdown(nodes = inspectNodes()): string {
  const edges = clawPersistentSurfaceRegistry.edges ?? [];
  const routes = clawPersistentSurfaceRegistry.routes ?? [];
  const fiches = listClawCapabilityFiches();
  const lines = [
    "# Claw stable surface",
    "",
    "Generated from `claw inspect render --format markdown`. Do not edit by hand.",
    "Use `claw inspect --manifest <path>` or `CLAW_INSPECT_MANIFEST=path[,path...]` to fuse static manifests from other language builders during inspection.",
    "`claw inspect why <surface>` explains the docs, ADRs, tests, and source backing a CLI command or registered surface.",
    "",
    "## Tree",
    "",
    "```mermaid",
    renderInspectMermaid(nodes, edges),
    "```",
    "",
    "## Routes",
    "",
    "| ID | From | To | Visibility | Validation | Narrative |",
    "| --- | --- | --- | --- | --- | --- |",
    ...routes.map((route) => `| \`${route.id}\` | \`${route.fromId}\` | \`${route.toId}\` | ${route.visibility} | ${route.validation} | ${route.surfaceNarrative?.concept ?? ""} |`),
    "",
    "## Capability Fiches",
    "",
    "| ID | System | Routes | Resources | Permissions | Gaps |",
    "| --- | --- | --- | --- | --- | --- |",
    ...fiches.map((fiche) => `| \`${fiche.id}\` | ${fiche.system} | ${fiche.routes.map((route) => `\`${route}\``).join("<br>") || ""} | ${fiche.touchedResources.map((resource) => `\`${resource}\``).join("<br>")} | ${fiche.permissions.join("<br>")} | ${fiche.gaps.map((gap) => `${gap.area}:${gap.status}`).join("<br>")} |`),
    "",
    "## Edges",
    "",
    "| ID | Type | From | To | Contract | Transport |",
    "| --- | --- | --- | --- | --- | --- |",
    ...edges.map((edge) => `| \`${edge.id}\` | ${edge.type} | \`${edge.fromId}\` | \`${edge.toId}\` | \`${edge.contractId ?? ""}\` | ${edge.transport ?? ""} |`),
    "",
    "## Nodes",
    "",
    "| ID | Kind | Surface | Owner | Human | Programmatic | Gaps | Narrative | Path / Key / Value |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const node of nodes) {
    const gaps = node.surfaceGaps?.map((gap) => `${gap.surface}:${gap.status}`).join("<br>") ?? "";
    lines.push(`| \`${node.id}\` | ${node.kind} | ${node.surfaceClass ?? "persistent"} | ${node.owner} | ${node.humanSurfaces?.join(", ") ?? ""} | ${node.programmaticSurfaces?.join(", ") ?? ""} | ${gaps} | ${node.surfaceNarrative?.concept ?? ""} | \`${node.path ?? node.route ?? node.key ?? node.value ?? ""}\` |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderInspectMermaid(nodes = inspectNodes(), edges: ClawSurfaceEdge[] = clawPersistentSurfaceRegistry.edges ?? []): string {
  const lines = ["flowchart TD"];
  for (const node of nodes) {
    const label = `${node.name}\\n${node.kind}`;
    lines.push(`  ${mermaidId(node.id)}["${label.replace(/"/g, "'")}"]`);
    if (node.parentId) lines.push(`  ${mermaidId(node.parentId)} --> ${mermaidId(node.id)}`);
  }
  for (const edge of edges) {
    lines.push(`  ${mermaidId(edge.fromId)} -- "${edge.type}" --> ${mermaidId(edge.toId)}`);
  }
  return lines.join("\n");
}

function mermaidId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

interface RemoteInspectEvidenceOptions {
  generatedAt?: string;
  reviewedSourceQaIds?: string[];
  sourceQaReviews?: RemoteSourceQaReviewItem[];
  evidence?: RemoteExternalValidationEvidence[];
  evidenceArtifact?: unknown;
}

function buildRemoteInspectPayload(nodes: ClawPersistentSurfaceNode[], routes: ClawSurfaceRoute[], options: RemoteInspectEvidenceOptions = {}) {
  const routeIds = routes.map((route) => route.id);
  const nodeIds = nodes.map((node) => node.id);
  const remoteNodes = nodes.filter((node) => node.programmaticSurfaces?.includes("relay") || node.surfaceGaps?.some((gap) => gap.surface === "relay"));
  const remoteRoutes = routes.filter((route) => route.id.startsWith("remote.") || route.id.startsWith("sync.") || route.id.startsWith("gateway.") || route.id.startsWith("mesh."));
  const tests = [...new Set(remoteRoutes.flatMap((route) => route.tests ?? []))].sort();
  const validationOptions = {
    generatedAt: options.generatedAt,
    reviewedSourceQaIds: options.reviewedSourceQaIds ?? [],
    sourceQaReviews: options.sourceQaReviews ?? [],
    evidence: options.evidence ?? [],
    evidenceArtifact: options.evidenceArtifact,
  };
  const conformance = buildRemoteConformanceReport({ routeIds, nodeIds });
  const sourceQaReviewTemplate = buildRemoteSourceQaReviewTemplate({ generatedAt: options.generatedAt });
  const closureGate = buildRemoteGoalClosureGate(validationOptions);
  const decisionReview = buildRemoteDecisionReview({ ...validationOptions, routeIds, nodeIds });
  return {
    schemaVersion: 1,
    conformance,
    decisionReview,
    classifications: remoteNodes.map((node) => {
      const nodeRoutes = routes.filter((route) => route.fromId === node.id || route.toId === node.id || route.steps.some((step) => step.fromId === node.id || step.toId === node.id));
      return {
        id: node.id,
        name: node.name,
        owner: node.owner,
        classification: node.programmaticSurfaces?.includes("relay")
          ? "remote-safe"
          : node.surfaceGaps?.find((gap) => gap.surface === "relay")?.status ?? "pending",
        routeIds: nodeRoutes.map((route) => route.id),
        gaps: node.surfaceGaps?.filter((gap) => gap.surface === "relay") ?? [],
        tests: [...new Set(nodeRoutes.flatMap((route) => route.tests ?? []))].sort(),
      };
    }),
    sync: {
      authorityClasses: ["primary", "replica", "cache", "mirror", "joint"],
      drivers: [...syncDriverSchema.options],
      driverCatalog: buildSyncDriverCatalog({ registeredRouteIds: routeIds }),
      conflictDefault: "detect_and_elevate",
      receiptContracts: ["SyncResourceManifest", "SyncDriverApplicationReceipt", "SyncAuthorityHandoffReceipt", "RemoteClientCacheSnapshot"],
      routeIds: routeIds.filter((routeId) => routeId.startsWith("sync.")),
      writes: false,
    },
    transport: {
      contract: "transport_agnostic_iroh_v1_adapter",
      adapterNodeId: "claw.transport.iroh",
      trustModes: ["sovereign_e2e_tunnel", "governed_gateway"],
      receiptContract: "RemoteTransportHandshakeReceipt",
      writes: false,
    },
    offlineCommand: buildRemoteOfflineCommandResult({
      routeId: "remote.chatGateway",
      actor: {
        actorKind: "human",
        actorId: "user.local",
        nodeId: "node.local",
        transport: "gateway",
        trustMode: "governed_gateway",
      },
      evaluatedAt: "2026-05-17T10:06:00.000Z",
    }),
    gaps: buildRemoteExternalPendingRegister().requirements,
    externalValidationChecklist: buildRemoteExternalValidationChecklist({ generatedAt: options.generatedAt }),
    externalValidationEvidenceTemplate: buildRemoteExternalValidationEvidenceTemplate({ generatedAt: options.generatedAt }),
    externalValidationReadiness: buildRemoteExternalValidationReadiness(validationOptions),
    externalValidationApprovalRequest: buildRemoteExternalValidationApprovalRequest(validationOptions),
    externalValidationReport: buildRemoteExternalValidationReport({
      generatedAt: options.generatedAt,
      evidence: validationOptions.evidence,
      evidenceArtifact: validationOptions.evidenceArtifact,
    }),
    sourceQaReviewTemplate,
    closureGate,
    providerDeviceE2EPlan: buildRemoteProviderDeviceE2EValidationPlan({ requiredRouteIds: remoteSyncRequiredRouteIds }),
    routeContracts: buildRemoteRouteContractCatalog({ registeredRouteIds: routeIds }).contracts,
    tests,
  };
}

function readJsonFlagValue(value: string | undefined, filePath: string | undefined, cwd: string): string | undefined {
  return value ?? (filePath ? fs.readFileSync(path.resolve(cwd, filePath), "utf8") : undefined);
}

function parseInspectExternalValidationEvidence(value: string | undefined, filePath: string | undefined, cwd: string): RemoteExternalValidationEvidence[] {
  const raw = readJsonFlagValue(value, filePath, cwd);
  return raw ? parseRemoteExternalValidationEvidenceInput(JSON.parse(raw) as unknown) : [];
}

function parseInspectExternalValidationEvidenceArtifact(value: string | undefined, filePath: string | undefined, cwd: string): unknown | undefined {
  const raw = readJsonFlagValue(value, filePath, cwd);
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray((parsed as { evidence?: unknown }).evidence) && "sourceConversationId" in parsed && "sourcePlanId" in parsed && "approvalRequestId" in parsed
    ? parsed
    : undefined;
}

function parseInspectSourceQaReviews(value: string | undefined, filePath: string | undefined, cwd: string): RemoteSourceQaReviewItem[] {
  const raw = readJsonFlagValue(value, filePath, cwd);
  return raw ? parseRemoteSourceQaReviewInput(JSON.parse(raw) as unknown) : [];
}

function parseInspectListFlag(value: string | undefined): string[] {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function inspectCustomAppSdkPayload() {
  return {
    cliRole: "inspection_validation_fallback_json",
    richUiRuntime: "sdk_host_bridge_not_cli_process",
    ...buildCustomAppSDKInspectionPayload(),
  };
}

async function runInspectCliUnsafe(input: InspectCliInput): Promise<number> {
  const [, command = "tree", target] = input.positionals;
  const registry = inspectRegistry(input);
  const nodes = withSurfaceChildren(registry.nodes);
  const edges = registry.edges ?? [];
  const routes = registry.routes ?? [];
  const edgesForNode = (nodeId: string) => ({
    incomingEdges: edges.filter((edge) => edge.toId === nodeId),
    outgoingEdges: edges.filter((edge) => edge.fromId === nodeId),
  });
  const routesForNode = (nodeId: string) => routes.filter((route) => route.fromId === nodeId || route.toId === nodeId || route.steps.some((step) => step.fromId === nodeId || step.toId === nodeId));
  const selectByKinds = (kinds: string[]) => nodes.filter((node) => kinds.includes(node.kind));
  const selectBySurface = (surfaceClass: string) => nodes.filter((node) => node.surfaceClass === surfaceClass);
  if (command === "tree") {
    const payload = { version: registry.version, nodes };
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(payload.nodes)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "list") {
    const listed = inspectList(target ?? "/", nodes);
    if (listed.length === 0 && target && target !== "/") {
      throw new InspectCliError("inspect_not_found", `No persistent surface node found for ${target}.`, CLI_EXIT_USAGE);
    }
    if (input.wantsJson) writeJsonOk(input.context.stdout, listed, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(listed)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "show") {
    if (!target) throw new InspectCliError("usage_error", `Usage: ${input.binName} inspect show <id-or-path> [--json]`, CLI_EXIT_USAGE);
    const node = inspectFind(target, nodes);
    if (!node) throw new InspectCliError("inspect_not_found", `No persistent surface node found for ${target}.`, CLI_EXIT_USAGE);
    if (input.wantsJson) writeJsonOk(input.context.stdout, { ...node, ...edgesForNode(node.id), routes: routesForNode(node.id), evidence: surfaceEvidence(node, edges, routes, input.binName) }, inspectJsonMeta(command));
    else {
      const routeSummary = routesForNode(node.id).map((route) => route.id).join(", ") || "-";
      input.context.stdout.write(`${inspectText([node])}\nroutes\t${routeSummary}\n`);
    }
    return CLI_EXIT_OK;
  }
  if (command === "neighbors") {
    if (!target) throw new InspectCliError("usage_error", `Usage: ${input.binName} inspect neighbors <id-or-path> [--json]`, CLI_EXIT_USAGE);
    const node = inspectFind(target, nodes);
    if (!node) throw new InspectCliError("inspect_not_found", `No persistent surface node found for ${target}.`, CLI_EXIT_USAGE);
    const nodeEdges = edgesForNode(node.id);
    const neighborIds = [...new Set([...nodeEdges.incomingEdges.map((edge) => edge.fromId), ...nodeEdges.outgoingEdges.map((edge) => edge.toId)])];
    const neighbors = neighborIds.map((id) => nodes.find((candidate) => candidate.id === id)).filter((candidate): candidate is ClawPersistentSurfaceNode => Boolean(candidate));
    const payload = { node, ...nodeEdges, neighbors, routes: routesForNode(node.id) };
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command, { surfaceId: node.id }));
    else input.context.stdout.write(`${inspectText(neighbors)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "routes") {
    const selected = target ? routes.filter((route) => route.id === target || route.fromId === target || route.toId === target || route.steps.some((step) => step.fromId === target || step.toId === target)) : routes;
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectRouteText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "capabilities") {
    const fiches = listClawCapabilityFiches();
    const selected = target ? fiches.filter((fiche) => fiche.id === target || fiche.system === target || fiche.routes.includes(target)) : fiches;
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectCapabilityFicheText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "capability") {
    if (!target) throw new InspectCliError("usage_error", `Usage: ${input.binName} inspect capability <capability-id> [--json]`, CLI_EXIT_USAGE);
    const fiche = getClawCapabilityFiche(target);
    if (!fiche) throw new InspectCliError("inspect_not_found", `No capability fiche found for ${target}.`, CLI_EXIT_USAGE);
    if (input.wantsJson) writeJsonOk(input.context.stdout, fiche, inspectJsonMeta(command, { capabilityId: fiche.id }));
    else input.context.stdout.write(`${inspectCapabilityFicheText([fiche])}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "maturity") {
    const entries = listClawCapabilityMaturityEntries();
    const selected = target ? entries.filter((entry) => entry.id === target || entry.parentId === target || entry.maturity === target) : entries;
    const payload = {
      version: 1,
      profileOrder: ["stable", "beta", "experimental", "dev"],
      maturityOrder: ["incomplete", "experimental", "beta", "stable"],
      defaultMaturity: "incomplete",
      blockedCode: "maturity_blocked",
      audit: auditClawCapabilityMaturityRegistry(),
      entries: selected,
    };
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command));
    else input.context.stdout.write(`${selected.map((entry) => `${entry.id}\t${entry.maturity}\t${entry.activationPolicy}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "route") {
    if (!target) throw new InspectCliError("usage_error", `Usage: ${input.binName} inspect route <route-id> [--json]`, CLI_EXIT_USAGE);
    const route = routes.find((candidate) => candidate.id === target);
    if (!route) throw new InspectCliError("inspect_not_found", `No surface route found for ${target}.`, CLI_EXIT_USAGE);
    const routeEdges = route.steps.map((step) => step.edgeId ? edges.find((edge) => edge.id === step.edgeId) : undefined).filter((edge): edge is ClawSurfaceEdge => Boolean(edge));
    const payload = { ...route, edges: routeEdges };
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command, { routeId: route.id }));
    else input.context.stdout.write(`${inspectRouteText([route])}\n${inspectEdgeText(routeEdges)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "agent") {
    if (!target) throw new InspectCliError("usage_error", `Usage: ${input.binName} inspect agent <agent-id> [--json]`, CLI_EXIT_USAGE);
    const fiche = await buildAgentInspectFiche(input, target, routes);
    if (input.wantsJson) writeJsonOk(input.context.stdout, fiche, inspectJsonMeta(command, { agentId: target }));
    else input.context.stdout.write(inspectAgentText(fiche));
    return CLI_EXIT_OK;
  }
  if (command === "edges") {
    const selected = target ? edges.filter((edge) => edge.id === target || edge.fromId === target || edge.toId === target) : edges;
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectEdgeText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "database") {
    const selected = nodes.filter((node) => node.kind === "database" || node.kind === "sidecar" || node.databaseId);
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "storage") {
    const selected = nodes.filter((node) => ["root", "folder", "file", "socket", "statusFile", "retiredPath", "externalReadOnlySource"].includes(node.kind));
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "prefs") {
    const selected = nodes.filter((node) => node.kind === "preferenceKey" || node.kind === "appStorageKey" || node.kind === "browserStorageKey");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "custom-app-sdk") {
    const payload = inspectCustomAppSdkPayload();
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command));
    else {
      input.context.stdout.write(`${payload.capabilities.map((capability) => `${capability.id}\t${capability.inputSchemaRef}\t${capability.outputSchemaRef}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }
  if (command === "contracts" || command === "stable" || command === "compat") {
    const selected = nodes.filter((node) => node.surfaceClass && node.surfaceClass !== "persistent");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "apis") {
    const selected = selectByKinds(["apiRoute", "privateApiRoute", "apiMethod", "apiParameter", "webhook", "webhookEvent", "deepLink", "hostname", "port"]);
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "private-apis") {
    const selected = selectByKinds(["privateApiRoute"]);
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "env") {
    const selected = selectByKinds(["envVar", "envOverride"]);
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "packages") {
    const selected = selectBySurface("package");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "native") {
    const selected = selectBySurface("native");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "formats") {
    const selected = selectBySurface("format");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "provider-mappings") {
    const selected = selectByKinds(["externalDependency", "externalMapping"]);
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "protocols") {
    const selected = selectBySurface("protocol");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "events") {
    const selected = selectBySurface("event");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "schemas") {
    const selected = selectBySurface("schema");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "ids") {
    const selected = selectBySurface("id");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "cli") {
    const selected = selectBySurface("cli");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "surfaces" || command === "surface-parity") {
    const selected = nodes.filter((node) => node.humanSurfaces?.length || node.programmaticSurfaces?.length || node.surfaceGaps?.length);
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "remote" || command === "remote-sync") {
    const evidenceFile = input.flags["evidence-file"] ?? input.flags["external-validation-file"];
    const payload = buildRemoteInspectPayload(nodes, routes, {
      generatedAt: input.flags.now,
      reviewedSourceQaIds: parseInspectListFlag(input.flags["reviewed-source-qa-ids"] ?? input.flags["source-qa-ids"]),
      sourceQaReviews: parseInspectSourceQaReviews(input.flags["source-qa-review-json"], input.flags["source-qa-review-file"], input.context.cwd),
      evidence: parseInspectExternalValidationEvidence(input.flags["evidence-json"], evidenceFile, input.context.cwd),
      evidenceArtifact: parseInspectExternalValidationEvidenceArtifact(input.flags["evidence-json"], evidenceFile, input.context.cwd),
    });
	    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command));
	    else input.context.stdout.write([
	      `conformance\t${payload.conformance.status}`,
	      `decisionReview\t${payload.decisionReview.status} ${payload.decisionReview.reviewedCount}/${payload.decisionReview.requiredCount} implemented=${payload.decisionReview.implementedCount} external=${payload.decisionReview.externalPendingCount} blockers=${payload.decisionReview.blockers.join(",") || "-"}`,
	      `validationReadiness\t${payload.externalValidationReadiness.status} sourceQa=${payload.externalValidationReadiness.sourceQaReviewStatus} evidence=${payload.externalValidationReadiness.externalValidationStatus} blockers=${payload.externalValidationReadiness.closureGateBlockers.join(",") || "-"}`,
	      `approvalRequest\t${payload.externalValidationApprovalRequest.status} readiness=${payload.externalValidationApprovalRequest.readinessStatus} approved=${payload.externalValidationApprovalRequest.approved}`,
	      `closureGate\t${payload.closureGate.status} sourceQa=${payload.closureGate.sourceQaReviewStatus} blockers=${payload.closureGate.blockers.join(",") || "-"} finalReread=required`,
	      `classifications\t${payload.classifications.length}`,
	      `syncDrivers\t${payload.sync.drivers.length}`,
	      `transport\t${payload.transport.contract}`,
      `gaps\t${payload.gaps.length}`,
      `routeContracts\t${payload.routeContracts.length}`,
    ].join("\n") + "\n");
    return CLI_EXIT_OK;
  }
  if (command === "version-governance" || command === "versioning") {
    const policyNode = nodes.find((node) => node.id === clawPreV1VersionGovernancePolicy.inspections.surfaceId);
    const payload = {
      ...clawPreV1VersionGovernancePolicy,
      surface: policyNode ?? null,
    };
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command));
    else {
      input.context.stdout.write([
        `phase\t${payload.phase}`,
        `branchPolicy\t${payload.branchPolicy}`,
        `sourceOfTruth\t${payload.sourceOfTruth}`,
        `freezeTrigger\t${payload.freezeTrigger.kind}`,
        `approvalGate\t${payload.approvalGate.decisionAuthority}`,
        `changesets\t${payload.changesets.mode}`,
      ].join("\n") + "\n");
    }
    return CLI_EXIT_OK;
  }
  if (command === "evolution") {
    const payload = {
      policy: clawEvolutionPolicy,
      surfaces: nodes.filter((node) => [
        "claw.contracts.evolution",
        "claw.schema.evolutionRecord.v1",
        "claw.cli.command.evolution",
        "claw.workspace.evolution",
      ].includes(node.id)),
    };
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command));
    else {
      input.context.stdout.write([
        `sourceOfTruth\t${payload.policy.sourceOfTruth}`,
        `postV1Migration\t${payload.policy.postV1Migration}`,
        `rescueCore\t${payload.policy.rescueCore}`,
        `ledger\t${payload.policy.ledger.baseline}`,
      ].join("\n") + "\n");
    }
    return CLI_EXIT_OK;
  }
  if (command === "governance") {
    const sample = {
      hierarchyDoesNotGrantRead: evaluateGovernanceAccess({
        request: { principalId: "user.demo", capability: "read", scope: { kind: "project", id: "project.demo" }, resource: { type: "memory", id: "project.demo" } },
        authorityEdges: [{ id: "edge.member", from: { kind: "principal", id: "user.demo" }, to: { kind: "entity", id: "org.demo" }, relation: "member", scope: { kind: "entity", id: "org.demo" } }],
        scopeHierarchy: [{ parent: { kind: "entity", id: "org.demo" }, child: { kind: "project", id: "project.demo" } }],
      }),
      controlWithoutRead: evaluateGovernanceAccess({
        request: { principalId: "manager.demo", capability: "budget_control", scope: { kind: "project", id: "project.demo" }, resource: { type: "policy" } },
        grants: [{ id: "grant.control", subject: { kind: "principal", id: "manager.demo" }, capabilities: ["control"], scope: { kind: "project", id: "project.demo" } }],
      }),
      delegationIntersection: evaluateGovernanceDelegation({
        delegator: {
          request: { principalId: "parent.agent", capability: "read", scope: { kind: "project", id: "project.demo" }, resource: { type: "memory", id: "project.demo" } },
          grants: [{ id: "grant.parent", subject: { kind: "principal", id: "parent.agent" }, capabilities: ["read"], scope: { kind: "project", id: "project.demo" }, resource: { type: "memory", id: "project.demo" } }],
        },
        delegatee: {
          request: { principalId: "child.agent", capability: "read", scope: { kind: "project", id: "project.demo" }, resource: { type: "memory", id: "project.demo" } },
          grants: [{ id: "grant.child", subject: { kind: "principal", id: "child.agent" }, capabilities: ["read"], scope: { kind: "project", id: "project.demo" }, resource: { type: "memory", id: "project.demo" } }],
        },
      }),
      bindingSummary: summarizeGovernanceBindings([
        { id: "binding.project", resource: { type: "project", id: "project.demo" }, scope: { kind: "project", id: "project.demo" }, steward: { kind: "principal", id: "user.demo" }, dataClass: "private" },
      ]),
    };
    const payload = {
      model: {
        principalKinds: GOVERNANCE_PRINCIPAL_KINDS,
        entityKinds: GOVERNANCE_ENTITY_KINDS,
        scopeKinds: GOVERNANCE_SCOPE_KINDS,
        capabilities: GOVERNANCE_CAPABILITIES,
      },
      invariants: [
        "technical isolation identifiers are not authority",
        "owner is not authority",
        "business data identifiers are not access control",
        "membership and hierarchy do not imply read access",
        "restrictions inherit down scope hierarchy",
        "control does not imply read",
        "delegation is strict intersection",
      ],
      functions: [
        "evaluateGovernanceAccess",
        "evaluateGovernanceDelegation",
        "summarizeGovernanceBindings",
      ],
      tests: ["packages/clawjs-core/src/governance.test.ts"],
      sample,
    };
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command));
    else input.context.stdout.write(`${payload.invariants.join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "commands") {
    const includeAdvanced = "all" in input.flags || input.flags.all === "true";
    const commands = listClawCliCommands({ includeAdvanced });
    if (input.wantsJson) {
      writeJsonOk(input.context.stdout, {
        version: registry.version,
        includeAdvanced,
        commands,
      }, inspectJsonMeta(command));
    } else {
      input.context.stdout.write(`${commands.map((entry) => `${entry.name}\t${entry.kind}\t${entry.support.state}\t${entry.securityPolicy}\t${entry.summary}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }
  if (command === "command-intents") {
    const intents = listClawCliCommandIntentRegistry();
    const payload = {
      schemaVersion: 1,
      statuses: CLAW_CLI_COMMAND_INTENT_STATUSES,
      registryIntents: intents,
      ledgerSurfaceId: "claw.workspace.command_intents.ledger",
      routeId: "cli.commandIntentResolution",
    };
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command));
    else input.context.stdout.write(`${intents.map((entry) => `${entry.id}\t${entry.status}\t${entry.phrase}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "debt-ledger" || command === "debt") {
    const payload = buildClawDebtLedger({ rootDir: input.flags.root || input.context.cwd, generatedAt: input.flags.now });
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command));
    else {
      input.context.stdout.write([
        `mode\t${payload.mode}`,
        `entries\t${payload.entries.length}`,
        `sources\t${payload.sources.length}`,
        `warnings\t${payload.audit.warnings.length}`,
        `unindexedCandidates\t${payload.audit.unindexedCandidates.length}`,
        `privateSummary\t${payload.audit.privateSummary.included ? "included" : "excluded"}`,
      ].join("\n") + "\n");
    }
    return CLI_EXIT_OK;
  }
  if (command === "dense-data") {
    const payload = {
      schemaVersion: 1,
      registry: clawProfessionalRecordsOsRegistry,
      gapCount: listClawProfessionalRecordsGapRegistryEntries().length,
      intentCount: listClawProfessionalRecordsIntentEntries().length,
      semanticViewCount: listClawProfessionalRecordsSemanticViewEntries().length,
    };
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command));
    else input.context.stdout.write(`${clawProfessionalRecordsOsRegistry.systems.map((system) => `${system.id}\t${system.wave}\t${system.canonicalCommand}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "dense-gaps") {
    const gaps = listClawProfessionalRecordsGapRegistryEntries();
    const payload = {
      schemaVersion: 1,
      statuses: clawProfessionalRecordsOsRegistry.intentStatuses,
      gaps,
    };
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command));
    else input.context.stdout.write(`${gaps.map((entry) => `${entry.id}\t${entry.status}\t${entry.source}\t${entry.phrase ?? entry.requirementId ?? entry.command ?? "policy"}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "dense-intents") {
    const intents = listClawProfessionalRecordsIntentEntries();
    const payload = {
      schemaVersion: 1,
      statuses: clawProfessionalRecordsOsRegistry.intentStatuses,
      intents,
    };
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command));
    else input.context.stdout.write(`${intents.map((entry) => `${entry.id}\t${entry.status}\t${entry.phrase}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "dense-views") {
    const semanticViews = listClawProfessionalRecordsSemanticViewEntries();
    const payload = {
      schemaVersion: 1,
      semanticViews,
    };
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command));
    else input.context.stdout.write(`${semanticViews.map((entry) => `${entry.id}\t${entry.systemId}\t${entry.commandPattern}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "dense-fixtures") {
    if (input.wantsJson) writeJsonOk(input.context.stdout, clawProfessionalRecordsAcceptanceFixture, inspectJsonMeta(command));
    else input.context.stdout.write(`${clawProfessionalRecordsAcceptanceFixture.records.map((entry) => `${entry.id}\t${entry.collectionName}\t${entry.label}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "codebase") {
    const manifest = filterCodebaseManifest(readCodebaseManifest(input), input);
    if (input.wantsJson) writeJsonOk(input.context.stdout, manifest, inspectJsonMeta(command));
    else {
      const summary = (manifest as { summary?: { files?: number; tests?: number; entrypoints?: number } }).summary ?? {};
      input.context.stdout.write(`files\t${summary.files ?? 0}\ntests\t${summary.tests ?? 0}\nentrypoints\t${summary.entrypoints ?? 0}\n`);
    }
    return CLI_EXIT_OK;
  }
  if (command === "connectors") {
    const catalog = readConnectorCatalog(input);
    if (input.wantsJson) writeJsonOk(input.context.stdout, catalog, inspectJsonMeta(command));
    else {
      const summary = (catalog as { summary?: { apps?: number; operations?: number; supportedOperations?: number; completeExternalSchemas?: number } }).summary ?? {};
      input.context.stdout.write(`apps=${summary.apps ?? 0} operations=${summary.operations ?? 0} supported=${summary.supportedOperations ?? 0} completeExternalSchemas=${summary.completeExternalSchemas ?? 0}\n`);
    }
    return CLI_EXIT_OK;
  }
  if (command === "aliases") {
    const aliases = listClawCliAliases();
    if (input.wantsJson) writeJsonOk(input.context.stdout, {
      version: registry.version,
      aliases,
    }, inspectJsonMeta(command));
    else input.context.stdout.write(`${aliases.map((alias) => `${alias.alias}\t${alias.canonicalName}\t${alias.source}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "why") {
    if (!target) throw new InspectCliError("usage_error", `Usage: ${input.binName} inspect why <command-or-id> [--json]`, CLI_EXIT_USAGE);
    const cliCommand = resolveClawCliCommand(target);
    if (cliCommand) {
      const payload = {
        type: "cliCommand",
        name: cliCommand.name,
        canonicalName: cliCommand.target ?? cliCommand.name,
        kind: cliCommand.kind,
        summary: cliCommand.summary,
        support: cliCommand.support,
        securityPolicy: cliCommand.securityPolicy,
        schemaVersion: cliCommand.schemaVersion,
        jsonSchemaId: cliCommand.jsonSchemaId,
        docs: cliCommand.docs,
        adrs: cliCommand.adrs,
        tests: cliCommand.tests,
        source: cliCommand.source,
      };
      if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command, { canonicalName: payload.canonicalName }));
      else {
        input.context.stdout.write([
          `${payload.name}\t${payload.kind}\t${payload.securityPolicy}`,
          `docs\t${payload.docs.join(", ")}`,
          `adrs\t${payload.adrs.join(", ")}`,
          `tests\t${payload.tests.join(", ")}`,
          `source\t${payload.source.file}${payload.source.symbol ? `#${payload.source.symbol}` : ""}`,
        ].join("\n") + "\n");
      }
      return CLI_EXIT_OK;
    }
    const node = inspectFind(target, nodes);
    if (node) {
      const payload = {
        type: "surfaceNode",
        id: node.id,
        name: node.name,
        kind: node.kind,
        surfaceClass: node.surfaceClass ?? "persistent",
        source: node.source,
        notes: node.notes,
        warnings: node.warnings ?? [],
      };
      if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command, { surfaceId: node.id }));
      else input.context.stdout.write(`${node.id}\t${node.kind}\t${node.source?.file ?? "source-unregistered"}\n${node.notes ?? ""}\n`);
      return CLI_EXIT_OK;
    }
    const related = searchClawCliRegistry(target, { limit: 5 });
    throw new InspectCliError("inspect_not_found", `No CLI command or persistent surface node found for ${target}.${related.length ? ` Related: ${related.map((entry) => entry.name).join(", ")}` : ""}`, CLI_EXIT_USAGE);
  }
  if (command === "external") {
    const selected = selectBySurface("external");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "render") {
    const format = input.flags.format ?? "markdown";
    if (format === "mermaid") {
      input.context.stdout.write(`${renderInspectMermaid(nodes, edges)}\n`);
      return CLI_EXIT_OK;
    }
    if (format === "markdown") {
      input.context.stdout.write(renderInspectMarkdown(nodes));
      return CLI_EXIT_OK;
    }
    throw new InspectCliError("usage_error", `Unsupported inspect render format: ${format}`, CLI_EXIT_USAGE);
  }
  throw new InspectCliError("usage_error", `Usage: ${input.binName} inspect tree|list|show|neighbors|routes|route|capabilities|capability|maturity|agent|edges|why|commands|command-intents|debt-ledger|remote|remote-sync|version-governance|evolution|governance|dense-data|dense-gaps|dense-intents|dense-views|dense-fixtures|codebase|connectors|aliases|database|storage|prefs|custom-app-sdk|contracts|apis|protocols|events|schemas|ids|cli|surfaces|external|render`, CLI_EXIT_USAGE);
}

export async function runInspectCli(input: InspectCliInput): Promise<number> {
  try {
    return await runInspectCliUnsafe(input);
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (input.wantsJson) writeJsonError(input.context.stdout, new CliHandledError(handled.code, handled.message, handled.exitCode), inspectJsonMeta(input.positionals[1] ?? "tree"));
    else input.context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }
}
