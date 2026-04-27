import { randomUUID } from "node:crypto";
import { Cron } from "croner";

import type {
  TemporalAction,
  TemporalExecution,
  TemporalHeartbeatPolicy,
  TemporalItem,
  TemporalNaturalInput,
  TemporalParticipant,
  TemporalProjection,
} from "@clawjs/core";

export type TemporalItemKind = TemporalItem["kind"];
export type TemporalItemStatus = TemporalItem["status"];
export type TemporalScheduleMode = TemporalItem["schedule"]["mode"];
export type TemporalSchedule = TemporalItem["schedule"];
export type TemporalOccurrenceOverride = NonNullable<TemporalSchedule["overrides"]>[number];
export type TemporalParticipantKind = TemporalParticipant["kind"];
export type TemporalActionKind = TemporalAction["kind"];
export type TemporalExecutionStatus = TemporalExecution["status"];
export type TemporalProjectionStatus = TemporalProjection["status"];
export type TemporalProjectionTarget = TemporalProjection["target"];
export type TemporalAnchorType = NonNullable<TemporalItem["anchorType"]>;
export type TemporalCancelSignal = NonNullable<NonNullable<TemporalItem["schedule"]["relative"]>["cancelOn"]>;

export interface CreateTemporalItemInput {
  id?: string;
  kind: TemporalItemKind;
  title: string;
  description?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  dueAt?: string;
  timezone?: string;
  schedule?: Partial<TemporalSchedule>;
  participants?: Array<Partial<TemporalParticipant>>;
  actions?: Array<Partial<TemporalAction>>;
  projections?: Array<Partial<TemporalProjection>>;
  heartbeat?: Partial<TemporalHeartbeatPolicy>;
  ownerId?: string;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  sourceProvider?: string;
  anchorType?: TemporalAnchorType;
  anchorId?: string;
  natural?: TemporalNaturalInput;
}

export interface UpdateTemporalItemInput extends Partial<Omit<CreateTemporalItemInput, "kind" | "title">> {
  title?: string;
  status?: TemporalItemStatus;
}

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const RRULE_WEEKDAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const HEARTBEAT_WHEN_CONDITIONS = new Set([
  "workspace.tasks:new",
  "workspace.inbox:new",
  "workspace.events:due",
  "relay.messages:new",
]);

const HEARTBEAT_STOP_CONDITIONS = new Set([
  "workspace.tasks:none",
  "workspace.inbox:none",
  "workspace.events:none",
  "relay.messages:none",
  "agent:disable",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function getFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
}

export function getZonedParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    getFormatter(timeZone).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: String(parts.weekday ?? "Sun"),
  };
}

function weekdayFromParts(parts: ReturnType<typeof getZonedParts>): number {
  const short = parts.weekday.slice(0, 3).toLowerCase();
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(short);
}

export function zonedDateTimeToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
}, timeZone: string): Date {
  let guess = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second ?? 0);
  const desired = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second ?? 0);
  for (let index = 0; index < 6; index += 1) {
    const actualParts = getZonedParts(new Date(guess), timeZone);
    const actual = Date.UTC(
      actualParts.year,
      actualParts.month - 1,
      actualParts.day,
      actualParts.hour,
      actualParts.minute,
      actualParts.second,
    );
    const diff = desired - actual;
    if (diff === 0) return new Date(guess);
    guess += diff;
  }
  return new Date(guess);
}

