import type {
  CommitmentKind,
  CommitmentStatus,
  ContextPackPurpose,
  ContextPackStatus,
  JudgmentImpact,
  JudgmentStatus,
  LearningEvidenceSentiment,
  LearningKind,
  LearningPromotionTarget,
  LearningStatus,
  LearningTarget,
  OutcomeResult,
  OutcomeStatus,
  RuntimeAdapterId,
} from "@clawjs/core";

import type { CliContext } from "./index.ts";
import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { collectFlagValues, joinedPositionals, parseCsvFlag, readBooleanFlag } from "./cli-flag-parsers.ts";
import { cliErrorFromUnknown, writeCliError, writeJson } from "./cli-json.ts";
import { COMMITMENT_KINDS, COMMITMENT_STATUSES, CONTEXT_PURPOSES, CONTEXT_STATUSES, JUDGMENT_IMPACTS, JUDGMENT_STATUSES, LEARNING_KINDS, LEARNING_PROMOTION_TARGETS, LEARNING_SENTIMENTS, LEARNING_STATUSES, LEARNING_TARGETS, OUTCOME_RESULTS, OUTCOME_STATUSES } from "./cli-knowledge-constants.ts";
import { createCliClaw, createCliWorkspaceClaw } from "./cli-claw-factory.ts";
import { coreProductivityCollection, mergeCoreDbInput, pickCoreTitle, singularCoreCollection } from "./cli-productivity-utils.ts";
import { resolveRuntimeAdapterId } from "./cli-runtime-utils.ts";

