import { randomUUID } from "crypto";
import type { EventRecord, NoteBlock, TaskChecklistItem, WorkspaceDomain, WorkspaceEntitySource, WorkspaceSearchResult } from "@clawjs/core";
import type { CreateEventInput, CreateNoteInput, CreateTaskInput, WorkspaceIndexRecord } from "./workspace-contracts.ts";

const DEFAULT_SOURCE: WorkspaceEntitySource = { kind: "local" };

export function nowIso(): string {
  return new Date().toISOString();
}

export function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function scoreKeyword(text: string, query: string, base: number): number {
  if (!text || !query) return 0;
  const haystack = normalizeSearchText(text);
  const needle = normalizeSearchText(query);
  if (!haystack || !needle) return 0;
  const occurrences = haystack.split(needle).length - 1;
  if (occurrences <= 0) return 0;
  return base + occurrences * 10;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function toId(prefix: string, requestedId?: string): string {
  const trimmed = requestedId?.trim();
  return trimmed || `${prefix}-${randomUUID()}`;
}

export function removeUndefined<TValue extends Record<string, unknown>>(value: TValue): TValue {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as TValue;
}

export function assertRecord<TValue>(value: TValue | null, label: string, id: string): TValue {
  if (!value) {
    throw new Error(`${label} not found: ${id}`);
  }
  return value;
}

export function toCollectionId(domain: WorkspaceDomain | "inbox_messages", id: string): string {
  return `${domain.replace(/[^A-Za-z0-9._-]+/g, "-")}--${id}`;
}

export function toSearchResult(
  entry: WorkspaceIndexRecord,
  score: number,
  strategy: WorkspaceSearchResult["strategy"],
  matchedFields: string[],
): WorkspaceSearchResult {
  return {
    domain: entry.domain,
    id: entry.entityId,
    title: entry.title,
    snippet: entry.snippet,
    score,
    strategy,
    matchedFields,
    links: entry.links,
    updatedAt: entry.updatedAt,
  };
}

export function defaultSource(source?: WorkspaceEntitySource): WorkspaceEntitySource {
  return source ? { ...source } : { ...DEFAULT_SOURCE };
}

export function clampNonNegativeNumber(value: number | undefined): number | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  return Math.max(0, Math.trunc(value));
}

export function clampConfidence(value: number | undefined): number | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

export function normalizeChecklist(input: CreateTaskInput["checklist"] = []): TaskChecklistItem[] {
  return input.map((item) => ({
    id: toId("check", item.id),
    text: item.text.trim(),
    completed: item.completed ?? false,
  })).filter((item) => item.text);
}

export function normalizeBlocks(input: CreateNoteInput): NoteBlock[] {
  const explicitBlocks = (input.blocks ?? []).map((block) => ({
    id: toId("block", block.id),
    type: block.type ?? "paragraph",
    text: block.text,
  }));
  if (explicitBlocks.length > 0) return explicitBlocks;
  const content = input.content?.trim();
  return content ? [{ id: toId("block"), type: "paragraph", text: content }] : [];
}

export function normalizeReminders(input: CreateEventInput["reminders"] = []): EventRecord["reminders"] {
  return input.map((reminder) => ({
    id: reminder.id?.trim() || toId("reminder"),
    minutesBeforeStart: reminder.minutesBeforeStart,
    ...(reminder.channel ? { channel: reminder.channel } : {}),
  }));
}

export function normalizeMilestoneIds(input: string[] = []): string[] {
  return uniqueStrings(input);
}

export function normalizeRecordIds(input: string[] = []): string[] {
  return uniqueStrings(input);
}

export function isArchived(record: { archivedAt?: string }, includeArchived = false): boolean {
  return !includeArchived && Boolean(record.archivedAt);
}