function parseClock(text: string): { hour: number; minute: number } | null {
  const match = text.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const period = match[3];
  if (period === "pm" && hour < 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function parseDurationMs(text: string): number | null {
  const match = text.trim().toLowerCase().match(/^(\d+)\s*(ms|s|m|h|d)$/);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "ms") return value;
  if (unit === "s") return value * 1000;
  if (unit === "m") return value * 60_000;
  if (unit === "h") return value * 3_600_000;
  return value * 86_400_000;
}

function parseEveryExpression(expression: string): string {
  const normalized = expression.trim().toLowerCase();
  const duration = parseDurationMs(normalized);
  if (!duration) {
    throw new Error(`Unsupported repeating schedule: ${expression}`);
  }
  if (duration < 60_000) {
    const seconds = Math.max(1, Math.round(duration / 1000));
    return seconds === 1 ? "* * * * * *" : `*/${seconds} * * * * *`;
  }
  const minutes = Math.round(duration / 60_000);
  if (minutes < 60 && 60 % minutes === 0) {
    return minutes === 1 ? "* * * * *" : `*/${minutes} * * * *`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    if (24 % hours === 0) {
      return hours === 1 ? "0 * * * *" : `0 */${hours} * * *`;
    }
  }
  throw new Error(`Unsupported repeating schedule: ${expression}`);
}

function parseAtExpression(expression: string, timeZone: string, now = new Date()): string {
  const normalized = expression.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}t/.test(normalized)) {
    return new Date(normalized).toISOString();
  }
  const match = normalized.match(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(.+)$/);
  if (!match) {
    throw new Error(`Unsupported one-off schedule: ${expression}`);
  }
  const targetWeekday = WEEKDAY_INDEX[match[1]];
  const clock = parseClock(match[2]);
  if (!clock) {
    throw new Error(`Unsupported time expression: ${expression}`);
  }
  const nowParts = getZonedParts(now, timeZone);
  const currentWeekday = weekdayFromParts(nowParts);
  let delta = targetWeekday - currentWeekday;
  if (delta < 0 || (delta === 0 && (clock.hour < nowParts.hour || (clock.hour === nowParts.hour && clock.minute <= nowParts.minute)))) {
    delta += 7;
  }
  const targetMiddayUtc = zonedDateTimeToUtc({
    year: nowParts.year,
    month: nowParts.month,
    day: nowParts.day + delta,
    hour: 12,
    minute: 0,
    second: 0,
  }, timeZone);
  const targetParts = getZonedParts(targetMiddayUtc, timeZone);
  return zonedDateTimeToUtc({
    year: targetParts.year,
    month: targetParts.month,
    day: targetParts.day,
    hour: clock.hour,
    minute: clock.minute,
    second: 0,
  }, timeZone).toISOString();
}

function parseAfterExpression(natural: TemporalNaturalInput, timeZone: string): TemporalSchedule {
  const normalized = natural.expression.trim().toLowerCase();
  const durationMatch = normalized.match(/^(\d+\s*[mhd])(?:\s+if\s+no\s+reply)?$/);
  const duration = parseDurationMs(durationMatch?.[1] ?? normalized.replace(/\s+if.+$/, ""));
  if (!duration) {
    throw new Error(`Unsupported relative schedule: ${natural.expression}`);
  }
  if (!natural.anchorType || !natural.anchorId || !natural.anchorAt) {
    throw new Error("Relative schedules require anchorType, anchorId, and anchorAt.");
  }
  return {
    mode: "relative",
    timezone: natural.timezone ?? timeZone,
    relative: {
      anchorType: natural.anchorType,
      anchorId: natural.anchorId,
      anchorAt: new Date(natural.anchorAt).toISOString(),
      offsetMs: duration,
      cancelOn: normalized.includes("if no reply") ? "reply_received" : undefined,
    },
  };
}

export function buildScheduleFromNatural(
  natural: TemporalNaturalInput,
  timeZone: string,
  now = new Date(),
): TemporalSchedule {
  const effectiveTimeZone = natural.timezone ?? timeZone;
  if (natural.command === "every") {
    return {
      mode: "cron",
      timezone: effectiveTimeZone,
      cron: parseEveryExpression(natural.expression),
    };
  }
  if (natural.command === "after") {
    return parseAfterExpression(natural, effectiveTimeZone);
  }
  return {
    mode: "one_off",
    timezone: effectiveTimeZone,
    startsAt: parseAtExpression(natural.expression, effectiveTimeZone, now),
  };
}

