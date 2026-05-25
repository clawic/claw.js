import fs from "fs";
import path from "path";

import {
  NEED_OPPORTUNITY_KINDS,
  NEED_SCENARIO_GENERATION_MODES,
  NEED_ROUTE_MATURITY_STATES,
  dedupeNeedOpportunities,
  evaluateNeedRoutes,
  generateNeedRoutes,
  listNeedCapabilityGraph,
  listNeedDimensions,
  listNeedRoutePilotPacks,
  planNeedRouteGeneration,
  resolveClawPersistentSurfacePath,
} from "@clawjs/core";
import type {
  NeedOpportunity,
  NeedRoute,
  NeedRouteEvaluation,
  NeedScenarioGenerationMode,
} from "@clawjs/core";

import { CliHandledError, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { formatCliTable, readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";

interface NeedsCliInput {
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    cwd: string;
  };
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
}

interface NeedRouteLedger {
  schemaVersion: 1;
  routes: NeedRoute[];
  evaluations: NeedRouteEvaluation[];
  opportunities: NeedOpportunity[];
  updatedAt: string;
}

export async function runNeedsCli(input: NeedsCliInput): Promise<number> {
  const action = input.positionals[1];
  const subaction = input.positionals[2];
  if (!action) return writeNeedsUsage(input);

  if (action === "dimensions") {
    return writeNeedsResult(input, {
      dimensions: listNeedDimensions(),
      capabilityGraph: listNeedCapabilityGraph(),
      generationModes: NEED_SCENARIO_GENERATION_MODES,
      maturityStates: NEED_ROUTE_MATURITY_STATES,
      opportunityKinds: NEED_OPPORTUNITY_KINDS,
    });
  }

  if (action === "pilots") {
    return writeNeedsResult(input, { pilotPacks: listNeedRoutePilotPacks() });
  }

  if (action === "generate") {
    const generation = planNeedRouteGeneration({ pilotPackId: input.flags.pilot, limit: parseLimit(input), mode: parseGenerationMode(input) });
    const routes = input.flags.route
      ? generation.routes.filter((candidate) => candidate.id === input.flags.route)
      : generation.routes;
    if (input.flags.route && routes.length === 0) throw new CliHandledError("route_not_found", `No need route found for ${input.flags.route}.`, CLI_EXIT_USAGE);
    return writeNeedsResult(input, {
      generation: { ...generation, routes },
      routes,
      save: maybeSaveEvaluations(input, routes, []),
    });
  }

  if (action === "evaluate") {
    const routes = selectRoutes(input);
    const evaluations = evaluateNeedRoutes(routes);
    return writeNeedsResult(input, {
      evaluations,
      opportunities: dedupeNeedOpportunities(evaluations.flatMap((evaluation) => evaluation.opportunities)),
      save: maybeSaveEvaluations(input, routes, evaluations),
    });
  }

  if (action === "opportunities") {
    if (subaction === "list" || !subaction) {
      const ledger = readNeedRouteLedger(input.workspaceRoot);
      const opportunities = dedupeNeedOpportunities(ledger.opportunities).unique;
      return writeNeedsResult(input, { opportunities, ledgerPath: needRouteLedgerPath(input.workspaceRoot) });
    }
    if (subaction === "show") {
      const id = input.positionals[3] || input.flags.id;
      if (!id) throw new CliHandledError("missing_opportunity_id", `Usage: ${input.binName} needs opportunities show <id>`, CLI_EXIT_USAGE);
      const opportunity = readNeedRouteLedger(input.workspaceRoot).opportunities.find((entry) => entry.id === id);
      if (!opportunity) throw new CliHandledError("opportunity_not_found", `No need opportunity found for ${id}.`, CLI_EXIT_USAGE);
      return writeNeedsResult(input, { opportunity, ledgerPath: needRouteLedgerPath(input.workspaceRoot) });
    }
    if (subaction === "dedupe") {
      const ledger = readNeedRouteLedger(input.workspaceRoot);
      return writeNeedsResult(input, { opportunities: dedupeNeedOpportunities(ledger.opportunities), ledgerPath: needRouteLedgerPath(input.workspaceRoot) });
    }
    if (subaction === "promote") {
      const id = input.positionals[3] || input.flags.id;
      if (!id) throw new CliHandledError("missing_opportunity_id", `Usage: ${input.binName} needs opportunities promote <id> [--to report]`, CLI_EXIT_USAGE);
      const opportunity = readNeedRouteLedger(input.workspaceRoot).opportunities.find((entry) => entry.id === id);
      if (!opportunity) throw new CliHandledError("opportunity_not_found", `No need opportunity found for ${id}.`, CLI_EXIT_USAGE);
      return writeNeedsResult(input, {
        promotion: buildPromotionPacket(input, opportunity),
        destructiveActionsAllowed: false,
        requiresApproval: true,
      });
    }
  }

  return writeNeedsUsage(input);
}

function writeNeedsUsage(input: NeedsCliInput): number {
  const usage = [
    `Usage: ${input.binName} needs dimensions|pilots|generate|evaluate|opportunities [options]`,
    "",
    "Commands:",
    "  needs dimensions --json",
    "  needs pilots --json",
    "  needs generate --pilot agent_workflow --limit 4 --json",
    "  needs evaluate --pilot iot_home --dry-run --save --json",
    "  needs opportunities list|show|dedupe|promote --json",
  ].join("\n");
  input.context.stderr.write(`${usage}\n`);
  return CLI_EXIT_USAGE;
}

function writeNeedsResult(input: NeedsCliInput, data: unknown): number {
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "needs", data, {
      subcommand: input.positionals[1] ?? null,
      operation: input.positionals[2] ?? null,
    });
    return CLI_EXIT_OK;
  }
  if (isDimensionPayload(data)) {
    input.context.stdout.write(`${formatCliTable(data.dimensions.map((dimension) => ({
      id: dimension.id,
      values: String(dimension.values.length),
      purpose: dimension.purpose,
    })))}\n`);
    return CLI_EXIT_OK;
  }
  if (isRoutePayload(data)) {
    input.context.stdout.write(`${formatCliTable(data.routes.map((route) => ({
      id: route.id,
      pilot: route.pilotPackId,
      validation: route.validationMode,
      title: route.title,
    })))}\n`);
    return CLI_EXIT_OK;
  }
  if (isEvaluationPayload(data)) {
    const opportunities = data.opportunities.unique;
    input.context.stdout.write(`${formatCliTable(opportunities.map((opportunity) => ({
      id: opportunity.id,
      kind: opportunity.kind,
      state: opportunity.state,
      score: String(opportunity.score.total),
      external: opportunity.externalPending ? "yes" : "no",
    })))}\n`);
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  return CLI_EXIT_OK;
}

