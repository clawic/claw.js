import type {
  TemporalExecution,
  TemporalHeartbeatAgentResult,
  TemporalHeartbeatMatch,
  TemporalItem,
  TemporalProjection,
} from "@clawjs/core";

import {
  applyTemporalItemUpdate,
  completeExecution,
  computeNextRunAt,
  createExecution,
  normalizeTemporalItem,
  type CreateTemporalItemInput,
  type UpdateTemporalItemInput,
} from "./logic.ts";
import { TimeServiceStore } from "./store.ts";

export interface EmbeddedTimeEngineOptions {
  dbPath: string;
  defaultTimeZone: string;
  schedulerIntervalMs?: number;
  notifyBaseUrl?: string;
  notifySourceToken?: string;
  heartbeatChecks?: Record<string, TemporalHeartbeatCheckProvider>;
  heartbeatAgent?: TemporalHeartbeatAgentRunner;
}

export type TemporalHeartbeatCheckProvider = (input: {
  condition: string;
  item: TemporalItem;
  now: Date;
}) => Promise<TemporalHeartbeatMatch[]> | TemporalHeartbeatMatch[];

export type TemporalHeartbeatAgentRunner = (input: {
  item: TemporalItem;
  execution: TemporalExecution;
  prompt: string;
  matches: TemporalHeartbeatMatch[];
  context: {
    mode: "diff";
    matches: TemporalHeartbeatMatch[];
  };
}) => Promise<TemporalHeartbeatAgentResult> | TemporalHeartbeatAgentResult;

type HeartbeatDecision =
  | { action: "none" }
  | { action: "skip"; item: TemporalItem }
  | { action: "complete"; item: TemporalItem }
  | { action: "wake"; item: TemporalItem; matches: TemporalHeartbeatMatch[] };

function heartbeatProviderKey(condition: string): string {
  if (condition.startsWith("custom:")) return condition;
  return condition.split(":")[0] ?? condition;
}

function heartbeatState(item: TemporalItem) {
  return {
    skipCount: 0,
    ...(item.heartbeat?.state ?? {}),
  };
}

function rescheduleItem(item: TemporalItem, scheduledFor: string): TemporalItem {
  const nextItem = { ...item };
  if (nextItem.schedule.mode === "one_off" || nextItem.schedule.mode === "relative") {
    nextItem.status = "completed";
    nextItem.nextRunAt = undefined;
  } else {
    nextItem.nextRunAt = computeNextRunAt(nextItem, new Date(scheduledFor));
  }
  nextItem.updatedAt = new Date().toISOString();
  return nextItem;
}

async function collectHeartbeatMatches(
  options: EmbeddedTimeEngineOptions,
  item: TemporalItem,
  condition: string,
  now: Date,
): Promise<TemporalHeartbeatMatch[]> {
  const provider = options.heartbeatChecks?.[condition] ?? options.heartbeatChecks?.[heartbeatProviderKey(condition)];
  if (!provider) return [];
  const matches = await provider({ condition, item, now });
  return matches.slice(0, item.heartbeat?.limit ?? 20);
}

async function evaluateHeartbeat(
  options: EmbeddedTimeEngineOptions,
  item: TemporalItem,
  scheduledFor: string,
  now: Date,
): Promise<HeartbeatDecision> {
  if (item.kind !== "routine" || !item.heartbeat) return { action: "none" };
  const evaluatedAt = now.toISOString();
  for (const condition of item.heartbeat.stopWhen ?? []) {
    if (condition === "agent:disable") continue;
    const matches = await collectHeartbeatMatches(options, item, condition, now);
    if (condition.endsWith(":none") ? matches.length === 0 : matches.length > 0) {
      const completed: TemporalItem = {
        ...item,
        status: "completed",
        nextRunAt: undefined,
        heartbeat: {
          ...item.heartbeat,
          state: {
            ...heartbeatState(item),
            lastEvaluatedAt: evaluatedAt,
            lastCompletedAt: evaluatedAt,
            lastSkipReason: `stop condition matched: ${condition}`,
          },
        },
        updatedAt: evaluatedAt,
      };
      return { action: "complete", item: completed };
    }
  }

  const matches: TemporalHeartbeatMatch[] = [];
  for (const condition of item.heartbeat.when) {
    matches.push(...await collectHeartbeatMatches(options, item, condition, now));
  }
  if (matches.length === 0) {
    const state = heartbeatState(item);
    const skipped: TemporalItem = rescheduleItem({
      ...item,
      heartbeat: {
        ...item.heartbeat,
        state: {
          ...state,
          skipCount: state.skipCount + 1,
          lastEvaluatedAt: evaluatedAt,
          lastSkipAt: evaluatedAt,
          lastSkipReason: "no heartbeat matches",
          lastMatches: [],
        },
      },
    }, scheduledFor);
    return { action: "skip", item: skipped };
  }

  const awakened: TemporalItem = {
    ...item,
    heartbeat: {
      ...item.heartbeat,
      state: {
        ...heartbeatState(item),
        lastEvaluatedAt: evaluatedAt,
        lastWakeAt: evaluatedAt,
        lastMatches: matches.slice(0, item.heartbeat.limit),
      },
    },
  };
  return { action: "wake", item: awakened, matches: matches.slice(0, item.heartbeat.limit) };
}

