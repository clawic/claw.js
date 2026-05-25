// @ts-nocheck
import fs from "fs";
import path from "path";
import type { RuntimeAdapterId } from "@clawjs/core";

import type { CliContext } from "./index.ts";
import { createCliWorkspaceClaw } from "./cli-claw-factory.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { joinedPositionals, parseCsvFlag, parseJsonFlag, readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";
import { timelineRange } from "./cli-runtime-utils.ts";
import { archiveOrRemoveProductivityRecord, runCoreProductivityDbCli } from "./cli-productivity-command.ts";
import { requireCliExportReview } from "./cli-export-review.ts";

function parseProductivityDashboardLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  const limit = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(limit)) {
    throw new CliHandledError("invalid_productivity_limit", "--limit must be a non-negative integer.", CLI_EXIT_USAGE);
  }
  return limit;
}

function parseProductivityNumberFlag(raw: string | undefined, name: string, options: {
  code: string;
  min?: number;
  integer?: boolean;
}): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  const value = Number(trimmed);
  const min = options.min ?? Number.NEGATIVE_INFINITY;
  if (!trimmed || !Number.isFinite(value) || value < min || (options.integer && !Number.isSafeInteger(value))) {
    const kind = options.integer ? "integer" : "number";
    const range = Number.isFinite(min) ? ` greater than or equal to ${min}` : "";
    throw new CliHandledError(options.code, `--${name} must be a finite ${kind}${range}.`, CLI_EXIT_USAGE, {
      location: `cli.productivity.${name}`,
      details: { flag: `--${name}`, value: raw },
    });
  }
  return value;
}

function parseTaskRankFlag(flags: Record<string, string>): number | undefined {
  return parseProductivityNumberFlag(flags.rank, "rank", { code: "invalid_task_rank" });
}

function parseTaskEstimateMinutesFlag(flags: Record<string, string>): number | undefined {
  return parseProductivityNumberFlag(flags["estimate-minutes"], "estimate-minutes", { code: "invalid_task_estimate_minutes", min: 0, integer: true });
}

function parseTaskActualMinutesFlag(flags: Record<string, string>): number | undefined {
  return parseProductivityNumberFlag(flags["actual-minutes"], "actual-minutes", { code: "invalid_task_actual_minutes", min: 0, integer: true });
}

function parseTaskStoryPointsFlag(flags: Record<string, string>): number | undefined {
  return parseProductivityNumberFlag(flags["story-points"], "story-points", { code: "invalid_task_story_points", min: 0 });
}

