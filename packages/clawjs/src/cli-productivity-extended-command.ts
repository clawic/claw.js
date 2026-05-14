// @ts-nocheck
import type { RuntimeAdapterId } from "@clawjs/core";

import type { CliContext } from "./index.ts";
import { createCliWorkspaceClaw } from "./cli-claw-factory.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { joinedPositionals, parseCsvFlag, readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeJson } from "./cli-json.ts";
import { archiveOrRemoveProductivityRecord } from "./cli-productivity-command.ts";

export async function runExtendedProductivityCli(input: {
  argv: string[];
  group: string | undefined;
  command: string | undefined;
  subcommand: string | undefined;
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  runtimeAdapterId: RuntimeAdapterId;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
}): Promise<number | null> {
  const { argv, group, command, subcommand, positionals, flags, context, wantsJson, runtimeAdapterId, workspaceRoot, appId, workspaceId, agentId } = input;

  if (group === "milestones") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const milestones = await claw.milestones.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"planned" | "active" | "done" | "archived"> } : {}),
        ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, milestones);
      else context.stdout.write(`${milestones.map((milestone) => `${milestone.status} ${milestone.id} ${milestone.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw milestones get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const milestone = await claw.milestones.get(id);
      if (!milestone) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, milestone);
      else context.stdout.write(`${milestone.status} ${milestone.id} ${milestone.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw milestones create <title> [--project-id ID] [--area-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const milestone = await claw.milestones.create({
        title,
        description: flags.description,
        status: flags.status as "planned" | "active" | "done" | "archived" | undefined,
        areaId: flags["area-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        targetDate: flags["target-date"],
        completedAt: flags["completed-at"],
      });
      if (wantsJson) writeJson(context.stdout, milestone);
      else context.stdout.write(`${milestone.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw milestones update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const milestone = await claw.milestones.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "planned" | "active" | "done" | "archived" | undefined,
        areaId: flags["area-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        targetDate: flags["target-date"],
        completedAt: flags["completed-at"],
      });
      if (wantsJson) writeJson(context.stdout, milestone);
      else context.stdout.write(`${milestone.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw milestones delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.milestones, id, argv, flags, "milestones");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw milestones search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.milestones.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "activity") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const activity = await claw.activity.list({
        entityType: flags["entity-type"] as any,
        entityId: flags["entity-id"],
        projectId: flags["project-id"],
        taskId: flags["task-id"],
        threadId: flags["thread-id"],
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, activity);
      else context.stdout.write(`${activity.map((entry) => `${entry.kind} ${entry.id} ${entry.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw activity get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const entry = await claw.activity.get(id);
      if (!entry) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, entry);
      else context.stdout.write(`${entry.kind} ${entry.id} ${entry.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw activity search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.activity.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "blockers") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const blockers = await claw.blockers.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "resolved" | "cancelled"> } : {}),
        ...(flags.kind ? { kind: parseCsvFlag(flags.kind) as Array<"waiting_human" | "waiting_agent" | "waiting_system" | "missing_context" | "policy_block"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, blockers);
      else context.stdout.write(`${blockers.map((blocker) => `${blocker.status} ${blocker.id} ${blocker.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw blockers get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const blocker = await claw.blockers.get(id);
      if (!blocker) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, blocker);
      else context.stdout.write(`${blocker.status} ${blocker.id} ${blocker.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags.kind) {
        context.stderr.write("Usage: claw blockers create <title> --kind waiting_human|waiting_agent|waiting_system|missing_context|policy_block\n");
        return CLI_EXIT_USAGE;
      }
      const blocker = await claw.blockers.create({
        title,
        description: flags.description,
        kind: flags.kind as "waiting_human" | "waiting_agent" | "waiting_system" | "missing_context" | "policy_block",
        status: flags.status as "active" | "resolved" | "cancelled" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        dependencyTaskIds: parseCsvFlag(flags["dependency-task-ids"]),
        evidenceIds: parseCsvFlag(flags["evidence-ids"]),
        resolvedAt: flags["resolved-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, blocker);
      else context.stdout.write(`${blocker.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw blockers update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const blocker = await claw.blockers.update(id, {
        title: flags.title,
        description: flags.description,
        kind: flags.kind as "waiting_human" | "waiting_agent" | "waiting_system" | "missing_context" | "policy_block" | undefined,
        status: flags.status as "active" | "resolved" | "cancelled" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        ...(flags["dependency-task-ids"] ? { dependencyTaskIds: parseCsvFlag(flags["dependency-task-ids"]) } : {}),
        ...(flags["evidence-ids"] ? { evidenceIds: parseCsvFlag(flags["evidence-ids"]) } : {}),
        resolvedAt: flags["resolved-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, blocker);
      else context.stdout.write(`${blocker.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw blockers delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.blockers, id, argv, flags, "blockers");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw blockers search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.blockers.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "artifacts") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const artifacts = await claw.artifacts.list({
        ...(flags.kind ? { kind: parseCsvFlag(flags.kind) as Array<"link" | "file" | "command" | "test" | "screenshot" | "message" | "note"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["thread-id"] ? { threadId: flags["thread-id"] } : {}),
        ...(flags["decision-id"] ? { decisionId: flags["decision-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, artifacts);
      else context.stdout.write(`${artifacts.map((artifact) => `${artifact.kind} ${artifact.id} ${artifact.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw artifacts get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const artifact = await claw.artifacts.get(id);
      if (!artifact) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, artifact);
      else context.stdout.write(`${artifact.kind} ${artifact.id} ${artifact.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags.kind) {
        context.stderr.write("Usage: claw artifacts create <title> --kind link|file|command|test|screenshot|message|note\n");
        return CLI_EXIT_USAGE;
      }
      const artifact = await claw.artifacts.create({
        title,
        kind: flags.kind as "link" | "file" | "command" | "test" | "screenshot" | "message" | "note",
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        threadId: flags["thread-id"],
        decisionId: flags["decision-id"],
        uri: flags.uri,
        summary: flags.summary,
        content: flags.content,
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, artifact);
      else context.stdout.write(`${artifact.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw artifacts update <id> [--title TEXT] [--kind KIND]\n");
        return CLI_EXIT_USAGE;
      }
      const artifact = await claw.artifacts.update(id, {
        title: flags.title,
        kind: flags.kind as "link" | "file" | "command" | "test" | "screenshot" | "message" | "note" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        threadId: flags["thread-id"],
        decisionId: flags["decision-id"],
        uri: flags.uri,
        summary: flags.summary,
        content: flags.content,
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, artifact);
      else context.stdout.write(`${artifact.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw artifacts delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.artifacts, id, argv, flags, "artifacts");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw artifacts search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.artifacts.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "decisions") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const decisions = await claw.decisions.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"proposed" | "accepted" | "rejected" | "superseded"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["owner-person-id"] ? { ownerPersonId: flags["owner-person-id"] } : {}),
        ...(flags["owner-agent-id"] ? { ownerAgentId: flags["owner-agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, decisions);
      else context.stdout.write(`${decisions.map((decision) => `${decision.status} ${decision.id} ${decision.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw decisions get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const decision = await claw.decisions.get(id);
      if (!decision) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, decision);
      else context.stdout.write(`${decision.status} ${decision.id} ${decision.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw decisions create <title> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const decision = await claw.decisions.create({
        title,
        summary: flags.summary,
        status: flags.status as "proposed" | "accepted" | "rejected" | "superseded" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        outcome: flags.outcome,
        rationale: flags.rationale,
        alternatives: parseCsvFlag(flags.alternatives),
        artifactIds: parseCsvFlag(flags["artifact-ids"]),
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, decision);
      else context.stdout.write(`${decision.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw decisions update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const decision = await claw.decisions.update(id, {
        title: flags.title,
        summary: flags.summary,
        status: flags.status as "proposed" | "accepted" | "rejected" | "superseded" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        outcome: flags.outcome,
        rationale: flags.rationale,
        ...(flags.alternatives ? { alternatives: parseCsvFlag(flags.alternatives) } : {}),
        ...(flags["artifact-ids"] ? { artifactIds: parseCsvFlag(flags["artifact-ids"]) } : {}),
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, decision);
      else context.stdout.write(`${decision.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw decisions delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.decisions, id, argv, flags, "decisions");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw decisions search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.decisions.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "work-sessions") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const sessions = await claw.workSessions.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "completed" | "cancelled"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, sessions);
      else context.stdout.write(`${sessions.map((session) => `${session.status} ${session.id} ${session.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw work-sessions get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const session = await claw.workSessions.get(id);
      if (!session) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, session);
      else context.stdout.write(`${session.status} ${session.id} ${session.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw work-sessions create <title> [--task-ids a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const session = await claw.workSessions.create({
        title,
        status: flags.status as "active" | "completed" | "cancelled" | undefined,
        objective: flags.objective,
        taskIds: parseCsvFlag(flags["task-ids"]),
        blockerIds: parseCsvFlag(flags["blocker-ids"]),
        startedAt: flags["started-at"],
        endedAt: flags["ended-at"],
        outcome: flags.outcome,
        ...(flags["timebox-minutes"] ? { timeboxMinutes: Number(flags["timebox-minutes"]) } : {}),
        ownerAgentId: flags["owner-agent-id"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, session);
      else context.stdout.write(`${session.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw work-sessions update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const session = await claw.workSessions.update(id, {
        title: flags.title,
        status: flags.status as "active" | "completed" | "cancelled" | undefined,
        objective: flags.objective,
        ...(flags["task-ids"] ? { taskIds: parseCsvFlag(flags["task-ids"]) } : {}),
        ...(flags["blocker-ids"] ? { blockerIds: parseCsvFlag(flags["blocker-ids"]) } : {}),
        startedAt: flags["started-at"],
        endedAt: flags["ended-at"],
        outcome: flags.outcome,
        ...(flags["timebox-minutes"] ? { timeboxMinutes: Number(flags["timebox-minutes"]) } : {}),
        ownerAgentId: flags["owner-agent-id"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, session);
      else context.stdout.write(`${session.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "complete" || command === "cancel") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw work-sessions ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const session = command === "complete"
        ? await claw.workSessions.complete(id, flags.outcome)
        : await claw.workSessions.cancel(id);
      if (wantsJson) writeJson(context.stdout, session);
      else context.stdout.write(`${session.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw work-sessions delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.workSessions, id, argv, flags, "work-sessions");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw work-sessions search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.workSessions.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "assignments") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const assignments = await claw.assignments.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"proposed" | "accepted" | "rejected" | "released" | "completed"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["assigned-to-agent-id"] ? { assignedToAgentId: flags["assigned-to-agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, assignments);
      else context.stdout.write(`${assignments.map((assignment) => `${assignment.status} ${assignment.id} ${assignment.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw assignments get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const assignment = await claw.assignments.get(id);
      if (!assignment) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, assignment);
      else context.stdout.write(`${assignment.status} ${assignment.id} ${assignment.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      const assignedToAgentId = flags["assigned-to-agent-id"];
      if (!title || !assignedToAgentId) {
        context.stderr.write("Usage: claw assignments create <title> --assigned-to-agent-id ID\n");
        return CLI_EXIT_USAGE;
      }
      const assignment = await claw.assignments.create({
        title,
        status: flags.status as "proposed" | "accepted" | "rejected" | "released" | "completed" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        assignedToAgentId,
        assignedBy: flags["assigned-by"],
        delegatedBy: flags["delegated-by"],
        reviewerAgentId: flags["reviewer-agent-id"],
        rationale: flags.rationale,
        rejectionReason: flags["rejection-reason"],
        acceptedAt: flags["accepted-at"],
        rejectedAt: flags["rejected-at"],
        completedAt: flags["completed-at"],
        dueAt: flags["due-at"],
        priority: flags.priority as "low" | "medium" | "high" | "urgent" | undefined,
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, assignment);
      else context.stdout.write(`${assignment.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw assignments update <id> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const assignment = await claw.assignments.update(id, {
        title: flags.title,
        status: flags.status as "proposed" | "accepted" | "rejected" | "released" | "completed" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        assignedToAgentId: flags["assigned-to-agent-id"],
        assignedBy: flags["assigned-by"],
        delegatedBy: flags["delegated-by"],
        reviewerAgentId: flags["reviewer-agent-id"],
        rationale: flags.rationale,
        rejectionReason: flags["rejection-reason"],
        acceptedAt: flags["accepted-at"],
        rejectedAt: flags["rejected-at"],
        completedAt: flags["completed-at"],
        dueAt: flags["due-at"],
        priority: flags.priority as "low" | "medium" | "high" | "urgent" | undefined,
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, assignment);
      else context.stdout.write(`${assignment.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw assignments delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.assignments, id, argv, flags, "assignments");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw assignments search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.assignments.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "handoffs") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const handoffs = await claw.handoffs.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"proposed" | "accepted" | "rejected" | "returned" | "completed"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["from-agent-id"] ? { fromAgentId: flags["from-agent-id"] } : {}),
        ...(flags["to-agent-id"] ? { toAgentId: flags["to-agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, handoffs);
      else context.stdout.write(`${handoffs.map((handoff) => `${handoff.status} ${handoff.id} ${handoff.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw handoffs get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const handoff = await claw.handoffs.get(id);
      if (!handoff) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, handoff);
      else context.stdout.write(`${handoff.status} ${handoff.id} ${handoff.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags["from-agent-id"] || !flags["to-agent-id"]) {
        context.stderr.write("Usage: claw handoffs create <title> --from-agent-id ID --to-agent-id ID\n");
        return CLI_EXIT_USAGE;
      }
      const handoff = await claw.handoffs.create({
        title,
        status: flags.status as "proposed" | "accepted" | "rejected" | "returned" | "completed" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        fromAgentId: flags["from-agent-id"],
        toAgentId: flags["to-agent-id"],
        objective: flags.objective,
        currentState: flags["current-state"],
        contextSummary: flags["context-summary"],
        nextStep: flags["next-step"],
        riskSummary: flags["risk-summary"],
        artifactIds: parseCsvFlag(flags["artifact-ids"]),
        blockerIds: parseCsvFlag(flags["blocker-ids"]),
        approvalId: flags["approval-id"],
        rejectionReason: flags["rejection-reason"],
        acceptedAt: flags["accepted-at"],
        completedAt: flags["completed-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, handoff);
      else context.stdout.write(`${handoff.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw handoffs update <id> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const handoff = await claw.handoffs.update(id, {
        title: flags.title,
        status: flags.status as "proposed" | "accepted" | "rejected" | "returned" | "completed" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        fromAgentId: flags["from-agent-id"],
        toAgentId: flags["to-agent-id"],
        objective: flags.objective,
        currentState: flags["current-state"],
        contextSummary: flags["context-summary"],
        nextStep: flags["next-step"],
        riskSummary: flags["risk-summary"],
        ...(flags["artifact-ids"] ? { artifactIds: parseCsvFlag(flags["artifact-ids"]) } : {}),
        ...(flags["blocker-ids"] ? { blockerIds: parseCsvFlag(flags["blocker-ids"]) } : {}),
        approvalId: flags["approval-id"],
        rejectionReason: flags["rejection-reason"],
        acceptedAt: flags["accepted-at"],
        completedAt: flags["completed-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, handoff);
      else context.stdout.write(`${handoff.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw handoffs delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.handoffs, id, argv, flags, "handoffs");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw handoffs search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.handoffs.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "approvals") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const approvals = await claw.approvals.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"pending" | "approved" | "rejected" | "cancelled"> } : {}),
        ...(flags.kind ? { kind: parseCsvFlag(flags.kind) as Array<"deploy" | "publish" | "delete" | "external_send" | "spend" | "policy_gate" | "other"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["handoff-id"] ? { handoffId: flags["handoff-id"] } : {}),
        ...(flags["approver-agent-id"] ? { approverAgentId: flags["approver-agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, approvals);
      else context.stdout.write(`${approvals.map((approval) => `${approval.status} ${approval.id} ${approval.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw approvals get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const approval = await claw.approvals.get(id);
      if (!approval) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, approval);
      else context.stdout.write(`${approval.status} ${approval.id} ${approval.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags.kind || !flags["policy-reason"]) {
        context.stderr.write("Usage: claw approvals create <title> --kind publish|deploy|delete|external_send|spend|policy_gate|other --policy-reason TEXT\n");
        return CLI_EXIT_USAGE;
      }
      const approval = await claw.approvals.create({
        title,
        status: flags.status as "pending" | "approved" | "rejected" | "cancelled" | undefined,
        kind: flags.kind as "deploy" | "publish" | "delete" | "external_send" | "spend" | "policy_gate" | "other",
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        handoffId: flags["handoff-id"],
        requestedByAgentId: flags["requested-by-agent-id"],
        approverAgentId: flags["approver-agent-id"],
        policyReason: flags["policy-reason"],
        evidenceIds: parseCsvFlag(flags["evidence-ids"]),
        decisionIds: parseCsvFlag(flags["decision-ids"]),
        approvedBy: flags["approved-by"],
        outcome: flags.outcome,
        approvedAt: flags["approved-at"],
        rejectedAt: flags["rejected-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, approval);
      else context.stdout.write(`${approval.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw approvals update <id> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const approval = await claw.approvals.update(id, {
        title: flags.title,
        status: flags.status as "pending" | "approved" | "rejected" | "cancelled" | undefined,
        kind: flags.kind as "deploy" | "publish" | "delete" | "external_send" | "spend" | "policy_gate" | "other" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        handoffId: flags["handoff-id"],
        requestedByAgentId: flags["requested-by-agent-id"],
        approverAgentId: flags["approver-agent-id"],
        policyReason: flags["policy-reason"],
        ...(flags["evidence-ids"] ? { evidenceIds: parseCsvFlag(flags["evidence-ids"]) } : {}),
        ...(flags["decision-ids"] ? { decisionIds: parseCsvFlag(flags["decision-ids"]) } : {}),
        approvedBy: flags["approved-by"],
        outcome: flags.outcome,
        approvedAt: flags["approved-at"],
        rejectedAt: flags["rejected-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, approval);
      else context.stdout.write(`${approval.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw approvals delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.approvals, id, argv, flags, "approvals");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw approvals search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.approvals.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "capacity") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const capacity = await claw.capacity.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "limited" | "overloaded" | "offline"> } : {}),
        ...(flags.availability ? { availability: parseCsvFlag(flags.availability) as Array<"available" | "busy" | "away" | "offline"> } : {}),
        ...(flags["team-id"] ? { teamId: flags["team-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, capacity);
      else context.stdout.write(`${capacity.map((snapshot) => `${snapshot.status} ${snapshot.id} ${snapshot.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw capacity get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const snapshot = await claw.capacity.get(id);
      if (!snapshot) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, snapshot);
      else context.stdout.write(`${snapshot.status} ${snapshot.id} ${snapshot.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      const agentIdFlag = flags["agent-id"];
      if (!title || !agentIdFlag) {
        context.stderr.write("Usage: claw capacity create <title> --agent-id ID\n");
        return CLI_EXIT_USAGE;
      }
      const snapshot = await claw.capacity.create({
        title,
        status: flags.status as "active" | "limited" | "overloaded" | "offline" | undefined,
        agentId: agentIdFlag,
        teamId: flags["team-id"],
        role: flags.role,
        availability: flags.availability as "available" | "busy" | "away" | "offline" | undefined,
        ...(flags["max-wip"] ? { maxWip: Number(flags["max-wip"]) } : {}),
        ...(flags["current-wip"] ? { currentWip: Number(flags["current-wip"]) } : {}),
        ...(flags["queue-depth"] ? { queueDepth: Number(flags["queue-depth"]) } : {}),
        ...(flags["blocked-count"] ? { blockedCount: Number(flags["blocked-count"]) } : {}),
        ...(flags["overdue-count"] ? { overdueCount: Number(flags["overdue-count"]) } : {}),
        ...(flags["response-latency-minutes"] ? { responseLatencyMinutes: Number(flags["response-latency-minutes"]) } : {}),
        ...(flags.utilization ? { utilization: Number(flags.utilization) } : {}),
        assignedTaskIds: parseCsvFlag(flags["assigned-task-ids"]),
        pendingApprovalIds: parseCsvFlag(flags["pending-approval-ids"]),
        pendingHandoffIds: parseCsvFlag(flags["pending-handoff-ids"]),
        snapshotAt: flags["snapshot-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, snapshot);
      else context.stdout.write(`${snapshot.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw capacity update <id>\n");
        return CLI_EXIT_USAGE;
      }
      const snapshot = await claw.capacity.update(id, {
        title: flags.title,
        status: flags.status as "active" | "limited" | "overloaded" | "offline" | undefined,
        agentId: flags["agent-id"],
        teamId: flags["team-id"],
        role: flags.role,
        availability: flags.availability as "available" | "busy" | "away" | "offline" | undefined,
        ...(flags["max-wip"] ? { maxWip: Number(flags["max-wip"]) } : {}),
        ...(flags["current-wip"] ? { currentWip: Number(flags["current-wip"]) } : {}),
        ...(flags["queue-depth"] ? { queueDepth: Number(flags["queue-depth"]) } : {}),
        ...(flags["blocked-count"] ? { blockedCount: Number(flags["blocked-count"]) } : {}),
        ...(flags["overdue-count"] ? { overdueCount: Number(flags["overdue-count"]) } : {}),
        ...(flags["response-latency-minutes"] ? { responseLatencyMinutes: Number(flags["response-latency-minutes"]) } : {}),
        ...(flags.utilization ? { utilization: Number(flags.utilization) } : {}),
        ...(flags["assigned-task-ids"] ? { assignedTaskIds: parseCsvFlag(flags["assigned-task-ids"]) } : {}),
        ...(flags["pending-approval-ids"] ? { pendingApprovalIds: parseCsvFlag(flags["pending-approval-ids"]) } : {}),
        ...(flags["pending-handoff-ids"] ? { pendingHandoffIds: parseCsvFlag(flags["pending-handoff-ids"]) } : {}),
        snapshotAt: flags["snapshot-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, snapshot);
      else context.stdout.write(`${snapshot.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw capacity delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.capacity, id, argv, flags, "capacity");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw capacity search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.capacity.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "reminders") {
    if (command === "after") {
      const expression = subcommand;
      const title = joinedPositionals(positionals, 3) || flags.title;
      if (!expression || !title) {
        context.stderr.write("Usage: claw reminders after <duration> <title>\n");
        return CLI_EXIT_USAGE;
      }
      if (parseSimpleDurationMs(expression) === null) {
        throw new CliHandledError("invalid_duration", `Unsupported duration "${expression}". Use simple durations like 30m, 24h, or 2d.`, CLI_EXIT_USAGE);
      }
      const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
      const payload = await claw.reminders.after({
        title,
        after: expression,
        description: flags.description,
        timezone: flags.timezone,
        workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        ...(flags["anchor-type"] ? { anchorType: flags["anchor-type"] as never } : {}),
        ...(flags["anchor-id"] ? { anchorId: flags["anchor-id"] } : {}),
        ...(flags["anchor-at"] ? { anchorAt: flags["anchor-at"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const reminders = await claw.reminders.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "paused" | "done" | "cancelled"> } : {}),
        ...(flags["anchor-id"] ? { anchorId: flags["anchor-id"] } : {}),
        ...(flags.before ? { before: flags.before } : {}),
        ...(flags.after ? { after: flags.after } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, reminders);
      else context.stdout.write(`${reminders.map((reminder) => `${reminder.status} ${reminder.id} ${reminder.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw reminders get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const reminder = await claw.reminders.get(id);
      if (!reminder) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, reminder);
      else context.stdout.write(`${reminder.status} ${reminder.id} ${reminder.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags["trigger-at"]) {
        context.stderr.write("Usage: claw reminders create <title> --trigger-at ISO [--anchor-type TYPE --anchor-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const reminder = await claw.reminders.create({
        title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | "cancelled" | undefined,
        triggerAt: flags["trigger-at"],
        anchorType: flags["anchor-type"] as "task" | "project" | "goal" | "event" | "thread" | "standalone" | undefined,
        anchorId: flags["anchor-id"],
        channel: flags.channel,
      });
      if (wantsJson) writeJson(context.stdout, reminder);
      else context.stdout.write(`${reminder.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw reminders update <id> [--title TEXT] [--trigger-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const reminder = await claw.reminders.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | "cancelled" | undefined,
        triggerAt: flags["trigger-at"],
        anchorType: flags["anchor-type"] as "task" | "project" | "goal" | "event" | "thread" | "standalone" | undefined,
        anchorId: flags["anchor-id"],
        channel: flags.channel,
      });
      if (wantsJson) writeJson(context.stdout, reminder);
      else context.stdout.write(`${reminder.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "pause" || command === "resume") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw reminders ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const reminder = command === "pause"
        ? await claw.reminders.pause(id)
        : await claw.reminders.resume(id);
      if (wantsJson) writeJson(context.stdout, reminder);
      else context.stdout.write(`${reminder.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw reminders delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.reminders, id, argv, flags, "reminders");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw reminders search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.reminders.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "deadlines") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const deadlines = await claw.deadlines.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "paused" | "done" | "cancelled"> } : {}),
        ...(flags["anchor-id"] ? { anchorId: flags["anchor-id"] } : {}),
        ...(flags.before ? { before: flags.before } : {}),
        ...(flags.after ? { after: flags.after } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, deadlines);
      else context.stdout.write(`${deadlines.map((deadline) => `${deadline.status} ${deadline.id} ${deadline.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw deadlines get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const deadline = await claw.deadlines.get(id);
      if (!deadline) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, deadline);
      else context.stdout.write(`${deadline.status} ${deadline.id} ${deadline.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags["due-at"]) {
        context.stderr.write("Usage: claw deadlines create <title> --due-at ISO [--anchor-type TYPE --anchor-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const deadline = await claw.deadlines.create({
        title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | "cancelled" | undefined,
        dueAt: flags["due-at"],
        anchorType: flags["anchor-type"] as "task" | "project" | "goal" | "event" | "thread" | "standalone" | undefined,
        anchorId: flags["anchor-id"],
      });
      if (wantsJson) writeJson(context.stdout, deadline);
      else context.stdout.write(`${deadline.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw deadlines update <id> [--title TEXT] [--due-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const deadline = await claw.deadlines.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | "cancelled" | undefined,
        dueAt: flags["due-at"],
        anchorType: flags["anchor-type"] as "task" | "project" | "goal" | "event" | "thread" | "standalone" | undefined,
        anchorId: flags["anchor-id"],
      });
      if (wantsJson) writeJson(context.stdout, deadline);
      else context.stdout.write(`${deadline.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "pause" || command === "resume") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw deadlines ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const deadline = command === "pause"
        ? await claw.deadlines.pause(id)
        : await claw.deadlines.resume(id);
      if (wantsJson) writeJson(context.stdout, deadline);
      else context.stdout.write(`${deadline.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw deadlines delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.deadlines, id, argv, flags, "deadlines");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw deadlines search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.deadlines.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "notes") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const notes = await claw.notes.list({
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, notes);
      else context.stdout.write(`${notes.map((note) => `${note.id} ${note.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw notes get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const note = await claw.notes.get(id);
      if (!note) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, note);
      else context.stdout.write(`${note.id} ${note.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw notes create <title> [--content TEXT] [--tags a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const note = await claw.notes.create({
        title,
        content: flags.content,
        tags: parseCsvFlag(flags.tags),
        summary: flags.summary,
      });
      if (wantsJson) writeJson(context.stdout, note);
      else context.stdout.write(`${note.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw notes update <id> [--title TEXT] [--content TEXT] [--tags a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const note = await claw.notes.update(id, {
        title: flags.title,
        content: flags.content,
        ...(flags.tags ? { tags: parseCsvFlag(flags.tags) } : {}),
        summary: flags.summary,
      });
      if (wantsJson) writeJson(context.stdout, note);
      else context.stdout.write(`${note.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw notes search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.notes.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "people") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const people = await claw.people.list({
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, people);
      else context.stdout.write(`${people.map((person) => `${person.id} ${person.displayName}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw people get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const person = await claw.people.get(id);
      if (!person) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, person);
      else context.stdout.write(`${person.id} ${person.displayName}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "upsert") {
      const displayName = joinedPositionals(positionals, 2) || flags.name || flags.title;
      if (!displayName) {
        context.stderr.write("Usage: claw people upsert <display-name> [--kind human|agent|org] [--email a@b.com]\n");
        return CLI_EXIT_USAGE;
      }
      const person = await claw.people.upsert({
        id: flags.id,
        displayName,
        kind: flags.kind as "human" | "agent" | "org" | undefined,
        emails: parseCsvFlag(flags.email),
        phones: parseCsvFlag(flags.phone),
        handles: parseCsvFlag(flags.handle),
        identities: flags.channel && flags.handle
          ? [{ channel: flags.channel, handle: parseCsvFlag(flags.handle)[0] || flags.handle, externalId: flags["external-id"], label: displayName }]
          : undefined,
        role: flags.role,
        organization: flags.organization,
      });
      if (wantsJson) writeJson(context.stdout, person);
      else context.stdout.write(`${person.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw people search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.people.search(query, {
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "inbox") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const threads = await claw.inbox.list({
        unreadOnly: readBooleanFlag(argv, flags, "unread-only", false),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, threads);
      else context.stdout.write(`${threads.map((thread) => `${thread.status} ${thread.id} ${thread.subject ?? ""}`.trim()).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "read") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw inbox read <thread-id>\n");
        return CLI_EXIT_USAGE;
      }
      const thread = await claw.inbox.readThread(id);
      if (!thread) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, thread);
      else context.stdout.write(`${thread.thread.id} ${thread.messages.length}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw inbox search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.inbox.search(query, {
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "draft") {
      const content = flags.content || subcommand;
      const channel = flags.channel || "local";
      if (!content) {
        context.stderr.write("Usage: claw inbox draft <content> [--thread THREAD_ID] [--channel CHANNEL]\n");
        return CLI_EXIT_USAGE;
      }
      const thread = await claw.inbox.createDraft({
        threadId: flags.thread,
        channel,
        subject: flags.subject,
        content,
        participantPersonIds: parseCsvFlag(flags.participants),
      });
      if (wantsJson) writeJson(context.stdout, thread);
      else context.stdout.write(`${thread.thread.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "archive") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw inbox archive <thread-id>\n");
        return CLI_EXIT_USAGE;
      }
      const thread = await claw.inbox.archive(id);
      if (wantsJson) writeJson(context.stdout, thread);
      else context.stdout.write(`${thread.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "process") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw inbox process <thread-id> [--task-title TEXT] [--note-title TEXT] [--reminder-title TEXT --trigger-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const processed = await claw.inbox.process(id, {
        taskTitle: flags["task-title"],
        noteTitle: flags["note-title"],
        reminderTitle: flags["reminder-title"],
        reminderAt: flags["trigger-at"],
        areaId: flags["area-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
      });
      if (wantsJson) writeJson(context.stdout, processed);
      else context.stdout.write(`${processed.thread.id}\n`);
      return CLI_EXIT_OK;
    }
  }

  if (group === "events") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const events = await claw.events.list({
        upcomingOnly: readBooleanFlag(argv, flags, "upcoming-only", false),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, events);
      else context.stdout.write(`${events.map((event) => `${event.id} ${event.title} ${event.startsAt}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw events get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const event = await claw.events.get(id);
      if (!event) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, event);
      else context.stdout.write(`${event.id} ${event.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = subcommand || flags.title;
      if (!title || !flags["starts-at"]) {
        context.stderr.write("Usage: claw events create <title> --starts-at ISO [--ends-at ISO] [--location TEXT]\n");
        return CLI_EXIT_USAGE;
      }
      const event = await claw.events.create({
        title,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        location: flags.location,
        description: flags.description,
        attendeePersonIds: parseCsvFlag(flags.attendees),
      });
      if (wantsJson) writeJson(context.stdout, event);
      else context.stdout.write(`${event.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw events update <id> [--title TEXT] [--starts-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const event = await claw.events.update(id, {
        title: flags.title,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        location: flags.location,
        description: flags.description,
        ...(flags.attendees ? { attendeePersonIds: parseCsvFlag(flags.attendees) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, event);
      else context.stdout.write(`${event.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw events search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.events.search(query, {
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  return null;
}