function selectRoutes(input: NeedsCliInput): NeedRoute[] {
  const pilotPackId = input.flags.pilot;
  const limit = parseLimit(input);
  if (input.flags.route) {
    const route = generateNeedRoutes({ pilotPackId, mode: parseGenerationMode(input) }).find((candidate) => candidate.id === input.flags.route);
    if (!route) throw new CliHandledError("route_not_found", `No need route found for ${input.flags.route}.`, CLI_EXIT_USAGE);
    return [route];
  }
  const routes = generateNeedRoutes({ pilotPackId, limit, mode: parseGenerationMode(input) });
  if (pilotPackId && routes.length === 0) throw new CliHandledError("pilot_not_found", `No need pilot pack found for ${pilotPackId}.`, CLI_EXIT_USAGE);
  return routes;
}

function parseLimit(input: NeedsCliInput): number | undefined {
  if (!input.flags.limit) return undefined;
  const limit = Number(input.flags.limit);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new CliHandledError("invalid_limit", "Use --limit with a non-negative integer.", CLI_EXIT_USAGE);
  }
  return limit;
}

function parseGenerationMode(input: NeedsCliInput): NeedScenarioGenerationMode {
  const raw = input.flags.mode || input.flags.generation || "deterministic";
  if (raw === "deterministic") return "deterministic";
  if (raw === "llm-lateral" || raw === "llm_lateral_dry_run") return "llm_lateral_dry_run";
  throw new CliHandledError("invalid_generation_mode", "Use --mode deterministic or --mode llm-lateral.", CLI_EXIT_USAGE);
}

