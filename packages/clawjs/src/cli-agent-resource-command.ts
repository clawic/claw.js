import path from "node:path";

import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import {
  openAgentCoordinationStore,
  publicAuditEvent,
  publicDemand,
  publicLease,
  publicWorkResult,
  resolveAgentCoordinationPaths,
  type AgentResourceLeaseMode,
  type AgentWorkResultStatus,
} from "./agent-coordination-store.ts";

interface AgentResourceCliInput {
  positionals: string[];
  flags: Record<string, string>;
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    cwd: string;
  };
  wantsJson: boolean;
  binName: string;
}

const VALID_MODES = new Set(["read", "write", "exclusive"]);
const VALID_RELEASE_STATUSES = new Set(["passed", "failed", "partial", "external_pending", "blocked", "abandoned"]);

export async function runAgentResourceCli(input: AgentResourceCliInput): Promise<number> {
  const command = input.positionals[1];
  if (!command || command === "help") return writeHelp(input);
  const store = await openAgentCoordinationStore(resolvePaths(input));

  if (command === "plan") {
    const intent = store.createIntent({
      id: input.flags.intent,
      repo: resolveMaybePath(input.flags.repo, input.context.cwd),
      workspaceRoot: resolveMaybePath(input.flags.workspace, input.context.cwd),
      agentId: input.flags.agent,
      sessionId: input.flags.session,
      purpose: input.flags.purpose || "agent resource plan",
      metadata: { command: "plan" },
    });
    return ok(input, { intent: publicIntent(intent) }, { subcommand: command });
  }

  if (command === "acquire") {
    const resource = requiredFlag(input, "resource", command);
    const intent = requiredFlag(input, "intent", command);
    const mode = parseMode(input.flags.mode || "exclusive");
    const result = store.acquire({
      resourceId: resource,
      mode,
      intentId: intent,
      agentId: input.flags.agent,
      sessionId: input.flags.session,
      pid: input.flags.pid ? parsePositiveInteger(input.flags.pid, process.pid) : undefined,
      ttlSeconds: parsePositiveInteger(input.flags.ttl, 600),
      resourceKind: input.flags.kind,
      reason: input.flags.reason,
      metadata: { command: "agent-resource acquire" },
    });
    if (result.status === "pending") {
      return ok(input, {
        status: "PENDING",
        demand: result.demand ? publicDemand(result.demand) : null,
        conflicts: result.conflicts.map(publicLease),
      }, { subcommand: command }, CLI_EXIT_DEGRADED);
    }
    return ok(input, {
      status: "ACQUIRED",
      lease: result.lease ? publicLease(result.lease) : null,
      conflicts: [],
    }, { subcommand: command });
  }

  if (command === "heartbeat") {
    const leaseId = requiredFlag(input, "lease", command);
    const lease = store.heartbeat({
      leaseId,
      status: input.flags.status as "running" | "repairing" | "blocked" | undefined,
      ttlSeconds: input.flags.ttl ? parsePositiveInteger(input.flags.ttl, 600) : undefined,
      metadata: { command: "agent-resource heartbeat" },
    });
    if (!lease) return fail(input, command, "lease_not_found", `Unknown coordination lease: ${leaseId}`, CLI_EXIT_FAILURE);
    return ok(input, { status: "HEARTBEAT", lease: publicLease(lease) }, { subcommand: command });
  }

  if (command === "release") {
    const leaseId = requiredFlag(input, "lease", command);
    const status = parseReleaseStatus(input.flags.status || "abandoned");
    const lease = store.release({
      leaseId,
      status,
      checkId: input.flags.check || null,
      repo: resolveMaybePath(input.flags.repo, input.context.cwd),
      lane: input.flags.lane || null,
      fingerprint: input.flags.fingerprint || null,
      failureAction: input.flags["failure-action"] || null,
      metadata: { command: "agent-resource release" },
      recordResult: !(input.flags["no-result"] === "1" || input.flags["no-result"] === "true"),
    });
    if (!lease) return fail(input, command, "lease_not_found", `Unknown coordination lease: ${leaseId}`, CLI_EXIT_FAILURE);
    return ok(input, { status: "RELEASED", lease: publicLease(lease) }, { subcommand: command });
  }

  if (command === "status") {
    const status = store.status();
    return ok(input, {
      activeLeases: status.activeLeases.map(publicLease),
      pendingDemands: status.pendingDemands.map(publicDemand),
      recentResults: status.recentResults.map(publicWorkResult),
      paths: status.paths,
    }, { subcommand: command });
  }

  if (command === "waitlist") {
    const resource = requiredFlag(input, "resource", command);
    const intent = requiredFlag(input, "intent", command);
    const demand = store.waitlist({
      resourceId: resource,
      intentId: intent,
      agentId: input.flags.agent,
      reason: input.flags.reason,
      requiredBy: input.flags["required-by"] || null,
      metadata: { command: "agent-resource waitlist" },
    });
    return ok(input, { status: "PENDING", demand: publicDemand(demand) }, { subcommand: command }, CLI_EXIT_DEGRADED);
  }

  if (command === "reap") {
    const result = store.reap();
    return ok(input, { reaped: result.reaped.map(publicLease) }, { subcommand: command });
  }

  if (command === "bypass") {
    const intent = requiredFlag(input, "intent", command);
    const reason = requiredFlag(input, "reason", command);
    const audit = store.recordBypass({
      intentId: intent,
      agentId: input.flags.agent,
      resourceId: input.flags.resource || null,
      reason,
      metadata: { command: "agent-resource bypass" },
    });
    return ok(input, { status: "BYPASS_AUDITED", cleanValidation: false, audit: publicAuditEvent(audit) }, { subcommand: command }, CLI_EXIT_DEGRADED);
  }

  return fail(input, command, "unknown_agent_resource_command", `Unknown agent-resource command: ${command}`, CLI_EXIT_USAGE);
}