export async function runCoreProductivityDbCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  workspaceRoot: string;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  wantsJson: boolean;
  appId: string;
  workspaceId: string;
  agentId: string;
  contextCwd: string;
}): Promise<number> {
  const { argv, flags, workspaceRoot, stdout, stderr, wantsJson, appId, workspaceId, agentId, contextCwd } = input;
  let { positionals } = input;
  const collectionName = coreProductivityCollection(positionals[1]);
  if (!collectionName) {
    throw new CliHandledError("usage_error", "Unknown productivity collection.", CLI_EXIT_USAGE);
  }
  const rawAction = positionals[2];
  const dbActions = new Set(["list", "get", "create", "update", "delete", "schema"]);
  const action = dbActions.has(rawAction || "") ? rawAction! : "create";
  if (!dbActions.has(rawAction || "")) {
    positionals = [positionals[0], positionals[1], "create", ...positionals.slice(2)];
  }
  const claw = await createCliWorkspaceClaw(resolveRuntimeAdapterId(flags), flags, workspaceRoot, appId, workspaceId, agentId, contextCwd);
  if (!wantsJson) stderr.write("Using local database for this project\n");

  const apiName = ({
    people: "people",
    saved_views: "savedViews",
    custom_fields: "customFields",
    field_values: "fieldValues",
  } as Record<string, string>)[collectionName] ?? collectionName;
  const api = (claw as unknown as Record<string, any>)[apiName];
  if (!api) {
    throw new CliHandledError("usage_error", `Unsupported productivity collection "${collectionName}".`, CLI_EXIT_USAGE);
  }

  if (action === "schema") {
    const primary = collectionName === "people" ? "displayName" : ["projects", "cycles", "saved_views", "custom_fields", "templates"].includes(collectionName) ? "name" : collectionName === "field_values" ? "fieldId" : collectionName === "comments" ? "body" : "title";
    writeJson(stdout, {
      exists: true,
      collection: {
        name: collectionName,
        builtin: true,
        protected: true,
        fields: [
          { name: "id", type: "text", required: true },
          { name: primary, type: "text", required: true },
          { name: "status", type: "text" },
          { name: "createdAt", type: "datetime" },
          { name: "updatedAt", type: "datetime" },
          { name: "archivedAt", type: "datetime" },
        ],
      },
      autoCreateOnWrite: false,
    });
    return CLI_EXIT_OK;
  }

  if (action === "list") {
    const items = await api.list({
      ...(flags.status ? { status: parseCsvFlag(flags.status) } : {}),
      ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
      ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
      ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
      ...(flags["anchor-id"] ? { anchorId: flags["anchor-id"] } : {}),
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
    });
    if (wantsJson) writeJson(stdout, items);
    else stdout.write(`${items.map((item: any) => `${item.status ?? ""} ${item.id} ${item.title ?? item.name ?? item.displayName ?? ""}`.trim()).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "get") {
    const id = positionals[3] || flags.id;
    if (!id) throw new CliHandledError("usage_error", "Usage: claw db <collection> get <id>", CLI_EXIT_USAGE);
    const item = collectionName === "people" ? await claw.people.get(id) : await api.get(id);
    if (!item) throw new CliHandledError("not_found", `${collectionName} record not found: ${id}`);
    if (wantsJson) writeJson(stdout, item);
    else stdout.write(`${Object.entries(item).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "delete") {
    const id = positionals[3] || flags.id;
    if (!id) throw new CliHandledError("usage_error", "Usage: claw db <collection> delete <id> [--force]", CLI_EXIT_USAGE);
    if (collectionName === "people") {
      throw new CliHandledError("unsupported_operation", "People records do not support delete through the productivity API.");
    }
    const force = readBooleanFlag(argv, flags, "force", false);
    if (force) {
      const removed = await api.remove(id);
      if (!removed) throw new CliHandledError("not_found", `${collectionName} record not found: ${id}`);
      if (wantsJson) writeJson(stdout, { ok: true, deleted: true, archived: false });
      else stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    const archived = await api.archive(id);
    if (wantsJson) writeJson(stdout, { ok: true, deleted: false, archived: true, record: archived });
    else stdout.write(`${archived.id}\n`);
    return CLI_EXIT_OK;
  }

  const { recordId, payload } = mergeCoreDbInput(action as "create" | "update", collectionName, positionals, flags, argv);
  if (action === "update" && !recordId) {
    throw new CliHandledError("usage_error", "Usage: claw db <collection> update <id> [--set key=value ...]", CLI_EXIT_USAGE);
  }

  let result: unknown;
  if (collectionName === "people") {
    const displayName = pickCoreTitle(collectionName, payload);
    if (!displayName) throw new CliHandledError("usage_error", "Usage: claw db people create <display-name>", CLI_EXIT_USAGE);
    result = await claw.people.upsert({
      id: action === "update" ? recordId : typeof payload.id === "string" ? payload.id : undefined,
      displayName,
      kind: payload.kind as "human" | "agent" | "org" | undefined,
      emails: Array.isArray(payload.emails) ? payload.emails as string[] : undefined,
      phones: Array.isArray(payload.phones) ? payload.phones as string[] : undefined,
      handles: Array.isArray(payload.handles) ? payload.handles as string[] : undefined,
      role: typeof payload.role === "string" ? payload.role : undefined,
      organization: typeof payload.organization === "string" ? payload.organization : undefined,
    });
  } else if (action === "create") {
    const requiredTitle = pickCoreTitle(collectionName, payload);
    if (!requiredTitle) throw new CliHandledError("usage_error", `Usage: claw db ${collectionName} create <title>`, CLI_EXIT_USAGE);
    result = await api.create(payload);
  } else {
    const current = await api.get(recordId);
    if (!current) throw new CliHandledError("not_found", `${collectionName} record not found: ${recordId}`);
    result = await api.update(recordId, payload);
  }

  if (wantsJson) writeJson(stdout, result);
  else {
    const record = result as { id?: string; title?: string; name?: string; displayName?: string };
    stdout.write(`${action === "create" ? "Created" : "Updated"} ${singularCoreCollection(collectionName)} ${record.id ?? ""} "${record.title ?? record.name ?? record.displayName ?? ""}"\n`);
  }
  return CLI_EXIT_OK;
}

export async function archiveOrRemoveProductivityRecord(
  api: { archive: (id: string) => Promise<unknown>; remove: (id: string) => Promise<boolean> },
  id: string,
  argv: string[],
  flags: Record<string, string>,
  label: string,
): Promise<{ ok: true; deleted: boolean; archived: boolean; record?: unknown }> {
  if (readBooleanFlag(argv, flags, "force", false)) {
    const removed = await api.remove(id);
    if (!removed) throw new CliHandledError("not_found", `${label} record not found: ${id}`);
    return { ok: true, deleted: true, archived: false };
  }
  const record = await api.archive(id);
  return { ok: true, deleted: false, archived: true, record };
}

function requireOneOf<T extends string>(value: string | undefined, values: Set<string>, label: string): T {
  if (!value || !values.has(value)) {
    throw new CliHandledError("usage_error", `${label} must be one of: ${[...values].join(", ")}`, CLI_EXIT_USAGE);
  }
  return value as T;
}

export async function runOutcomesCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
}): Promise<number> {
  const { argv, positionals, flags, context, wantsJson, binName, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId } = input;
  const [, command, subcommand] = positionals;
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);

  try {
    if (command === "add") {
      const subject = flags.subject || flags.title || joinedPositionals(positionals, 2);
      const result = requireOneOf<OutcomeResult>(flags.result, OUTCOME_RESULTS, "result");
      const note = flags.note || flags.reason;
      const score = flags.score !== undefined ? Number(flags.score) : Number.NaN;
      if (!subject || !note || !Number.isFinite(score)) {
        context.stderr.write(`Usage: ${binName} outcomes add --subject TEXT --result worked|failed|mixed --score 0.82 --note TEXT\n`);
        return CLI_EXIT_USAGE;
      }
      const outcome = claw.outcomes.add({
        subject,
        result,
        score,
        note,
        judgment: flags.judgment || flags["judgment-id"],
        session: flags.session || flags["session-id"],
        learning: flags.learning || flags["learning-id"],
        task: flags.task || flags["task-id"],
        artifact: flags.artifact || flags["artifact-id"],
      });
      if (wantsJson) writeJson(context.stdout, outcome);
      else context.stdout.write(`${outcome.id} ${outcome.result} score=${outcome.score.toFixed(2)} gap=${outcome.confidenceGap?.toFixed(2) ?? "n/a"}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "capture") {
      const sessionId = flags.session || flags["session-id"] || subcommand;
      if (!sessionId) {
        context.stderr.write(`Usage: ${binName} outcomes capture --session <session-id> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const result = claw.outcomes.capture({ sessionId });
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(result.ignored ? `ignored ${sessionId}: ${result.reason ?? "no outcome"}\n` : `${result.outcomes.map((outcome) => `${outcome.id} ${outcome.result} ${outcome.subject}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      const outcomes = claw.outcomes.list({
        ...(flags.result ? { result: requireOneOf<OutcomeResult>(flags.result, OUTCOME_RESULTS, "result") } : {}),
        ...(flags.status ? { status: requireOneOf<OutcomeStatus>(flags.status, OUTCOME_STATUSES, "status") } : {}),
        ...(flags.judgment ? { judgment: flags.judgment } : {}),
      });
      if (wantsJson) writeJson(context.stdout, { outcomes });
      else context.stdout.write(`${outcomes.map((outcome) => `${outcome.status} ${outcome.result} ${outcome.score.toFixed(2)} ${outcome.id} ${outcome.subject}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "show" || command === "inspect") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} outcomes show <outcome-id> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const outcome = claw.outcomes.show(id);
      if (!outcome) throw new CliHandledError("not_found", `Outcome not found: ${id}`, CLI_EXIT_FAILURE);
      if (wantsJson) writeJson(context.stdout, outcome);
      else context.stdout.write(`${outcome.status} ${outcome.result} ${outcome.id}\n${outcome.subject}\nscore=${outcome.score.toFixed(2)} expected=${outcome.expectedConfidence?.toFixed(2) ?? "n/a"} gap=${outcome.confidenceGap?.toFixed(2) ?? "n/a"}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "link") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} outcomes link <outcome-id> --judgment ID|--learning ID|--session ID|--task ID|--artifact ID\n`);
        return CLI_EXIT_USAGE;
      }
      const outcome = claw.outcomes.link(id, {
        judgment: flags.judgment || flags["judgment-id"],
        session: flags.session || flags["session-id"],
        learning: flags.learning || flags["learning-id"],
        task: flags.task || flags["task-id"],
        artifact: flags.artifact || flags["artifact-id"],
      });
      if (wantsJson) writeJson(context.stdout, outcome);
      else context.stdout.write(`${outcome.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "archive") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} outcomes archive <outcome-id> [--reason TEXT]\n`);
        return CLI_EXIT_USAGE;
      }
      const outcome = claw.outcomes.archive(id, flags.reason);
      if (wantsJson) writeJson(context.stdout, outcome);
      else context.stdout.write(`archived ${outcome.id}\n`);
      return CLI_EXIT_OK;
    }
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) writeCliError(context.stdout, handled);
    else context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }

  context.stderr.write(`Usage: ${binName} outcomes add|capture|list|show|link|archive\n`);
  return CLI_EXIT_USAGE;
}

