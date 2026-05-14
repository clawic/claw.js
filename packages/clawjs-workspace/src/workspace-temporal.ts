import type { DeadlineRecord, EventRecord, ReminderRecord, TemporalItem } from "@clawjs/core";

export function isOverdue(timestamp: string | undefined, now = new Date().toISOString()): boolean {
  return Boolean(timestamp && timestamp < now);
}

export function toTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function timelineOverlaps(start: string, end: string, rangeStart: string, rangeEnd: string): boolean {
  return toTimestamp(start) <= toTimestamp(rangeEnd) && toTimestamp(end) >= toTimestamp(rangeStart);
}

export function minIso(values: Array<string | undefined>): string | undefined {
  const present = values.filter((value): value is string => Boolean(value));
  return present.length ? present.sort((left, right) => left.localeCompare(right))[0] : undefined;
}

export function maxIso(values: Array<string | undefined>): string | undefined {
  const present = values.filter((value): value is string => Boolean(value));
  return present.length ? present.sort((left, right) => right.localeCompare(left))[0] : undefined;
}

export function temporalToEventRecord(item: {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  location?: string;
  participants?: Array<{ personId?: string }>;
  actions?: Array<{ id: string; target?: string }>;
  projections?: Array<{ target: string; detail?: Record<string, unknown> }>;
}): EventRecord {
  const workspaceProjection = (item.projections ?? []).find((projection) => projection.target === "workspace_events");
  const linkedTaskIds = Array.isArray(workspaceProjection?.detail?.linkedTaskIds)
    ? workspaceProjection.detail.linkedTaskIds.filter((value): value is string => typeof value === "string")
    : [];
  const linkedNoteIds = Array.isArray(workspaceProjection?.detail?.linkedNoteIds)
    ? workspaceProjection.detail.linkedNoteIds.filter((value): value is string => typeof value === "string")
    : [];
  return {
    id: item.id,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    source: { kind: "derived", externalId: item.id },
    title: item.title,
    ...(item.description ? { description: item.description } : {}),
    startsAt: item.startsAt ?? item.updatedAt,
    ...(item.endsAt ? { endsAt: item.endsAt } : {}),
    ...(item.location ? { location: item.location } : {}),
    attendeePersonIds: (item.participants ?? []).flatMap((participant) => participant.personId ? [participant.personId] : []),
    linkedTaskIds,
    linkedNoteIds,
    reminders: (item.actions ?? []).map((action) => ({
      id: action.id,
      minutesBeforeStart: 0,
      ...(action.target ? { channel: action.target } : {}),
    })),
  };
}

export function temporalStatusToProductivityStatus(status: TemporalItem["status"]): ReminderRecord["status"] {
  if (status === "completed") return "done";
  return status;
}

export function productivityStatusToTemporalStatus(
  status?: ReminderRecord["status"] | DeadlineRecord["status"],
  archivedAt?: string | null,
): TemporalItem["status"] | undefined {
  if (archivedAt) return "cancelled";
  if (!status) return undefined;
  if (status === "done") return "completed";
  return status;
}

export function temporalToReminderRecord(item: TemporalItem): ReminderRecord {
  const notifyAction = item.actions.find((action) => action.kind === "notify");
  return {
    id: item.id,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    source: { kind: "derived", externalId: item.id },
    title: item.title,
    ...(item.description ? { description: item.description } : {}),
    status: temporalStatusToProductivityStatus(item.status),
    triggerAt: item.nextRunAt ?? item.startsAt ?? item.updatedAt,
    ...(item.anchorType ? { anchorType: item.anchorType as ReminderRecord["anchorType"] } : {}),
    ...(item.anchorId ? { anchorId: item.anchorId } : {}),
    ...(notifyAction?.target ? { channel: notifyAction.target } : {}),
  };
}

export function temporalToDeadlineRecord(item: TemporalItem): DeadlineRecord {
  return {
    id: item.id,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    source: { kind: "derived", externalId: item.id },
    title: item.title,
    ...(item.description ? { description: item.description } : {}),
    status: temporalStatusToProductivityStatus(item.status),
    dueAt: item.dueAt ?? item.nextRunAt ?? item.updatedAt,
    ...(item.anchorType ? { anchorType: item.anchorType as DeadlineRecord["anchorType"] } : {}),
    ...(item.anchorId ? { anchorId: item.anchorId } : {}),
  };
}
