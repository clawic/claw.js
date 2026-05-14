// @ts-nocheck
import type { RuntimeAdapterId, TemporalItem } from "@clawjs/core";

import type { CliContext } from "./index.ts";
import { createCliClaw } from "./cli-claw-factory.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { extractPositionals, joinedPositionals } from "./cli-flag-parsers.ts";
import { writeJson } from "./cli-json.ts";
import { buildRoutineHeartbeat, parseRoutineStaggerMs, parseSimpleDurationMs, parseWatchTarget, writeTemporalExecutions, writeTemporalItems } from "./cli-temporal-utils.ts";

export async function runTemporalCli(input: {
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

  if (group === "calendar") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (command === "list" || !command) {
      const payload = await claw.calendar.list({
        workspaceId: flags["workspace-id"] || workspaceId,
        ...(flags.status ? { status: flags.status as TemporalItem["status"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, payload.items, { empty: "No calendar events" });
      return CLI_EXIT_OK;
    }
    if (command === "at") {
      const expression = subcommand;
      const title = joinedPositionals(positionals, 3) || flags.title;
      if (!expression || !title) {
        context.stderr.write("Usage: claw calendar at <expression> <title>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.calendar.at({
        title,
        expression,
        description: flags.description,
        location: flags.location,
        timezone: flags.timezone,
        workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = subcommand || flags.title;
      if (!title || !flags["starts-at"]) {
        context.stderr.write("Usage: claw calendar create <title> --starts-at ISO [--ends-at ISO] [--location TEXT]\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.calendar.create({
        title,
        description: flags.description,
        location: flags.location,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        timezone: flags.timezone,
        workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        schedule: { mode: "one_off", timezone: flags.timezone || "UTC", startsAt: flags["starts-at"] },
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw calendar get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.calendar.get(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw calendar update <id> [--title TEXT] [--starts-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.calendar.update(id, {
        title: flags.title,
        description: flags.description,
        location: flags.location,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        ...(flags.timezone ? { timezone: flags.timezone } : {}),
        ...(flags["starts-at"] ? { schedule: { mode: "one_off", timezone: flags.timezone || "UTC", startsAt: flags["starts-at"] } } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw calendar delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.calendar.delete(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
  }

  if (group === "routines") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (command === "list" || !command) {
      const payload = await claw.routines.list({
        workspaceId: flags["workspace-id"] || workspaceId,
        ...(flags.status ? { status: flags.status as TemporalItem["status"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, payload.items, { empty: "No routines" });
      return CLI_EXIT_OK;
    }
    if (command === "every") {
      const expression = subcommand;
      const title = joinedPositionals(positionals, 3) || flags.title;
      if (!expression || !title) {
        context.stderr.write("Usage: claw routines every <duration> <title>\n");
        return CLI_EXIT_USAGE;
      }
      if (parseSimpleDurationMs(expression) === null) {
        throw new CliHandledError("invalid_duration", `Unsupported duration "${expression}". Use simple durations like 30s, 30m, 24h, or 2d.`, CLI_EXIT_USAGE);
      }
      const staggerMs = parseRoutineStaggerMs(flags, argv);
      const heartbeat = buildRoutineHeartbeat(argv, flags);
      const payload = await claw.routines.every({
        title,
        expression,
        description: flags.description,
        timezone: flags.timezone,
        ...(staggerMs !== undefined ? { schedule: { staggerMs } } : {}),
        ...(heartbeat ? { heartbeat: { ...heartbeat, ...(staggerMs !== undefined ? { staggerMs } : {}) } } : {}),
        workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = subcommand || flags.title;
      if (!title || (!flags.cron && !flags.rrule)) {
        context.stderr.write("Usage: claw routines create <title> --cron EXPR|--rrule RRULE\n");
        return CLI_EXIT_USAGE;
      }
      const staggerMs = parseRoutineStaggerMs(flags, argv);
      const payload = await claw.routines.create({
        title,
        description: flags.description,
        timezone: flags.timezone,
        workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        schedule: {
          mode: flags.rrule ? "rrule" : "cron",
          timezone: flags.timezone || "UTC",
          ...(flags.cron ? { cron: flags.cron } : {}),
          ...(flags.rrule ? { rrule: flags.rrule } : {}),
          ...(staggerMs !== undefined ? { staggerMs } : {}),
        },
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw routines get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.routines.get(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw routines update <id> [--title TEXT] [--cron EXPR|--rrule RRULE]\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.routines.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as TemporalItem["status"] | undefined,
        ...(flags.timezone ? { timezone: flags.timezone } : {}),
        ...(flags.cron || flags.rrule
          ? {
              schedule: {
                mode: flags.rrule ? "rrule" : "cron",
                timezone: flags.timezone || "UTC",
                ...(flags.cron ? { cron: flags.cron } : {}),
                ...(flags.rrule ? { rrule: flags.rrule } : {}),
              },
            }
          : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw routines delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.routines.delete(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "enable" || command === "disable" || command === "run") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw routines ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const payload = command === "enable"
        ? await claw.routines.enable(id)
        : command === "disable"
          ? await claw.routines.disable(id)
          : await claw.routines.run(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "history") {
      const payload = await claw.routines.history(subcommand || flags.id || flags["item-id"]);
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalExecutions(context.stdout, payload.executions);
      return CLI_EXIT_OK;
    }
  }

  if (group === "reminders") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (command === "list" || !command) {
      const payload = await claw.time.list({
        kind: "reminder",
        workspaceId: flags["workspace-id"] || workspaceId,
        ...(flags.status ? { status: flags.status as TemporalItem["status"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, payload.items, { empty: "No reminders" });
      return CLI_EXIT_OK;
    }
    if (command === "after") {
      const expression = subcommand;
      const title = joinedPositionals(positionals, 3) || flags.title;
      if (!expression || !title) {
        context.stderr.write("Usage: claw reminders after <duration> <title>\n");
        return CLI_EXIT_USAGE;
      }
      if (parseSimpleDurationMs(expression) === null) {
        throw new CliHandledError("invalid_duration", `Unsupported duration "${expression}". Use simple durations like 30s, 30m, 24h, or 2d.`, CLI_EXIT_USAGE);
      }
      const payload = await claw.reminders.after({
        title,
        after: expression,
        description: flags.description,
        timezone: flags.timezone,
        workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw reminders get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.time.get(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "pause" || command === "resume" || command === "archive" || command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw reminders ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const payload = command === "pause"
        ? await claw.time.update(id, { status: "paused" })
        : command === "resume"
          ? await claw.time.update(id, { status: "active" })
          : command === "archive"
            ? await claw.time.update(id, { status: "cancelled" })
            : await claw.time.delete(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else if (command === "delete") context.stdout.write("ok\n");
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
  }

  if (group === "watch") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (command === "list" || !command) {
      const payload = await claw.watch.list({
        workspaceId: flags["workspace-id"] || workspaceId,
        ...(flags.status ? { status: flags.status as TemporalItem["status"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, payload.items, { empty: "No watches" });
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw watch get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.watch.get(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "enable" || command === "disable") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw watch ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const payload = command === "enable" ? await claw.watch.enable(id) : await claw.watch.disable(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw watch delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.watch.delete(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    const targetValue = command;
    const after = flags.after;
    const ifNo = flags["if-no"];
    const thenKind = flags.then;
    const title = joinedPositionals(positionals, 2) || flags.title;
    if (!targetValue || !after || thenKind !== "remind" || !title) {
      context.stderr.write('Usage: claw watch <target> --if-no reply --after 24h --then remind "message"\n');
      return CLI_EXIT_USAGE;
    }
    if (ifNo !== "reply") {
      throw new CliHandledError("usage_error", 'Only "--if-no reply" is supported today.', CLI_EXIT_USAGE);
    }
    const target = parseWatchTarget(targetValue);
    const payload = await claw.watch.create({
      target: targetValue,
      after,
      ifNo,
      then: { kind: "remind", title },
      title,
      timezone: flags.timezone,
      description: flags.description,
      workspaceId,
      ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
      ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      anchorType: target.anchorType,
      anchorId: target.anchorId,
      anchorAt: flags["anchor-at"],
    });
    if (wantsJson) writeJson(context.stdout, payload);
    else writeTemporalItems(context.stdout, [payload.item]);
    return CLI_EXIT_OK;
  }

  if (group === "scheduler" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const schedulers = await claw.scheduler.list();
    if (wantsJson) {
      writeJson(context.stdout, schedulers);
    } else {
      context.stdout.write(`${schedulers.map((entry) => `${entry.enabled ? "*" : "-"} ${entry.id}`).join("\n")}\n`);
    }
    return schedulers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "scheduler" && (command === "run" || command === "enable" || command === "disable")) {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (command === "run") await claw.scheduler.run(id);
    if (command === "enable") await claw.scheduler.enable(id);
    if (command === "disable") await claw.scheduler.disable(id);
    if (wantsJson) {
      writeJson(context.stdout, { ok: true, id, command });
    } else {
      context.stdout.write("ok\n");
    }
    return CLI_EXIT_OK;
  }

  if (group === "time") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (command === "list") {
      const payload = await claw.time.list({
        kind: flags.kind as TemporalItem["kind"] | undefined,
        status: flags.status as TemporalItem["status"] | undefined,
        workspaceId: flags["workspace-id"] || workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        ...(flags["owner-id"] ? { ownerId: flags["owner-id"] } : {}),
        ...(flags["source-provider"] ? { sourceProvider: flags["source-provider"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.items.map((item) => `${item.id} ${item.kind} ${item.status} ${item.title}`).join("\n")}\n`);
      return payload.items.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw time get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.time.get(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.item.id} ${payload.item.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const kind = (subcommand || flags.kind) as "event" | "routine" | "reminder" | "deadline" | "follow_up" | undefined;
      const title = extractPositionals(argv)[3] || flags.title;
      if (!kind || !title) {
        context.stderr.write("Usage: claw time create <kind> <title> [--starts-at ISO|--cron EXPR|--rrule RRULE|--after 24h --anchor-type thread --anchor-id ID --anchor-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.time.create({
        kind,
        title,
        description: flags.description,
        location: flags.location,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        ...(flags.timezone ? { timezone: flags.timezone } : {}),
        ...(flags.cron || flags.rrule || flags["after"]
          ? {
              schedule: {
                mode: flags["after"] ? "relative" : flags.rrule ? "rrule" : flags.cron ? "cron" : "one_off",
                timezone: flags.timezone || "UTC",
                ...(flags.cron ? { cron: flags.cron } : {}),
                ...(flags.rrule ? { rrule: flags.rrule } : {}),
                ...(flags["after"]
                  ? {
                      relative: {
                        anchorType: (flags["anchor-type"] || "thread") as NonNullable<TemporalItem["anchorType"]>,
                        anchorId: flags["anchor-id"] || "",
                        anchorAt: flags["anchor-at"] || new Date().toISOString(),
                        offsetMs: Number(flags["after-ms"] || 0),
                        ...(flags["cancel-on"] ? { cancelOn: flags["cancel-on"] as "reply_received" | "task_completed" | "event_started" | "execution_succeeded" } : {}),
                      },
                    }
                  : {}),
              },
            }
          : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.item.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw time update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.time.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "cancelled" | "completed" | undefined,
        location: flags.location,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        ...(flags.timezone ? { timezone: flags.timezone } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.item.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw time delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.time.delete(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.ok}\n`);
      return payload.ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
    }
    if (command === "pause" || command === "resume" || command === "run") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw time ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const payload = command === "pause"
        ? await claw.time.pause(id)
        : command === "resume"
          ? await claw.time.resume(id)
          : await claw.time.runNow(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${"item" in payload ? payload.item.id : "ok"}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "executions") {
      const payload = await claw.time.listExecutions(flags["item-id"]);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.executions.map((entry) => `${entry.itemId} ${entry.status} ${entry.scheduledFor}`).join("\n")}\n`);
      return payload.executions.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "calendar") {
      const payload = await claw.time.calendarView({ start: flags.start, end: flags.end });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.items.map((item) => `${item.title} ${item.startsAt || item.nextRunAt}`).join("\n")}\n`);
      return payload.items.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "timeline") {
      const payload = await claw.time.timelineView({ start: flags.start, end: flags.end });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.items.map((item) => `${item.title} ${item.startsAt || item.nextRunAt}`).join("\n")}\n`);
      return payload.items.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "schedule" && (command === "at" || command === "every" || command === "after")) {
    const expression = subcommand;
    const title = joinedPositionals(positionals, 3) || flags.title;
    if (!expression || !title) {
      context.stderr.write("Usage: claw schedule at|every|after <expression> <title> [--anchor-type TYPE --anchor-id ID --anchor-at ISO]\n");
      return CLI_EXIT_USAGE;
    }
    const durationMs = parseSimpleDurationMs(expression);
    if ((command === "after" || command === "every") && durationMs === null) {
      throw new CliHandledError("invalid_duration", `Unsupported duration "${expression}". Use simple durations like 30m, 24h, or 2d.`, CLI_EXIT_USAGE);
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const payload = await claw.time.create({
      kind: command === "at" ? "event" : command === "every" ? "routine" : "follow_up",
      title,
      description: flags.description,
      workspaceId,
      ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
      ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      natural: {
        command,
        expression,
        timezone: flags.timezone,
        anchorType: flags["anchor-type"] as NonNullable<TemporalItem["anchorType"]> | undefined,
        anchorId: flags["anchor-id"],
        anchorAt: flags["anchor-at"] ?? (command === "after" && durationMs !== null ? new Date(Date.now() + durationMs).toISOString() : undefined),
      },
    });
    if (wantsJson) writeJson(context.stdout, payload);
    else context.stdout.write(`${payload.item.id}\n`);
    return CLI_EXIT_OK;
  }

  return null;
}