export async function runContextCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
}): Promise<number> {
  const { argv, positionals, flags, context, wantsJson, binName, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId } = input;
  const [, command, subcommand] = positionals;
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);

  try {
    if (command === "prepare") {
      const query = flags.query || flags.prompt || joinedPositionals(positionals, 2);
      if (!query) {
        context.stderr.write(`Usage: ${binName} context prepare --query TEXT [--purpose judgment|prompt|task|session|manual]\n`);
        return CLI_EXIT_USAGE;
      }
      const pack = claw.context.prepare({
        query,
        purpose: flags.purpose ? requireOneOf<ContextPackPurpose>(flags.purpose, CONTEXT_PURPOSES, "purpose") : undefined,
        domain: flags.domain,
        sessionId: flags.session || flags["session-id"],
        ...(flags["max-items"] ? { maxItems: Number(flags["max-items"]) } : {}),
        ...(flags["max-chars"] ? { maxChars: Number(flags["max-chars"]) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, pack);
      else context.stdout.write(`${pack.id} ${pack.purpose} items=${pack.items.length} chars=${pack.budget.charCount}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      const packs = claw.context.list({
        ...(flags.purpose ? { purpose: requireOneOf<ContextPackPurpose>(flags.purpose, CONTEXT_PURPOSES, "purpose") } : {}),
        ...(flags.status ? { status: requireOneOf<ContextPackStatus>(flags.status, CONTEXT_STATUSES, "status") } : {}),
      });
      if (wantsJson) writeJson(context.stdout, { contexts: packs });
      else context.stdout.write(`${packs.map((pack) => `${pack.status} ${pack.purpose} ${pack.id} items=${pack.items.length} ${pack.query}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "show" || command === "inspect") {
      const id = subcommand || flags.id || flags.context;
      if (!id) {
        context.stderr.write(`Usage: ${binName} context show <context-id> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const pack = claw.context.show(id);
      if (!pack) throw new CliHandledError("not_found", `Context pack not found: ${id}`, CLI_EXIT_FAILURE);
      if (wantsJson) writeJson(context.stdout, pack);
      else context.stdout.write(`${pack.status} ${pack.purpose} ${pack.id}\n${pack.summary}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "archive") {
      const id = subcommand || flags.id || flags.context;
      if (!id) {
        context.stderr.write(`Usage: ${binName} context archive <context-id> [--reason TEXT]\n`);
        return CLI_EXIT_USAGE;
      }
      const pack = claw.context.archive(id, flags.reason);
      if (wantsJson) writeJson(context.stdout, pack);
      else context.stdout.write(`archived ${pack.id}\n`);
      return CLI_EXIT_OK;
    }
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) writeCliError(context.stdout, handled);
    else context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }

  context.stderr.write(`Usage: ${binName} context prepare|list|show|archive\n`);
  return CLI_EXIT_USAGE;
}

export async function runCommitmentsCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
}): Promise<number> {
  const { argv, positionals, flags, context, wantsJson, binName, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId } = input;
  const [, command, subcommand] = positionals;
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);

  try {
    if (command === "capture") {
      const sessionId = flags.session || flags["session-id"] || subcommand;
      if (!sessionId) {
        context.stderr.write(`Usage: ${binName} commitments capture --session SESSION_ID [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const result = claw.commitments.capture({
        sessionId,
        ownerAgentId: flags["owner-agent"] || flags["owner-agent-id"],
        beneficiaryUserId: flags["beneficiary-user"] || flags["beneficiary-user-id"],
      });
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(result.ignored ? `${result.reason ?? "No commitments captured."}\n` : `${result.commitments.map((commitment) => commitment.id).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "add") {
      const claim = flags.claim || joinedPositionals(positionals, 2);
      const kind = requireOneOf<CommitmentKind>(flags.kind, COMMITMENT_KINDS, "kind");
      if (!claim) {
        context.stderr.write(`Usage: ${binName} commitments add --claim TEXT --kind promise|follow_up|delivery [--remind-at ISO]\n`);
        return CLI_EXIT_USAGE;
      }
      const commitment = await claw.commitments.add({
        claim,
        kind,
        ownerAgentId: flags["owner-agent"] || flags["owner-agent-id"],
        ownerUserId: flags["owner-user"] || flags["owner-user-id"],
        beneficiaryUserId: flags["beneficiary-user"] || flags["beneficiary-user-id"],
        beneficiaryAgentId: flags["beneficiary-agent"] || flags["beneficiary-agent-id"],
        sessionId: flags.session || flags["session-id"],
        remindAt: flags["remind-at"],
        dueAt: flags["due-at"],
        taskId: flags.task || flags["task-id"],
      });
      if (wantsJson) writeJson(context.stdout, commitment);
      else context.stdout.write(`${commitment.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      const commitments = claw.commitments.list({
        ...(flags.status ? { status: requireOneOf<CommitmentStatus>(flags.status, COMMITMENT_STATUSES, "status") } : {}),
        ...(flags.kind ? { kind: requireOneOf<CommitmentKind>(flags.kind, COMMITMENT_KINDS, "kind") } : {}),
        ...(flags["owner-agent"] || flags["owner-agent-id"] ? { ownerAgentId: flags["owner-agent"] || flags["owner-agent-id"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, { commitments });
      else context.stdout.write(`${commitments.map((commitment) => `${commitment.status} ${commitment.kind} ${commitment.id} ${commitment.claim}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "show" || command === "inspect") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} commitments show <commitment-id> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const commitment = claw.commitments.show(id);
      if (!commitment) throw new CliHandledError("not_found", `Commitment not found: ${id}`, CLI_EXIT_FAILURE);
      if (wantsJson) writeJson(context.stdout, commitment);
      else context.stdout.write(`${commitment.status} ${commitment.kind} ${commitment.id}\n${commitment.claim}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "fulfill" || command === "miss") {
      const id = subcommand || flags.id;
      const text = command === "fulfill" ? flags.outcome : flags.reason;
      if (!id || !text) {
        context.stderr.write(`Usage: ${binName} commitments ${command} <commitment-id> --${command === "fulfill" ? "outcome" : "reason"} TEXT\n`);
        return CLI_EXIT_USAGE;
      }
      const payload = {
        outcome: command === "fulfill" ? text : undefined,
        reason: command === "miss" ? text : undefined,
        evidenceSessionId: flags["evidence-session"] || flags.session || flags["session-id"],
        artifactId: flags.artifact || flags["artifact-id"],
      };
      const commitment = command === "fulfill" ? claw.commitments.fulfill(id, payload) : claw.commitments.miss(id, payload);
      if (wantsJson) writeJson(context.stdout, commitment);
      else context.stdout.write(`${commitment.status} ${commitment.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "cancel") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} commitments cancel <commitment-id> [--reason TEXT]\n`);
        return CLI_EXIT_USAGE;
      }
      const commitment = claw.commitments.cancel(id, flags.reason);
      if (wantsJson) writeJson(context.stdout, commitment);
      else context.stdout.write(`${commitment.status} ${commitment.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "link") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} commitments link <commitment-id> [--judgment ID] [--task ID]\n`);
        return CLI_EXIT_USAGE;
      }
      const commitment = claw.commitments.link(id, {
        session: flags.session || flags["session-id"],
        judgment: flags.judgment || flags["judgment-id"],
        decision: flags.decision || flags["decision-id"],
        learning: flags.learning || flags["learning-id"],
        task: flags.task || flags["task-id"],
        reminder: flags.reminder || flags["reminder-id"],
        deadline: flags.deadline || flags["deadline-id"],
        artifact: flags.artifact || flags["artifact-id"],
      });
      if (wantsJson) writeJson(context.stdout, commitment);
      else context.stdout.write(`${commitment.id}\n`);
      return CLI_EXIT_OK;
    }
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) writeCliError(context.stdout, handled);
    else context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }

  context.stderr.write(`Usage: ${binName} commitments capture|add|list|show|fulfill|miss|cancel|link\n`);
  return CLI_EXIT_USAGE;
}

export async function runJudgmentCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
}): Promise<number> {
  const { argv, positionals, flags, context, wantsJson, binName, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId } = input;
  const [, command, subcommand] = positionals;
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);

  try {
    if (command === "prepare") {
      const question = flags.question || flags.prompt || joinedPositionals(positionals, 2);
      const domain = flags.domain;
      if (!question || !domain) {
        context.stderr.write(`Usage: ${binName} judgment prepare --question TEXT --domain DOMAIN [--impact low|medium|high|critical] [--option VALUE ...]\n`);
        return CLI_EXIT_USAGE;
      }
      const judgment = claw.judgment.prepare({
        question,
        domain,
        impact: flags.impact ? requireOneOf<JudgmentImpact>(flags.impact, JUDGMENT_IMPACTS, "impact") : undefined,
        options: collectFlagValues(argv, "option"),
        sessionId: flags.session || flags["session-id"],
      });
      if (wantsJson) writeJson(context.stdout, judgment);
      else context.stdout.write(`${judgment.id} ${judgment.recommendation} ${judgment.recommendedOption ?? ""} confidence=${judgment.confidence.toFixed(2)}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "record") {
      const id = subcommand || flags.id;
      const chosen = flags.chosen || flags.option;
      const rationale = flags.rationale || flags.reason;
      if (!id || !chosen || !rationale) {
        context.stderr.write(`Usage: ${binName} judgment record <judgment-id> --chosen VALUE --rationale TEXT [--confidence 0.8]\n`);
        return CLI_EXIT_USAGE;
      }
      const judgment = claw.judgment.record(id, {
        chosen,
        rationale,
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
        outcome: flags.outcome,
      });
      if (wantsJson) writeJson(context.stdout, judgment);
      else context.stdout.write(`${judgment.id} ${judgment.status} ${judgment.chosenOption ?? ""}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      const judgments = claw.judgment.list({
        ...(flags.status ? { status: requireOneOf<JudgmentStatus>(flags.status, JUDGMENT_STATUSES, "status") } : {}),
        ...(flags.domain ? { domain: flags.domain } : {}),
      });
      if (wantsJson) writeJson(context.stdout, { judgments });
      else context.stdout.write(`${judgments.map((judgment) => `${judgment.status} ${judgment.confidence.toFixed(2)} ${judgment.id} ${judgment.question}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "show" || command === "inspect") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} judgment show <judgment-id> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const judgment = claw.judgment.show(id);
      if (!judgment) throw new CliHandledError("not_found", `Judgment not found: ${id}`, CLI_EXIT_FAILURE);
      if (wantsJson) writeJson(context.stdout, judgment);
      else context.stdout.write(`${judgment.status} ${judgment.recommendation} ${judgment.id}\n${judgment.question}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "link") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} judgment link <judgment-id> --learning ID|--rule ID|--session ID|--decision ID\n`);
        return CLI_EXIT_USAGE;
      }
      const judgment = claw.judgment.link(id, {
        learning: flags.learning,
        rule: flags.rule,
        session: flags.session || flags["session-id"],
        decision: flags.decision || flags["decision-id"],
        artifact: flags.artifact || flags["artifact-id"],
        plan: flags.plan || flags["plan-id"],
        task: flags.task || flags["task-id"],
      });
      if (wantsJson) writeJson(context.stdout, judgment);
      else context.stdout.write(`${judgment.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "archive") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} judgment archive <judgment-id> [--reason TEXT]\n`);
        return CLI_EXIT_USAGE;
      }
      const judgment = claw.judgment.archive(id, flags.reason);
      if (wantsJson) writeJson(context.stdout, judgment);
      else context.stdout.write(`archived ${judgment.id}\n`);
      return CLI_EXIT_OK;
    }
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) writeCliError(context.stdout, handled);
    else context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }

  context.stderr.write(`Usage: ${binName} judgment prepare|record|list|show|link|archive\n`);
  return CLI_EXIT_USAGE;
}

export async function runLearningCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
}): Promise<number> {
  const { argv, positionals, flags, context, wantsJson, binName, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId } = input;
  const [, command, subcommand] = positionals;
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);

  try {
    if (command === "capture") {
      const sessionId = flags.session || flags["session-id"] || subcommand;
      if (!sessionId) {
        context.stderr.write(`Usage: ${binName} learning capture --session <session-id> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const result = claw.learning.capture({ sessionId });
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(result.ignored ? `ignored ${sessionId}: ${result.reason ?? "no learning"}\n` : `${result.learnings.map((learning) => `${learning.id} ${learning.claim}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "add") {
      const claim = flags.claim || joinedPositionals(positionals, 2);
      const evidenceSessionId = flags["evidence-session"] || flags.session || flags["session-id"];
      if (!claim || !evidenceSessionId) {
        context.stderr.write(`Usage: ${binName} learning add --claim TEXT --target user|agent|project|workflow|runtime|ui --kind preference|observation|correction|workflow|failure --evidence-session ID\n`);
        return CLI_EXIT_USAGE;
      }
      const learning = claw.learning.add({
        claim,
        target: requireOneOf<LearningTarget>(flags.target, LEARNING_TARGETS, "target"),
        kind: requireOneOf<LearningKind>(flags.kind, LEARNING_KINDS, "kind"),
        evidenceSessionId,
        sentiment: flags.sentiment ? requireOneOf<LearningEvidenceSentiment>(flags.sentiment, LEARNING_SENTIMENTS, "sentiment") : undefined,
        note: flags.note,
        quote: flags.quote,
      });
      if (wantsJson) writeJson(context.stdout, learning);
      else context.stdout.write(`${learning.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      const learnings = claw.learning.list({
        ...(flags.target ? { target: requireOneOf<LearningTarget>(flags.target, LEARNING_TARGETS, "target") } : {}),
        ...(flags.kind ? { kind: requireOneOf<LearningKind>(flags.kind, LEARNING_KINDS, "kind") } : {}),
        ...(flags.status ? { status: requireOneOf<LearningStatus>(flags.status, LEARNING_STATUSES, "status") } : {}),
      });
      if (wantsJson) writeJson(context.stdout, { learnings });
      else context.stdout.write(`${learnings.map((learning) => `${learning.status} ${learning.confidence.toFixed(2)} ${learning.id} ${learning.claim}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "show" || command === "inspect") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} learning show <learning-id> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const learning = claw.learning.show(id);
      if (!learning) throw new CliHandledError("not_found", `Learning not found: ${id}`, CLI_EXIT_FAILURE);
      if (wantsJson) writeJson(context.stdout, learning);
      else context.stdout.write(`${learning.status} ${learning.confidence.toFixed(2)} ${learning.id}\n${learning.claim}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "evidence" && subcommand === "add") {
      const id = positionals[3] || flags.id || flags.learning;
      const sessionId = flags.session || flags["session-id"];
      const note = flags.note;
      if (!id || !sessionId || !note) {
        context.stderr.write(`Usage: ${binName} learning evidence add <learning-id> --session ID --sentiment positive|negative|neutral --note TEXT\n`);
        return CLI_EXIT_USAGE;
      }
      const learning = claw.learning.addEvidence(id, {
        sessionId,
        sentiment: requireOneOf<LearningEvidenceSentiment>(flags.sentiment, LEARNING_SENTIMENTS, "sentiment"),
        note,
        quote: flags.quote,
      });
      if (wantsJson) writeJson(context.stdout, learning);
      else context.stdout.write(`${learning.id} confidence=${learning.confidence.toFixed(2)} evidence=${learning.evidence.length}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "promote") {
      const id = subcommand || flags.id || flags.learning;
      const to = requireOneOf<LearningPromotionTarget>(flags.to, LEARNING_PROMOTION_TARGETS, "to");
      if (!id) {
        context.stderr.write(`Usage: ${binName} learning promote <learning-id> --to rule|user|soul|skill|memory --dry-run|--apply\n`);
        return CLI_EXIT_USAGE;
      }
      const apply = readBooleanFlag(argv, flags, "apply", false);
      const dryRun = readBooleanFlag(argv, flags, "dry-run", !apply);
      const result = claw.learning.promote(id, { to, dryRun, apply });
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(`${result.applied ? "applied" : "dry-run"} ${to} ${id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "archive") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} learning archive <learning-id> [--reason TEXT]\n`);
        return CLI_EXIT_USAGE;
      }
      const learning = claw.learning.archive(id, flags.reason);
      if (wantsJson) writeJson(context.stdout, learning);
      else context.stdout.write(`archived ${learning.id}\n`);
      return CLI_EXIT_OK;
    }
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) writeCliError(context.stdout, handled);
    else context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }

  context.stderr.write(`Usage: ${binName} learning capture|add|list|show|evidence add|promote|archive\n`);
  return CLI_EXIT_USAGE;
}
