import type {
  TemporalExecution,
  TemporalHeartbeatAgentResult,
  TemporalHeartbeatMatch,
  TemporalItem,
  TemporalProjection,
  TemporalRunLogEntry,
} from "@clawjs/core";
import { clawNotifyApiRoutes, clawTemporalEvents } from "@clawjs/core";

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
  maxCatchUpPerCycle?: number;
  missedJobStaggerMs?: number;
  runLogLimit?: number;
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
  target: "main" | "isolated";
  deliver?: NonNullable<TemporalItem["heartbeat"]>["deliver"];
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

const MIN_REFIRE_GAP_MS = 2_000;
const DEFAULT_MAX_CATCH_UP_PER_CYCLE = 5;
const DEFAULT_MISSED_JOB_STAGGER_MS = 5_000;
const DEFAULT_RUN_LOG_LIMIT = 500;
const DEFAULT_TRANSIENT_ATTEMPTS = 3;
const ERROR_BACKOFF_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

function nowIso(): string {
  return new Date().toISOString();
}

function parseIsoMs(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function errorBackoffMs(consecutiveErrors: number): number {
  const index = Math.max(0, Math.min(ERROR_BACKOFF_MS.length - 1, consecutiveErrors - 1));
  return ERROR_BACKOFF_MS[index] ?? ERROR_BACKOFF_MS[ERROR_BACKOFF_MS.length - 1]!;
}

function ensureFutureNextRunAt(item: TemporalItem, from: Date): string | undefined {
  const first = computeNextRunAt(item, from);
  const firstMs = parseIsoMs(first);
  const minMs = from.getTime() + MIN_REFIRE_GAP_MS;
  if (firstMs !== null && firstMs >= minMs) return first;
  return computeNextRunAt(item, new Date(minMs));
}

function rescheduleItem(item: TemporalItem, scheduledFor: string): TemporalItem {
  const nextItem = { ...item };
  if (nextItem.schedule.mode === "one_off" || nextItem.schedule.mode === "relative") {
    nextItem.status = "completed";
    nextItem.nextRunAt = undefined;
  } else {
    const scheduledForMs = parseIsoMs(scheduledFor) ?? Date.now();
    const reference = new Date(Math.max(scheduledForMs, Date.now()));
    nextItem.nextRunAt = ensureFutureNextRunAt(nextItem, reference);
  }
  nextItem.runtime = undefined;
  nextItem.updatedAt = nowIso();
  return nextItem;
}

function markRunning(item: TemporalItem, execution: TemporalExecution): TemporalItem {
  return {
    ...item,
    runtime: {
      ...(item.runtime ?? {}),
      runningExecutionId: execution.id,
      runningAt: execution.startedAt ?? nowIso(),
    },
    updatedAt: nowIso(),
  };
}

function clearRuntimeSuccess(item: TemporalItem, durationMs: number): TemporalItem {
  return {
    ...item,
    runtime: {
      ...(item.runtime ?? {}),
      runningExecutionId: undefined,
      runningAt: undefined,
      consecutiveErrors: 0,
      lastError: undefined,
      lastErrorAt: undefined,
      nextRetryAt: undefined,
      lastDurationMs: durationMs,
    },
  };
}

function applyFailureBackoff(item: TemporalItem, scheduledFor: string, error: string, completedAt: Date): TemporalItem {
  const consecutiveErrors = (item.runtime?.consecutiveErrors ?? 0) + 1;
  const backoffMs = errorBackoffMs(consecutiveErrors);
  const failed: TemporalItem = {
    ...item,
    runtime: {
      ...(item.runtime ?? {}),
      runningExecutionId: undefined,
      runningAt: undefined,
      consecutiveErrors,
      lastError: error,
      lastErrorAt: completedAt.toISOString(),
      lastDurationMs: item.runtime?.lastDurationMs,
    },
    updatedAt: completedAt.toISOString(),
  };
  if (failed.schedule.mode === "one_off" || failed.schedule.mode === "relative") {
    if (consecutiveErrors >= DEFAULT_TRANSIENT_ATTEMPTS) {
      failed.status = "paused";
      failed.nextRunAt = undefined;
      failed.runtime = {
        ...(failed.runtime ?? {}),
        nextRetryAt: undefined,
      };
      return failed;
    }
    const retryAt = new Date(completedAt.getTime() + backoffMs).toISOString();
    failed.nextRunAt = retryAt;
    failed.runtime = {
      ...(failed.runtime ?? {}),
      nextRetryAt: retryAt,
    };
    return failed;
  }
  const naturalNext = ensureFutureNextRunAt(failed, new Date(Math.max(parseIsoMs(scheduledFor) ?? completedAt.getTime(), completedAt.getTime())));
  const backoffAtMs = completedAt.getTime() + backoffMs;
  const naturalNextMs = parseIsoMs(naturalNext);
  const nextRetryAt = new Date(naturalNextMs === null ? backoffAtMs : Math.max(naturalNextMs, backoffAtMs)).toISOString();
  failed.nextRunAt = nextRetryAt;
  failed.runtime = {
    ...(failed.runtime ?? {}),
    nextRetryAt,
  };
  return failed;
}

function parseClockMinutes(value: string | undefined, allow24 = false): number | null {
  const match = value?.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (hour === 24 && allow24 && minute === 0) return 24 * 60;
  if (hour < 0 || hour > 23) return null;
  return hour * 60 + minute;
}

function zonedMinutes(now: Date, timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    return hour * 60 + minute;
  } catch {
    return null;
  }
}

