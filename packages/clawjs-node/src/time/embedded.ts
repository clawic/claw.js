import type { TemporalExecution, TemporalItem, TemporalProjection } from "@clawjs/core";

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
}

async function dispatchActions(
  options: EmbeddedTimeEngineOptions,
  item: TemporalItem,
  execution: TemporalExecution,
  store: TimeServiceStore,
): Promise<{
  output: string;
  projections: TemporalProjection[];
}> {
  let output = `${item.kind} executed`;
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

  for (const action of item.actions) {
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
  return { output, projections };
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
      let execution = createExecution(item.id, scheduledFor, "scheduler");
      this.store.putExecution(execution);
      try {
        const { output } = await dispatchActions(this.config, item, execution, this.store);
        execution = completeExecution(execution, { status: "succeeded", output });
        this.store.putExecution(execution);
        const nextItem = this.store.getItem(item.id);
        if (!nextItem) continue;
        if (nextItem.schedule.mode === "one_off" || nextItem.schedule.mode === "relative") {
          nextItem.status = "completed";
          nextItem.nextRunAt = undefined;
        } else {
          nextItem.nextRunAt = computeNextRunAt(nextItem, new Date(scheduledFor));
        }
        nextItem.updatedAt = new Date().toISOString();
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
    const { output } = await dispatchActions(this.config, current, execution, this.store);
    execution = completeExecution(execution, { status: "succeeded", output });
    this.store.putExecution(execution);
    const refreshed = this.store.getItem(id)!;
    if (refreshed.schedule.mode === "one_off" || refreshed.schedule.mode === "relative") {
      refreshed.status = "completed";
      refreshed.nextRunAt = undefined;
    } else {
      refreshed.nextRunAt = computeNextRunAt(refreshed, new Date(execution.scheduledFor));
    }
    refreshed.updatedAt = new Date().toISOString();
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