async function dispatchActions(
  options: EmbeddedTimeEngineOptions,
  item: TemporalItem,
  execution: TemporalExecution,
  store: TimeServiceStore,
  heartbeatMatches: TemporalHeartbeatMatch[] = [],
): Promise<{
  output: string;
  projections: TemporalProjection[];
  agentResult?: TemporalHeartbeatAgentResult;
}> {
  let output = `${item.kind} executed`;
  let agentResult: TemporalHeartbeatAgentResult | undefined;
  const projections = item.projections.map((projection) => ({
    ...projection,
    status: "synced" as const,
    updatedAt: new Date().toISOString(),
    detail: {
      ...(projection.detail ?? {}),
      lastExecutionId: execution.id,
      lastScheduledFor: execution.scheduledFor,
    },
  }));

  if (item.heartbeat) {
    const prompt = item.heartbeat.prompt ?? item.description ?? item.title;
    agentResult = await (options.heartbeatAgent?.({
      item,
      execution,
      prompt,
      matches: heartbeatMatches,
      context: {
        mode: "diff",
        matches: heartbeatMatches.slice(0, item.heartbeat.limit),
      },
    }) ?? {
      status: "done",
      summary: `Heartbeat matched ${heartbeatMatches.length} item${heartbeatMatches.length === 1 ? "" : "s"}`,
    });
    output = JSON.stringify(agentResult);
  }

  for (const action of item.actions) {
    if (item.heartbeat) continue;
    if (action.kind === "notify" && options.notifyBaseUrl) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (options.notifySourceToken) {
        headers.authorization = `Bearer ${options.notifySourceToken}`;
      }
      await fetch(`${options.notifyBaseUrl.replace(/\/$/, "")}/v1/notifications`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          context: {
            tenantId: item.workspaceId ?? "time-local",
            workspaceId: item.workspaceId ?? "time-local",
            eventType: "temporal.item.due",
            severity: "normal",
          },
          delivery: {
            mode: "normal",
            title: item.title,
            body: item.description ?? `${item.kind} is due`,
          },
        }),
      }).catch(() => undefined);
      output = `${item.kind} executed and notify dispatched`;
    }
    if (action.kind === "calendar_sync") {
      output = `${item.kind} executed and calendar projection updated`;
    }
    if (action.kind === "workflow") {
      output = `${item.kind} executed via workflow`;
    }
  }

  const nextItem = { ...item, projections };
  store.putItem(nextItem);
  return { output, projections, ...(agentResult ? { agentResult } : {}) };
}

function eventProjection(item: TemporalItem) {
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? "",
    location: item.location ?? "",
    startsAt: item.startsAt ? new Date(item.startsAt).getTime() : item.nextRunAt ? new Date(item.nextRunAt).getTime() : null,
    endsAt: item.endsAt ? new Date(item.endsAt).getTime() : null,
    attendeePersonIds: item.participants.flatMap((participant) => participant.personId ? [participant.personId] : []),
    linkedTaskIds: [],
    linkedNoteIds: [],
    reminders: item.actions.filter((action) => action.kind === "notify").map((action) => ({ id: action.id, channel: action.target ?? "notify" })),
    createdAt: new Date(item.createdAt).getTime(),
    updatedAt: new Date(item.updatedAt).getTime(),
  };
}

function routineProjection(item: TemporalItem, executions: TemporalExecution[]) {
  const latestExecution = executions.find((execution) => execution.itemId === item.id);
  return {
    id: item.id,
    label: item.title,
    description: item.description ?? "",
    schedule: item.schedule.cron ?? item.schedule.rrule ?? item.schedule.startsAt ?? item.nextRunAt ?? "",
    channel: item.actions[0]?.target ?? "workflow",
    prompt: item.description ?? item.title,
    enabled: item.status === "active",
    createdAt: new Date(item.createdAt).getTime(),
    updatedAt: new Date(item.updatedAt).getTime(),
    lastRun: latestExecution?.completedAt ? new Date(latestExecution.completedAt).getTime() : undefined,
  };
}