function isWithinActiveHours(item: TemporalItem, now: Date): boolean {
  const activeHours = item.heartbeat?.activeHours;
  if (!activeHours) return true;
  const start = parseClockMinutes(activeHours.start);
  const end = parseClockMinutes(activeHours.end, true);
  if (start === null || end === null) return true;
  if (start === end) return false;
  const current = zonedMinutes(now, activeHours.timezone ?? item.timezone ?? "UTC");
  if (current === null) return true;
  return end > start ? current >= start && current < end : current >= start || current < end;
}

function heartbeatSkip(item: TemporalItem, scheduledFor: string, evaluatedAt: string, reason: string): HeartbeatDecision {
  const state = heartbeatState(item);
  const skipped = rescheduleItem({
    ...item,
    heartbeat: item.heartbeat ? {
      ...item.heartbeat,
      state: {
        ...state,
        skipCount: state.skipCount + 1,
        lastEvaluatedAt: evaluatedAt,
        lastSkipAt: evaluatedAt,
        lastSkipReason: reason,
        lastMatches: [],
      },
    } : undefined,
  }, scheduledFor);
  return { action: "skip", item: skipped };
}

function wakeBudgetAllows(item: TemporalItem, now: Date): { ok: true } | { ok: false; reason: string } {
  const heartbeat = item.heartbeat;
  if (!heartbeat) return { ok: true };
  const lastWakeAt = parseIsoMs(heartbeat.state?.lastWakeAt);
  if (heartbeat.cooldownMs !== undefined && lastWakeAt !== null && now.getTime() - lastWakeAt < heartbeat.cooldownMs) {
    return { ok: false, reason: "heartbeat cooldown active" };
  }
  const windowPolicy = heartbeat.maxWakesPerWindow;
  if (windowPolicy) {
    const min = now.getTime() - windowPolicy.windowMs;
    const recent = (heartbeat.state?.wakeTimestamps ?? []).map(parseIsoMs).filter((value): value is number => value !== null && value >= min);
    if (recent.length >= windowPolicy.count) {
      return { ok: false, reason: "heartbeat wake budget exhausted" };
    }
  }
  return { ok: true };
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
  if (!isWithinActiveHours(item, now)) {
    return heartbeatSkip(item, scheduledFor, evaluatedAt, "outside active hours");
  }
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
    return heartbeatSkip(item, scheduledFor, evaluatedAt, "no heartbeat matches");
  }

  const budget = wakeBudgetAllows(item, now);
  if (!budget.ok) {
    return heartbeatSkip(item, scheduledFor, evaluatedAt, budget.reason);
  }

  const state = heartbeatState(item);
  const windowPolicy = item.heartbeat.maxWakesPerWindow;
  const minWakeMs = windowPolicy ? now.getTime() - windowPolicy.windowMs : null;
  const wakeTimestamps = [
    ...(state.wakeTimestamps ?? []).filter((timestamp) => {
      if (minWakeMs === null) return true;
      const ts = parseIsoMs(timestamp);
      return ts !== null && ts >= minWakeMs;
    }),
    evaluatedAt,
  ].slice(-50);
  const awakened: TemporalItem = {
    ...item,
    heartbeat: {
      ...item.heartbeat,
      state: {
        ...state,
        lastEvaluatedAt: evaluatedAt,
        lastWakeAt: evaluatedAt,
        lastMatches: matches.slice(0, item.heartbeat.limit),
        wakeTimestamps,
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
      target: item.heartbeat.target ?? "isolated",
      ...(item.heartbeat.deliver !== undefined ? { deliver: item.heartbeat.deliver } : {}),
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
      await fetch(`${options.notifyBaseUrl.replace(/\/$/, "")}${clawNotifyApiRoutes.notifications}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          context: {
            tenantId: item.workspaceId ?? "time-local",
            workspaceId: item.workspaceId ?? "time-local",
            eventType: clawTemporalEvents.itemDue,
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
  private schedulerRunning = false;

  constructor(options: EmbeddedTimeEngineOptions) {
    this.config = {
      ...options,
      schedulerIntervalMs: options.schedulerIntervalMs ?? 1000,
    };
    this.store = new TimeServiceStore(this.config.dbPath);
    this.store.failStaleRunningExecutions();
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
    if (this.schedulerRunning) return [];
    this.schedulerRunning = true;
    const now = new Date();
    const completed: TemporalExecution[] = [];
    try {
    const dueItems = this.store.listItems({ status: "active" })
      .filter((item) => item.nextRunAt && item.nextRunAt <= now.toISOString())
      .sort((left, right) => String(left.nextRunAt).localeCompare(String(right.nextRunAt)));
    const maxCatchUp = Math.max(1, Math.floor(this.config.maxCatchUpPerCycle ?? DEFAULT_MAX_CATCH_UP_PER_CYCLE));
    const runnableItems = dueItems.slice(0, maxCatchUp);
    const deferredItems = dueItems.slice(maxCatchUp);
    const staggerMs = Math.max(0, Math.floor(this.config.missedJobStaggerMs ?? DEFAULT_MISSED_JOB_STAGGER_MS));
    deferredItems.forEach((item, index) => {
      this.store.putItem({
        ...item,
        nextRunAt: new Date(now.getTime() + (index + 1) * staggerMs).toISOString(),
        updatedAt: now.toISOString(),
      });
    });

    for (const item of runnableItems) {
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
      const isHeartbeatWake = heartbeat.action === "wake";
      if (!isHeartbeatWake) {
        this.store.putExecution(execution);
      }
      this.store.putItem(markRunning(runnableItem, execution));
      const startedMs = parseIsoMs(execution.startedAt) ?? Date.now();
      try {
        const { output, agentResult } = await dispatchActions(
          this.config,
          runnableItem,
          execution,
          this.store,
          heartbeat.action === "wake" ? heartbeat.matches : [],
        );
        const completedAt = new Date();
        const durationMs = Math.max(0, completedAt.getTime() - startedMs);
        if (agentResult?.status === "noop") {
          let noopItem = this.store.getItem(item.id);
          if (!noopItem) continue;
          noopItem = rescheduleItem({
            ...clearRuntimeSuccess(noopItem, durationMs),
            heartbeat: noopItem.heartbeat ? {
              ...noopItem.heartbeat,
              state: {
                ...heartbeatState(noopItem),
                lastNoopAt: completedAt.toISOString(),
                lastResult: {
                  ...agentResult,
                  at: completedAt.toISOString(),
                },
              },
            } : undefined,
          }, scheduledFor);
          this.store.putItem(noopItem);
          this.store.appendRunLog({
            id: execution.id,
            itemId: item.id,
            status: "noop",
            scheduledFor,
            startedAt: execution.startedAt ?? completedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            durationMs,
            triggeredBy: "scheduler",
            summary: agentResult.summary,
            agentResult,
            usage: agentResult.usage,
          }, { keep: this.config.runLogLimit ?? DEFAULT_RUN_LOG_LIMIT });
          continue;
        }
        if (isHeartbeatWake) {
          this.store.putExecution(execution);
        }
        execution = completeExecution(execution, {
          status: agentResult?.status === "error" ? "failed" : "succeeded",
          output,
          ...(agentResult?.error ? { error: agentResult.error } : {}),
        });
        this.store.putExecution(execution);
        let nextItem = this.store.getItem(item.id);
        if (!nextItem) continue;
        nextItem = clearRuntimeSuccess(nextItem, durationMs);
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
            this.store.appendRunLog({
              id: execution.id,
              itemId: item.id,
              status: execution.status === "succeeded" ? "succeeded" : "failed",
              scheduledFor,
              startedAt: execution.startedAt ?? completedAt.toISOString(),
              completedAt: execution.completedAt ?? completedAt.toISOString(),
              durationMs,
              triggeredBy: "scheduler",
              summary: agentResult.summary ?? output,
              error: execution.error,
              agentResult,
              usage: agentResult.usage,
            }, { keep: this.config.runLogLimit ?? DEFAULT_RUN_LOG_LIMIT });
            completed.push(execution);
            continue;
          }
        }
        nextItem = rescheduleItem(nextItem, scheduledFor);
        this.store.putItem(nextItem);
        this.store.appendRunLog({
          id: execution.id,
          itemId: item.id,
          status: execution.status === "succeeded" ? "succeeded" : execution.status === "cancelled" ? "cancelled" : "failed",
          scheduledFor,
          startedAt: execution.startedAt ?? completedAt.toISOString(),
          completedAt: execution.completedAt ?? completedAt.toISOString(),
          durationMs,
          triggeredBy: "scheduler",
          summary: agentResult?.summary ?? output,
          error: execution.error,
          ...(agentResult ? { agentResult } : {}),
          usage: agentResult?.usage,
        }, { keep: this.config.runLogLimit ?? DEFAULT_RUN_LOG_LIMIT });
        completed.push(execution);
      } catch (error) {
        if (isHeartbeatWake) {
          this.store.putExecution(execution);
        }
        const completedAt = new Date();
        const durationMs = Math.max(0, completedAt.getTime() - startedMs);
        const errorText = error instanceof Error ? error.message : String(error);
        execution = completeExecution(execution, {
          status: "failed",
          error: errorText,
        });
        this.store.putExecution(execution);
        const failedItem = applyFailureBackoff(this.store.getItem(item.id) ?? runnableItem, scheduledFor, errorText, completedAt);
        this.store.putItem(failedItem);
        this.store.appendRunLog({
          id: execution.id,
          itemId: item.id,
          status: "failed",
          scheduledFor,
          startedAt: execution.startedAt ?? completedAt.toISOString(),
          completedAt: execution.completedAt ?? completedAt.toISOString(),
          durationMs,
          triggeredBy: "scheduler",
          error: errorText,
        }, { keep: this.config.runLogLimit ?? DEFAULT_RUN_LOG_LIMIT });
        completed.push(execution);
      }
    }

    return completed;
    } finally {
      this.schedulerRunning = false;
    }
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
    const isHeartbeat = Boolean(current.heartbeat);
    if (!isHeartbeat) {
      this.store.putExecution(execution);
    }
    this.store.putItem(markRunning(current, execution));
    const startedMs = parseIsoMs(execution.startedAt) ?? Date.now();
    const { output, agentResult } = await dispatchActions(this.config, current, execution, this.store);
    const completedAt = new Date();
    const durationMs = Math.max(0, completedAt.getTime() - startedMs);
    if (agentResult?.status === "noop") {
      let refreshed = this.store.getItem(id)!;
      refreshed = rescheduleItem({
        ...clearRuntimeSuccess(refreshed, durationMs),
        heartbeat: refreshed.heartbeat ? {
          ...refreshed.heartbeat,
          state: {
            ...heartbeatState(refreshed),
            lastNoopAt: completedAt.toISOString(),
            lastResult: {
              ...agentResult,
              at: completedAt.toISOString(),
            },
          },
        } : undefined,
      }, execution.scheduledFor);
      this.store.putItem(refreshed);
      this.store.appendRunLog({
        id: execution.id,
        itemId: id,
        status: "noop",
        scheduledFor: execution.scheduledFor,
        startedAt: execution.startedAt ?? completedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
        triggeredBy: "manual",
        summary: agentResult.summary,
        agentResult,
        usage: agentResult.usage,
      }, { keep: this.config.runLogLimit ?? DEFAULT_RUN_LOG_LIMIT });
      return { item: refreshed, execution: completeExecution(execution, { status: "cancelled", output }) };
    }
    if (isHeartbeat) {
      this.store.putExecution(execution);
    }
    execution = completeExecution(execution, {
      status: agentResult?.status === "error" ? "failed" : "succeeded",
      output,
      ...(agentResult?.error ? { error: agentResult.error } : {}),
    });
    this.store.putExecution(execution);
    let refreshed = this.store.getItem(id)!;
    refreshed = clearRuntimeSuccess(refreshed, durationMs);
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
        this.store.appendRunLog({
          id: execution.id,
          itemId: id,
          status: execution.status === "succeeded" ? "succeeded" : "failed",
          scheduledFor: execution.scheduledFor,
          startedAt: execution.startedAt ?? completedAt.toISOString(),
          completedAt: execution.completedAt ?? completedAt.toISOString(),
          durationMs,
          triggeredBy: "manual",
          summary: agentResult.summary ?? output,
          error: execution.error,
          agentResult,
          usage: agentResult.usage,
        }, { keep: this.config.runLogLimit ?? DEFAULT_RUN_LOG_LIMIT });
        return { item: refreshed, execution };
      }
    }
    refreshed = rescheduleItem(refreshed, execution.scheduledFor);
    this.store.putItem(refreshed);
    this.store.appendRunLog({
      id: execution.id,
      itemId: id,
      status: execution.status === "succeeded" ? "succeeded" : execution.status === "cancelled" ? "cancelled" : "failed",
      scheduledFor: execution.scheduledFor,
      startedAt: execution.startedAt ?? completedAt.toISOString(),
      completedAt: execution.completedAt ?? completedAt.toISOString(),
      durationMs,
      triggeredBy: "manual",
      summary: agentResult?.summary ?? output,
      error: execution.error,
      ...(agentResult ? { agentResult } : {}),
      usage: agentResult?.usage,
    }, { keep: this.config.runLogLimit ?? DEFAULT_RUN_LOG_LIMIT });
    return { item: refreshed, execution };
  }

  async listExecutions(itemId?: string) {
    return { executions: this.store.listExecutions(itemId) };
  }

  async listRunLog(itemId?: string, limit?: number) {
    return { entries: this.store.listRunLog(itemId, limit) };
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