function buildDefaultActions(kind: TemporalItemKind): TemporalAction[] {
  if (kind === "event") {
    return [{ id: randomUUID(), kind: "calendar_sync", target: "google_calendar" }];
  }
  if (kind === "routine") {
    return [{ id: randomUUID(), kind: "workflow", target: "runtime_scheduler" }];
  }
  return [{ id: randomUUID(), kind: "notify", target: "notify" }];
}

function buildDefaultProjections(kind: TemporalItemKind): TemporalProjection[] {
  if (kind === "event") {
    return [{
      id: randomUUID(),
      itemId: "",
      target: "workspace_events",
      status: "pending",
      provider: "workspace",
      updatedAt: nowIso(),
    }];
  }
  if (kind === "routine") {
    return [{
      id: randomUUID(),
      itemId: "",
      target: "relay_routines",
      status: "pending",
      provider: "relay",
      updatedAt: nowIso(),
    }];
  }
  return [];
}

function normalizeParticipants(input: Array<Partial<TemporalParticipant>> = []): TemporalParticipant[] {
  return input.map((participant) => ({
    id: participant.id?.trim() || randomUUID(),
    kind: participant.kind ?? "external",
    label: participant.label?.trim() || participant.personId || participant.agentId || "participant",
    ...(participant.personId ? { personId: participant.personId } : {}),
    ...(participant.agentId ? { agentId: participant.agentId } : {}),
    ...(participant.metadata ? { metadata: participant.metadata } : {}),
  }));
}

function normalizeActions(kind: TemporalItemKind, input?: Array<Partial<TemporalAction>>): TemporalAction[] {
  const source = input && input.length > 0 ? input : buildDefaultActions(kind);
  return source.map((action) => ({
    id: action.id?.trim() || randomUUID(),
    kind: action.kind ?? "notify",
    ...(action.target ? { target: action.target } : {}),
    ...(action.payload ? { payload: action.payload } : {}),
  }));
}

