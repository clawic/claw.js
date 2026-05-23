import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { parseCsvFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import { openAgentCoordinationStore, publicDemand, publicLease, resolveAgentCoordinationPaths } from "./agent-coordination-store.ts";

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
  resultReuse?: { allowed: boolean; validForSeconds: number };
  externalPendingPolicy?: string;
  failureAction?: string;
  repairPolicy?: string;
}

export async function runTestCli(input: TestCliInput): Promise<number> {
  const command = input.positionals[1];
  if (!command || command === "help") return writeHelp(input);
  const repo = resolveRepo(input);
  const lane = input.flags.lane || input.positionals[2] || "changed";
  const checks = loadChecks(repo);

  if (command === "plan") {
    const selected = checks.filter((check) => check.lane === lane || lane === "all");
    return ok(input, { repo, lane, checks: selected }, { subcommand: command, lane });
  }

  if (command === "status") {
    const store = await openAgentCoordinationStore(resolvePaths(input));
    const status = store.status();
    return ok(input, {
      activeLeases: status.activeLeases.map(publicLease),
      pendingDemands: status.pendingDemands.map(publicDemand),
      recentResults: status.recentResults,
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
    const selected = ids.map((id) => findCheck(checks, repo, id, lane));
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
    const acquisitions = selected.map((check) => {
      const resource = `test:${repoFingerprint(repo)}:${check.id}`;
      return {
        check,
        resource,
        result: store.acquire({
          resourceId: resource,
          mode: "exclusive",
          intentId: intent.id,
          agentId: input.flags.agent,
          sessionId: input.flags.session,
          pid: input.flags.pid ? parsePositiveInteger(input.flags.pid, process.pid) : undefined,
          ttlSeconds: check.timeoutSeconds,
          resourceKind: "test",
          reason: `test result required for ${check.id}`,
          metadata: { command: check.command, lane: check.lane },
        }),
      };
    });
    const pending = acquisitions.filter((entry) => entry.result.status === "pending");
    return ok(input, {
      status: pending.length > 0 ? "PENDING" : "ACQUIRED",
      intent: { id: intent.id, repo, lane },
      checks: acquisitions.map((entry) => ({
        id: entry.check.id,
        resource: entry.resource,
        status: entry.result.status === "pending" ? "PENDING" : "ACQUIRED",
        lease: entry.result.lease ? publicLease(entry.result.lease) : null,
        demand: entry.result.demand ? publicDemand(entry.result.demand) : null,
        conflicts: entry.result.conflicts.map(publicLease),
      })),
    }, { subcommand: command, lane }, pending.length > 0 ? CLI_EXIT_DEGRADED : CLI_EXIT_OK);
  }

  if (command === "run") {
    const check = findCheck(checks, repo, input.flags.check || lane, lane);
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
    const acquisition = store.acquire({
      resourceId: `test:${repoFingerprint(repo)}:${check.id}`,
      mode: "exclusive",
      intentId: intent.id,
      agentId: input.flags.agent,
      sessionId: input.flags.session,
      pid: input.flags.pid ? parsePositiveInteger(input.flags.pid, process.pid) : undefined,
      ttlSeconds: check.timeoutSeconds,
      resourceKind: "test",
      reason: `test run ${check.id}`,
      metadata: { command: check.command, lane: check.lane },
    });
    if (acquisition.status === "pending") {
      return ok(input, {
        status: "PENDING",
        intent: { id: intent.id, repo, lane },
        check: check.id,
        demand: acquisition.demand ? publicDemand(acquisition.demand) : null,
        conflicts: acquisition.conflicts.map(publicLease),
      }, { subcommand: command, lane }, CLI_EXIT_DEGRADED);
    }
    if (!acquisition.lease) throw new CliHandledError("test_lease_missing", "test run could not acquire a lease.", CLI_EXIT_DEGRADED);

    if (input.flags["dry-run"] === "1" || input.flags["dry-run"] === "true") {
      const released = store.release({
        leaseId: acquisition.lease.id,
        status: "passed",
        checkId: check.id,
        repo,
        lane,
        metadata: { dryRun: true, command: check.command },
      });
      if (!released) throw new CliHandledError("test_lease_missing", `Could not release test lease ${acquisition.lease.id}.`, CLI_EXIT_DEGRADED);
      return ok(input, {
        status: "DRY_RUN",
        intent: { id: intent.id, repo, lane },
        check: check.id,
        lease: publicLease(released),
        command: check.command,
      }, { subcommand: command, lane });
    }

    const result = spawnSync("bash", ["-lc", check.command], {
      cwd: repo,
      env: { ...process.env, CLAW_AGENT_COORDINATION_ACTIVE: "1" },
      stdio: "inherit",
      shell: false,
    });
    const status = result.status === 0 ? "passed" : "failed";
    const released = store.release({
      leaseId: acquisition.lease.id,
      status,
      checkId: check.id,
      repo,
      lane,
      metadata: { command: check.command, exitCode: result.status ?? null, signal: result.signal ?? null },
    });
    if (!released) throw new CliHandledError("test_lease_missing", `Could not release test lease ${acquisition.lease.id}.`, CLI_EXIT_DEGRADED);
    if (input.wantsJson) {
      writeCommandJsonOk(input.context.stdout, "test", {
        status: status === "passed" ? "PASS" : "FAIL",
        intent: { id: intent.id, repo, lane },
        check: check.id,
        lease: publicLease(released),
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

function loadChecks(repo: string): CoordinationCheck[] {
  const manifestPath = path.join(repo, "qa", "agent-coordination.manifest.json");
  if (fs.existsSync(manifestPath)) {
    let parsed: { checks?: CoordinationCheck[] };
    try {
      parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { checks?: CoordinationCheck[] };
    } catch (error) {
      throw new CliHandledError("malformed_test_manifest", `Could not parse ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`, CLI_EXIT_USAGE);
    }
    if (!Array.isArray(parsed.checks)) throw new CliHandledError("malformed_test_manifest", `${manifestPath} must contain a checks array.`, CLI_EXIT_USAGE);
    return parsed.checks.map((check, index) => validateCheck(check, index, manifestPath));
  }
  return [
    defaultCheck(repo, "changed", "changed"),
    defaultCheck(repo, "fast", "fast"),
    defaultCheck(repo, "integration", "integration"),
  ];
}

function validateCheck(check: CoordinationCheck, index: number, manifestPath: string): CoordinationCheck {
  const prefix = `${manifestPath} checks[${index}]`;
  const requiredStrings = ["id", "lane", "command"] as const;
  for (const field of requiredStrings) {
    if (typeof check[field] !== "string" || !check[field].trim()) throw new CliHandledError("malformed_test_manifest", `${prefix}.${field} must be a non-empty string.`, CLI_EXIT_USAGE);
  }
  if (!Number.isFinite(check.timeoutSeconds) || check.timeoutSeconds <= 0) throw new CliHandledError("malformed_test_manifest", `${prefix}.timeoutSeconds must be a positive number.`, CLI_EXIT_USAGE);
  if (!["light", "heavy", "saturating", "interactive"].includes(check.costClass)) throw new CliHandledError("malformed_test_manifest", `${prefix}.costClass is invalid.`, CLI_EXIT_USAGE);
  if (typeof check.realServices !== "boolean") throw new CliHandledError("malformed_test_manifest", `${prefix}.realServices must be boolean.`, CLI_EXIT_USAGE);
  if (!Array.isArray(check.resources) || check.resources.length === 0) throw new CliHandledError("malformed_test_manifest", `${prefix}.resources must be a non-empty array.`, CLI_EXIT_USAGE);
  for (const [resourceIndex, resource] of check.resources.entries()) {
    if (typeof resource.id !== "string" || !resource.id.trim()) throw new CliHandledError("malformed_test_manifest", `${prefix}.resources[${resourceIndex}].id must be a non-empty string.`, CLI_EXIT_USAGE);
    if (!["read", "write", "exclusive"].includes(resource.mode)) throw new CliHandledError("malformed_test_manifest", `${prefix}.resources[${resourceIndex}].mode is invalid.`, CLI_EXIT_USAGE);
  }
  return check;
}

function findCheck(checks: CoordinationCheck[], repo: string, id: string, lane: string): CoordinationCheck {
  return checks.find((check) => check.id === id) ?? defaultCheck(repo, id, lane);
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
    resources: [
      { id: `repo:${repoName}:worktree`, mode: "read" },
      { id: lane === "integration" ? "cpu:global:heavy" : "cpu:global:light", mode: lane === "integration" ? "write" : "read" },
    ],
    resultReuse: { allowed: false, validForSeconds: 0 },
    externalPendingPolicy: "report",
    failureAction: "Inspect the failing lane output and repair the owning change before rerunning the same fingerprint.",
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

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function repoFingerprint(repo: string): string {
  return createHash("sha256").update(repo).digest("hex").slice(0, 12);
}