export class EmbeddedTimeEngine {
  readonly store: TimeServiceStore;
  readonly config: EmbeddedTimeEngineOptions;
  private timer?: NodeJS.Timeout;

  constructor(options: EmbeddedTimeEngineOptions) {
    this.config = {
      ...options,
      schedulerIntervalMs: options.schedulerIntervalMs ?? 1000,
    };
    this.store = new TimeServiceStore(this.config.dbPath);
  }

  close(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.store.close();
  }

  startScheduler(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runSchedulerCycle().catch(() => undefined);
    }, this.config.schedulerIntervalMs);
    this.timer.unref?.();
  }

  async runSchedulerCycle(): Promise<TemporalExecution[]> {
    const now = new Date();
    const dueItems = this.store.listItems({ status: "active" }).filter((item) => item.nextRunAt && item.nextRunAt <= now.toISOString());
    const completed: TemporalExecution[] = [];

    for (const item of dueItems) {
      const scheduledFor = item.nextRunAt!;
      const existing = this.store.getExecutionForSchedule(item.id, scheduledFor);
      if (existing) continue;
      const heartbeat = await evaluateHeartbeat(this.config, item, scheduledFor, now);
      if (heartbeat.action === "skip" || heartbeat.action === "complete") {
        this.store.putItem(heartbeat.item);
        continue;
      }
      const runnableItem = heartbeat.action === "wake" ? heartbeat.item : item;
      if (heartbeat.action === "wake") {
        this.store.putItem(runnableItem);
      }
      let execution = createExecution(item.id, scheduledFor, "scheduler");
      this.store.putExecution(execution);
      try {
        const { output, agentResult } = await dispatchActions(
          this.config,
          runnableItem,
          execution,
          this.store,
          heartbeat.action === "wake" ? heartbeat.matches : [],
        );
        execution = completeExecution(execution, {
          status: agentResult?.status === "error" ? "failed" : "succeeded",
          output,
          ...(agentResult?.error ? { error: agentResult.error } : {}),
        });
        this.store.putExecution(execution);
        let nextItem = this.store.getItem(item.id);
        if (!nextItem) continue;
        if (nextItem.heartbeat && agentResult) {
          nextItem.heartbeat = {
            ...nextItem.heartbeat,
            state: {
              ...heartbeatState(nextItem),
              lastResult: {
                ...agentResult,
                at: new Date().toISOString(),
              },
            },
          };
          if (agentResult.status === "disable" && nextItem.heartbeat.stopWhen?.includes("agent:disable")) {
            nextItem.status = "completed";
            nextItem.nextRunAt = undefined;
            nextItem.updatedAt = new Date().toISOString();
            this.store.putItem(nextItem);
            completed.push(execution);
            continue;
          }
        }
        nextItem = rescheduleItem(nextItem, scheduledFor);
        this.store.putItem(nextItem);
        completed.push(execution);
      } catch (error) {
        execution = completeExecution(execution, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        this.store.putExecution(execution);
        completed.push(execution);
      }
    }

    return completed;
  }

  async list(filters?: {
    kind?: TemporalItem["kind"];
    status?: TemporalItem["status"];
    workspaceId?: string;
    projectId?: string;
    agentId?: string;
    ownerId?: string;
    sourceProvider?: string;
  }) {
    return { items: this.store.listItems(filters) };
  }

  async get(id: string) {
    const item = this.store.getItem(id);
    if (!item) throw new Error(`time item not found: ${id}`);
    return { item };
  }

  async create(input: CreateTemporalItemInput) {
    const item = normalizeTemporalItem(input, this.config.defaultTimeZone);
    this.store.putItem(item);
    return { item };
  }

  async update(id: string, input: UpdateTemporalItemInput) {
    const current = this.store.getItem(id);
    if (!current) throw new Error(`time item not found: ${id}`);
    const item = applyTemporalItemUpdate(current, input, this.config.defaultTimeZone);
    this.store.putItem(item);
    return { item };
  }

  async delete(id: string) {
    const ok = this.store.deleteItem(id);
    if (!ok) throw new Error(`time item not found: ${id}`);
    return { ok: true };
  }

  async pause(id: string) {
    const current = this.store.getItem(id);
    if (!current) throw new Error(`time item not found: ${id}`);
    current.status = "paused";
    current.nextRunAt = undefined;
    current.updatedAt = new Date().toISOString();
    this.store.putItem(current);
    return { item: current };
  }

  async resume(id: string) {
    const current = this.store.getItem(id);
    if (!current) throw new Error(`time item not found: ${id}`);
    current.status = "active";
    current.nextRunAt = computeNextRunAt(current);
    current.updatedAt = new Date().toISOString();
    this.store.putItem(current);
    return { item: current };
  }

  async runNow(id: string) {
    const current = this.store.getItem(id);
    if (!current) throw new Error(`time item not found: ${id}`);
    let execution = createExecution(current.id, new Date().toISOString(), "manual");
    this.store.putExecution(execution);
    const { output, agentResult } = await dispatchActions(this.config, current, execution, this.store);
    execution = completeExecution(execution, {
      status: agentResult?.status === "error" ? "failed" : "succeeded",
      output,
      ...(agentResult?.error ? { error: agentResult.error } : {}),
    });
    this.store.putExecution(execution);
    let refreshed = this.store.getItem(id)!;
    if (refreshed.heartbeat && agentResult) {
      refreshed.heartbeat = {
        ...refreshed.heartbeat,
        state: {
          ...heartbeatState(refreshed),
          lastResult: {
            ...agentResult,
            at: new Date().toISOString(),
          },
        },
      };
      if (agentResult.status === "disable" && refreshed.heartbeat.stopWhen?.includes("agent:disable")) {
        refreshed.status = "completed";
        refreshed.nextRunAt = undefined;
        refreshed.updatedAt = new Date().toISOString();
        this.store.putItem(refreshed);
        return { item: refreshed, execution };
      }
    }
    refreshed = rescheduleItem(refreshed, execution.scheduledFor);
    this.store.putItem(refreshed);
    return { item: refreshed, execution };
  }

  async listExecutions(itemId?: string) {
    return { executions: this.store.listExecutions(itemId) };
  }

  async calendarView(input?: { start?: string; end?: string }) {
    const start = input?.start ? new Date(input.start).getTime() : Date.now() - 86_400_000;
    const end = input?.end ? new Date(input.end).getTime() : Date.now() + 31 * 86_400_000;
    const items = this.store.listItems().filter((item) => {
      const ts = item.startsAt ? new Date(item.startsAt).getTime() : item.nextRunAt ? new Date(item.nextRunAt).getTime() : 0;
      return ts >= start && ts <= end;
    });
    return {
      items,
      entries: items.map(eventProjection),
    };
  }

  async timelineView(input?: { start?: string; end?: string }) {
    const start = input?.start ? new Date(input.start).getTime() : 0;
    const end = input?.end ? new Date(input.end).getTime() : Date.now() + 31 * 86_400_000;
    const items = this.store.listItems().filter((item) => {
      const ts = item.startsAt ? new Date(item.startsAt).getTime() : item.nextRunAt ? new Date(item.nextRunAt).getTime() : 0;
      return ts >= start && ts <= end;
    });
    return { items };
  }

  async signalAnchor(input: { anchorId: string; signal: "reply_received" | "task_completed" | "event_started" | "execution_succeeded" }) {
    const updated: TemporalItem[] = [];
    for (const item of this.store.listItems({ status: "active" })) {
      const matchesRelativeSignal = item.schedule.mode === "relative"
        && item.schedule.relative?.anchorId === input.anchorId
        && item.schedule.relative.cancelOn === input.signal;
      const matchesTaskCompletion = input.signal === "task_completed"
        && item.anchorType === "task"
        && item.anchorId === input.anchorId
        && (item.kind === "reminder" || item.kind === "follow_up");
      if (!matchesRelativeSignal && !matchesTaskCompletion) continue;
      item.status = "cancelled";
      item.nextRunAt = undefined;
      item.updatedAt = new Date().toISOString();
      this.store.putItem(item);
      let execution = createExecution(item.id, new Date().toISOString(), "system");
      execution = completeExecution(execution, { status: "cancelled", output: `Cancelled by signal ${input.signal}` });
      this.store.putExecution(execution);
      updated.push(item);
    }
    return { items: updated };
  }

  async legacyEvents() {
    const items = this.store.listItems().filter((item) => item.kind === "event");
    return { events: items.map(eventProjection) };
  }

  async legacyRoutines() {
    const items = this.store.listItems().filter((item) => item.kind === "routine");
    const executions = this.store.listExecutions();
    return {
      routines: items.map((item) => routineProjection(item, executions)),
      executions: executions.map((execution) => ({
        id: execution.id,
        routineId: execution.itemId,
        status: execution.status === "succeeded" ? "success" : execution.status === "failed" ? "failure" : execution.status,
        startedAt: execution.startedAt ? new Date(execution.startedAt).getTime() : new Date(execution.scheduledFor).getTime(),
        completedAt: execution.completedAt ? new Date(execution.completedAt).getTime() : undefined,
        output: execution.output,
        error: execution.error,
      })),
    };
  }
}
