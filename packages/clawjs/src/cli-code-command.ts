import path from "path";

import { createCodeGlobalIndex, createCodeLedger, startCodeServer } from "@clawjs/claw";

import type { CliContext } from "./index.ts";
import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { formatCliTable, joinedPositionals, parseJsonFlag, readBooleanFlag } from "./cli-flag-parsers.ts";
import { cliErrorFromUnknown, writeCommandJsonError, writeCommandJsonOk, writeCommandJsonOkLine } from "./cli-json.ts";
import { readJsonFile } from "./cli-runtime-utils.ts";

function parseCodeListFlag(value: string | undefined): string[] {
  return value
    ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function parseCodeDecimalIntegerFlag(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseCodeNonNegativeIntegerFlag(value: string | undefined, flagName: string, errorCode: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = parseCodeDecimalIntegerFlag(value);
  if (parsed === undefined || parsed < 0) {
    throw new CliHandledError(errorCode, `Expected --${flagName} to be a non-negative integer, got ${value}.`, CLI_EXIT_USAGE, {
      suggestion: `Pass a non-negative integer such as --${flagName} 60000.`,
      safeNextStep: `Rerun claw code agents list with a valid --${flagName} value.`,
    });
  }
  return parsed;
}

function parseCodeServePortFlag(value: string | undefined): number {
  if (value === undefined) return 0;
  const port = parseCodeDecimalIntegerFlag(value);
  if (port === undefined || port > 65_535) {
    throw new CliHandledError("invalid_code_serve_port", `Expected --port to be an integer from 0 to 65535, got ${value}.`, CLI_EXIT_USAGE, {
      suggestion: "Pass a valid local port such as --port 8787, or omit --port to use an ephemeral port.",
      safeNextStep: "Rerun claw code serve with a valid --port value.",
    });
  }
  return port;
}

function resolveCodeIntentId(positionals: string[], flags: Record<string, string>, index = 2): string {
  const id = flags.intent ?? flags["intent-id"] ?? flags.id ?? positionals[index];
  if (!id) throw new CliHandledError("usage_error", "A code intent id is required.", CLI_EXIT_USAGE);
  return id;
}

export async function runCodeCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number> {
  const [, command, subcommand] = input.positionals;
  const globalIndex = createCodeGlobalIndex({ rootDir: input.flags["code-home"] });
  const localLedger = () => createCodeLedger({ cwd: input.flags.repo || input.flags.workspace || input.context.cwd });
  const projectLedger = () => input.flags.project ? globalIndex.projectLedger(input.flags.project) : localLedger();
  const dryRun = readBooleanFlag(input.argv, input.flags, "dry-run", false);
  const wantsAll = readBooleanFlag(input.argv, input.flags, "all", false);
  const jsonMeta = () => ({
    invokedCommand: "code",
    subcommand: command ?? null,
    ...(subcommand ? { operation: subcommand } : {}),
  });
  const writeCodeJson = (data: unknown) => writeCommandJsonOk(input.context.stdout, "code", data, jsonMeta());

  try {
    if (command === "projects" && subcommand === "add") {
      const rootDir = input.positionals[3] ?? input.flags.path ?? input.flags.repo ?? input.flags.workspace;
      if (!rootDir) {
        input.context.stderr.write(`Usage: ${input.binName} code projects add <path> [--id ID] [--name NAME]\n`);
        return CLI_EXIT_USAGE;
      }
      const project = globalIndex.addProject({ rootDir, id: input.flags.id, name: input.flags.name });
      if (input.wantsJson) writeCodeJson({ project });
      else input.context.stdout.write(`${project.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "projects" && subcommand === "discover") {
      const rootDir = input.positionals[3] ?? input.flags.path ?? input.context.cwd;
      const maxDepth = parseCodeNonNegativeIntegerFlag(input.flags["max-depth"], "max-depth", "invalid_code_project_discover_max_depth");
      const projects = globalIndex.discoverProjects({ rootDir, ...(maxDepth !== undefined ? { maxDepth } : {}) });
      if (input.wantsJson) writeCodeJson({ projects });
      else input.context.stdout.write(formatCliTable(projects.map((project: { id: string; status: string; name: string; rootDir: string }) => ({
        id: project.id,
        status: project.status,
        name: project.name,
        root: project.rootDir,
      }))) + "\n");
      return CLI_EXIT_OK;
    }

    if (command === "projects" && subcommand === "list") {
      const projects = globalIndex.listProjects();
      if (input.wantsJson) writeCodeJson({ projects });
      else input.context.stdout.write(formatCliTable(projects.map((project: { id: string; status: string; name: string; rootDir: string }) => ({
        id: project.id,
        status: project.status,
        name: project.name,
        root: project.rootDir,
      }))) + "\n");
      return CLI_EXIT_OK;
    }

    if (command === "projects" && subcommand === "show") {
      const projectId = input.positionals[3] ?? input.flags.project ?? input.flags.id;
      if (!projectId) {
        input.context.stderr.write(`Usage: ${input.binName} code projects show <project-id>\n`);
        return CLI_EXIT_USAGE;
      }
      const project = globalIndex.syncProject(projectId);
      if (input.wantsJson) writeCodeJson({ project });
      else input.context.stdout.write(`${project.id} ${project.status} ${project.rootDir}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "projects" && subcommand === "remove") {
      const projectId = input.positionals[3] ?? input.flags.project ?? input.flags.id;
      if (!projectId) {
        input.context.stderr.write(`Usage: ${input.binName} code projects remove <project-id>\n`);
        return CLI_EXIT_USAGE;
      }
      const ok = globalIndex.removeProject(projectId);
      if (input.wantsJson) writeCodeJson({ ok });
      else input.context.stdout.write(`${ok}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "agents" && subcommand === "register") {
      const agentId = input.positionals[3] ?? input.flags.agent ?? input.flags["agent-id"] ?? input.flags.id;
      if (!agentId) {
        input.context.stderr.write(`Usage: ${input.binName} code agents register <agent-id> [--project ID] [--intent ID]\n`);
        return CLI_EXIT_USAGE;
      }
      const agent = globalIndex.registerAgent({
        id: agentId,
        label: input.flags.label ?? input.flags.name,
        status: input.flags.status as never,
        projectId: input.flags.project ?? null,
        intentId: input.flags.intent ?? input.flags["intent-id"] ?? null,
        worktreePath: input.flags.worktree ?? input.flags["worktree-path"] ?? null,
      });
      if (input.wantsJson) writeCodeJson({ agent });
      else input.context.stdout.write(`${agent.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "agents" && subcommand === "heartbeat") {
      const agentId = input.positionals[3] ?? input.flags.agent ?? input.flags["agent-id"] ?? input.flags.id;
      if (!agentId) {
        input.context.stderr.write(`Usage: ${input.binName} code agents heartbeat <agent-id> [--project ID] [--intent ID]\n`);
        return CLI_EXIT_USAGE;
      }
      const agent = globalIndex.heartbeatAgent({
        id: agentId,
        status: input.flags.status as never,
        projectId: input.flags.project ?? null,
        intentId: input.flags.intent ?? input.flags["intent-id"] ?? null,
        worktreePath: input.flags.worktree ?? input.flags["worktree-path"] ?? null,
      });
      if (input.wantsJson) writeCodeJson({ agent });
      else input.context.stdout.write(`${agent.status}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "agents" && subcommand === "list") {
      const offlineAfterMs = parseCodeNonNegativeIntegerFlag(input.flags["offline-after-ms"], "offline-after-ms", "invalid_code_agent_offline_after_ms");
      const agents = globalIndex.listAgents({ ...(offlineAfterMs !== undefined ? { offlineAfterMs } : {}) });
      if (input.wantsJson) writeCodeJson({ agents });
      else input.context.stdout.write(formatCliTable(agents.map((agent: { id: string; status: string; projectId: string | null; intentId: string | null }) => ({
        id: agent.id,
        status: agent.status,
        project: agent.projectId ?? "",
        intent: agent.intentId ?? "",
      }))) + "\n");
      return CLI_EXIT_OK;
    }

    if (command === "agents" && subcommand === "show") {
      const agentId = input.positionals[3] ?? input.flags.agent ?? input.flags["agent-id"] ?? input.flags.id;
      if (!agentId) {
        input.context.stderr.write(`Usage: ${input.binName} code agents show <agent-id>\n`);
        return CLI_EXIT_USAGE;
      }
      const agent = globalIndex.requireAgent(agentId);
      if (input.wantsJson) writeCodeJson({ agent });
      else input.context.stdout.write(`${agent.id} ${agent.status}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "serve") {
      const port = parseCodeServePortFlag(input.flags.port);
      const server = await startCodeServer(globalIndex, { host: input.flags.host || "127.0.0.1", port });
      if (input.wantsJson) writeCommandJsonOkLine(input.context.stdout, "code", { url: server.url }, jsonMeta());
      else input.context.stdout.write(`${server.url}\n`);
      await new Promise<void>((resolve) => {
        const stop = () => {
          void server.close().finally(resolve);
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
      });
      return CLI_EXIT_OK;
    }

    if (command === "init") {
      const ledger = projectLedger();
      const repository = ledger.init();
      if (input.flags.project) globalIndex.syncProject(input.flags.project);
      if (input.wantsJson) writeCodeJson({ repository, databasePath: ledger.databasePath });
      else input.context.stdout.write(`${repository.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "policy" && (subcommand === "show" || subcommand === undefined)) {
      const policy = input.flags.project ? globalIndex.policy(input.flags.project) : localLedger().policy();
      if (input.wantsJson) writeCodeJson({ policy });
      else input.context.stdout.write(`${policy.path}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "policy" && subcommand === "validate") {
      const policy = input.flags.project ? globalIndex.validatePolicy(input.flags.project) : localLedger().validatePolicy();
      if (input.wantsJson) writeCodeJson({ ok: true, policy });
      else input.context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }

    if (command === "policy" && subcommand === "set") {
      const raw = input.flags["from-file"]
        ? readJsonFile<Record<string, unknown>>(path.resolve(input.context.cwd, input.flags["from-file"]), "--from-file")
        : parseJsonFlag<Record<string, unknown>>(input.flags["policy-json"] ?? input.flags.json, "--json");
      if (!raw) {
        input.context.stderr.write(`Usage: ${input.binName} code policy set [--project ID] --json TEXT\n`);
        return CLI_EXIT_USAGE;
      }
      const policy = input.flags.project ? globalIndex.setPolicy(input.flags.project, raw) : localLedger().setPolicy(raw);
      if (input.wantsJson) writeCodeJson({ policy });
      else input.context.stdout.write(`${policy.path}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "status") {
      if (wantsAll) {
        const status = globalIndex.status();
        if (input.wantsJson) writeCodeJson(status);
        else input.context.stdout.write(`${status.projects.length} projects, ${status.intents.length} intents, ${status.queued.length} queued\n`);
        return CLI_EXIT_OK;
      }
      if (input.flags.project) {
        const project = globalIndex.syncProject(input.flags.project);
        const status = project.status === "active" ? globalIndex.projectLedger(project.id).status() : { repository: project, intents: [], blocked: [], queued: [] };
        if (input.wantsJson) writeCodeJson({ project, ...status });
        else input.context.stdout.write(`${project.id} ${project.status}\n`);
        return CLI_EXIT_OK;
      }
      const status = localLedger().status();
      if (input.wantsJson) writeCodeJson(status);
      else input.context.stdout.write(`${status.intents.length} intents, ${status.queued.length} queued\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      if (wantsAll || input.flags.project || input.flags["agent-id"]) {
        const intents = globalIndex.listIntents({
          ...(input.flags.project ? { projectId: input.flags.project } : {}),
          ...(input.flags["agent-id"] ? { agentId: input.flags["agent-id"] } : {}),
          ...(input.flags.status ? { status: input.flags.status as never } : {}),
        });
        if (input.wantsJson) writeCodeJson({ intents });
        else input.context.stdout.write(formatCliTable(intents.map((intent: { projectId: string; id: string; status: string; kind: string; scope: string; title: string }) => ({
          project: intent.projectId,
          id: intent.id,
          status: intent.status,
          kind: intent.kind,
          scope: intent.scope,
          title: intent.title,
        }))) + "\n");
        return CLI_EXIT_OK;
      }
      const intents = localLedger().listIntents({ ...(input.flags.status ? { status: input.flags.status as never } : {}) });
      if (input.wantsJson) writeCodeJson({ intents });
      else input.context.stdout.write(formatCliTable(intents.map((intent) => ({
        id: intent.id,
        status: intent.status,
        kind: intent.kind,
        scope: intent.scope,
        title: intent.title,
      }))) + "\n");
      return CLI_EXIT_OK;
    }

    if (command === "show") {
      const detail = input.flags.project
        ? globalIndex.showIntent(input.flags.project, resolveCodeIntentId(input.positionals, input.flags))
        : localLedger().showIntent(resolveCodeIntentId(input.positionals, input.flags));
      if (input.wantsJson) writeCodeJson(detail);
      else input.context.stdout.write(`${detail.intent.id} ${detail.intent.status} ${detail.intent.branch}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "start") {
      const kind = input.flags.kind;
      const scope = input.flags.scope;
      const title = input.flags.title ?? joinedPositionals(input.positionals, 2);
      if (!kind || !scope || !title) {
        input.context.stderr.write(`Usage: ${input.binName} code start --kind fix|feat|refactor|docs|test|chore --scope SCOPE --title TEXT\n`);
        return CLI_EXIT_USAGE;
      }
      const startInput = {
        kind: kind as never,
        scope,
        title,
        ...(input.flags.summary ? { summary: input.flags.summary } : {}),
        ...(input.flags.risk ? { risk: input.flags.risk as never } : {}),
        ...(input.flags["agent-id"] ? { agentId: input.flags["agent-id"] } : {}),
        ...(input.flags.base ? { baseBranch: input.flags.base } : {}),
        paths: [...parseCodeListFlag(input.flags.path), ...parseCodeListFlag(input.flags.paths)],
      };
      const detail = input.flags.project
        ? globalIndex.startIntent(input.flags.project, startInput)
        : localLedger().start(startInput);
      if (input.wantsJson) writeCodeJson(detail);
      else input.context.stdout.write(`${detail.intent.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "reserve") {
      const ledger = projectLedger();
      const reservations = ledger.reserve({
        intentId: resolveCodeIntentId(input.positionals, input.flags),
        scopes: parseCodeListFlag(input.flags.scope ?? input.flags.scopes),
        paths: [...parseCodeListFlag(input.flags.path), ...parseCodeListFlag(input.flags.paths)],
      });
      if (input.flags.project) globalIndex.syncProject(input.flags.project);
      if (input.wantsJson) writeCodeJson({ reservations });
      else input.context.stdout.write(`${reservations.length}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "evidence" && subcommand === "add") {
      const label = input.flags.label ?? input.flags.title ?? joinedPositionals(input.positionals, 3);
      if (!label) {
        input.context.stderr.write(`Usage: ${input.binName} code evidence add --intent ID --label TEXT [--path PATH|--url URL]\n`);
        return CLI_EXIT_USAGE;
      }
      const evidence = input.flags.project ? globalIndex.addEvidence(input.flags.project, {
        intentId: resolveCodeIntentId(input.positionals, input.flags, 3),
        label,
        ...(input.flags.kind ? { kind: input.flags.kind } : {}),
        ...(input.flags.path ? { path: input.flags.path } : {}),
        ...(input.flags.url ? { url: input.flags.url } : {}),
      }) : localLedger().addEvidence({
        intentId: resolveCodeIntentId(input.positionals, input.flags, 3),
        label,
        ...(input.flags.kind ? { kind: input.flags.kind } : {}),
        ...(input.flags.path ? { path: input.flags.path } : {}),
        ...(input.flags.url ? { url: input.flags.url } : {}),
      });
      if (input.wantsJson) writeCodeJson({ evidence });
      else input.context.stdout.write(`${evidence.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "check" && subcommand === "record") {
      const name = input.flags.name ?? input.flags.check ?? "check";
      const status = input.flags.status;
      if (status !== "passed" && status !== "failed") {
        input.context.stderr.write(`Usage: ${input.binName} code check record --intent ID --name NAME --status passed|failed\n`);
        return CLI_EXIT_USAGE;
      }
      const checkInput = {
        intentId: resolveCodeIntentId(input.positionals, input.flags, 3),
        name,
        status: status as "passed" | "failed",
        ...(input.flags.command ? { command: input.flags.command } : {}),
        ...(input.flags.output ? { output: input.flags.output } : {}),
      };
      const check = input.flags.project
        ? globalIndex.recordCheck(input.flags.project, checkInput)
        : localLedger().recordCheck(checkInput);
      if (input.wantsJson) writeCodeJson({ check });
      else input.context.stdout.write(`${check.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "check" && subcommand === "run") {
      const name = input.flags.name ?? input.flags.check ?? "check";
      const commandText = input.flags.command ?? joinedPositionals(input.positionals, 3);
      if (!commandText) {
        input.context.stderr.write(`Usage: ${input.binName} code check run --intent ID --name NAME --command COMMAND\n`);
        return CLI_EXIT_USAGE;
      }
      const checkInput = {
        intentId: resolveCodeIntentId(input.positionals, input.flags, 3),
        name,
        command: commandText,
      };
      const check = input.flags.project
        ? globalIndex.runCheck(input.flags.project, checkInput)
        : localLedger().runCheck(checkInput);
      if (input.wantsJson) writeCodeJson({ check });
      else input.context.stdout.write(`${check.status}\n`);
      return check.status === "passed" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
    }

    if (command === "commit") {
      const result = input.flags.project
        ? globalIndex.commit(input.flags.project, resolveCodeIntentId(input.positionals, input.flags))
        : localLedger().commit(resolveCodeIntentId(input.positionals, input.flags));
      if (input.wantsJson) writeCodeJson(result);
      else input.context.stdout.write(`${result.commitSha}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "review" && (subcommand === "approve" || subcommand === "reject")) {
      const reviewInput = {
        intentId: resolveCodeIntentId(input.positionals, input.flags, 3),
        reviewer: input.flags.reviewer ?? input.flags["agent-id"] ?? "operator",
        decision: (subcommand === "approve" ? "approved" : "rejected") as "approved" | "rejected",
        ...(input.flags.reason ? { reason: input.flags.reason } : {}),
      };
      const review = input.flags.project
        ? globalIndex.review(input.flags.project, reviewInput)
        : localLedger().review(reviewInput);
      if (input.wantsJson) writeCodeJson({ review });
      else input.context.stdout.write(`${review.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "gate") {
      const gate = input.flags.project
        ? globalIndex.gate(input.flags.project, resolveCodeIntentId(input.positionals, input.flags))
        : localLedger().gate(resolveCodeIntentId(input.positionals, input.flags));
      if (input.wantsJson) writeCodeJson({ gate });
      else input.context.stdout.write(`${gate.status}${gate.reasons.length > 0 ? ` ${gate.reasons.join("; ")}` : ""}\n`);
      return gate.status === "passed" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
    }

    if (command === "queue") {
      if (wantsAll) {
        const queue = globalIndex.listQueue(input.flags.project);
        if (input.wantsJson) writeCodeJson({ queue });
        else input.context.stdout.write(formatCliTable(queue.map((entry: { projectId: string; intentId: string; status: string }) => ({
          project: entry.projectId,
          intent: entry.intentId,
          status: entry.status,
        }))) + "\n");
        return CLI_EXIT_OK;
      }
      const queue = input.flags.project
        ? globalIndex.queueIntent(input.flags.project, resolveCodeIntentId(input.positionals, input.flags))
        : localLedger().queue(resolveCodeIntentId(input.positionals, input.flags));
      if (input.wantsJson) writeCodeJson({ queue });
      else input.context.stdout.write(`${queue.status}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "integrate") {
      const result = input.flags.project
        ? globalIndex.integrateIntent(input.flags.project, resolveCodeIntentId(input.positionals, input.flags))
        : localLedger().integrate(resolveCodeIntentId(input.positionals, input.flags));
      if (input.wantsJson) writeCodeJson(result);
      else input.context.stdout.write(`${result.integrationSha}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "sync" && subcommand === "github") {
      const syncInput = {
        intentId: resolveCodeIntentId(input.positionals, input.flags, 3),
        dryRun,
        ...(input.flags.repo ? { repo: input.flags.repo } : {}),
        ...(input.flags.base ? { base: input.flags.base } : {}),
      };
      const sync = input.flags.project
        ? globalIndex.syncGithub(input.flags.project, syncInput)
        : localLedger().syncGithub(syncInput);
      if (input.wantsJson) writeCodeJson({ sync });
      else input.context.stdout.write(`${sync.remoteUrl ?? sync.status}\n`);
      return sync.status === "failed" ? CLI_EXIT_FAILURE : CLI_EXIT_OK;
    }

    input.context.stderr.write(`Usage: ${input.binName} code init|projects|agents|policy|start|status|list|show|reserve|evidence add|check run|check record|commit|review approve|review reject|gate|queue|integrate|sync github|serve\n`);
    return CLI_EXIT_USAGE;
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "code", handled, jsonMeta());
    else input.context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }
}