function writeHelp(input: AgentResourceCliInput): number {
  const text = [
    `Usage: ${input.binName} agent-resource <command> --json`,
    "",
    "Commands:",
    "  agent-resource plan --intent <id> [--repo <path>] --json",
    "  agent-resource acquire --resource <id> --mode read|write|exclusive --intent <id> --json",
    "  agent-resource heartbeat --lease <id> [--status running|repairing|blocked] --json",
    "  agent-resource release --lease <id> --status passed|failed|partial|external_pending|blocked|abandoned [--no-result true] --json",
    "  agent-resource status --json",
    "  agent-resource waitlist --resource <id> --intent <id> --json",
    "  agent-resource reap --json",
    "  agent-resource bypass --intent <id> --reason <text> [--resource <id>] --json",
  ].join("\n");
  input.context.stdout.write(`${text}\n`);
  return CLI_EXIT_OK;
}

function ok(input: AgentResourceCliInput, data: unknown, meta: Record<string, unknown>, exitCode = CLI_EXIT_OK): number {
  if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "agent-resource", data, meta);
  else input.context.stdout.write(`${JSON.stringify(data)}\n`);
  return exitCode;
}

function fail(input: AgentResourceCliInput, subcommand: string, code: string, message: string, exitCode: number): number {
  const error = new CliHandledError(code, message, exitCode);
  if (input.wantsJson) writeCommandJsonError(input.context.stdout, "agent-resource", error, { subcommand });
  else input.context.stderr.write(`${message}\n`);
  return exitCode;
}

function requiredFlag(input: AgentResourceCliInput, name: string, command: string): string {
  const value = input.flags[name];
  if (!value) throw new CliHandledError("missing_agent_resource_flag", `agent-resource ${command} requires --${name}`, CLI_EXIT_USAGE);
  return value;
}

function parseMode(value: string): AgentResourceLeaseMode {
  if (!VALID_MODES.has(value)) throw new CliHandledError("invalid_agent_resource_mode", `Invalid resource lease mode: ${value}`, CLI_EXIT_USAGE);
  return value as AgentResourceLeaseMode;
}

function parseReleaseStatus(value: string): AgentWorkResultStatus {
  if (!VALID_RELEASE_STATUSES.has(value)) throw new CliHandledError("invalid_agent_resource_status", `Invalid release status: ${value}`, CLI_EXIT_USAGE);
  return value as AgentWorkResultStatus;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new CliHandledError("invalid_agent_resource_ttl", `Expected a positive integer TTL, got ${value}`, CLI_EXIT_USAGE);
  return parsed;
}

function resolvePaths(input: AgentResourceCliInput) {
  return resolveAgentCoordinationPaths({
    stateDir: input.flags["state-dir"] ? resolveMaybePath(input.flags["state-dir"], input.context.cwd) ?? undefined : undefined,
    runDir: input.flags["run-dir"] ? resolveMaybePath(input.flags["run-dir"], input.context.cwd) ?? undefined : undefined,
  });
}

function resolveMaybePath(value: string | undefined, cwd: string): string | null {
  if (!value) return null;
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(cwd, value);
}

function publicIntent(intent: { id: string; repo: string | null; workspace_root: string | null; agent_id: string; session_id: string | null; purpose: string; status: string; created_at: string; updated_at: string }) {
  return {
    id: intent.id,
    repo: intent.repo,
    workspaceRoot: intent.workspace_root,
    agentId: intent.agent_id,
    sessionId: intent.session_id,
    purpose: intent.purpose,
    status: intent.status,
    createdAt: intent.created_at,
    updatedAt: intent.updated_at,
  };
}