function normalizeProjections(kind: TemporalItemKind, itemId: string, input?: Array<Partial<TemporalProjection>>): TemporalProjection[] {
  const source = input && input.length > 0 ? input : buildDefaultProjections(kind);
  return source.map((projection) => ({
    id: projection.id?.trim() || randomUUID(),
    itemId,
    target: projection.target ?? "workspace_events",
    status: projection.status ?? "pending",
    ...(projection.provider ? { provider: projection.provider } : {}),
    ...(projection.externalId ? { externalId: projection.externalId } : {}),
    ...(projection.detail ? { detail: projection.detail } : {}),
    updatedAt: projection.updatedAt ?? nowIso(),
  }));
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function heartbeatCustomId(condition: string): string | null {
  return condition.startsWith("custom:") ? condition.slice("custom:".length).trim() || null : null;
}

function normalizeHeartbeat(input?: Partial<TemporalHeartbeatPolicy>, current?: TemporalItem): TemporalHeartbeatPolicy | undefined {
  if (input === undefined) return current?.heartbeat;
  const gatePolicy = input.gate?.policy ?? {};
  const gateWhen = normalizeStringList((gatePolicy as { when?: unknown }).when);
  const gateStopWhen = normalizeStringList((gatePolicy as { stopWhen?: unknown }).stopWhen);
  const when = [...gateWhen, ...normalizeStringList(input.when)];
  const stopWhen = [...gateStopWhen, ...normalizeStringList(input.stopWhen)];
  const allowedCustomChecks = normalizeStringList(input.allowedCustomChecks);
  const invalidWhen = when.filter((condition) => !HEARTBEAT_WHEN_CONDITIONS.has(condition) && !heartbeatCustomId(condition));
  const invalidStopWhen = stopWhen.filter((condition) => !HEARTBEAT_STOP_CONDITIONS.has(condition) && !heartbeatCustomId(condition));
  if (invalidWhen.length > 0) {
    throw new Error(`Unsupported heartbeat condition: ${invalidWhen.join(", ")}`);
  }
  if (invalidStopWhen.length > 0) {
    throw new Error(`Unsupported heartbeat stop condition: ${invalidStopWhen.join(", ")}`);
  }
  const unapprovedCustomChecks = [...when, ...stopWhen]
    .map(heartbeatCustomId)
    .filter((id): id is string => Boolean(id))
    .filter((id) => !allowedCustomChecks.includes(id));
  if (unapprovedCustomChecks.length > 0) {
    throw new Error(`Custom heartbeat checks require opt-in: ${[...new Set(unapprovedCustomChecks)].join(", ")}`);
  }
  if (when.length === 0 && stopWhen.length === 0) return undefined;
  const gateLimit = Number((gatePolicy as { limit?: unknown }).limit);
  const inputLimit = Number(input.limit);
  const prompt = input.prompt ?? (gatePolicy as { prompt?: string }).prompt;
  const cooldownMs = Number(input.cooldownMs ?? (gatePolicy as { cooldownMs?: unknown }).cooldownMs);
  const maxWakesPolicy = input.maxWakesPerWindow ?? (gatePolicy as { maxWakesPerWindow?: TemporalHeartbeatPolicy["maxWakesPerWindow"] }).maxWakesPerWindow;
  const target = input.target ?? (gatePolicy as { target?: TemporalHeartbeatPolicy["target"] }).target;
  const deliver = input.deliver ?? (gatePolicy as { deliver?: TemporalHeartbeatPolicy["deliver"] }).deliver;
  const activeHours = input.activeHours ?? (gatePolicy as { activeHours?: TemporalHeartbeatPolicy["activeHours"] }).activeHours;
  const staggerMs = Number(input.staggerMs ?? (gatePolicy as { staggerMs?: unknown }).staggerMs);
  return {
    when,
    ...(stopWhen.length > 0 ? { stopWhen } : {}),
    context: "diff",
    limit: Number.isFinite(inputLimit) && inputLimit > 0
      ? Math.floor(inputLimit)
      : Number.isFinite(gateLimit) && gateLimit > 0
        ? Math.floor(gateLimit)
        : 20,
    ...(target === "main" || target === "isolated" ? { target } : {}),
    ...(deliver !== undefined ? { deliver } : {}),
    ...(activeHours ? { activeHours } : {}),
    ...(Number.isFinite(cooldownMs) && cooldownMs >= 0 ? { cooldownMs: Math.floor(cooldownMs) } : {}),
    ...(maxWakesPolicy && Number.isFinite(maxWakesPolicy.count) && Number.isFinite(maxWakesPolicy.windowMs) ? {
      maxWakesPerWindow: {
        count: Math.max(1, Math.floor(maxWakesPolicy.count)),
        windowMs: Math.max(1, Math.floor(maxWakesPolicy.windowMs)),
      },
    } : {}),
    ...(Number.isFinite(staggerMs) && staggerMs >= 0 ? { staggerMs: Math.floor(staggerMs) } : {}),
    ...(prompt ? { prompt } : {}),
    ...(input.gate ? { gate: input.gate } : {}),
    ...(allowedCustomChecks.length > 0 ? { allowedCustomChecks } : {}),
    state: {
      skipCount: input.state?.skipCount ?? current?.heartbeat?.state?.skipCount ?? 0,
      ...(current?.heartbeat?.state ?? {}),
      ...(input.state ?? {}),
    },
  };
}

function normalizeSchedule(
  input: CreateTemporalItemInput | UpdateTemporalItemInput,
  kind: TemporalItemKind,
  defaultTimeZone: string,
  current?: TemporalItem,
): TemporalSchedule {
  const timeZone = input.timezone ?? input.schedule?.timezone ?? current?.timezone ?? defaultTimeZone;
  if (input.natural) {
    const naturalSchedule = buildScheduleFromNatural(input.natural, timeZone);
    return {
      ...naturalSchedule,
      staggerMs: input.schedule?.staggerMs ?? current?.schedule.staggerMs,
    };
  }
  const mode = input.schedule?.mode ?? current?.schedule.mode ?? (kind === "routine" ? "cron" : "one_off");
  if (mode === "relative") {
    const relative = input.schedule?.relative ?? current?.schedule.relative;
    if (!relative) throw new Error("Relative schedules require relative configuration.");
    return {
      mode,
      timezone: timeZone,
      relative,
      overrides: input.schedule?.overrides ?? current?.schedule.overrides ?? [],
      cancelledOccurrences: input.schedule?.cancelledOccurrences ?? current?.schedule.cancelledOccurrences ?? [],
    };
  }
  return {
    mode,
    timezone: timeZone,
    startsAt: input.schedule?.startsAt ?? input.startsAt ?? current?.schedule.startsAt ?? current?.startsAt,
    cron: input.schedule?.cron ?? current?.schedule.cron,
    rrule: input.schedule?.rrule ?? current?.schedule.rrule,
    staggerMs: input.schedule?.staggerMs ?? current?.schedule.staggerMs,
    overrides: input.schedule?.overrides ?? current?.schedule.overrides ?? [],
    cancelledOccurrences: input.schedule?.cancelledOccurrences ?? current?.schedule.cancelledOccurrences ?? [],
  };
}

export function computeNextRunAt(item: Pick<TemporalItem, "kind" | "startsAt" | "dueAt" | "schedule" | "status">, from = new Date()): string | undefined {
  if (item.status !== "active") return undefined;
  const schedule = item.schedule;
  if (schedule.mode === "one_off") {
    return schedule.startsAt ?? item.startsAt ?? item.dueAt;
  }
  if (schedule.mode === "relative") {
    if (!schedule.relative) return undefined;
    return new Date(new Date(schedule.relative.anchorAt).getTime() + schedule.relative.offsetMs).toISOString();
  }
  if (schedule.mode === "cron" && schedule.cron) {
    try {
      const cron = new Cron(schedule.cron, { timezone: schedule.timezone, catch: false });
      const next = cron.nextRun(from);
      if (!next) return undefined;
      const nextMs = next.getTime() + (schedule.staggerMs ?? 0);
      if (!Number.isFinite(nextMs) || nextMs <= from.getTime()) return undefined;
      return new Date(nextMs).toISOString();
    } catch {
      return undefined;
    }
    return undefined;
  }
  if (schedule.mode === "rrule" && schedule.rrule) {
    const parts = Object.fromEntries(
      schedule.rrule.split(";").map((entry) => {
        const [key, value = ""] = entry.split("=");
        return [key.toUpperCase(), value];
      }),
    );
    const freq = String(parts.FREQ ?? "").toUpperCase();
    const interval = Number(parts.INTERVAL ?? "1");
    const byHour = Number(parts.BYHOUR ?? "0");
    const byMinute = Number(parts.BYMINUTE ?? "0");
    let candidate = new Date(from.getTime() + 60_000);
    for (let index = 0; index < 20_000; index += 1) {
      const zoned = getZonedParts(candidate, schedule.timezone);
      if (freq === "HOURLY") {
        const elapsedHours = Math.floor((candidate.getTime() - from.getTime()) / 3_600_000);
        if (zoned.minute === byMinute && elapsedHours % interval === 0) {
          candidate.setSeconds(0, 0);
          return candidate.toISOString();
        }
      }
      if (freq === "WEEKLY") {
        const allowedDays = String(parts.BYDAY ?? "")
          .split(",")
          .map((entry) => RRULE_WEEKDAY_MAP[entry])
          .filter((entry) => Number.isInteger(entry));
        if (allowedDays.includes(weekdayFromParts(zoned)) && zoned.hour === byHour && zoned.minute === byMinute) {
          candidate.setSeconds(0, 0);
          return candidate.toISOString();
        }
      }
      candidate = new Date(candidate.getTime() + 60_000);
    }
  }
  return undefined;
}

export function normalizeTemporalItem(
  input: CreateTemporalItemInput,
  defaultTimeZone: string,
  now = new Date(),
): TemporalItem {
  const timestamp = now.toISOString();
  const id = input.id?.trim() || randomUUID();
  const schedule = normalizeSchedule(input, input.kind, defaultTimeZone);
  const startsAt = input.startsAt ?? schedule.startsAt;
  const anchorType = input.anchorType ?? schedule.relative?.anchorType;
  const anchorId = input.anchorId ?? schedule.relative?.anchorId;
  const heartbeat = normalizeHeartbeat(input.heartbeat);
  const item: TemporalItem = {
    id,
    kind: input.kind,
    status: "active",
    title: input.title.trim(),
    ...(input.description ? { description: input.description } : {}),
    ...(input.location ? { location: input.location } : {}),
    ...(startsAt ? { startsAt } : {}),
    ...(input.endsAt ? { endsAt: input.endsAt } : {}),
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    timezone: schedule.timezone,
    schedule,
    participants: normalizeParticipants(input.participants),
    actions: normalizeActions(input.kind, input.actions),
    projections: [],
    ...(heartbeat ? { heartbeat } : {}),
    ...(input.ownerId ? { ownerId: input.ownerId } : {}),
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.sourceProvider ? { sourceProvider: input.sourceProvider } : {}),
    ...(anchorType ? { anchorType } : {}),
    ...(anchorId ? { anchorId } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  item.nextRunAt = computeNextRunAt(item, now);
  item.projections = normalizeProjections(input.kind, item.id, input.projections);
  return item;
}

export function applyTemporalItemUpdate(
  current: TemporalItem,
  input: UpdateTemporalItemInput,
  defaultTimeZone: string,
  now = new Date(),
): TemporalItem {
  const schedule = normalizeSchedule(input, current.kind, defaultTimeZone, current);
  const anchorType = input.anchorType ?? schedule.relative?.anchorType ?? current.anchorType;
  const anchorId = input.anchorId ?? schedule.relative?.anchorId ?? current.anchorId;
  const heartbeat = normalizeHeartbeat(input.heartbeat, current);
  const updated: TemporalItem = {
    ...current,
    title: input.title?.trim() ?? current.title,
    description: input.description ?? current.description,
    location: input.location ?? current.location,
    startsAt: input.startsAt ?? current.startsAt ?? schedule.startsAt,
    endsAt: input.endsAt ?? current.endsAt,
    dueAt: input.dueAt ?? current.dueAt,
    timezone: schedule.timezone,
    schedule,
    participants: input.participants ? normalizeParticipants(input.participants) : current.participants,
    actions: input.actions ? normalizeActions(current.kind, input.actions) : current.actions,
    projections: input.projections ? normalizeProjections(current.kind, current.id, input.projections) : current.projections,
    ...(heartbeat ? { heartbeat } : {}),
    runtime: input.status === "active" && current.status !== "active" ? undefined : current.runtime,
    ownerId: input.ownerId ?? current.ownerId,
    workspaceId: input.workspaceId ?? current.workspaceId,
    projectId: input.projectId ?? current.projectId,
    agentId: input.agentId ?? current.agentId,
    sourceProvider: input.sourceProvider ?? current.sourceProvider,
    ...(anchorType ? { anchorType } : {}),
    ...(anchorId ? { anchorId } : {}),
    status: input.status ?? current.status,
    updatedAt: now.toISOString(),
  };
  updated.nextRunAt = computeNextRunAt(updated, now);
  return updated;
}

export function createExecution(itemId: string, scheduledFor: string, triggeredBy: TemporalExecution["triggeredBy"]): TemporalExecution {
  const startedAt = nowIso();
  return {
    id: randomUUID(),
    itemId,
    status: "running",
    scheduledFor,
    startedAt,
    triggeredBy,
  };
}

export function completeExecution(execution: TemporalExecution, result: {
  status: Extract<TemporalExecutionStatus, "succeeded" | "failed" | "cancelled">;
  output?: string;
  error?: string;
}): TemporalExecution {
  return {
    ...execution,
    status: result.status,
    completedAt: nowIso(),
    ...(result.output ? { output: result.output } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
}