function maybeSaveEvaluations(input: NeedsCliInput, routes: NeedRoute[], evaluations: NeedRouteEvaluation[]): { wrote: boolean; ledgerPath: string; reason?: string } {
  const ledgerPath = needRouteLedgerPath(input.workspaceRoot);
  if (!readBooleanFlag(input.argv, input.flags, "save", false)) {
    return { wrote: false, ledgerPath, reason: "Pass --save to write the local .claw need route ledger." };
  }
  const current = readNeedRouteLedger(input.workspaceRoot);
  const nextEvaluations = evaluations.length > 0 ? evaluations : evaluateNeedRoutes(routes);
  const next = normalizeNeedRouteLedger({
    schemaVersion: 1,
    routes: mergeById(current.routes, routes),
    evaluations: mergeByRouteId(current.evaluations, nextEvaluations),
    opportunities: dedupeNeedOpportunities([...current.opportunities, ...nextEvaluations.flatMap((evaluation) => evaluation.opportunities)]).unique,
    updatedAt: new Date().toISOString(),
  });
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, `${JSON.stringify(next, null, 2)}\n`);
  return { wrote: true, ledgerPath };
}

function buildPromotionPacket(input: NeedsCliInput, opportunity: NeedOpportunity): {
  opportunityId: string;
  target: "report";
  commandPlan: string[];
  reportDraft: {
    type: NeedOpportunity["kind"];
    title: string;
    body: string;
    labels: string[];
  };
} {
  const target = input.flags.to || "report";
  if (target !== "report") throw new CliHandledError("unsupported_promotion_target", "Need opportunities can only promote to report in V1.", CLI_EXIT_USAGE);
  const body = [
    opportunity.summary,
    "",
    "Evidence:",
    ...opportunity.evidence.map((entry) => `- ${entry}`),
    "",
    `Route: ${opportunity.routeId}`,
    `State: ${opportunity.state}`,
    `External pending: ${opportunity.externalPending ? "yes" : "no"}`,
  ].join("\n");
  return {
    opportunityId: opportunity.id,
    target: "report",
    commandPlan: [
      `${input.binName} report ${opportunity.kind === "bug" ? "bug" : "feature"} --title ${JSON.stringify(opportunity.title)} --body-file <reviewed-body.md> --json`,
    ],
    reportDraft: {
      type: opportunity.kind,
      title: opportunity.title,
      body,
      labels: ["need-route-lab", opportunity.kind, opportunity.state],
    },
  };
}

function needRouteLedgerPath(workspaceRoot: string): string {
  return resolveClawPersistentSurfacePath("claw.workspace.need_routes.ledger", workspaceRoot);
}

function readNeedRouteLedger(workspaceRoot: string): NeedRouteLedger {
  const file = needRouteLedgerPath(workspaceRoot);
  if (!fs.existsSync(file)) {
    return { schemaVersion: 1, routes: [], evaluations: [], opportunities: [], updatedAt: new Date(0).toISOString() };
  }
  return normalizeNeedRouteLedger(JSON.parse(fs.readFileSync(file, "utf8")));
}

function normalizeNeedRouteLedger(value: unknown): NeedRouteLedger {
  const state = value && typeof value === "object" ? value as Partial<NeedRouteLedger> : {};
  return {
    schemaVersion: 1,
    routes: Array.isArray(state.routes) ? state.routes as NeedRoute[] : [],
    evaluations: Array.isArray(state.evaluations) ? state.evaluations as NeedRouteEvaluation[] : [],
    opportunities: Array.isArray(state.opportunities) ? state.opportunities as NeedOpportunity[] : [],
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : new Date().toISOString(),
  };
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  return [...new Map([...current, ...incoming].map((entry) => [entry.id, entry])).values()];
}

function mergeByRouteId(current: NeedRouteEvaluation[], incoming: NeedRouteEvaluation[]): NeedRouteEvaluation[] {
  return [...new Map([...current, ...incoming].map((entry) => [entry.route.id, entry])).values()];
}

function isDimensionPayload(value: unknown): value is { dimensions: ReturnType<typeof listNeedDimensions> } {
  return !!value && typeof value === "object" && Array.isArray((value as { dimensions?: unknown }).dimensions);
}

function isRoutePayload(value: unknown): value is { routes: NeedRoute[] } {
  return !!value && typeof value === "object" && Array.isArray((value as { routes?: unknown }).routes);
}

function isEvaluationPayload(value: unknown): value is { opportunities: ReturnType<typeof dedupeNeedOpportunities> } {
  return !!value && typeof value === "object" && !!(value as { opportunities?: unknown }).opportunities;
}
