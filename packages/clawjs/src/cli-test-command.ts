import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { parseCsvFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import {
  emptyAgentCoordinationStatus,
  openAgentCoordinationStore,
  openAgentCoordinationStoreReadOnly,
  publicDemand,
  publicLease,
  publicRepairOwnership,
  publicWorkResult,
  resolveAgentCoordinationPaths,
  type AgentCoordinationAcquireInput,
  type AgentCoordinationStore,
  type AgentRepairOwnershipRow,
  type AgentResourceDemandRow,
  type AgentResourceLeaseMode,
  type AgentResourceLeaseRow,
  type AgentWorkResultRow,
} from "./agent-coordination-store.ts";

interface TestCliInput {
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

interface CoordinationCheck {
  id: string;
  repo?: string;
  lane: string;
  command: string;
  timeoutSeconds: number;
  costClass: "light" | "heavy" | "saturating" | "interactive";
  resources: Array<{ id: string; mode: "read" | "write" | "exclusive" }>;
  realServices: boolean;
  pathPatterns?: string[];
  fingerprintInputs?: string[];
  environmentInputs?: string[];
  resourceStateInputs?: string[];
  consumes: string[];
  produces: string[];
  mutates: string[];
  exclusiveResources: string[];
  canRunWith: string[];
  cannotRunWith: string[];
  heartbeatSeconds: number;
  ttlSeconds: number;
  cleanup: string;
  ownerObligations?: string[];
  stewardObligations?: string[];
  resultReuse?: { allowed: boolean; validForSeconds: number };
  externalPendingPolicy?: string;
  failureAction?: string;
  repairPolicy?: string;
}

interface CoordinationManifest {
  checks: CoordinationCheck[];
  manifestPath: string | null;
}

interface CommandRunResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

interface TestRequirementAcquisition {
  check: CoordinationCheck;
  resource: string;
  fingerprint: string;
  reused: AgentWorkResultRow | null;
  result: TestCoordinationAcquisition | null;
  repair: AgentRepairOwnershipRow | null;
  deduplicated?: boolean;
}

type TestCoordinationAcquisition = ReturnType<AgentCoordinationStore["acquireMany"]> & {
  lease?: AgentResourceLeaseRow;
  demand?: AgentResourceDemandRow;
};

export async function runTestCli(input: TestCliInput): Promise<number> {
  const command = input.positionals[1];
  if (!command || command === "help") return writeHelp(input);
  const repo = resolveRepo(input);
  const lane = input.flags.lane || input.positionals[2] || "changed";
  const manifest = loadChecks(repo);
  const checks = manifest.checks;
  if (input.flags.pid !== undefined) parsePidFlag(input.flags.pid);

  if (command === "plan") {
    const selected = checks.filter((check) => check.lane === lane || lane === "all");
    if (lane !== "all" && selected.length === 0) {
      throw unknownTestLaneError(lane, checks, manifest.manifestPath);
    }
    return ok(input, { repo, lane, checks: selected }, { subcommand: command, lane });
  }

  if (command === "status") {
    const paths = resolvePaths(input);
    const store = await openAgentCoordinationStoreReadOnly(paths);
    const status = store?.status() ?? emptyAgentCoordinationStatus(paths);
    return ok(input, {
      activeLeases: status.activeLeases.map(publicLease),
      pendingDemands: status.pendingDemands.map(publicDemand),
      recentResults: status.recentResults.map(publicWorkResult),
      paths: status.paths,
    }, { subcommand: command });
  }

  if (command === "reap") {
    const store = await openAgentCoordinationStore(resolvePaths(input));
    const result = store.reap();
    return ok(input, { reaped: result.reaped.map(publicLease) }, { subcommand: command });
  }

  if (command === "require") {
    const ids = parseCsvFlag(input.flags.checks);
    if (ids.length === 0) throw new CliHandledError("missing_test_checks", "claw test require needs --checks <id,id>", CLI_EXIT_USAGE);
    const selected = ids.map((id) => findCheck(checks, repo, id, lane, manifest.manifestPath));
    const store = await openAgentCoordinationStore(resolvePaths(input));
    const intent = store.createIntent({
      id: input.flags.intent,
      repo,
      workspaceRoot: repo,
      agentId: input.flags.agent,
      sessionId: input.flags.session,
      purpose: `test require ${ids.join(",")}`,
      metadata: { command: "claw test require", lane },
    });
    const acquisitionsByKey = new Map<string, TestRequirementAcquisition>();
    const acquisitions = selected.map((check) => {
      const resource = testResourceId(repo, check);
      const fingerprint = fingerprintForCheck(repo, check, input);
      const acquisitionKey = `${check.id}\0${fingerprint}`;
      const existingAcquisition = acquisitionsByKey.get(acquisitionKey);
      if (existingAcquisition) {
        return { ...existingAcquisition, check, resource, fingerprint, deduplicated: true };
      }
      const reusable = reusableResult(store, repo, check, fingerprint);
      if (reusable?.status === "passed") {
        const entry: TestRequirementAcquisition = { check, resource, fingerprint, reused: reusable, result: null, repair: null };
        acquisitionsByKey.set(acquisitionKey, entry);
        return entry;
      }
      const repair = store.activeRepairOwnership({ checkId: check.id, fingerprint });
      if (repair && repair.owner_intent_id !== intent.id) {
        const demand = store.waitlist({
          resourceId: resource,
          intentId: intent.id,
          agentId: input.flags.agent,
          reason: `repair active for ${check.id}`,
          metadata: { command: "claw test require", lane: check.lane, fingerprint, repairId: repair.id },
        });
        const entry: TestRequirementAcquisition = { check, resource, fingerprint, reused: reusable, result: pendingTestAcquisition(demand, []), repair };
        acquisitionsByKey.set(acquisitionKey, entry);
        return entry;
      }
      if (reusable) {
        const entry: TestRequirementAcquisition = { check, resource, fingerprint, reused: reusable, result: null, repair: null };
        acquisitionsByKey.set(acquisitionKey, entry);
        return entry;
      }
      const entry: TestRequirementAcquisition = {
        check,
        resource,
        fingerprint,
        reused: null,
        repair: null,
        result: acquireCheckResources(store, repo, check, intent.id, fingerprint, input, "test result required"),
      };
      acquisitionsByKey.set(acquisitionKey, entry);
      return entry;
    });
    const pending = acquisitions.filter((entry) => entry.result?.status === "pending");
    const failedEvidence = acquisitions.filter((entry) => entry.reused && entry.reused.status !== "passed");
    const acquired = acquisitions.filter((entry) => entry.result?.status === "acquired");
    const satisfied = acquisitions.filter((entry) => entry.reused?.status === "passed");
    const status = pending.length > 0 ? "PENDING"
      : failedEvidence.length > 0 ? "FAILED_EVIDENCE"
        : acquired.length > 0 ? "ACQUIRED"
          : "SATISFIED";
    return ok(input, {
      status,
      intent: { id: intent.id, repo, lane },
      checks: acquisitions.map((entry) => ({
        id: entry.check.id,
        resource: entry.resource,
        fingerprint: entry.fingerprint,
        deduplicated: entry.deduplicated === true,
        status: entry.result?.status === "pending" ? "PENDING"
          : entry.result?.status === "acquired" ? "ACQUIRED"
            : entry.reused?.status === "passed" ? "SATISFIED"
              : entry.reused ? "FAILED_EVIDENCE"
                : "UNKNOWN",
        lease: entry.result?.lease ? publicLease(entry.result.lease) : null,
        leases: entry.result?.leases?.map(publicLease) ?? (entry.result?.lease ? [publicLease(entry.result.lease)] : []),
        demand: entry.result?.demand ? publicDemand(entry.result.demand) : entry.result?.demands?.[0] ? publicDemand(entry.result.demands[0]) : null,
        demands: entry.result?.demands?.map(publicDemand) ?? (entry.result?.demand ? [publicDemand(entry.result.demand)] : []),
        conflicts: entry.result?.conflicts.map(publicLease) ?? [],
        reusableResult: entry.reused ? publicWorkResult(entry.reused) : null,
        repair: entry.repair ? publicRepairOwnership(entry.repair) : null,
      })),
    }, { subcommand: command, lane }, pending.length > 0 || failedEvidence.length > 0 ? CLI_EXIT_DEGRADED : CLI_EXIT_OK);
  }

  if (command === "run") {
    const check = findCheck(checks, repo, input.flags.check || lane, lane, manifest.manifestPath);
    const store = await openAgentCoordinationStore(resolvePaths(input));
    const intent = store.createIntent({
      id: input.flags.intent,
      repo,
      workspaceRoot: repo,
      agentId: input.flags.agent,
      sessionId: input.flags.session,
      purpose: `test run ${check.id}`,
      metadata: { command: "claw test run", lane, check: check.id },
    });
    const fingerprint = fingerprintForCheck(repo, check, input);
    const reusable = reusableResult(store, repo, check, fingerprint);
    if (reusable?.status === "passed") {
      return ok(input, {
        status: "REUSED",
        intent: { id: intent.id, repo, lane },
        check: check.id,
        fingerprint,
        result: publicWorkResult(reusable),
      }, { subcommand: command, lane });
    }
    const repair = store.activeRepairOwnership({ checkId: check.id, fingerprint });
    if (repair && repair.owner_intent_id !== intent.id) {
      const demand = store.waitlist({
        resourceId: testResourceId(repo, check),
        intentId: intent.id,
        agentId: input.flags.agent,
        reason: `repair active for ${check.id}`,
        metadata: { command: "claw test run", lane, fingerprint, repairId: repair.id },
      });
      return ok(input, {
        status: "PENDING",
        intent: { id: intent.id, repo, lane },
        check: check.id,
        fingerprint,
        demand: publicDemand(demand),
        demands: [publicDemand(demand)],
        conflicts: [],
        repair: publicRepairOwnership(repair),
      }, { subcommand: command, lane }, CLI_EXIT_DEGRADED);
    }
    const acquisition = acquireCheckResources(store, repo, check, intent.id, fingerprint, input, "test run");
    if (acquisition.status === "pending") {
      return ok(input, {
        status: "PENDING",
        intent: { id: intent.id, repo, lane },
        check: check.id,
        fingerprint,
        demand: acquisition.demands[0] ? publicDemand(acquisition.demands[0]) : null,
        demands: acquisition.demands.map(publicDemand),
        conflicts: acquisition.conflicts.map(publicLease),
      }, { subcommand: command, lane }, CLI_EXIT_DEGRADED);
    }
    const primaryLease = acquisition.leases[0];
    if (!primaryLease) throw new CliHandledError("test_lease_missing", "test run could not acquire a lease.", CLI_EXIT_DEGRADED);

    if (input.flags["dry-run"] === "1" || input.flags["dry-run"] === "true") {
      const released = releaseCheckLeases(store, acquisition.leases, primaryLease.id, {
        status: "passed",
        checkId: check.id,
        repo,
        lane,
        fingerprint,
        metadata: { dryRun: true, command: check.command },
      });
      store.releaseRepairOwnership({ checkId: check.id, fingerprint, ownerIntentId: intent.id });
      if (!released) throw new CliHandledError("test_lease_missing", `Could not release test lease ${primaryLease.id}.`, CLI_EXIT_DEGRADED);
      return ok(input, {
        status: "DRY_RUN",
        intent: { id: intent.id, repo, lane },
        check: check.id,
        fingerprint,
        lease: publicLease(released),
        leases: acquisition.leases.map(publicLease),
        command: check.command,
      }, { subcommand: command, lane });
    }

    const startedAt = new Date().toISOString();
    const started = Date.now();
    let result: CommandRunResult = { status: 1, signal: null, stdout: "", stderr: "" };
    let status: "passed" | "failed" | "external_pending" = "failed";
    let released: ReturnType<AgentCoordinationStore["release"]> = null;
    try {
      result = await runCheckCommandWithHeartbeat(store, acquisition.leases, check, repo);
      if (result.stdout) input.context.stderr.write(result.stdout);
      if (result.stderr) input.context.stderr.write(result.stderr);
      status = result.status === 0 ? "passed" : result.status === 2 ? "external_pending" : "failed";
    } finally {
      released = releaseCheckLeases(store, acquisition.leases, primaryLease.id, {
        status,
        checkId: check.id,
        repo,
        lane,
        fingerprint,
        startedAt,
        durationMs: Date.now() - started,
        stdoutTail: typeof result.stdout === "string" ? result.stdout : null,
        stderrTail: typeof result.stderr === "string" ? result.stderr : null,
        failureAction: check.failureAction ?? null,
        metadata: { command: check.command, exitCode: result.status ?? null, signal: result.signal ?? null, error: result.error?.message ?? null },
      });
    }
    const repairOwnership = status === "failed"
      ? store.claimRepairOwnership({ checkId: check.id, fingerprint, ownerIntentId: intent.id, ownerAgentId: input.flags.agent || process.env.CLAW_AGENT_ID || process.env.USER || "agent", ttlSeconds: check.timeoutSeconds })
      : null;
    if (status === "passed") store.releaseRepairOwnership({ checkId: check.id, fingerprint, ownerIntentId: null });
    if (!released) throw new CliHandledError("test_lease_missing", `Could not release test lease ${primaryLease.id}.`, CLI_EXIT_DEGRADED);
    if (input.wantsJson) {
      writeCommandJsonOk(input.context.stdout, "test", {
        status: status === "passed" ? "PASS" : status === "external_pending" ? "EXTERNAL_PENDING" : "FAIL",
        intent: { id: intent.id, repo, lane },
        check: check.id,
        fingerprint,
        lease: publicLease(released),
        leases: acquisition.leases.map(publicLease),
        repair: repairOwnership ? publicRepairOwnership(repairOwnership) : null,
        command: check.command,
        exitCode: result.status ?? 1,
      }, { subcommand: command, lane });
    }
    return result.status === 0 ? CLI_EXIT_OK : (result.status ?? 1);
  }

  const error = new CliHandledError("unknown_test_command", `Unknown test command: ${command}`, CLI_EXIT_USAGE);
  if (input.wantsJson) writeCommandJsonError(input.context.stdout, "test", error, { subcommand: command });
  else input.context.stderr.write(`${error.message}\n`);
  return CLI_EXIT_USAGE;
}

function writeHelp(input: TestCliInput): number {
  input.context.stdout.write([
    `Usage: ${input.binName} test <command> --json`,
    "",
    "Commands:",
    "  test plan --repo <path> --lane changed --json",
    "  test run --repo <path> --lane changed --json",
    "  test require --repo <path> --checks <id,id> --json",
    "  test status --json",
    "  test reap --json",
  ].join("\n") + "\n");
  return CLI_EXIT_OK;
}

function loadChecks(repo: string): CoordinationManifest {
  const manifestPath = path.join(repo, "qa", "agent-coordination.manifest.json");
  if (fs.existsSync(manifestPath)) {
    let parsed: { checks?: CoordinationCheck[] };
    try {
      parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { checks?: CoordinationCheck[] };
    } catch (error) {
      throw new CliHandledError("malformed_test_manifest", `Could not parse ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`, CLI_EXIT_USAGE);
    }
    if (!Array.isArray(parsed.checks)) throw new CliHandledError("malformed_test_manifest", `${manifestPath} must contain a checks array.`, CLI_EXIT_USAGE);
    return {
      checks: parsed.checks.map((check, index) => validateCheck(check, index, manifestPath)),
      manifestPath,
    };
  }
  return {
    checks: [
      defaultCheck(repo, "changed", "changed"),
      defaultCheck(repo, "fast", "fast"),
      defaultCheck(repo, "integration", "integration"),
    ],
    manifestPath: null,
  };
}

function validateCheck(check: CoordinationCheck, index: number, manifestPath: string): CoordinationCheck {
  const prefix = `${manifestPath} checks[${index}]`;
  const normalized = { ...check, ownerObligations: check.ownerObligations ?? check.stewardObligations ?? [] };
  delete normalized.stewardObligations;
  const requiredStrings = ["id", "lane", "command"] as const;
  for (const field of requiredStrings) {
    if (typeof normalized[field] !== "string" || !normalized[field].trim()) throw new CliHandledError("malformed_test_manifest", `${prefix}.${field} must be a non-empty string.`, CLI_EXIT_USAGE);
  }
  if (!Number.isFinite(normalized.timeoutSeconds) || normalized.timeoutSeconds <= 0) throw new CliHandledError("malformed_test_manifest", `${prefix}.timeoutSeconds must be a positive number.`, CLI_EXIT_USAGE);
  if (!["light", "heavy", "saturating", "interactive"].includes(normalized.costClass)) throw new CliHandledError("malformed_test_manifest", `${prefix}.costClass is invalid.`, CLI_EXIT_USAGE);
  if (typeof normalized.realServices !== "boolean") throw new CliHandledError("malformed_test_manifest", `${prefix}.realServices must be boolean.`, CLI_EXIT_USAGE);
  for (const field of ["consumes", "produces", "mutates", "exclusiveResources", "canRunWith", "cannotRunWith", "ownerObligations"] as const) {
    if (!Array.isArray(normalized[field]) || normalized[field].some((item) => typeof item !== "string")) {
      throw new CliHandledError("malformed_test_manifest", `${prefix}.${field} must be an array of strings.`, CLI_EXIT_USAGE);
    }
  }
  for (const field of ["pathPatterns", "fingerprintInputs", "environmentInputs", "resourceStateInputs"] as const) {
    if (normalized[field] !== undefined && (!Array.isArray(normalized[field]) || normalized[field]?.some((item) => typeof item !== "string"))) {
      throw new CliHandledError("malformed_test_manifest", `${prefix}.${field} must be an array of strings when present.`, CLI_EXIT_USAGE);
    }
  }
  for (const field of ["heartbeatSeconds", "ttlSeconds"] as const) {
    if (!Number.isFinite(normalized[field]) || normalized[field] <= 0) throw new CliHandledError("malformed_test_manifest", `${prefix}.${field} must be a positive number.`, CLI_EXIT_USAGE);
  }
  if (typeof normalized.cleanup !== "string" || !normalized.cleanup.trim()) throw new CliHandledError("malformed_test_manifest", `${prefix}.cleanup must be a non-empty string.`, CLI_EXIT_USAGE);
  if (!Array.isArray(normalized.resources) || normalized.resources.length === 0) throw new CliHandledError("malformed_test_manifest", `${prefix}.resources must be a non-empty array.`, CLI_EXIT_USAGE);
  for (const [resourceIndex, resource] of normalized.resources.entries()) {
    if (typeof resource.id !== "string" || !resource.id.trim()) throw new CliHandledError("malformed_test_manifest", `${prefix}.resources[${resourceIndex}].id must be a non-empty string.`, CLI_EXIT_USAGE);
    if (!["read", "write", "exclusive"].includes(resource.mode)) throw new CliHandledError("malformed_test_manifest", `${prefix}.resources[${resourceIndex}].mode is invalid.`, CLI_EXIT_USAGE);
  }
  return normalized;
}

function findCheck(checks: CoordinationCheck[], repo: string, id: string, lane: string, manifestPath: string | null): CoordinationCheck {
  const check = checks.find((entry) => entry.id === id);
  if (check) return check;
  if (manifestPath) {
    throw new CliHandledError("unknown_test_check", `Test check "${id}" is not declared in ${manifestPath}.`, CLI_EXIT_USAGE);
  }
  return defaultCheck(repo, id, lane);
}

function unknownTestLaneError(lane: string, checks: CoordinationCheck[], manifestPath: string | null): CliHandledError {
  const availableLanes = Array.from(new Set(checks.map((check) => check.lane))).sort();
  return new CliHandledError(
    "unknown_test_lane",
    manifestPath
      ? `Test lane "${lane}" is not declared in ${manifestPath}.`
      : `Test lane "${lane}" is not one of the default lanes.`,
    CLI_EXIT_USAGE,
    {
      location: "cli.test.lane",
      suggestion: "Choose a lane declared by the coordination manifest.",
      safeNextStep: `Run claw test plan --lane ${availableLanes[0] ?? "changed"} --json or claw test plan --lane all --json.`,
      details: {
        requestedLane: lane,
        availableLanes,
        manifestPath,
      },
    },
  );
}

function testResourceId(repo: string, check: CoordinationCheck): string {
  return `test:${repoFingerprint(repo)}:${check.id}`;
}

function acquireCheckResources(
  store: AgentCoordinationStore,
  repo: string,
  check: CoordinationCheck,
  intentId: string,
  fingerprint: string,
  input: TestCliInput,
  reason: string,
): TestCoordinationAcquisition {
  const requests = resourceRequestsForCheck(repo, check, intentId, fingerprint, input, reason);
  const result = store.acquireMany(requests);
  return { ...result, lease: result.leases[0], demand: result.demands[0] };
}

function pendingTestAcquisition(demand: AgentResourceDemandRow, conflicts: AgentResourceLeaseRow[]): TestCoordinationAcquisition {
  return {
    status: "pending",
    leases: [],
    demands: [demand],
    conflicts,
    demand,
  };
}

function resourceRequestsForCheck(
  repo: string,
  check: CoordinationCheck,
  intentId: string,
  fingerprint: string,
  input: TestCliInput,
  reason: string,
): AgentCoordinationAcquireInput[] {
  const pid = input.flags.pid !== undefined ? parsePidFlag(input.flags.pid) : undefined;
  const primary: AgentCoordinationAcquireInput = {
    resourceId: testResourceId(repo, check),
    mode: "exclusive",
    intentId,
    agentId: input.flags.agent,
    sessionId: input.flags.session,
    pid,
    ttlSeconds: check.ttlSeconds || check.timeoutSeconds,
    resourceKind: "test",
    reason: `${reason} ${check.id}`,
    cleanupCommand: { command: check.cleanup, scope: "test-result", check: check.id },
    metadata: { command: check.command, lane: check.lane, check: check.id, fingerprint, role: "test-result" },
  };
  const resourceInputs = check.resources.map((resource) => ({
    resourceId: resource.id,
    mode: resource.mode,
    intentId,
    agentId: input.flags.agent,
    sessionId: input.flags.session,
    pid,
    ttlSeconds: check.ttlSeconds || check.timeoutSeconds,
    resourceKind: resourceKind(resource.id),
    reason: `${reason} ${check.id} needs ${resource.id}`,
    cleanupCommand: { command: check.cleanup, scope: "declared-resource", check: check.id, resource: resource.id },
    metadata: { command: check.command, lane: check.lane, check: check.id, fingerprint, role: "declared-resource" },
  }));
  return normalizeAcquireInputs([primary, ...resourceInputs]);
}

function normalizeAcquireInputs(inputs: AgentCoordinationAcquireInput[]): AgentCoordinationAcquireInput[] {
  const byResource = new Map<string, AgentCoordinationAcquireInput>();
  for (const input of inputs) {
    const existing = byResource.get(input.resourceId);
    if (!existing) {
      byResource.set(input.resourceId, input);
      continue;
    }
    byResource.set(input.resourceId, {
      ...existing,
      mode: stricterMode(existing.mode, input.mode),
      metadata: { ...(existing.metadata ?? {}), duplicateModes: [existing.mode, input.mode] },
    });
  }
  return [...byResource.values()];
}

function stricterMode(left: AgentResourceLeaseMode, right: AgentResourceLeaseMode): AgentResourceLeaseMode {
  const rank: Record<AgentResourceLeaseMode, number> = { read: 0, write: 1, exclusive: 2 };
  return rank[right] > rank[left] ? right : left;
}

function resourceKind(resourceId: string): string {
  const [kind] = resourceId.split(":");
  return kind || "test-resource";
}

function releaseCheckLeases(
  store: AgentCoordinationStore,
  leases: AgentResourceLeaseRow[],
  primaryLeaseId: string,
  input: Omit<Parameters<AgentCoordinationStore["release"]>[0], "leaseId" | "recordResult">,
): AgentResourceLeaseRow | null {
  let primary: AgentResourceLeaseRow | null = null;
  for (const lease of leases) {
    const released = store.release({
      ...input,
      leaseId: lease.id,
      recordResult: lease.id === primaryLeaseId,
      metadata: {
        ...(input.metadata ?? {}),
        releasedResourceId: lease.resource_id,
        primaryLease: lease.id === primaryLeaseId,
      },
    });
    if (lease.id === primaryLeaseId) primary = released;
  }
  return primary;
}

async function runCheckCommandWithHeartbeat(
  store: AgentCoordinationStore,
  leases: AgentResourceLeaseRow[],
  check: CoordinationCheck,
  repo: string,
): Promise<CommandRunResult> {
  const heartbeatMs = Math.max(1, check.heartbeatSeconds || 10) * 1000;
  let stdout = "";
  let stderr = "";
  let settled = false;
  let child: ReturnType<typeof spawn> | null = null;
  const heartbeat = () => {
    for (const lease of leases) {
      try {
        store.heartbeat({
          leaseId: lease.id,
          status: "running",
          ttlSeconds: check.ttlSeconds || check.timeoutSeconds,
          metadata: { command: check.command, lane: check.lane, check: check.id, phase: "running" },
        });
      } catch {
        // Keep release/failure reporting authoritative even if a heartbeat
        // races with cleanup or a local store issue.
      }
    }
  };
  heartbeat();
  const heartbeatTimer = setInterval(heartbeat, heartbeatMs);
  const timeoutTimer = setTimeout(() => {
    if (!settled && child) child.kill("SIGTERM");
  }, Math.max(1, check.timeoutSeconds) * 1000);
  child = spawn("bash", ["-lc", check.command], {
    cwd: repo,
    env: { ...process.env, CLAW_AGENT_COORDINATION_ACTIVE: "1" },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const append = (current: string, chunk: Buffer): string => {
    const next = current + chunk.toString("utf8");
    return next.length > 20 * 1024 * 1024 ? next.slice(-20 * 1024 * 1024) : next;
  };
  child.stdout?.on("data", (chunk) => {
    stdout = append(stdout, chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr = append(stderr, chunk);
  });
  return await new Promise((resolve) => {
    child?.on("error", (error) => {
      settled = true;
      clearInterval(heartbeatTimer);
      clearTimeout(timeoutTimer);
      resolve({ status: 1, signal: null, stdout, stderr, error });
    });
    child?.on("close", (status, signal) => {
      settled = true;
      clearInterval(heartbeatTimer);
      clearTimeout(timeoutTimer);
      resolve({ status: status ?? (signal ? 1 : 0), signal, stdout, stderr });
    });
  });
}

function reusableResult(store: AgentCoordinationStore, repo: string, check: CoordinationCheck, fingerprint: string): AgentWorkResultRow | null {
  if (!check.resultReuse?.allowed) return null;
  return store.latestResult({
    repo,
    checkId: check.id,
    fingerprint,
    maxAgeSeconds: check.resultReuse.validForSeconds,
  });
}

function fingerprintForCheck(repo: string, check: CoordinationCheck, input: TestCliInput): string {
  if (input.flags.fingerprint) return input.flags.fingerprint;
  const hash = createHash("sha256");
  hash.update(JSON.stringify({
    repo,
    id: check.id,
    lane: check.lane,
    command: check.command,
    inputs: check.fingerprintInputs ?? [],
    git: gitFingerprintEvidence(repo, check.fingerprintInputs ?? []),
    files: filesystemFingerprintEvidence(repo, check.fingerprintInputs ?? []),
    environment: environmentFingerprintEvidence(check.environmentInputs ?? []),
    resources: resourceFingerprintEvidence(check),
  }));
  return hash.digest("hex").slice(0, 16);
}

function environmentFingerprintEvidence(inputs: string[]): Record<string, string | null> {
  const evidence: Record<string, string | null> = {
    "node.version": process.version,
    "process.platform": process.platform,
    "process.arch": process.arch,
  };
  for (const name of [...new Set(inputs)].sort()) {
    evidence[`env.${name}`] = process.env[name] ?? null;
  }
  return evidence;
}

function resourceFingerprintEvidence(check: CoordinationCheck): Record<string, unknown> {
  const explicitResources = (check.resourceStateInputs && check.resourceStateInputs.length > 0)
    ? check.resourceStateInputs
    : [
        ...check.resources.map((resource) => `${resource.id}:${resource.mode}`),
        ...check.consumes.map((resource) => `consumes:${resource}`),
        ...check.produces.map((resource) => `produces:${resource}`),
        ...check.mutates.map((resource) => `mutates:${resource}`),
        ...check.exclusiveResources.map((resource) => `exclusive:${resource}`),
        ...check.cannotRunWith.map((resource) => `cannotRunWith:${resource}`),
      ];
  return {
    realServices: check.realServices,
    costClass: check.costClass,
    resources: [...new Set(explicitResources)].sort(),
  };
}

function gitFingerprintEvidence(repo: string, inputs: string[]): Record<string, unknown> | null {
  if (!fs.existsSync(path.join(repo, ".git"))) return null;
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" });
  const status = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all", "--", ...pathspecRoots(inputs)], { cwd: repo, encoding: "utf8" });
  return {
    head: head.status === 0 ? head.stdout.trim() : null,
    status: status.status === 0 ? status.stdout.trim() : null,
  };
}

function filesystemFingerprintEvidence(repo: string, inputs: string[]): Array<{ path: string; size: number; mtimeMs: number }> {
  const roots = pathspecRoots(inputs.length > 0 ? inputs : ["."]);
  const files = new Map<string, { path: string; size: number; mtimeMs: number }>();
  for (const root of roots) {
    const absolute = path.join(repo, root);
    if (!fs.existsSync(absolute)) continue;
    collectFileStats(repo, absolute, files, 250);
    if (files.size >= 250) break;
  }
  return [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function pathspecRoots(inputs: string[]): string[] {
  const roots = inputs.map((input) => input.replace(/\\/g, "/").replace(/^\.\//, "").split("**")[0].replace(/\/$/, "") || ".")
    .map((input) => input.includes("*") ? path.dirname(input) : input)
    .map((input) => input === "." ? "." : input.replace(/\/$/, ""))
    .filter(Boolean);
  return [...new Set(roots.length > 0 ? roots : ["."])];
}

function collectFileStats(repo: string, absolute: string, files: Map<string, { path: string; size: number; mtimeMs: number }>, limit: number): void {
  if (files.size >= limit) return;
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) {
    const name = path.basename(absolute);
    if ([".git", "node_modules", "dist", "coverage", "test-results", "artifacts"].includes(name)) return;
    for (const entry of fs.readdirSync(absolute)) {
      collectFileStats(repo, path.join(absolute, entry), files, limit);
      if (files.size >= limit) return;
    }
    return;
  }
  if (!stat.isFile()) return;
  const relative = path.relative(repo, absolute).replace(/\\/g, "/");
  files.set(relative, { path: relative, size: stat.size, mtimeMs: Math.round(stat.mtimeMs) });
}

function defaultCheck(repo: string, id: string, lane: string): CoordinationCheck {
  const repoName = path.basename(repo);
  const packageJson = path.join(repo, "package.json");
  const hasNpmLane = fs.existsSync(packageJson);
  return {
    id,
    lane,
    command: hasNpmLane ? `npm run test:${lane}` : `bash scripts/test.sh ${lane}`,
    timeoutSeconds: lane === "integration" ? 3600 : 900,
    costClass: lane === "integration" ? "heavy" : "light",
    realServices: false,
    pathPatterns: ["**/*"],
    fingerprintInputs: ["package.json", "package-lock.json", "scripts/**", "packages/**", "docs/**", "qa/**"],
    consumes: [`repo:${repoName}:worktree`, lane === "integration" ? "cpu:global:heavy" : "cpu:global:light"],
    produces: [`test-result:${repoName}:${lane}`],
    mutates: [],
    exclusiveResources: lane === "integration" ? [] : [],
    canRunWith: [],
    cannotRunWith: lane === "integration" ? ["cpu:global:saturating"] : [],
    heartbeatSeconds: 30,
    ttlSeconds: lane === "integration" ? 3600 : 900,
    cleanup: "release all acquired leases and record only the primary test result",
    ownerObligations: ["inspect failures before rerun", "record pending demand instead of waiting on busy resources"],
    resources: [
      { id: `repo:${repoName}:worktree`, mode: "read" },
      { id: lane === "integration" ? "cpu:global:heavy" : "cpu:global:light", mode: lane === "integration" ? "write" : "read" },
    ],
    resultReuse: { allowed: false, validForSeconds: 0 },
    externalPendingPolicy: "report",
    failureAction: "Inspect the failing lane output and repair the responsible change before rerunning the same fingerprint.",
    repairPolicy: "claim failing check before broad repair",
  };
}

function ok(input: TestCliInput, data: unknown, meta: Record<string, unknown>, exitCode = CLI_EXIT_OK): number {
  if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "test", data, meta);
  else input.context.stdout.write(`${JSON.stringify(data)}\n`);
  return exitCode;
}

function resolveRepo(input: TestCliInput): string {
  const raw = input.flags.repo || input.context.cwd;
  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(input.context.cwd, raw);
}

function resolvePaths(input: TestCliInput) {
  return resolveAgentCoordinationPaths({
    stateDir: input.flags["state-dir"] ? resolveMaybePath(input.flags["state-dir"], input.context.cwd) : undefined,
    runDir: input.flags["run-dir"] ? resolveMaybePath(input.flags["run-dir"], input.context.cwd) : undefined,
  });
}

function resolveMaybePath(value: string, cwd: string): string {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(cwd, value);
}

function parsePidFlag(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliHandledError("invalid_test_pid", "--pid must be a positive integer process id.", CLI_EXIT_USAGE, {
      location: "cli.test.pid",
      details: { flag: "--pid", value },
    });
  }
  return parsed;
}

function repoFingerprint(repo: string): string {
  return createHash("sha256").update(repo).digest("hex").slice(0, 12);
}