export async function runPrimaryProductivityCli(input: {
  argv: string[];
  group: string | undefined;
  command: string | undefined;
  subcommand: string | undefined;
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  runtimeAdapterId: RuntimeAdapterId;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
}): Promise<number | null> {
  const { argv, group, command, subcommand, positionals, flags, context, wantsJson, binName, runtimeAdapterId, workspaceRoot, appId, workspaceId, agentId } = input;
  const writePrimaryJson = (payload: unknown) => {
    const canonicalCommand = group ?? "work";
    writeCommandJsonOk(context.stdout, canonicalCommand, payload, {
      invokedCommand: group ?? canonicalCommand,
      subcommand: command ?? null,
      ...(subcommand ? { operation: subcommand } : {}),
    });
  };

  const workCommand = group === "work" ? command : group;
  const workSubcommand = group === "work" ? subcommand : command;
  if (workCommand === "export" || workCommand === "import" || workCommand === "backup" || workCommand === "agenda" || workCommand === "review" || workCommand === "my-work" || workCommand === "team-work" || workCommand === "timeline") {
    let clawPromise: ReturnType<typeof createCliWorkspaceClaw> | null = null;
    const getClaw = () => {
      clawPromise ??= createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
      return clawPromise;
    };
    if (workCommand === "export") {
      const targetPath = workSubcommand || flags.path;
      if (!targetPath) {
        context.stderr.write(`Usage: ${binName} work export <file> --confirm --approval-id ID --legal-label LABEL\n`);
        return CLI_EXIT_USAGE;
      }
      const review = requireCliExportReview({ argv, flags, operation: "work export" });
      const claw = await getClaw();
      const snapshot = await claw.productivity.exportSnapshot();
      const envelope = {
        ...snapshot,
        legal: {
          approvalId: review.approvalId,
          legalLabel: review.legalLabel,
          confirmed: review.confirmed,
          exportKind: "work.snapshot",
        },
      };
      const absolutePath = path.resolve(context.cwd, targetPath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, JSON.stringify(envelope, null, 2));
      if (wantsJson) writePrimaryJson({ path: absolutePath });
      else context.stdout.write(`${absolutePath}\n`);
      return CLI_EXIT_OK;
    }
    if (workCommand === "import") {
      const sourcePath = workSubcommand || flags.path;
      if (!sourcePath) {
        context.stderr.write(`Usage: ${binName} work import <file> [--replace]\n`);
        return CLI_EXIT_USAGE;
      }
      const absolutePath = path.resolve(context.cwd, sourcePath);
      const payload = readWorkImportSnapshot(absolutePath);
      const claw = await getClaw();
      const imported = await claw.productivity.importSnapshot(payload, {
        replace: readBooleanFlag(argv, flags, "replace", false),
      });
      if (wantsJson) writePrimaryJson(imported);
      else context.stdout.write(`${Object.values(imported.importedCollections).reduce((sum, value) => sum + value, 0)}\n`);
      return CLI_EXIT_OK;
    }
    if (workCommand === "backup") {
      const targetDir = workSubcommand || flags.path;
      if (!targetDir) {
        context.stderr.write(`Usage: ${binName} work backup <directory> --confirm --approval-id ID --legal-label LABEL\n`);
        return CLI_EXIT_USAGE;
      }
      const review = requireCliExportReview({ argv, flags, operation: "work backup" });
      const claw = await getClaw();
      const backup = await claw.productivity.backup(targetDir);
      const absoluteTargetDir = path.resolve(workspaceRoot, targetDir);
      fs.writeFileSync(path.join(absoluteTargetDir, "claw-legal-backup.json"), JSON.stringify({
        schemaVersion: 1,
        kind: "claw.work.backup.legal",
        exportedAt: new Date().toISOString(),
        approvalId: review.approvalId,
        legalLabel: review.legalLabel,
        confirmed: review.confirmed,
        files: backup.files.map((file) => path.basename(file)),
      }, null, 2));
      if (wantsJson) writePrimaryJson(backup);
      else context.stdout.write(`${backup.files.join("\n")}\n`);
      return backup.files.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (workCommand === "agenda") {
      const claw = await getClaw();
      const agenda = await claw.agenda.list({
        start: flags.start,
        end: flags.end,
        includeCompleted: readBooleanFlag(argv, flags, "include-completed", false),
      });
      if (wantsJson) writePrimaryJson(agenda);
      else context.stdout.write(`${agenda.items.map((item) => `${item.when} ${item.domain} ${item.status} ${item.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (workCommand === "timeline") {
      const mode = (workSubcommand || "week") as "day" | "week";
      if (mode !== "day" && mode !== "week") {
        context.stderr.write(`Usage: ${binName} work timeline day|week [--start ISO] [--project-id ID]\n`);
        return CLI_EXIT_USAGE;
      }
      const range = timelineRange(mode, flags.start);
      const claw = await getClaw();
      const timeline = await claw.productivity.timeline({
        ...range,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        includeDone: readBooleanFlag(argv, flags, "include-done", readBooleanFlag(argv, flags, "include-completed", false)),
      });
      if (wantsJson) writePrimaryJson(timeline);
      else {
        const lines = [
          `now=${timeline.now.primary?.title ?? "none"}`,
          ...timeline.projects.map((project) => `${project.title}: tasks=${project.tasks.length} milestones=${project.milestones.length} deadlines=${project.deadlines.length} cycles=${project.cycles.length}`),
        ];
        context.stdout.write(`${lines.join("\n")}\n`);
      }
      return CLI_EXIT_OK;
    }
    if (workCommand === "review") {
      const cadence = (workSubcommand || "daily") as "daily" | "weekly";
      if (cadence !== "daily" && cadence !== "weekly") {
        context.stderr.write(`Usage: ${binName} work review daily|weekly\n`);
        return CLI_EXIT_USAGE;
      }
      const claw = await getClaw();
      const review = cadence === "weekly" ? await claw.review.weekly() : await claw.review.daily();
      if (wantsJson) writePrimaryJson(review);
      else context.stdout.write(`blocked=${review.summary.blockedTasks} overdue=${review.summary.overdueTasks} goals=${review.summary.activeGoals} projects=${review.summary.activeProjects}\n`);
      return CLI_EXIT_OK;
    }
    if (workCommand === "my-work") {
      const claw = await getClaw();
      const limit = parseProductivityDashboardLimit(flags.limit);
      const myWork = await claw.productivity.myWork({
        ...(limit !== undefined ? { limit } : {}),
      });
      if (wantsJson) writePrimaryJson(myWork);
      else context.stdout.write(`triage=${myWork.summary.triageThreads} ready=${myWork.summary.readyTasks} blocked=${myWork.summary.blockedTasks} blockers=${myWork.summary.activeBlockers} decisions=${myWork.summary.pendingDecisions}\n`);
      return CLI_EXIT_OK;
    }
    if (workCommand === "team-work") {
      const claw = await getClaw();
      const limit = parseProductivityDashboardLimit(flags.limit);
      const teamWork = await claw.productivity.teamWork({
        ...(limit !== undefined ? { limit } : {}),
      });
      if (wantsJson) writePrimaryJson(teamWork);
      else context.stdout.write(`assignments=${teamWork.summary.activeAssignments} handoffs=${teamWork.summary.pendingHandoffs} approvals=${teamWork.summary.pendingApprovals} overloaded=${teamWork.summary.overloadedAgents}\n`);
      return CLI_EXIT_OK;
    }
  }

  const genericProductivityGroupMap: Record<string, string> = {
    lists: "lists",
    sections: "sections",
    comments: "comments",
    attachments: "attachments",
    "saved-views": "saved_views",
    recurrences: "recurrences",
    cycles: "cycles",
    sprints: "cycles",
    epics: "epics",
    initiatives: "epics",
    "custom-fields": "custom_fields",
    "field-values": "field_values",
    templates: "templates",
  };
  if (group && genericProductivityGroupMap[group]) {
    return await runCoreProductivityDbCli({
      argv,
      positionals: ["db", genericProductivityGroupMap[group], ...positionals.slice(1)],
      flags,
      workspaceRoot,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      appId,
      workspaceId,
      agentId,
      contextCwd: context.cwd,
    });
  }

  const primaryCollectionGroupMap: Record<string, string> = { tasks: "tasks", projects: "projects", goals: "goals", reminders: "reminders", deadlines: "deadlines", notes: "notes", people: "people" };
  if (group && primaryCollectionGroupMap[group] && (command === "schema" || command === "query")) {
    return await runCoreProductivityDbCli({
      argv,
      positionals: [group, primaryCollectionGroupMap[group], ...positionals.slice(1)],
      flags,
      workspaceRoot,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      appId,
      workspaceId,
      agentId,
      contextCwd: context.cwd,
    });
  }

  if (group === "areas") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const areas = await claw.areas.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "paused" | "archived"> } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writePrimaryJson(areas);
      else context.stdout.write(`${areas.map((area) => `${area.status} ${area.id} ${area.name}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw areas get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const area = await claw.areas.get(id);
      if (!area) return CLI_EXIT_FAILURE;
      if (wantsJson) writePrimaryJson(area);
      else context.stdout.write(`${area.status} ${area.id} ${area.name}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const name = joinedPositionals(positionals, 2) || flags.name || flags.title;
      if (!name) {
        context.stderr.write("Usage: claw areas create <name> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const area = await claw.areas.create({
        name,
        description: flags.description,
        status: flags.status as "active" | "paused" | "archived" | undefined,
        color: flags.color,
        ownerPersonId: flags["owner-person-id"],
      });
      if (wantsJson) writePrimaryJson(area);
      else context.stdout.write(`${area.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw areas update <id> [--name TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const area = await claw.areas.update(id, {
        name: flags.name || flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "archived" | undefined,
        color: flags.color,
        ownerPersonId: flags["owner-person-id"],
      });
      if (wantsJson) writePrimaryJson(area);
      else context.stdout.write(`${area.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw areas delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.areas, id, argv, flags, "areas");
      if (wantsJson) writePrimaryJson(result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw areas search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.areas.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writePrimaryJson(results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "tasks") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const tasks = await claw.tasks.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"todo" | "in_progress" | "blocked" | "done" | "cancelled"> } : {}),
        ...(flags.assignee ? { assigneePersonId: flags.assignee } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
        ...(flags["list-id"] ? { listId: flags["list-id"] } : {}),
        ...(flags["section-id"] ? { sectionId: flags["section-id"] } : {}),
        ...(flags["cycle-id"] ? { cycleId: flags["cycle-id"] } : {}),
        ...(flags["epic-id"] ? { epicId: flags["epic-id"] } : {}),
        ...(argv.includes("--blocked") ? { blocked: readBooleanFlag(argv, flags, "blocked", true) } : {}),
        ...(argv.includes("--overdue") ? { overdue: readBooleanFlag(argv, flags, "overdue", true) } : {}),
        ...(argv.includes("--has-reminder") ? { hasReminder: readBooleanFlag(argv, flags, "has-reminder", true) } : {}),
        ...(flags.ids ? { ids: parseCsvFlag(flags.ids) } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writePrimaryJson(tasks);
      else context.stdout.write(`${tasks.map((task) => `${task.status} ${task.id} ${task.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw tasks get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const task = await claw.tasks.get(id);
      if (!task) return CLI_EXIT_FAILURE;
      if (wantsJson) writePrimaryJson(task);
      else context.stdout.write(`${task.status} ${task.id} ${task.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw tasks create <title> [--description TEXT] [--status STATUS] [--priority PRIORITY] [--labels a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const task = await claw.tasks.create({
        title,
        description: flags.description,
        status: flags.status as "todo" | "in_progress" | "blocked" | "done" | "cancelled" | undefined,
        type: flags.type as "todo" | "task" | "bug" | "story" | "feature" | "chore" | undefined,
        priority: flags.priority as "low" | "medium" | "high" | "urgent" | undefined,
        ...(flags.rank ? { rank: parseTaskRankFlag(flags) } : {}),
        labels: parseCsvFlag(flags.labels),
        areaId: flags["area-id"],
        listId: flags["list-id"],
        sectionId: flags["section-id"],
        assigneePersonId: flags.assignee,
        reporterPersonId: flags["reporter-person-id"],
        watcherPersonIds: parseCsvFlag(flags.watchers),
        startAt: flags["start-at"],
        deferUntil: flags["defer-until"],
        dueAt: flags["due-at"],
        deadlineAt: flags["deadline-at"],
        snoozedUntil: flags["snoozed-until"],
        recurrenceRule: flags["recurrence-rule"],
        ...(flags["estimate-minutes"] ? { estimateMinutes: parseTaskEstimateMinutesFlag(flags) } : {}),
        ...(flags["actual-minutes"] ? { actualMinutes: parseTaskActualMinutesFlag(flags) } : {}),
        ...(flags["story-points"] ? { storyPoints: parseTaskStoryPointsFlag(flags) } : {}),
        blockedReason: flags["blocked-reason"],
        waitingOn: flags["waiting-on"],
        startedAt: flags["started-at"],
        completedAt: flags["completed-at"],
        cancelledAt: flags["cancelled-at"],
        eventId: flags["event-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        cycleId: flags["cycle-id"],
        epicId: flags["epic-id"],
        parentTaskId: flags["parent-task-id"],
        childTaskIds: parseCsvFlag(flags["child-task-ids"]),
        dependsOnTaskIds: parseCsvFlag(flags["depends-on"]),
        commentIds: parseCsvFlag(flags["comment-ids"]),
        attachmentIds: parseCsvFlag(flags["attachment-ids"]),
        checklist: parseJsonFlag<Array<{ id?: string; text: string; completed?: boolean }>>(flags["checklist-json"], "--checklist-json"),
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
      });
      if (wantsJson) writePrimaryJson(task);
      else context.stdout.write(`${task.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw tasks update <id> [--title TEXT] [--description TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const task = await claw.tasks.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "todo" | "in_progress" | "blocked" | "done" | "cancelled" | undefined,
        type: flags.type as "todo" | "task" | "bug" | "story" | "feature" | "chore" | undefined,
        priority: flags.priority as "low" | "medium" | "high" | "urgent" | undefined,
        ...(flags.rank ? { rank: parseTaskRankFlag(flags) } : {}),
        ...(flags.labels ? { labels: parseCsvFlag(flags.labels) } : {}),
        areaId: flags["area-id"],
        listId: flags["list-id"],
        sectionId: flags["section-id"],
        assigneePersonId: flags.assignee,
        reporterPersonId: flags["reporter-person-id"],
        ...(flags.watchers ? { watcherPersonIds: parseCsvFlag(flags.watchers) } : {}),
        startAt: flags["start-at"],
        deferUntil: flags["defer-until"],
        dueAt: flags["due-at"],
        deadlineAt: flags["deadline-at"],
        snoozedUntil: flags["snoozed-until"],
        recurrenceRule: flags["recurrence-rule"],
        ...(flags["estimate-minutes"] ? { estimateMinutes: parseTaskEstimateMinutesFlag(flags) } : {}),
        ...(flags["actual-minutes"] ? { actualMinutes: parseTaskActualMinutesFlag(flags) } : {}),
        ...(flags["story-points"] ? { storyPoints: parseTaskStoryPointsFlag(flags) } : {}),
        blockedReason: flags["blocked-reason"],
        waitingOn: flags["waiting-on"],
        startedAt: flags["started-at"],
        completedAt: flags["completed-at"],
        cancelledAt: flags["cancelled-at"],
        eventId: flags["event-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        cycleId: flags["cycle-id"],
        epicId: flags["epic-id"],
        parentTaskId: flags["parent-task-id"],
        ...(flags["child-task-ids"] ? { childTaskIds: parseCsvFlag(flags["child-task-ids"]) } : {}),
        ...(flags["depends-on"] ? { dependsOnTaskIds: parseCsvFlag(flags["depends-on"]) } : {}),
        ...(flags["comment-ids"] ? { commentIds: parseCsvFlag(flags["comment-ids"]) } : {}),
        ...(flags["attachment-ids"] ? { attachmentIds: parseCsvFlag(flags["attachment-ids"]) } : {}),
        ...(flags["checklist-json"] ? { checklist: parseJsonFlag<Array<{ id?: string; text: string; completed?: boolean }>>(flags["checklist-json"], "--checklist-json") } : {}),
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
      });
      if (wantsJson) writePrimaryJson(task);
      else context.stdout.write(`${task.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "complete") {
      const ids = parseCsvFlag(flags.ids);
      const allIds = ids.length > 0 ? ids : [subcommand || flags.id].filter(Boolean) as string[];
      if (allIds.length === 0) {
        context.stderr.write("Usage: claw tasks complete <id> | --ids a,b\n");
        return CLI_EXIT_USAGE;
      }
      const tasks = await Promise.all(allIds.map((id) => claw.tasks.complete(id)));
      if (wantsJson) writePrimaryJson(tasks.length === 1 ? tasks[0] : tasks);
      else context.stdout.write(`${tasks.map((task) => task.id).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "move") {
      const ids = parseCsvFlag(flags.ids);
      if (ids.length === 0) {
        context.stderr.write("Usage: claw tasks move --ids a,b [--project-id ID] [--goal-id ID] [--area-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const tasks = await Promise.all(ids.map((id) => claw.tasks.update(id, {
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        areaId: flags["area-id"],
      })));
      if (wantsJson) writePrimaryJson(tasks);
      else context.stdout.write(`${tasks.map((task) => task.id).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw tasks search <query> [--strategy auto|keyword|semantic|hybrid]\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.tasks.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writePrimaryJson(results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "goals") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const goals = await claw.goals.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "paused" | "done"> } : {}),
        ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writePrimaryJson(goals);
      else context.stdout.write(`${goals.map((goal) => `${goal.status} ${goal.id} ${goal.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw goals get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const goal = await claw.goals.get(id);
      if (!goal) return CLI_EXIT_FAILURE;
      if (wantsJson) writePrimaryJson(goal);
      else context.stdout.write(`${goal.status} ${goal.id} ${goal.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw goals create <title> [--status STATUS] [--project-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const goal = await claw.goals.create({
        title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | undefined,
        level: flags.level as "company" | "team" | "personal" | undefined,
        areaId: flags["area-id"],
        projectId: flags["project-id"],
        parentId: flags["parent-id"],
        parentGoalId: flags["parent-goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
        metricKey: flags["metric-key"],
        metricLabel: flags["metric-label"],
        ...(flags["target-value"] ? { targetValue: Number(flags["target-value"]) } : {}),
        ...(flags["current-value"] ? { currentValue: Number(flags["current-value"]) } : {}),
        unit: flags.unit,
        period: flags.period,
        timeframeStart: flags["timeframe-start"],
        timeframeEnd: flags["timeframe-end"],
        reviewCadence: flags["review-cadence"] as "daily" | "weekly" | "monthly" | "quarterly" | undefined,
        metricDirection: flags["metric-direction"] as "increase" | "decrease" | "maintain" | undefined,
        healthStatus: flags["health-status"] as "green" | "yellow" | "red" | "unknown" | undefined,
      });
      if (wantsJson) writePrimaryJson(goal);
      else context.stdout.write(`${goal.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw goals update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const goal = await claw.goals.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | undefined,
        level: flags.level as "company" | "team" | "personal" | undefined,
        areaId: flags["area-id"],
        projectId: flags["project-id"],
        parentId: flags["parent-id"],
        parentGoalId: flags["parent-goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
        metricKey: flags["metric-key"],
        metricLabel: flags["metric-label"],
        ...(flags["target-value"] ? { targetValue: Number(flags["target-value"]) } : {}),
        ...(flags["current-value"] ? { currentValue: Number(flags["current-value"]) } : {}),
        unit: flags.unit,
        period: flags.period,
        timeframeStart: flags["timeframe-start"],
        timeframeEnd: flags["timeframe-end"],
        reviewCadence: flags["review-cadence"] as "daily" | "weekly" | "monthly" | "quarterly" | undefined,
        metricDirection: flags["metric-direction"] as "increase" | "decrease" | "maintain" | undefined,
        healthStatus: flags["health-status"] as "green" | "yellow" | "red" | "unknown" | undefined,
      });
      if (wantsJson) writePrimaryJson(goal);
      else context.stdout.write(`${goal.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw goals delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.goals, id, argv, flags, "goals");
      if (wantsJson) writePrimaryJson(result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw goals search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.goals.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writePrimaryJson(results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "projects") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const projects = await claw.projects.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"draft" | "in_progress" | "paused" | "done" | "archived"> } : {}),
        ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writePrimaryJson(projects);
      else context.stdout.write(`${projects.map((project) => `${project.status} ${project.id} ${project.name}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw projects get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const project = await claw.projects.get(id);
      if (!project) return CLI_EXIT_FAILURE;
      if (wantsJson) writePrimaryJson(project);
      else context.stdout.write(`${project.status} ${project.id} ${project.name}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const name = joinedPositionals(positionals, 2) || flags.name || flags.title;
      if (!name) {
        context.stderr.write("Usage: claw projects create <name> [--status STATUS] [--goal-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const project = await claw.projects.create({
        name,
        description: flags.description,
        status: flags.status as "draft" | "in_progress" | "paused" | "done" | "archived" | undefined,
        areaId: flags["area-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        leadAgentId: flags["lead-agent-id"],
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
        color: flags.color,
        kind: flags.kind as "delivery" | "growth" | "ops" | "research" | "migration" | "other" | undefined,
        ...(flags.rank ? { rank: Number(flags.rank) } : {}),
        statusCategory: flags["status-category"] as "active" | "someday" | "planned" | "done" | "archived" | undefined,
        healthStatus: flags["health-status"] as "green" | "yellow" | "red" | "unknown" | undefined,
        startAt: flags["start-at"],
        startDate: flags["start-date"],
        targetDate: flags["target-date"],
        deadlineAt: flags["deadline-at"],
        milestoneIds: parseCsvFlag(flags["milestone-ids"]),
        defaultSectionIds: parseCsvFlag(flags["default-section-ids"]),
        templateId: flags["template-id"],
        reviewAt: flags["review-at"],
        reviewCadence: flags["review-cadence"] as "daily" | "weekly" | "monthly" | "quarterly" | undefined,
        archiveReason: flags["archive-reason"],
        completedAt: flags["completed-at"],
      });
      if (wantsJson) writePrimaryJson(project);
      else context.stdout.write(`${project.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw projects update <id> [--name TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const project = await claw.projects.update(id, {
        name: flags.name || flags.title,
        description: flags.description,
        status: flags.status as "draft" | "in_progress" | "paused" | "done" | "archived" | undefined,
        areaId: flags["area-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        leadAgentId: flags["lead-agent-id"],
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
        color: flags.color,
        kind: flags.kind as "delivery" | "growth" | "ops" | "research" | "migration" | "other" | undefined,
        ...(flags.rank ? { rank: Number(flags.rank) } : {}),
        statusCategory: flags["status-category"] as "active" | "someday" | "planned" | "done" | "archived" | undefined,
        healthStatus: flags["health-status"] as "green" | "yellow" | "red" | "unknown" | undefined,
        startAt: flags["start-at"],
        startDate: flags["start-date"],
        targetDate: flags["target-date"],
        deadlineAt: flags["deadline-at"],
        ...(flags["milestone-ids"] ? { milestoneIds: parseCsvFlag(flags["milestone-ids"]) } : {}),
        ...(flags["default-section-ids"] ? { defaultSectionIds: parseCsvFlag(flags["default-section-ids"]) } : {}),
        templateId: flags["template-id"],
        reviewAt: flags["review-at"],
        reviewCadence: flags["review-cadence"] as "daily" | "weekly" | "monthly" | "quarterly" | undefined,
        archiveReason: flags["archive-reason"],
        completedAt: flags["completed-at"],
      });
      if (wantsJson) writePrimaryJson(project);
      else context.stdout.write(`${project.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "archive") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw projects archive <id> [--cascade]\n");
        return CLI_EXIT_USAGE;
      }
      const project = await claw.projects.archive(id);
      if (readBooleanFlag(argv, flags, "cascade", false)) {
        const anchoredReminders = await claw.reminders.list({ anchorId: id, includeArchived: true, limit: Number.MAX_SAFE_INTEGER });
        const anchoredDeadlines = await claw.deadlines.list({ anchorId: id, includeArchived: true, limit: Number.MAX_SAFE_INTEGER });
        await Promise.all(anchoredReminders.filter((item) => item.status === "active").map((item) => claw.reminders.pause(item.id)));
        await Promise.all(anchoredDeadlines.filter((item) => item.status === "active").map((item) => claw.deadlines.pause(item.id)));
      }
      if (wantsJson) writePrimaryJson(project);
      else context.stdout.write(`${project.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw projects delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.projects, id, argv, flags, "projects");
      if (wantsJson) writePrimaryJson(result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw projects search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.projects.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writePrimaryJson(results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  return null;
}

function readWorkImportSnapshot(absolutePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CliHandledError("invalid_work_import_json", `Work import file must contain valid JSON: ${absolutePath}`, CLI_EXIT_USAGE);
    }
    throw error;
  }
}
