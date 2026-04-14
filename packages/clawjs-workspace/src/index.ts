import { randomUUID } from "crypto";

import {
  Claw,
  WorkspaceAuditLog,
  createClaw,
  type ClawInstance,
  type SessionStreamEvent,
  type CreateClawOptions,
} from "@clawjs/claw";
import type {
  Attachment,
  DeadlineRecord,
  EventRecord,
  GoalRecord,
  InboxMessageRecord,
  InboxReplyTarget,
  InboxThreadRecord,
  LinkedEntityRef,
  NoteBlock,
  NoteRecord,
  PersonIdentity,
  PersonRecord,
  ProjectRecord,
  PromptContextBlock,
  ReminderRecord,
  TaskChecklistItem,
  TaskRecord,
  WorkspaceBadgeSummary,
  WorkspaceContextBundle,
  WorkspaceContextRequest,
  WorkspaceDomain,
  WorkspaceEntitySource,
  WorkspaceSearchQuery,
  WorkspaceSearchResult,
  WorkspaceSearchStrategy,
  WorkspaceSurfaceDescriptor,
  WorkspaceToolDescriptor,
  TemporalItem,
} from "@clawjs/core";
import { createSqliteWorkspaceCollectionStore } from "./sqlite-store.ts";

type WorkspaceEntityRecord =
  | TaskRecord
  | GoalRecord
  | ProjectRecord
  | ReminderRecord
  | DeadlineRecord
  | NoteRecord
  | PersonRecord
  | InboxThreadRecord
  | EventRecord;

interface WorkspaceIndexRecord {
  id: string;
  domain: WorkspaceDomain;
  entityId: string;
  title: string;
  searchText: string;
  snippet: string;
  updatedAt: string;
  archivedAt?: string;
  links?: LinkedEntityRef[];
}

interface WorkspaceEmbeddingRecord {
  id: string;
  domain: Extract<WorkspaceDomain, "notes" | "inbox">;
  entityId: string;
  sourceId: string;
  searchText: string;
  vector: number[];
  updatedAt: string;
}

export interface WorkspaceSemanticSearchOptions {
  embed: (text: string) => Promise<number[]>;
  minTextLength?: number;
}

export interface WorkspaceExtensionOptions {
  semanticSearch?: WorkspaceSemanticSearchOptions;
}

export interface CreateWorkspaceClawOptions extends CreateClawOptions {
  productivity?: WorkspaceExtensionOptions;
}

export interface CreateTaskInput {
  id?: string;
  title: string;
  description?: string;
  status?: TaskRecord["status"];
  priority?: TaskRecord["priority"];
  labels?: string[];
  assigneePersonId?: string;
  watcherPersonIds?: string[];
  dueAt?: string;
  scheduledEventId?: string;
  eventId?: string;
  projectId?: string;
  goalId?: string;
  parentTaskId?: string;
  childTaskIds?: string[];
  dependsOnTaskIds?: string[];
  companyId?: string;
  portfolioId?: string;
  portfolioItemId?: string;
  checklist?: Array<{ id?: string; text: string; completed?: boolean }>;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskInput extends Partial<Omit<CreateTaskInput, "id" | "title">> {
  title?: string;
  archivedAt?: string | null;
}

export interface CreateGoalInput {
  id?: string;
  title: string;
  description?: string;
  status?: GoalRecord["status"];
  level?: GoalRecord["level"];
  projectId?: string;
  parentId?: string;
  parentGoalId?: string;
  ownerPersonId?: string;
  ownerAgentId?: string;
  companyId?: string;
  portfolioId?: string;
  portfolioItemId?: string;
  metricKey?: string;
  metricLabel?: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  period?: string;
  healthStatus?: GoalRecord["healthStatus"];
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateGoalInput extends Partial<Omit<CreateGoalInput, "id" | "title">> {
  title?: string;
  archivedAt?: string | null;
}

export interface CreateProjectInput {
  id?: string;
  name: string;
  description?: string;
  status?: ProjectRecord["status"];
  goalId?: string;
  ownerPersonId?: string;
  leadAgentId?: string;
  companyId?: string;
  portfolioId?: string;
  portfolioItemId?: string;
  color?: string;
  kind?: ProjectRecord["kind"];
  healthStatus?: ProjectRecord["healthStatus"];
  startDate?: string;
  targetDate?: string;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectInput extends Partial<Omit<CreateProjectInput, "id" | "name">> {
  name?: string;
  archivedAt?: string | null;
}

export interface CreateReminderInput {
  id?: string;
  title: string;
  description?: string;
  status?: ReminderRecord["status"];
  triggerAt: string;
  anchorType?: ReminderRecord["anchorType"];
  anchorId?: string;
  channel?: string;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateReminderInput extends Partial<Omit<CreateReminderInput, "id" | "title" | "triggerAt">> {
  title?: string;
  triggerAt?: string;
  archivedAt?: string | null;
}

export interface CreateDeadlineInput {
  id?: string;
  title: string;
  description?: string;
  status?: DeadlineRecord["status"];
  dueAt: string;
  anchorType?: DeadlineRecord["anchorType"];
  anchorId?: string;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateDeadlineInput extends Partial<Omit<CreateDeadlineInput, "id" | "title" | "dueAt">> {
  title?: string;
  dueAt?: string;
  archivedAt?: string | null;
}

export interface CreateNoteInput {
  id?: string;
  title: string;
  blocks?: Array<{ id?: string; type?: NoteBlock["type"]; text: string }>;
  content?: string;
  tags?: string[];
  summary?: string;
  attachments?: Attachment[];
  linkedEntityIds?: string[];
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateNoteInput extends Partial<Omit<CreateNoteInput, "id" | "title">> {
  title?: string;
  archivedAt?: string | null;
}

export interface UpsertPersonInput {
  id?: string;
  displayName: string;
  kind?: PersonRecord["kind"];
  identities?: PersonIdentity[];
  emails?: string[];
  phones?: string[];
  handles?: string[];
  role?: string;
  organization?: string;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface CreateInboxDraftInput {
  threadId?: string;
  channel: string;
  subject?: string;
  content: string;
  participantPersonIds?: string[];
  attachments?: Attachment[];
  linkedTaskIds?: string[];
  linkedNoteIds?: string[];
  replyTarget?: InboxReplyTarget;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface RouteInboxReplyInput {
  content: string;
  attachments?: Attachment[];
  linkedTaskIds?: string[];
  linkedNoteIds?: string[];
}

export interface IngestInboxMessageInput {
  threadId?: string;
  channel: string;
  content: string;
  subject?: string;
  participantPersonIds?: string[];
  attachments?: Attachment[];
  linkedTaskIds?: string[];
  linkedNoteIds?: string[];
  replyTarget?: InboxReplyTarget;
  externalThreadId?: string;
  externalMessageId?: string;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface CreateEventInput {
  id?: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  attendeePersonIds?: string[];
  linkedTaskIds?: string[];
  linkedNoteIds?: string[];
  reminders?: Array<{ id?: string; minutesBeforeStart: number; channel?: string }>;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateEventInput extends Partial<Omit<CreateEventInput, "id" | "title" | "startsAt">> {
  title?: string;
  startsAt?: string;
  archivedAt?: string | null;
}

export interface InboxThreadView {
  thread: InboxThreadRecord;
  messages: InboxMessageRecord[];
}

export interface WorkspaceConversationContextOption extends WorkspaceContextRequest {}

type BaseWorkspaceConversationInput = Parameters<ClawInstance["sessions"]["streamAssistantReplyEvents"]>[0];

export interface WorkspaceConversationInput extends BaseWorkspaceConversationInput {
  workspaceContext?: "off" | "auto" | WorkspaceConversationContextOption;
}

export interface WorkspaceClawInstance extends Omit<ClawInstance, "workspace" | "sessions"> {
  workspace: ClawInstance["workspace"] & {
    tools: {
      describe: () => WorkspaceToolDescriptor[];
    };
  };
  sessions: Omit<ClawInstance["sessions"], "streamAssistantReplyEvents" | "streamAssistantReply"> & {
    streamAssistantReplyEvents: (input: WorkspaceConversationInput) => AsyncGenerator<SessionStreamEvent>;
    streamAssistantReply: (input: WorkspaceConversationInput) => AsyncGenerator<{ sessionId: string; messageId?: string; delta: string; done: boolean }>;
  };
  tasks: {
    list: (options?: { includeArchived?: boolean; status?: TaskRecord["status"] | TaskRecord["status"][]; assigneePersonId?: string; limit?: number }) => Promise<TaskRecord[]>;
    get: (id: string) => Promise<TaskRecord | null>;
    create: (input: CreateTaskInput) => Promise<TaskRecord>;
    update: (id: string, input: UpdateTaskInput) => Promise<TaskRecord>;
    complete: (id: string) => Promise<TaskRecord>;
    archive: (id: string) => Promise<TaskRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  goals: {
    list: (options?: { includeArchived?: boolean; status?: GoalRecord["status"] | GoalRecord["status"][]; projectId?: string; limit?: number }) => Promise<GoalRecord[]>;
    get: (id: string) => Promise<GoalRecord | null>;
    create: (input: CreateGoalInput) => Promise<GoalRecord>;
    update: (id: string, input: UpdateGoalInput) => Promise<GoalRecord>;
    archive: (id: string) => Promise<GoalRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  projects: {
    list: (options?: { includeArchived?: boolean; status?: ProjectRecord["status"] | ProjectRecord["status"][]; goalId?: string; limit?: number }) => Promise<ProjectRecord[]>;
    get: (id: string) => Promise<ProjectRecord | null>;
    create: (input: CreateProjectInput) => Promise<ProjectRecord>;
    update: (id: string, input: UpdateProjectInput) => Promise<ProjectRecord>;
    archive: (id: string) => Promise<ProjectRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  reminders: {
    list: (options?: {
      includeArchived?: boolean;
      status?: ReminderRecord["status"] | ReminderRecord["status"][];
      anchorId?: string;
      before?: string;
      after?: string;
      limit?: number;
    }) => Promise<ReminderRecord[]>;
    get: (id: string) => Promise<ReminderRecord | null>;
    create: (input: CreateReminderInput) => Promise<ReminderRecord>;
    update: (id: string, input: UpdateReminderInput) => Promise<ReminderRecord>;
    pause: (id: string) => Promise<ReminderRecord>;
    resume: (id: string) => Promise<ReminderRecord>;
    archive: (id: string) => Promise<ReminderRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  deadlines: {
    list: (options?: {
      includeArchived?: boolean;
      status?: DeadlineRecord["status"] | DeadlineRecord["status"][];
      anchorId?: string;
      before?: string;
      after?: string;
      limit?: number;
    }) => Promise<DeadlineRecord[]>;
    get: (id: string) => Promise<DeadlineRecord | null>;
    create: (input: CreateDeadlineInput) => Promise<DeadlineRecord>;
    update: (id: string, input: UpdateDeadlineInput) => Promise<DeadlineRecord>;
    pause: (id: string) => Promise<DeadlineRecord>;
    resume: (id: string) => Promise<DeadlineRecord>;
    archive: (id: string) => Promise<DeadlineRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  notes: {
    list: (options?: { includeArchived?: boolean; limit?: number }) => Promise<NoteRecord[]>;
    get: (id: string) => Promise<NoteRecord | null>;
    create: (input: CreateNoteInput) => Promise<NoteRecord>;
    update: (id: string, input: UpdateNoteInput) => Promise<NoteRecord>;
    archive: (id: string) => Promise<NoteRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  people: {
    list: (options?: { includeArchived?: boolean; limit?: number }) => Promise<PersonRecord[]>;
    get: (id: string) => Promise<PersonRecord | null>;
    upsert: (input: UpsertPersonInput) => Promise<PersonRecord>;
    upsertPersonIdentity: (identity: PersonIdentity, input?: Partial<UpsertPersonInput>) => Promise<PersonRecord>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  inbox: {
    list: (options?: { includeArchived?: boolean; unreadOnly?: boolean; limit?: number }) => Promise<InboxThreadRecord[]>;
    getThread: (id: string) => Promise<InboxThreadRecord | null>;
    readThread: (id: string) => Promise<InboxThreadView | null>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
    createDraft: (input: CreateInboxDraftInput) => Promise<InboxThreadView>;
    routeReply: (threadId: string, input: RouteInboxReplyInput) => Promise<InboxMessageRecord>;
    archive: (threadId: string) => Promise<InboxThreadRecord>;
    ingestIncomingMessage: (input: IngestInboxMessageInput) => Promise<InboxThreadView>;
    resolveReplyTarget: (threadId: string) => Promise<InboxReplyTarget | null>;
  };
  events: {
    list: (options?: { includeArchived?: boolean; upcomingOnly?: boolean; limit?: number }) => Promise<EventRecord[]>;
    get: (id: string) => Promise<EventRecord | null>;
    create: (input: CreateEventInput) => Promise<EventRecord>;
    update: (id: string, input: UpdateEventInput) => Promise<EventRecord>;
    archive: (id: string) => Promise<EventRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  search: {
    query: (input: WorkspaceSearchQuery) => Promise<WorkspaceSearchResult[]>;
  };
  context: {
    build: (input?: WorkspaceContextRequest) => Promise<WorkspaceContextBundle>;
    tools: () => WorkspaceToolDescriptor[];
  };
  ui: {
    surfaces: () => WorkspaceSurfaceDescriptor[];
    badges: () => Promise<WorkspaceBadgeSummary[]>;
  };
  workspaceIndex: {
    rebuild: () => Promise<{ reindexed: number; embeddings: number }>;
  };
}

const DEFAULT_SOURCE: WorkspaceEntitySource = { kind: "local" };
const DEFAULT_CONTEXT_LIMIT = 6;
const EMBEDDING_COLLECTION = "workspace_embeddings";
const INDEX_COLLECTION = "workspace_indexes";
const TOOL_DESCRIPTORS: WorkspaceToolDescriptor[] = [
  { id: "tasks.create", title: "Create task", description: "Create a task in the local workspace.", domain: "tasks" },
  { id: "tasks.update", title: "Update task", description: "Update task fields, assignees, dates, or labels.", domain: "tasks" },
  { id: "tasks.list", title: "List tasks", description: "List tasks in the local workspace.", domain: "tasks" },
  { id: "tasks.search", title: "Search tasks", description: "Search tasks by keyword or hybrid search.", domain: "tasks" },
  { id: "tasks.complete", title: "Complete task", description: "Mark a task as done.", domain: "tasks" },
  { id: "goals.create", title: "Create goal", description: "Create a goal in the local workspace.", domain: "goals" },
  { id: "goals.update", title: "Update goal", description: "Update goal status, owner, or metrics.", domain: "goals" },
  { id: "goals.list", title: "List goals", description: "List goals in the local workspace.", domain: "goals" },
  { id: "goals.search", title: "Search goals", description: "Search goals by title, description, or metrics.", domain: "goals" },
  { id: "projects.create", title: "Create project", description: "Create a project in the local workspace.", domain: "projects" },
  { id: "projects.update", title: "Update project", description: "Update project state or ownership.", domain: "projects" },
  { id: "projects.list", title: "List projects", description: "List projects in the local workspace.", domain: "projects" },
  { id: "projects.search", title: "Search projects", description: "Search projects by name or description.", domain: "projects" },
  { id: "reminders.create", title: "Create reminder", description: "Create a reminder in the local workspace.", domain: "reminders" },
  { id: "reminders.update", title: "Update reminder", description: "Update reminder timing or status.", domain: "reminders" },
  { id: "reminders.list", title: "List reminders", description: "List reminders in the local workspace.", domain: "reminders" },
  { id: "reminders.pause", title: "Pause reminder", description: "Pause an active reminder.", domain: "reminders" },
  { id: "reminders.resume", title: "Resume reminder", description: "Resume a paused reminder.", domain: "reminders" },
  { id: "deadlines.create", title: "Create deadline", description: "Create a deadline in the local workspace.", domain: "deadlines" },
  { id: "deadlines.update", title: "Update deadline", description: "Update deadline timing or status.", domain: "deadlines" },
  { id: "deadlines.list", title: "List deadlines", description: "List deadlines in the local workspace.", domain: "deadlines" },
  { id: "deadlines.pause", title: "Pause deadline", description: "Pause an active deadline.", domain: "deadlines" },
  { id: "deadlines.resume", title: "Resume deadline", description: "Resume a paused deadline.", domain: "deadlines" },
  { id: "notes.create", title: "Create note", description: "Create a note in the local workspace.", domain: "notes" },
  { id: "notes.update", title: "Update note", description: "Update note content or metadata.", domain: "notes" },
  { id: "notes.get", title: "Get note", description: "Read one note by id.", domain: "notes" },
  { id: "notes.search", title: "Search notes", description: "Search notes by keyword or hybrid search.", domain: "notes" },
  { id: "people.upsert", title: "Upsert person", description: "Create or update a contact/person record.", domain: "people" },
  { id: "people.get", title: "Get person", description: "Read one person by id.", domain: "people" },
  { id: "people.search", title: "Search people", description: "Search contacts and identities.", domain: "people" },
  { id: "inbox.list", title: "List inbox threads", description: "List local inbox threads.", domain: "inbox" },
  { id: "inbox.search", title: "Search inbox", description: "Search unified inbox threads.", domain: "inbox" },
  { id: "inbox.readThread", title: "Read thread", description: "Read one inbox thread and its messages.", domain: "inbox" },
  { id: "inbox.createDraft", title: "Create draft", description: "Create an outbound draft inside the inbox.", domain: "inbox" },
  { id: "inbox.routeReply", title: "Route reply", description: "Create an outbound reply for a thread.", domain: "inbox" },
  { id: "events.create", title: "Create event", description: "Create a calendar event with reminders.", domain: "events" },
  { id: "events.update", title: "Update event", description: "Update an existing event.", domain: "events" },
  { id: "events.list", title: "List events", description: "List events in the local workspace.", domain: "events" },
  { id: "events.search", title: "Search events", description: "Search events by title, description, or location.", domain: "events" },
  { id: "workspace.search.query", title: "Search workspace", description: "Search across tasks, notes, people, inbox, and events.", domain: "workspace" },
];

const SURFACES: WorkspaceSurfaceDescriptor[] = [
  { id: "tasks", title: "Tasks", route: "/tasks", icon: "check-square", badgeId: "tasks_due_today", order: 10 },
  { id: "goals", title: "Goals", route: "/goals", icon: "target", order: 15 },
  { id: "projects", title: "Projects", route: "/projects", icon: "folder-kanban", order: 18 },
  { id: "notes", title: "Notes", route: "/notes", icon: "file-text", order: 20 },
  { id: "people", title: "People", route: "/people", icon: "users", order: 30 },
  { id: "inbox", title: "Inbox", route: "/inbox", icon: "inbox", badgeId: "inbox_unread", order: 40 },
  { id: "events", title: "Events", route: "/events", icon: "calendar", badgeId: "events_upcoming", order: 50 },
  { id: "reminders", title: "Reminders", route: "/reminders", icon: "bell", order: 55 },
  { id: "deadlines", title: "Deadlines", route: "/deadlines", icon: "alarm-clock", order: 58 },
];

function nowIso(): string {
  return new Date().toISOString();
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function summarizeSnippet(value: string, maxLength = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function scoreKeyword(text: string, query: string, base: number): number {
  if (!text || !query) return 0;
  const haystack = normalizeSearchText(text);
  const needle = normalizeSearchText(query);
  if (!haystack || !needle) return 0;
  const occurrences = haystack.split(needle).length - 1;
  if (occurrences <= 0) return 0;
  return base + occurrences * 10;
}

function cosineSimilarity(left: number[], right: number[]): number {
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

function toId(prefix: string, requestedId?: string): string {
  const trimmed = requestedId?.trim();
  return trimmed || `${prefix}-${randomUUID()}`;
}

function removeUndefined<TValue extends Record<string, unknown>>(value: TValue): TValue {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as TValue;
}

function assertRecord<TValue>(value: TValue | null, label: string, id: string): TValue {
  if (!value) {
    throw new Error(`${label} not found: ${id}`);
  }
  return value;
}

function toCollectionId(domain: WorkspaceDomain | "inbox_messages", id: string): string {
  return `${domain.replace(/[^A-Za-z0-9._-]+/g, "-")}--${id}`;
}

function toSearchResult(
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

function defaultSource(source?: WorkspaceEntitySource): WorkspaceEntitySource {
  return source ? { ...source } : { ...DEFAULT_SOURCE };
}

function normalizeChecklist(input: CreateTaskInput["checklist"] = []): TaskChecklistItem[] {
  return input.map((item) => ({
    id: toId("check", item.id),
    text: item.text.trim(),
    completed: item.completed ?? false,
  })).filter((item) => item.text);
}

function normalizeBlocks(input: CreateNoteInput): NoteBlock[] {
  const explicitBlocks = (input.blocks ?? []).map((block) => ({
    id: toId("block", block.id),
    type: block.type ?? "paragraph",
    text: block.text,
  }));
  if (explicitBlocks.length > 0) return explicitBlocks;
  const content = input.content?.trim();
  return content ? [{ id: toId("block"), type: "paragraph", text: content }] : [];
}

function normalizeReminders(input: CreateEventInput["reminders"] = []): EventRecord["reminders"] {
  return input.map((reminder) => ({
    id: reminder.id?.trim() || toId("reminder"),
    minutesBeforeStart: reminder.minutesBeforeStart,
    ...(reminder.channel ? { channel: reminder.channel } : {}),
  }));
}

function temporalToEventRecord(item: {
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

function temporalStatusToProductivityStatus(status: TemporalItem["status"]): ReminderRecord["status"] {
  if (status === "completed") return "done";
  return status;
}

function productivityStatusToTemporalStatus(
  status?: ReminderRecord["status"] | DeadlineRecord["status"],
  archivedAt?: string | null,
): TemporalItem["status"] | undefined {
  if (archivedAt) return "cancelled";
  if (!status) return undefined;
  if (status === "done") return "completed";
  return status;
}

function temporalToReminderRecord(item: TemporalItem): ReminderRecord {
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

function temporalToDeadlineRecord(item: TemporalItem): DeadlineRecord {
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

function messagePreview(value: string): string {
  return summarizeSnippet(value, 140);
}

function taskSearchText(task: TaskRecord): string {
  return [
    task.title,
    task.description,
    task.status,
    task.priority,
    task.projectId,
    task.goalId,
    ...task.labels,
    ...task.checklist.map((item) => item.text),
  ].filter(Boolean).join(" ");
}

function goalSearchText(goal: GoalRecord): string {
  return [
    goal.title,
    goal.description,
    goal.status,
    goal.metricKey,
    goal.metricLabel,
    goal.unit,
    goal.period,
  ].filter(Boolean).join(" ");
}

function projectSearchText(project: ProjectRecord): string {
  return [
    project.name,
    project.description,
    project.status,
    project.kind,
    project.goalId,
  ].filter(Boolean).join(" ");
}

function reminderSearchText(reminder: ReminderRecord): string {
  return [
    reminder.title,
    reminder.description,
    reminder.status,
    reminder.anchorType,
    reminder.anchorId,
    reminder.channel,
  ].filter(Boolean).join(" ");
}

function deadlineSearchText(deadline: DeadlineRecord): string {
  return [
    deadline.title,
    deadline.description,
    deadline.status,
    deadline.anchorType,
    deadline.anchorId,
  ].filter(Boolean).join(" ");
}

function noteSearchText(note: NoteRecord): string {
  return [
    note.title,
    note.summary,
    ...note.tags,
    ...note.blocks.map((block) => block.text),
  ].filter(Boolean).join(" ");
}

function personSearchText(person: PersonRecord): string {
  return [
    person.displayName,
    person.role,
    person.organization,
    ...person.emails,
    ...person.phones,
    ...person.handles,
    ...person.identities.map((identity) => `${identity.channel} ${identity.handle} ${identity.label ?? ""}`),
  ].filter(Boolean).join(" ");
}

function eventSearchText(event: EventRecord): string {
  return [
    event.title,
    event.description,
    event.location,
  ].filter(Boolean).join(" ");
}

function isArchived(record: { archivedAt?: string }, includeArchived = false): boolean {
  return !includeArchived && Boolean(record.archivedAt);
}

async function createWorkspaceExtension(
  claw: ClawInstance,
  workspaceDir: string,
  options: WorkspaceExtensionOptions = {},
): Promise<WorkspaceClawInstance> {
  const audit = new WorkspaceAuditLog();
  const data = createSqliteWorkspaceCollectionStore(workspaceDir);
  const tasksCollection = data.collection<TaskRecord>("tasks");
  const goalsCollection = data.collection<GoalRecord>("goals");
  const projectsCollection = data.collection<ProjectRecord>("projects");
  const remindersCollection = data.collection<ReminderRecord>("reminders");
  const deadlinesCollection = data.collection<DeadlineRecord>("deadlines");
  const notesCollection = data.collection<NoteRecord>("notes");
  const peopleCollection = data.collection<PersonRecord>("people");
  const inboxThreadsCollection = data.collection<InboxThreadRecord>("inbox_threads");
  const inboxMessagesCollection = data.collection<InboxMessageRecord>("inbox_messages");
  const eventsCollection = data.collection<EventRecord>("events");
  const workspaceMetaCollection = data.collection<{ id: string; migratedAt: string }>("_workspace_meta");
  const indexCollection = data.collection<WorkspaceIndexRecord>(INDEX_COLLECTION);
  const embeddingCollection = data.collection<WorkspaceEmbeddingRecord>(EMBEDDING_COLLECTION);

  function appendAudit(event: string, capability: WorkspaceToolDescriptor["domain"] | "workspace_search" | "workspace_context", detail?: Record<string, unknown>): void {
    audit.append(workspaceDir, {
      timestamp: nowIso(),
      event,
      capability,
      ...(detail ? { detail } : {}),
    });
  }

  async function maybeWriteEmbedding(
    domain: Extract<WorkspaceDomain, "notes" | "inbox">,
    sourceId: string,
    entityId: string,
    searchText: string,
  ): Promise<boolean> {
    const config = options.semanticSearch;
    const embeddingId = toCollectionId(domain, sourceId);
    if (!config?.embed) {
      embeddingCollection.remove(embeddingId);
      return false;
    }
    if (searchText.trim().length < (config.minTextLength ?? 80)) {
      embeddingCollection.remove(embeddingId);
      return false;
    }
    const vector = await config.embed(searchText);
    embeddingCollection.put(embeddingId, {
      id: embeddingId,
      domain,
      sourceId,
      entityId,
      searchText,
      vector,
      updatedAt: nowIso(),
    });
    return true;
  }

  function removeEmbedding(domain: Extract<WorkspaceDomain, "notes" | "inbox">, sourceId: string): void {
    embeddingCollection.remove(toCollectionId(domain, sourceId));
  }

  function putIndex(entry: WorkspaceIndexRecord): void {
    indexCollection.put(toCollectionId(entry.domain, entry.entityId), entry);
  }

  function removeIndex(domain: WorkspaceDomain, entityId: string): void {
    indexCollection.remove(toCollectionId(domain, entityId));
  }

  function readInboxMessagesForThread(threadId: string): InboxMessageRecord[] {
    return inboxMessagesCollection.entries()
      .map((entry) => entry.value)
      .filter((message) => message.threadId === threadId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async function syncTaskIndex(task: TaskRecord): Promise<void> {
    putIndex({
      id: toCollectionId("tasks", task.id),
      domain: "tasks",
      entityId: task.id,
      title: task.title,
      searchText: taskSearchText(task),
      snippet: summarizeSnippet(task.description || task.title),
      updatedAt: task.updatedAt,
      ...(task.archivedAt ? { archivedAt: task.archivedAt } : {}),
      ...(task.links ? { links: task.links } : {}),
    });
  }

  async function syncGoalIndex(goal: GoalRecord): Promise<void> {
    putIndex({
      id: toCollectionId("goals", goal.id),
      domain: "goals",
      entityId: goal.id,
      title: goal.title,
      searchText: goalSearchText(goal),
      snippet: summarizeSnippet(goal.description || goal.title),
      updatedAt: goal.updatedAt,
      ...(goal.archivedAt ? { archivedAt: goal.archivedAt } : {}),
      ...(goal.links ? { links: goal.links } : {}),
    });
  }

  async function syncProjectIndex(project: ProjectRecord): Promise<void> {
    putIndex({
      id: toCollectionId("projects", project.id),
      domain: "projects",
      entityId: project.id,
      title: project.name,
      searchText: projectSearchText(project),
      snippet: summarizeSnippet(project.description || project.name),
      updatedAt: project.updatedAt,
      ...(project.archivedAt ? { archivedAt: project.archivedAt } : {}),
      ...(project.links ? { links: project.links } : {}),
    });
  }

  async function syncReminderIndex(reminder: ReminderRecord): Promise<void> {
    putIndex({
      id: toCollectionId("reminders", reminder.id),
      domain: "reminders",
      entityId: reminder.id,
      title: reminder.title,
      searchText: reminderSearchText(reminder),
      snippet: summarizeSnippet(reminder.description || reminder.title),
      updatedAt: reminder.updatedAt,
      ...(reminder.archivedAt ? { archivedAt: reminder.archivedAt } : {}),
      ...(reminder.links ? { links: reminder.links } : {}),
    });
  }

  async function syncDeadlineIndex(deadline: DeadlineRecord): Promise<void> {
    putIndex({
      id: toCollectionId("deadlines", deadline.id),
      domain: "deadlines",
      entityId: deadline.id,
      title: deadline.title,
      searchText: deadlineSearchText(deadline),
      snippet: summarizeSnippet(deadline.description || deadline.title),
      updatedAt: deadline.updatedAt,
      ...(deadline.archivedAt ? { archivedAt: deadline.archivedAt } : {}),
      ...(deadline.links ? { links: deadline.links } : {}),
    });
  }

  async function syncNoteIndex(note: NoteRecord): Promise<void> {
    const searchText = noteSearchText(note);
    putIndex({
      id: toCollectionId("notes", note.id),
      domain: "notes",
      entityId: note.id,
      title: note.title,
      searchText,
      snippet: summarizeSnippet(note.summary || searchText),
      updatedAt: note.updatedAt,
      ...(note.archivedAt ? { archivedAt: note.archivedAt } : {}),
      ...(note.links ? { links: note.links } : {}),
    });
    await maybeWriteEmbedding("notes", note.id, note.id, searchText);
  }

  async function syncPersonIndex(person: PersonRecord): Promise<void> {
    putIndex({
      id: toCollectionId("people", person.id),
      domain: "people",
      entityId: person.id,
      title: person.displayName,
      searchText: personSearchText(person),
      snippet: summarizeSnippet([person.role, person.organization, ...person.handles].filter(Boolean).join(" ")),
      updatedAt: person.updatedAt,
      ...(person.archivedAt ? { archivedAt: person.archivedAt } : {}),
      ...(person.links ? { links: person.links } : {}),
    });
  }

  async function syncEventIndex(event: EventRecord): Promise<void> {
    putIndex({
      id: toCollectionId("events", event.id),
      domain: "events",
      entityId: event.id,
      title: event.title,
      searchText: eventSearchText(event),
      snippet: summarizeSnippet([event.description, event.location].filter(Boolean).join(" ")),
      updatedAt: event.updatedAt,
      ...(event.archivedAt ? { archivedAt: event.archivedAt } : {}),
      ...(event.links ? { links: event.links } : {}),
    });
  }

  async function syncInboxThreadIndex(threadId: string): Promise<void> {
    const thread = inboxThreadsCollection.get(threadId);
    if (!thread) {
      removeIndex("inbox", threadId);
      return;
    }
    const messages = readInboxMessagesForThread(threadId);
    const combinedText = [thread.subject, thread.preview, ...messages.map((message) => message.content)].filter(Boolean).join(" ");
    putIndex({
      id: toCollectionId("inbox", thread.id),
      domain: "inbox",
      entityId: thread.id,
      title: thread.subject || `Thread ${thread.id}`,
      searchText: combinedText,
      snippet: summarizeSnippet(thread.preview || combinedText),
      updatedAt: thread.updatedAt,
      ...(thread.archivedAt ? { archivedAt: thread.archivedAt } : {}),
      ...(thread.links ? { links: thread.links } : {}),
    });
    for (const message of messages) {
      const written = await maybeWriteEmbedding("inbox", message.id, thread.id, message.content);
      if (!written) {
        removeEmbedding("inbox", message.id);
      }
    }
  }

  async function rebuildIndexes(): Promise<{ reindexed: number; embeddings: number }> {
    for (const id of indexCollection.listIds()) {
      indexCollection.remove(id);
    }
    for (const id of embeddingCollection.listIds()) {
      embeddingCollection.remove(id);
    }

    let reindexed = 0;
    let embeddings = 0;
    for (const task of tasksCollection.list()) {
      await syncTaskIndex(task);
      reindexed += 1;
    }
    for (const goal of goalsCollection.list()) {
      await syncGoalIndex(goal);
      reindexed += 1;
    }
    for (const project of projectsCollection.list()) {
      await syncProjectIndex(project);
      reindexed += 1;
    }
    if (claw.time.configured) {
      for (const reminder of (await claw.time.list({ kind: "reminder" })).items.map((item) => temporalToReminderRecord(item))) {
        await syncReminderIndex(reminder);
        reindexed += 1;
      }
      for (const deadline of (await claw.time.list({ kind: "deadline" })).items.map((item) => temporalToDeadlineRecord(item))) {
        await syncDeadlineIndex(deadline);
        reindexed += 1;
      }
    } else {
      for (const reminder of remindersCollection.list()) {
        await syncReminderIndex(reminder);
        reindexed += 1;
      }
      for (const deadline of deadlinesCollection.list()) {
        await syncDeadlineIndex(deadline);
        reindexed += 1;
      }
    }
    for (const note of notesCollection.list()) {
      await syncNoteIndex(note);
      reindexed += 1;
    }
    for (const person of peopleCollection.list()) {
      await syncPersonIndex(person);
      reindexed += 1;
    }
    if (claw.time.configured) {
      for (const event of (await claw.time.list({ kind: "event" })).items.map((item) => temporalToEventRecord(item))) {
        await syncEventIndex(event);
        reindexed += 1;
      }
    } else {
      for (const event of eventsCollection.list()) {
        await syncEventIndex(event);
        reindexed += 1;
      }
    }
    for (const thread of inboxThreadsCollection.list()) {
      await syncInboxThreadIndex(thread.id);
      reindexed += 1;
    }
    embeddings = embeddingCollection.listIds().length;
    appendAudit("workspace.index.rebuilt", "workspace_search", { reindexed, embeddings });
    return { reindexed, embeddings };
  }

  async function migrateTemporalCollectionsToTime(): Promise<void> {
    if (!claw.time.configured) return;
    const migrationId = "time_embedded_projection_imported_at";
    if (workspaceMetaCollection.get(migrationId)) return;

    for (const event of eventsCollection.list()) {
      const existing = await claw.time.get(event.id).catch(() => null);
      if (existing) continue;
      await claw.time.create({
        id: event.id,
        kind: "event",
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        location: event.location,
        participants: event.attendeePersonIds.map((personId) => ({ kind: "human", label: personId, personId })),
        actions: event.reminders.map((reminder) => ({ id: reminder.id, kind: "notify", target: reminder.channel })),
        projections: [{
          id: `${event.id}-workspace-events`,
          target: "workspace_events",
          provider: "workspace",
          detail: {
            linkedTaskIds: event.linkedTaskIds,
            linkedNoteIds: event.linkedNoteIds,
          },
        }],
      });
    }

    for (const reminder of remindersCollection.list()) {
      const existing = await claw.time.get(reminder.id).catch(() => null);
      if (existing) continue;
      const created = await claw.time.create({
        id: reminder.id,
        kind: "reminder",
        title: reminder.title,
        description: reminder.description,
        startsAt: reminder.triggerAt,
        schedule: { mode: "one_off", timezone: "UTC", startsAt: reminder.triggerAt },
        actions: [{ id: `${reminder.id}-notify`, kind: "notify", target: reminder.channel }],
        anchorType: reminder.anchorType,
        anchorId: reminder.anchorId,
      });
      const targetStatus = productivityStatusToTemporalStatus(reminder.status);
      if (targetStatus && targetStatus !== created.item.status) {
        await claw.time.update(reminder.id, { status: targetStatus });
      }
    }

    for (const deadline of deadlinesCollection.list()) {
      const existing = await claw.time.get(deadline.id).catch(() => null);
      if (existing) continue;
      const created = await claw.time.create({
        id: deadline.id,
        kind: "deadline",
        title: deadline.title,
        description: deadline.description,
        dueAt: deadline.dueAt,
        schedule: { mode: "one_off", timezone: "UTC", startsAt: deadline.dueAt },
        anchorType: deadline.anchorType,
        anchorId: deadline.anchorId,
      });
      const targetStatus = productivityStatusToTemporalStatus(deadline.status);
      if (targetStatus && targetStatus !== created.item.status) {
        await claw.time.update(deadline.id, { status: targetStatus });
      }
    }

    workspaceMetaCollection.put(migrationId, { id: migrationId, migratedAt: nowIso() });
  }

  async function keywordSearch(input: WorkspaceSearchQuery): Promise<Map<string, WorkspaceSearchResult>> {
    const query = input.query.trim();
    const domains = new Set(input.domains && input.domains.length > 0 ? input.domains : ["tasks", "goals", "projects", "reminders", "deadlines", "notes", "people", "inbox", "events"]);
    const results = new Map<string, WorkspaceSearchResult>();
    for (const entry of indexCollection.entries().map((item) => item.value)) {
      if (!domains.has(entry.domain)) continue;
      if (!input.includeArchived && entry.archivedAt) continue;
      const titleScore = scoreKeyword(entry.title, query, 50);
      const textScore = scoreKeyword(entry.searchText, query, 20);
      const score = titleScore + textScore;
      if (score <= 0) continue;
      const matchedFields: string[] = [];
      if (titleScore > 0) matchedFields.push("title");
      if (textScore > 0) matchedFields.push("text");
      results.set(`${entry.domain}:${entry.entityId}`, toSearchResult(entry, score, "keyword", matchedFields));
    }
    return results;
  }

  async function semanticSearch(input: WorkspaceSearchQuery): Promise<Map<string, WorkspaceSearchResult>> {
    if (!options.semanticSearch?.embed) {
      return new Map();
    }
    const queryText = input.query.trim();
    if (!queryText) return new Map();
    const queryVector = await options.semanticSearch.embed(queryText);
    const domains = new Set(input.domains && input.domains.length > 0 ? input.domains : ["tasks", "goals", "projects", "reminders", "deadlines", "notes", "people", "inbox", "events"]);
    const results = new Map<string, WorkspaceSearchResult>();
    const indices = new Map(indexCollection.entries().map((entry) => [`${entry.value.domain}:${entry.value.entityId}`, entry.value]));
    for (const embedding of embeddingCollection.entries().map((entry) => entry.value)) {
      if (!domains.has(embedding.domain)) continue;
      const indexEntry = indices.get(`${embedding.domain}:${embedding.entityId}`);
      if (!indexEntry) continue;
      if (!input.includeArchived && indexEntry.archivedAt) continue;
      const similarity = cosineSimilarity(embedding.vector, queryVector);
      if (similarity <= 0.05) continue;
      const score = similarity * 100;
      const key = `${embedding.domain}:${embedding.entityId}`;
      const existing = results.get(key);
      if (!existing || score > existing.score) {
        results.set(key, toSearchResult(indexEntry, score, "semantic", ["semantic"]));
      }
    }
    return results;
  }

  async function searchWorkspace(input: WorkspaceSearchQuery): Promise<WorkspaceSearchResult[]> {
    const normalizedInput: WorkspaceSearchQuery = {
      strategy: "auto",
      limit: 10,
      ...input,
      query: input.query.trim(),
    };
    if (!normalizedInput.query) return [];

    const requestedStrategy = normalizedInput.strategy ?? "auto";
    const runKeyword = requestedStrategy === "auto" || requestedStrategy === "keyword" || requestedStrategy === "hybrid";
    const runSemantic = requestedStrategy === "semantic" || requestedStrategy === "hybrid";
    const keywordResults = runKeyword ? await keywordSearch(normalizedInput) : new Map<string, WorkspaceSearchResult>();
    const semanticResults = runSemantic ? await semanticSearch(normalizedInput) : new Map<string, WorkspaceSearchResult>();
    const combined = new Map<string, WorkspaceSearchResult>();

    for (const [key, result] of keywordResults.entries()) {
      combined.set(key, result);
    }

    if (semanticResults.size > 0) {
      for (const [key, semanticResult] of semanticResults.entries()) {
        const existing = combined.get(key);
        if (!existing) {
          combined.set(key, requestedStrategy === "hybrid"
            ? { ...semanticResult, strategy: "hybrid", matchedFields: ["semantic"] }
            : semanticResult);
          continue;
        }
        combined.set(key, {
          ...existing,
          score: existing.score + semanticResult.score,
          strategy: requestedStrategy === "hybrid" ? "hybrid" : semanticResult.strategy,
          matchedFields: uniqueStrings([...existing.matchedFields, ...semanticResult.matchedFields]),
        });
      }
    }

    const results = [...combined.values()]
      .sort((left, right) => right.score - left.score || (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
      .slice(0, normalizedInput.limit ?? 10);

    appendAudit("workspace.search.queried", "workspace_search", {
      query: normalizedInput.query,
      strategy: requestedStrategy,
      domains: normalizedInput.domains?.join(",") ?? "all",
      resultCount: results.length,
    });
    return results;
  }

  async function buildContext(input: WorkspaceContextRequest = {}): Promise<WorkspaceContextBundle> {
    const queryText = input.query?.trim()
      || (input.threadId ? (inboxThreadsCollection.get(input.threadId)?.preview ?? "") : "")
      || (input.sessionId ? claw.sessions.getSession(input.sessionId)?.messages.at(-1)?.content ?? "" : "");
    const request: WorkspaceContextRequest = {
      strategy: "auto",
      limit: DEFAULT_CONTEXT_LIMIT,
      ...input,
      ...(queryText ? { query: queryText } : {}),
    };

    const results = queryText
      ? await searchWorkspace({
          query: queryText,
          domains: request.domains,
          strategy: request.strategy ?? "auto",
          limit: request.limit ?? DEFAULT_CONTEXT_LIMIT,
        })
      : [];

    const taskRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "tasks").map((result) => tasksApi.get(result.id)))
      : await tasksApi.list({ limit: 3, status: ["todo", "in_progress", "blocked"] });
    const goalRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "goals").map((result) => goalsApi.get(result.id)))
      : await goalsApi.list({ limit: 2, status: ["active", "paused"] });
    const projectRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "projects").map((result) => projectsApi.get(result.id)))
      : await projectsApi.list({ limit: 2, status: ["draft", "in_progress", "paused"] });
    const reminderRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "reminders").map((result) => remindersApi.get(result.id)))
      : await remindersApi.list({ limit: 2, status: ["active", "paused"] });
    const deadlineRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "deadlines").map((result) => deadlinesApi.get(result.id)))
      : await deadlinesApi.list({ limit: 2, status: ["active", "paused"] });

    const noteRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "notes").map((result) => notesApi.get(result.id)))
      : (await notesApi.list({ limit: 2 })).slice(0, 2);

    const inboxThreads = queryText
      ? await Promise.all(results.filter((result) => result.domain === "inbox").map((result) => inboxApi.getThread(result.id)))
      : await inboxApi.list({ unreadOnly: true, limit: 3 });

    const eventRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "events").map((result) => eventsApi.get(result.id)))
      : await eventsApi.list({ upcomingOnly: true, limit: 3 });

    const linkedPeopleIds = uniqueStrings([
      ...taskRecords.flatMap((task) => task ? [task.assigneePersonId, ...task.watcherPersonIds] : []),
      ...goalRecords.flatMap((goal) => goal ? [goal.ownerPersonId] : []),
      ...projectRecords.flatMap((project) => project ? [project.ownerPersonId] : []),
      ...inboxThreads.flatMap((thread) => thread?.participantPersonIds ?? []),
      ...eventRecords.flatMap((event) => event?.attendeePersonIds ?? []),
    ]);
    const peopleRecords = await Promise.all(linkedPeopleIds.map((id) => peopleApi.get(id)));

    const blocks: PromptContextBlock[] = [];
    const filteredTasks = taskRecords.filter((task): task is TaskRecord => Boolean(task)).filter((task) => request.includeDoneTasks || task.status !== "done");
    const filteredGoals = goalRecords.filter((goal): goal is GoalRecord => Boolean(goal)).filter((goal) => request.includeDoneTasks || goal.status !== "done");
    const filteredProjects = projectRecords.filter((project): project is ProjectRecord => Boolean(project)).filter((project) => request.includeDoneTasks || project.status !== "done");
    const filteredReminders = reminderRecords.filter((reminder): reminder is ReminderRecord => Boolean(reminder)).filter((reminder) => request.includeDoneTasks || reminder.status !== "done");
    const filteredDeadlines = deadlineRecords.filter((deadline): deadline is DeadlineRecord => Boolean(deadline)).filter((deadline) => request.includeDoneTasks || deadline.status !== "done");
    const filteredNotes = noteRecords.filter((note): note is NoteRecord => Boolean(note));
    const filteredThreads = inboxThreads.filter((thread): thread is InboxThreadRecord => Boolean(thread));
    const filteredEvents = eventRecords.filter((event): event is EventRecord => Boolean(event));
    const filteredPeople = peopleRecords.filter((person): person is PersonRecord => Boolean(person));

    if (filteredTasks.length > 0) {
      blocks.push({
        id: "workspace-tasks",
        title: "Relevant tasks",
        content: filteredTasks.map((task) => `- [${task.status}] ${task.title}${task.dueAt ? ` (due ${task.dueAt})` : ""}`).join("\n"),
      });
    }
    if (filteredGoals.length > 0) {
      blocks.push({
        id: "workspace-goals",
        title: "Relevant goals",
        content: filteredGoals.map((goal) => `- [${goal.status}] ${goal.title}`).join("\n"),
      });
    }
    if (filteredProjects.length > 0) {
      blocks.push({
        id: "workspace-projects",
        title: "Relevant projects",
        content: filteredProjects.map((project) => `- [${project.status}] ${project.name}`).join("\n"),
      });
    }
    if (filteredReminders.length > 0) {
      blocks.push({
        id: "workspace-reminders",
        title: "Active reminders",
        content: filteredReminders.map((reminder) => `- [${reminder.status}] ${reminder.title} at ${reminder.triggerAt}`).join("\n"),
      });
    }
    if (filteredDeadlines.length > 0) {
      blocks.push({
        id: "workspace-deadlines",
        title: "Active deadlines",
        content: filteredDeadlines.map((deadline) => `- [${deadline.status}] ${deadline.title} due ${deadline.dueAt}`).join("\n"),
      });
    }
    if (filteredNotes.length > 0) {
      blocks.push({
        id: "workspace-notes",
        title: "Relevant notes",
        content: filteredNotes.map((note) => `- ${note.title}: ${summarizeSnippet(note.searchText, 160)}`).join("\n"),
      });
    }
    if (filteredThreads.length > 0) {
      blocks.push({
        id: "workspace-inbox",
        title: "Inbox context",
        content: filteredThreads.map((thread) => `- [${thread.status}] ${thread.subject || thread.id}: ${thread.preview || ""}`).join("\n"),
      });
    }
    if (filteredEvents.length > 0) {
      blocks.push({
        id: "workspace-events",
        title: "Upcoming events",
        content: filteredEvents.map((event) => `- ${event.title} at ${event.startsAt}${event.location ? ` (${event.location})` : ""}`).join("\n"),
      });
    }
    if (filteredPeople.length > 0) {
      blocks.push({
        id: "workspace-people",
        title: "Linked people",
        content: filteredPeople.map((person) => `- ${person.displayName}${person.role ? `, ${person.role}` : ""}`).join("\n"),
      });
    }

    appendAudit("workspace.context.built", "workspace_context", {
      query: queryText || "",
      blockCount: blocks.length,
      resultCount: results.length,
    });

    return {
      request,
      generatedAt: nowIso(),
      blocks,
      results,
    };
  }

  const tasksApi: WorkspaceClawInstance["tasks"] = {
    list: async (options = {}) => tasksCollection.list()
      .filter((task) => !isArchived(task, options.includeArchived))
      .filter((task) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(task.status);
      })
      .filter((task) => !options.assigneePersonId || task.assigneePersonId === options.assigneePersonId)
      .sort((left, right) => (right.updatedAt).localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => tasksCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const task: TaskRecord = {
        id: toId("task", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        ...(input.description ? { description: input.description } : {}),
        status: input.status ?? "todo",
        priority: input.priority ?? "medium",
        labels: uniqueStrings(input.labels ?? []),
        ...(input.assigneePersonId ? { assigneePersonId: input.assigneePersonId } : {}),
        watcherPersonIds: uniqueStrings(input.watcherPersonIds ?? []),
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
        ...(input.scheduledEventId ? { scheduledEventId: input.scheduledEventId } : {}),
        ...(input.eventId ? { eventId: input.eventId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}),
        childTaskIds: uniqueStrings(input.childTaskIds ?? []),
        dependsOnTaskIds: uniqueStrings(input.dependsOnTaskIds ?? []),
        ...(input.companyId ? { companyId: input.companyId } : {}),
        ...(input.portfolioId ? { portfolioId: input.portfolioId } : {}),
        ...(input.portfolioItemId ? { portfolioItemId: input.portfolioItemId } : {}),
        checklist: normalizeChecklist(input.checklist),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      tasksCollection.put(task.id, task);
      await syncTaskIndex(task);
      appendAudit("tasks.created", "tasks", { taskId: task.id, title: task.title });
      return task;
    },
    update: async (id, input) => {
      const current = assertRecord(tasksCollection.get(id), "Task", id);
      const task: TaskRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        priority: input.priority ?? current.priority,
        ...removeUndefined({
          description: input.description,
          assigneePersonId: input.assigneePersonId,
          dueAt: input.dueAt,
          scheduledEventId: input.scheduledEventId,
          eventId: input.eventId,
          projectId: input.projectId,
          goalId: input.goalId,
          parentTaskId: input.parentTaskId,
          companyId: input.companyId,
          portfolioId: input.portfolioId,
          portfolioItemId: input.portfolioItemId,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        labels: input.labels ? uniqueStrings(input.labels) : current.labels,
        watcherPersonIds: input.watcherPersonIds ? uniqueStrings(input.watcherPersonIds) : current.watcherPersonIds,
        childTaskIds: input.childTaskIds ? uniqueStrings(input.childTaskIds) : current.childTaskIds,
        dependsOnTaskIds: input.dependsOnTaskIds ? uniqueStrings(input.dependsOnTaskIds) : current.dependsOnTaskIds,
        checklist: input.checklist ? normalizeChecklist(input.checklist) : current.checklist,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      tasksCollection.put(id, task);
      if (current.status !== "done" && task.status === "done" && claw.time.configured) {
        await claw.time.signalAnchor({ anchorId: id, signal: "task_completed" });
      }
      await syncTaskIndex(task);
      appendAudit("tasks.updated", "tasks", { taskId: id });
      return task;
    },
    complete: async (id) => tasksApi.update(id, { status: "done" }),
    archive: async (id) => tasksApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = tasksCollection.get(id);
      if (!existing) return false;
      tasksCollection.remove(id);
      removeIndex("tasks", id);
      appendAudit("tasks.removed", "tasks", { taskId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["tasks"] }),
  };

  const goalsApi: WorkspaceClawInstance["goals"] = {
    list: async (options = {}) => goalsCollection.list()
      .filter((goal) => !isArchived(goal, options.includeArchived))
      .filter((goal) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(goal.status);
      })
      .filter((goal) => !options.projectId || goal.projectId === options.projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => goalsCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const parentGoalId = input.parentGoalId ?? input.parentId;
      const goal: GoalRecord = {
        id: toId("goal", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        ...(input.description ? { description: input.description } : {}),
        status: input.status ?? "active",
        ...(input.level ? { level: input.level } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(parentGoalId ? { parentId: parentGoalId, parentGoalId } : {}),
        ...(input.ownerPersonId ? { ownerPersonId: input.ownerPersonId } : {}),
        ...(input.ownerAgentId ? { ownerAgentId: input.ownerAgentId } : {}),
        ...(input.companyId ? { companyId: input.companyId } : {}),
        ...(input.portfolioId ? { portfolioId: input.portfolioId } : {}),
        ...(input.portfolioItemId ? { portfolioItemId: input.portfolioItemId } : {}),
        ...(input.metricKey ? { metricKey: input.metricKey } : {}),
        ...(input.metricLabel ? { metricLabel: input.metricLabel } : {}),
        ...(input.targetValue !== undefined ? { targetValue: input.targetValue } : {}),
        ...(input.currentValue !== undefined ? { currentValue: input.currentValue } : {}),
        ...(input.unit ? { unit: input.unit } : {}),
        ...(input.period ? { period: input.period } : {}),
        ...(input.healthStatus ? { healthStatus: input.healthStatus } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      goalsCollection.put(goal.id, goal);
      await syncGoalIndex(goal);
      appendAudit("goals.created", "goals", { goalId: goal.id, title: goal.title });
      return goal;
    },
    update: async (id, input) => {
      const current = assertRecord(goalsCollection.get(id), "Goal", id);
      const parentGoalId = input.parentGoalId ?? input.parentId;
      const goal: GoalRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        ...removeUndefined({
          description: input.description,
          level: input.level,
          projectId: input.projectId,
          parentId: parentGoalId,
          parentGoalId,
          ownerPersonId: input.ownerPersonId,
          ownerAgentId: input.ownerAgentId,
          companyId: input.companyId,
          portfolioId: input.portfolioId,
          portfolioItemId: input.portfolioItemId,
          metricKey: input.metricKey,
          metricLabel: input.metricLabel,
          targetValue: input.targetValue,
          currentValue: input.currentValue,
          unit: input.unit,
          period: input.period,
          healthStatus: input.healthStatus,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      goalsCollection.put(id, goal);
      await syncGoalIndex(goal);
      appendAudit("goals.updated", "goals", { goalId: id });
      return goal;
    },
    archive: async (id) => goalsApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = goalsCollection.get(id);
      if (!existing) return false;
      goalsCollection.remove(id);
      removeIndex("goals", id);
      appendAudit("goals.removed", "goals", { goalId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["goals"] }),
  };

  const projectsApi: WorkspaceClawInstance["projects"] = {
    list: async (options = {}) => projectsCollection.list()
      .filter((project) => !isArchived(project, options.includeArchived))
      .filter((project) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(project.status);
      })
      .filter((project) => !options.goalId || project.goalId === options.goalId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => projectsCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const project: ProjectRecord = {
        id: toId("project", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        name: input.name.trim(),
        ...(input.description ? { description: input.description } : {}),
        status: input.status ?? "draft",
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.ownerPersonId ? { ownerPersonId: input.ownerPersonId } : {}),
        ...(input.leadAgentId ? { leadAgentId: input.leadAgentId } : {}),
        ...(input.companyId ? { companyId: input.companyId } : {}),
        ...(input.portfolioId ? { portfolioId: input.portfolioId } : {}),
        ...(input.portfolioItemId ? { portfolioItemId: input.portfolioItemId } : {}),
        ...(input.color ? { color: input.color } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.healthStatus ? { healthStatus: input.healthStatus } : {}),
        ...(input.startDate ? { startDate: input.startDate } : {}),
        ...(input.targetDate ? { targetDate: input.targetDate } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      projectsCollection.put(project.id, project);
      await syncProjectIndex(project);
      appendAudit("projects.created", "projects", { projectId: project.id, name: project.name });
      return project;
    },
    update: async (id, input) => {
      const current = assertRecord(projectsCollection.get(id), "Project", id);
      const project: ProjectRecord = {
        ...current,
        name: input.name?.trim() || current.name,
        status: input.status ?? current.status,
        ...removeUndefined({
          description: input.description,
          goalId: input.goalId,
          ownerPersonId: input.ownerPersonId,
          leadAgentId: input.leadAgentId,
          companyId: input.companyId,
          portfolioId: input.portfolioId,
          portfolioItemId: input.portfolioItemId,
          color: input.color,
          kind: input.kind,
          healthStatus: input.healthStatus,
          startDate: input.startDate,
          targetDate: input.targetDate,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      projectsCollection.put(id, project);
      await syncProjectIndex(project);
      appendAudit("projects.updated", "projects", { projectId: id });
      return project;
    },
    archive: async (id) => projectsApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = projectsCollection.get(id);
      if (!existing) return false;
      projectsCollection.remove(id);
      removeIndex("projects", id);
      appendAudit("projects.removed", "projects", { projectId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["projects"] }),
  };

  const remindersApi: WorkspaceClawInstance["reminders"] = {
    list: async (options = {}) => claw.time.configured
      ? (await claw.time.list({ kind: "reminder" })).items
        .map((item) => temporalToReminderRecord(item))
        .filter((reminder) => !isArchived(reminder, options.includeArchived))
        .filter((reminder) => {
          if (!options.status) return true;
          const statuses = Array.isArray(options.status) ? options.status : [options.status];
          return statuses.includes(reminder.status);
        })
        .filter((reminder) => !options.anchorId || reminder.anchorId === options.anchorId)
        .filter((reminder) => !options.before || reminder.triggerAt <= options.before)
        .filter((reminder) => !options.after || reminder.triggerAt >= options.after)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER)
      : remindersCollection.list()
        .filter((reminder) => !isArchived(reminder, options.includeArchived))
        .filter((reminder) => {
          if (!options.status) return true;
          const statuses = Array.isArray(options.status) ? options.status : [options.status];
          return statuses.includes(reminder.status);
        })
        .filter((reminder) => !options.anchorId || reminder.anchorId === options.anchorId)
        .filter((reminder) => !options.before || reminder.triggerAt <= options.before)
        .filter((reminder) => !options.after || reminder.triggerAt >= options.after)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => {
      if (claw.time.configured) {
        const payload = await claw.time.get(id).catch(() => null);
        return payload ? temporalToReminderRecord(payload.item) : null;
      }
      return remindersCollection.get(id);
    },
    create: async (input) => {
      if (claw.time.configured) {
        const created = await claw.time.create({
          kind: "reminder",
          title: input.title,
          description: input.description,
          startsAt: input.triggerAt,
          schedule: { mode: "one_off", timezone: "UTC", startsAt: input.triggerAt },
          actions: [{ id: `${input.id ?? "reminder"}-notify`, kind: "notify", target: input.channel }],
          anchorType: input.anchorType,
          anchorId: input.anchorId,
        });
        const targetStatus = productivityStatusToTemporalStatus(input.status);
        const reminder = temporalToReminderRecord(
          targetStatus && targetStatus !== created.item.status
            ? (await claw.time.update(created.item.id, { status: targetStatus })).item
            : created.item,
        );
        await syncReminderIndex(reminder);
        appendAudit("reminders.created", "reminders", { reminderId: reminder.id, title: reminder.title });
        return reminder;
      }
      const timestamp = nowIso();
      const reminder: ReminderRecord = {
        id: toId("reminder", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        ...(input.description ? { description: input.description } : {}),
        status: input.status ?? "active",
        triggerAt: input.triggerAt,
        ...(input.anchorType ? { anchorType: input.anchorType } : {}),
        ...(input.anchorId ? { anchorId: input.anchorId } : {}),
        ...(input.channel ? { channel: input.channel } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      remindersCollection.put(reminder.id, reminder);
      await syncReminderIndex(reminder);
      appendAudit("reminders.created", "reminders", { reminderId: reminder.id, title: reminder.title });
      return reminder;
    },
    update: async (id, input) => {
      if (claw.time.configured) {
        const updated = await claw.time.update(id, {
          title: input.title,
          description: input.description,
          startsAt: input.triggerAt,
          schedule: input.triggerAt ? { mode: "one_off", timezone: "UTC", startsAt: input.triggerAt } : undefined,
          actions: input.channel !== undefined ? [{ id: `${id}-notify`, kind: "notify", target: input.channel }] : undefined,
          anchorType: input.anchorType,
          anchorId: input.anchorId,
          status: productivityStatusToTemporalStatus(input.status, input.archivedAt),
        });
        const reminder = temporalToReminderRecord(updated.item);
        await syncReminderIndex(reminder);
        appendAudit("reminders.updated", "reminders", { reminderId: id });
        return reminder;
      }
      const current = assertRecord(remindersCollection.get(id), "Reminder", id);
      const reminder: ReminderRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        triggerAt: input.triggerAt ?? current.triggerAt,
        ...removeUndefined({
          description: input.description,
          anchorType: input.anchorType,
          anchorId: input.anchorId,
          channel: input.channel,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      remindersCollection.put(id, reminder);
      await syncReminderIndex(reminder);
      appendAudit("reminders.updated", "reminders", { reminderId: id });
      return reminder;
    },
    pause: async (id) => remindersApi.update(id, { status: "paused" }),
    resume: async (id) => remindersApi.update(id, { status: "active" }),
    archive: async (id) => remindersApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      if (claw.time.configured) {
        await claw.time.delete(id);
        removeIndex("reminders", id);
        appendAudit("reminders.removed", "reminders", { reminderId: id });
        return true;
      }
      const existing = remindersCollection.get(id);
      if (!existing) return false;
      remindersCollection.remove(id);
      removeIndex("reminders", id);
      appendAudit("reminders.removed", "reminders", { reminderId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["reminders"] }),
  };

  const deadlinesApi: WorkspaceClawInstance["deadlines"] = {
    list: async (options = {}) => claw.time.configured
      ? (await claw.time.list({ kind: "deadline" })).items
        .map((item) => temporalToDeadlineRecord(item))
        .filter((deadline) => !isArchived(deadline, options.includeArchived))
        .filter((deadline) => {
          if (!options.status) return true;
          const statuses = Array.isArray(options.status) ? options.status : [options.status];
          return statuses.includes(deadline.status);
        })
        .filter((deadline) => !options.anchorId || deadline.anchorId === options.anchorId)
        .filter((deadline) => !options.before || deadline.dueAt <= options.before)
        .filter((deadline) => !options.after || deadline.dueAt >= options.after)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER)
      : deadlinesCollection.list()
        .filter((deadline) => !isArchived(deadline, options.includeArchived))
        .filter((deadline) => {
          if (!options.status) return true;
          const statuses = Array.isArray(options.status) ? options.status : [options.status];
          return statuses.includes(deadline.status);
        })
        .filter((deadline) => !options.anchorId || deadline.anchorId === options.anchorId)
        .filter((deadline) => !options.before || deadline.dueAt <= options.before)
        .filter((deadline) => !options.after || deadline.dueAt >= options.after)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => {
      if (claw.time.configured) {
        const payload = await claw.time.get(id).catch(() => null);
        return payload ? temporalToDeadlineRecord(payload.item) : null;
      }
      return deadlinesCollection.get(id);
    },
    create: async (input) => {
      if (claw.time.configured) {
        const created = await claw.time.create({
          kind: "deadline",
          title: input.title,
          description: input.description,
          dueAt: input.dueAt,
          schedule: { mode: "one_off", timezone: "UTC", startsAt: input.dueAt },
          anchorType: input.anchorType,
          anchorId: input.anchorId,
        });
        const targetStatus = productivityStatusToTemporalStatus(input.status);
        const deadline = temporalToDeadlineRecord(
          targetStatus && targetStatus !== created.item.status
            ? (await claw.time.update(created.item.id, { status: targetStatus })).item
            : created.item,
        );
        await syncDeadlineIndex(deadline);
        appendAudit("deadlines.created", "deadlines", { deadlineId: deadline.id, title: deadline.title });
        return deadline;
      }
      const timestamp = nowIso();
      const deadline: DeadlineRecord = {
        id: toId("deadline", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        ...(input.description ? { description: input.description } : {}),
        status: input.status ?? "active",
        dueAt: input.dueAt,
        ...(input.anchorType ? { anchorType: input.anchorType } : {}),
        ...(input.anchorId ? { anchorId: input.anchorId } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      deadlinesCollection.put(deadline.id, deadline);
      await syncDeadlineIndex(deadline);
      appendAudit("deadlines.created", "deadlines", { deadlineId: deadline.id, title: deadline.title });
      return deadline;
    },
    update: async (id, input) => {
      if (claw.time.configured) {
        const updated = await claw.time.update(id, {
          title: input.title,
          description: input.description,
          dueAt: input.dueAt,
          schedule: input.dueAt ? { mode: "one_off", timezone: "UTC", startsAt: input.dueAt } : undefined,
          anchorType: input.anchorType,
          anchorId: input.anchorId,
          status: productivityStatusToTemporalStatus(input.status, input.archivedAt),
        });
        const deadline = temporalToDeadlineRecord(updated.item);
        await syncDeadlineIndex(deadline);
        appendAudit("deadlines.updated", "deadlines", { deadlineId: id });
        return deadline;
      }
      const current = assertRecord(deadlinesCollection.get(id), "Deadline", id);
      const deadline: DeadlineRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        dueAt: input.dueAt ?? current.dueAt,
        ...removeUndefined({
          description: input.description,
          anchorType: input.anchorType,
          anchorId: input.anchorId,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      deadlinesCollection.put(id, deadline);
      await syncDeadlineIndex(deadline);
      appendAudit("deadlines.updated", "deadlines", { deadlineId: id });
      return deadline;
    },
    pause: async (id) => deadlinesApi.update(id, { status: "paused" }),
    resume: async (id) => deadlinesApi.update(id, { status: "active" }),
    archive: async (id) => deadlinesApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      if (claw.time.configured) {
        await claw.time.delete(id);
        removeIndex("deadlines", id);
        appendAudit("deadlines.removed", "deadlines", { deadlineId: id });
        return true;
      }
      const existing = deadlinesCollection.get(id);
      if (!existing) return false;
      deadlinesCollection.remove(id);
      removeIndex("deadlines", id);
      appendAudit("deadlines.removed", "deadlines", { deadlineId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["deadlines"] }),
  };

  const notesApi: WorkspaceClawInstance["notes"] = {
    list: async (options = {}) => notesCollection.list()
      .filter((note) => !isArchived(note, options.includeArchived))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => notesCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const blocks = normalizeBlocks(input);
      const note: NoteRecord = {
        id: toId("note", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        blocks,
        tags: uniqueStrings(input.tags ?? []),
        ...(input.summary ? { summary: input.summary } : {}),
        ...(input.attachments ? { attachments: input.attachments } : {}),
        linkedEntityIds: uniqueStrings(input.linkedEntityIds ?? []),
        searchText: [input.title, ...blocks.map((block) => block.text), ...(input.tags ?? [])].join(" "),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      notesCollection.put(note.id, note);
      await syncNoteIndex(note);
      appendAudit("notes.created", "notes", { noteId: note.id, title: note.title });
      return note;
    },
    update: async (id, input) => {
      const current = assertRecord(notesCollection.get(id), "Note", id);
      const mergedInput: CreateNoteInput = {
        title: input.title ?? current.title,
        blocks: input.blocks ?? current.blocks,
        content: input.content,
        tags: input.tags ?? current.tags,
        summary: input.summary ?? current.summary,
        attachments: input.attachments ?? current.attachments,
        linkedEntityIds: input.linkedEntityIds ?? current.linkedEntityIds,
        source: input.source ?? current.source,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
      };
      const blocks = normalizeBlocks(mergedInput);
      const note: NoteRecord = {
        ...current,
        title: (input.title ?? current.title).trim(),
        blocks,
        tags: input.tags ? uniqueStrings(input.tags) : current.tags,
        summary: input.summary ?? current.summary,
        attachments: input.attachments ?? current.attachments,
        linkedEntityIds: input.linkedEntityIds ? uniqueStrings(input.linkedEntityIds) : current.linkedEntityIds,
        searchText: [(input.title ?? current.title), ...blocks.map((block) => block.text), ...(input.tags ?? current.tags)].join(" "),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        archivedAt: input.archivedAt === null ? undefined : input.archivedAt ?? current.archivedAt,
        updatedAt: nowIso(),
      };
      notesCollection.put(id, note);
      await syncNoteIndex(note);
      appendAudit("notes.updated", "notes", { noteId: id });
      return note;
    },
    archive: async (id) => notesApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = notesCollection.get(id);
      if (!existing) return false;
      notesCollection.remove(id);
      removeIndex("notes", id);
      removeEmbedding("notes", id);
      appendAudit("notes.removed", "notes", { noteId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["notes"] }),
  };

  const peopleApi: WorkspaceClawInstance["people"] = {
    list: async (options = {}) => peopleCollection.list()
      .filter((person) => !isArchived(person, options.includeArchived))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => peopleCollection.get(id),
    upsert: async (input) => {
      const existing = input.id ? peopleCollection.get(input.id) : null;
      const timestamp = nowIso();
      const person: PersonRecord = existing ? {
        ...existing,
        displayName: input.displayName.trim(),
        kind: input.kind ?? existing.kind,
        identities: input.identities ? dedupeIdentities(input.identities) : existing.identities,
        emails: input.emails ? uniqueStrings(input.emails) : existing.emails,
        phones: input.phones ? uniqueStrings(input.phones) : existing.phones,
        handles: input.handles ? uniqueStrings(input.handles) : existing.handles,
        role: input.role ?? existing.role,
        organization: input.organization ?? existing.organization,
        links: input.links ?? existing.links,
        metadata: input.metadata ?? existing.metadata,
        updatedAt: timestamp,
      } : {
        id: toId("person", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        displayName: input.displayName.trim(),
        kind: input.kind ?? "human",
        identities: dedupeIdentities(input.identities ?? []),
        emails: uniqueStrings(input.emails ?? []),
        phones: uniqueStrings(input.phones ?? []),
        handles: uniqueStrings(input.handles ?? []),
        ...(input.role ? { role: input.role } : {}),
        ...(input.organization ? { organization: input.organization } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      peopleCollection.put(person.id, person);
      await syncPersonIndex(person);
      appendAudit(existing ? "people.updated" : "people.created", "people", { personId: person.id, displayName: person.displayName });
      return person;
    },
    upsertPersonIdentity: async (identity, input = {}) => {
      const existing = peopleCollection.list().find((person) => person.identities.some((candidate) => {
        if (candidate.channel !== identity.channel) return false;
        return candidate.handle === identity.handle || Boolean(identity.externalId && candidate.externalId === identity.externalId);
      }));
      return peopleApi.upsert({
        id: existing?.id,
        displayName: input.displayName ?? existing?.displayName ?? identity.label ?? identity.handle,
        kind: input.kind ?? existing?.kind,
        identities: dedupeIdentities([...(existing?.identities ?? []), identity]),
        emails: input.emails ?? existing?.emails,
        phones: input.phones ?? existing?.phones,
        handles: uniqueStrings([...(existing?.handles ?? []), identity.handle, ...(input.handles ?? [])]),
        role: input.role ?? existing?.role,
        organization: input.organization ?? existing?.organization,
        links: input.links ?? existing?.links,
        metadata: input.metadata ?? existing?.metadata,
        source: input.source ?? existing?.source,
      });
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["people"] }),
  };

  const inboxApi: WorkspaceClawInstance["inbox"] = {
    list: async (options = {}) => inboxThreadsCollection.list()
      .filter((thread) => !isArchived(thread, options.includeArchived))
      .filter((thread) => !options.unreadOnly || thread.status === "unread")
      .sort((left, right) => (right.latestMessageAt ?? right.updatedAt).localeCompare(left.latestMessageAt ?? left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    getThread: async (id) => inboxThreadsCollection.get(id),
    readThread: async (id) => {
      const current = inboxThreadsCollection.get(id);
      if (!current) return null;
      const thread = current.status === "unread"
        ? { ...current, status: "read" as const, updatedAt: nowIso() }
        : current;
      if (thread !== current) {
        inboxThreadsCollection.put(id, thread);
        await syncInboxThreadIndex(id);
        appendAudit("inbox.thread_read", "inbox", { threadId: id });
      }
      return {
        thread,
        messages: readInboxMessagesForThread(id),
      };
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["inbox"] }),
    createDraft: async (input) => {
      const timestamp = nowIso();
      const threadId = input.threadId?.trim() || toId("thread");
      const thread = inboxThreadsCollection.get(threadId) ?? {
        id: threadId,
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        channel: input.channel,
        ...(input.subject ? { subject: input.subject } : {}),
        participantPersonIds: uniqueStrings(input.participantPersonIds ?? []),
        status: "read" as const,
        ...(input.replyTarget ? { replyTarget: input.replyTarget } : {}),
        linkedTaskIds: uniqueStrings(input.linkedTaskIds ?? []),
        linkedNoteIds: uniqueStrings(input.linkedNoteIds ?? []),
        preview: messagePreview(input.content),
        latestMessageAt: timestamp,
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      if (!inboxThreadsCollection.get(threadId)) {
        inboxThreadsCollection.put(threadId, thread);
      }
      const message: InboxMessageRecord = {
        id: toId("message"),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        threadId,
        channel: input.channel,
        participantPersonIds: uniqueStrings(input.participantPersonIds ?? []),
        direction: "outbound",
        status: "draft",
        ...(input.replyTarget ? { replyTarget: input.replyTarget } : {}),
        ...(input.attachments ? { attachments: input.attachments } : {}),
        linkedTaskIds: uniqueStrings(input.linkedTaskIds ?? []),
        linkedNoteIds: uniqueStrings(input.linkedNoteIds ?? []),
        content: input.content,
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      inboxMessagesCollection.put(message.id, message);
      inboxThreadsCollection.put(threadId, {
        ...thread,
        updatedAt: timestamp,
        latestMessageAt: timestamp,
        preview: messagePreview(input.content),
      });
      await syncInboxThreadIndex(threadId);
      appendAudit("inbox.draft_created", "inbox", { threadId, messageId: message.id });
      return assertRecord(await inboxApi.readThread(threadId), "Inbox thread", threadId);
    },
    routeReply: async (threadId, input) => {
      const thread = assertRecord(inboxThreadsCollection.get(threadId), "Inbox thread", threadId);
      const timestamp = nowIso();
      const message: InboxMessageRecord = {
        id: toId("message"),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: { kind: "derived", channel: thread.channel },
        threadId,
        channel: thread.channel,
        participantPersonIds: thread.participantPersonIds,
        direction: "outbound",
        status: "sent",
        replyTarget: thread.replyTarget,
        ...(input.attachments ? { attachments: input.attachments } : {}),
        linkedTaskIds: uniqueStrings(input.linkedTaskIds ?? []),
        linkedNoteIds: uniqueStrings(input.linkedNoteIds ?? []),
        content: input.content,
      };
      inboxMessagesCollection.put(message.id, message);
      inboxThreadsCollection.put(threadId, {
        ...thread,
        status: "read",
        updatedAt: timestamp,
        latestMessageAt: timestamp,
        preview: messagePreview(input.content),
      });
      await syncInboxThreadIndex(threadId);
      appendAudit("inbox.reply_routed", "inbox", { threadId, messageId: message.id, channel: thread.channel });
      return message;
    },
    archive: async (threadId) => {
      const current = assertRecord(inboxThreadsCollection.get(threadId), "Inbox thread", threadId);
      const thread: InboxThreadRecord = {
        ...current,
        status: "archived",
        archivedAt: nowIso(),
        updatedAt: nowIso(),
      };
      inboxThreadsCollection.put(threadId, thread);
      await syncInboxThreadIndex(threadId);
      appendAudit("inbox.archived", "inbox", { threadId });
      return thread;
    },
    ingestIncomingMessage: async (input) => {
      const timestamp = nowIso();
      const existingThread = input.threadId
        ? inboxThreadsCollection.get(input.threadId)
        : inboxThreadsCollection.list().find((thread) => thread.externalThreadId && thread.externalThreadId === input.externalThreadId);
      const threadId = existingThread?.id ?? input.threadId?.trim() ?? toId("thread");
      const thread: InboxThreadRecord = existingThread ?? {
        id: threadId,
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source ?? { kind: "channel", channel: input.channel, externalId: input.externalThreadId }),
        channel: input.channel,
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.externalThreadId ? { externalThreadId: input.externalThreadId } : {}),
        participantPersonIds: uniqueStrings(input.participantPersonIds ?? []),
        status: "unread",
        ...(input.replyTarget ? { replyTarget: input.replyTarget } : {}),
        linkedTaskIds: uniqueStrings(input.linkedTaskIds ?? []),
        linkedNoteIds: uniqueStrings(input.linkedNoteIds ?? []),
        preview: messagePreview(input.content),
        latestMessageAt: timestamp,
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      inboxThreadsCollection.put(threadId, {
        ...thread,
        status: "unread",
        updatedAt: timestamp,
        latestMessageAt: timestamp,
        preview: messagePreview(input.content),
        participantPersonIds: uniqueStrings([...(thread.participantPersonIds ?? []), ...(input.participantPersonIds ?? [])]),
      });
      const message: InboxMessageRecord = {
        id: toId("message"),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source ?? { kind: "channel", channel: input.channel, externalId: input.externalMessageId }),
        threadId,
        channel: input.channel,
        ...(input.externalThreadId ? { externalThreadId: input.externalThreadId } : {}),
        ...(input.externalMessageId ? { externalMessageId: input.externalMessageId } : {}),
        participantPersonIds: uniqueStrings(input.participantPersonIds ?? []),
        direction: "inbound",
        status: "unread",
        ...(input.replyTarget ? { replyTarget: input.replyTarget } : {}),
        ...(input.attachments ? { attachments: input.attachments } : {}),
        linkedTaskIds: uniqueStrings(input.linkedTaskIds ?? []),
        linkedNoteIds: uniqueStrings(input.linkedNoteIds ?? []),
        content: input.content,
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      inboxMessagesCollection.put(message.id, message);
      await syncInboxThreadIndex(threadId);
      appendAudit("inbox.ingested", "inbox", { threadId, messageId: message.id, channel: input.channel });
      return assertRecord(await inboxApi.readThread(threadId), "Inbox thread", threadId);
    },
    resolveReplyTarget: async (threadId) => inboxThreadsCollection.get(threadId)?.replyTarget ?? null,
  };

  const eventsApi: WorkspaceClawInstance["events"] = {
    list: async (options = {}) => claw.time.configured
      ? (await claw.time.list({ kind: "event" })).items
        .filter((item) => !options.upcomingOnly || Boolean(item.startsAt && item.startsAt >= nowIso()))
        .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER)
        .map((item) => temporalToEventRecord(item))
      : eventsCollection.list()
      .filter((event) => !isArchived(event, options.includeArchived))
      .filter((event) => !options.upcomingOnly || event.startsAt >= nowIso())
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => {
      if (claw.time.configured) {
        const payload = await claw.time.get(id).catch(() => null);
        return payload ? temporalToEventRecord(payload.item) : null;
      }
      return eventsCollection.get(id);
    },
    create: async (input) => {
      if (claw.time.configured) {
        const created = await claw.time.create({
          kind: "event",
          title: input.title,
          description: input.description,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          location: input.location,
          participants: (input.attendeePersonIds ?? []).map((personId) => ({ kind: "human", label: personId, personId })),
          actions: (input.reminders ?? []).map((reminder) => ({ kind: "notify", target: reminder.channel, id: reminder.id })),
          projections: [{
            id: `${input.id ?? "event"}-workspace-events`,
            target: "workspace_events",
            provider: "workspace",
            detail: {
              linkedTaskIds: input.linkedTaskIds ?? [],
              linkedNoteIds: input.linkedNoteIds ?? [],
            },
          }],
        });
        const event = temporalToEventRecord(created.item);
        await syncEventIndex(event);
        appendAudit("events.created", "events", { eventId: event.id, title: event.title });
        return event;
      }
      const timestamp = nowIso();
      const event: EventRecord = {
        id: toId("event", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        startsAt: input.startsAt,
        ...(input.description ? { description: input.description } : {}),
        ...(input.endsAt ? { endsAt: input.endsAt } : {}),
        ...(input.location ? { location: input.location } : {}),
        attendeePersonIds: uniqueStrings(input.attendeePersonIds ?? []),
        linkedTaskIds: uniqueStrings(input.linkedTaskIds ?? []),
        linkedNoteIds: uniqueStrings(input.linkedNoteIds ?? []),
        reminders: normalizeReminders(input.reminders),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      eventsCollection.put(event.id, event);
      await syncEventIndex(event);
      appendAudit("events.created", "events", { eventId: event.id, title: event.title });
      return event;
    },
    update: async (id, input) => {
      if (claw.time.configured) {
        const updated = await claw.time.update(id, {
          title: input.title,
          description: input.description,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          location: input.location,
          participants: input.attendeePersonIds?.map((personId) => ({ kind: "human", label: personId, personId })),
          actions: input.reminders?.map((reminder) => ({ kind: "notify", target: reminder.channel, id: reminder.id })),
          projections: input.linkedTaskIds || input.linkedNoteIds
            ? [{
                id: `${id}-workspace-events`,
                target: "workspace_events",
                provider: "workspace",
                detail: {
                  linkedTaskIds: input.linkedTaskIds ?? [],
                  linkedNoteIds: input.linkedNoteIds ?? [],
                },
              }]
            : undefined,
          status: input.archivedAt ? "cancelled" : undefined,
        });
        const event = temporalToEventRecord(updated.item);
        await syncEventIndex(event);
        appendAudit("events.updated", "events", { eventId: id });
        return event;
      }
      const current = assertRecord(eventsCollection.get(id), "Event", id);
      const event: EventRecord = {
        ...current,
        title: input.title?.trim() ?? current.title,
        description: input.description ?? current.description,
        startsAt: input.startsAt ?? current.startsAt,
        endsAt: input.endsAt ?? current.endsAt,
        location: input.location ?? current.location,
        attendeePersonIds: input.attendeePersonIds ? uniqueStrings(input.attendeePersonIds) : current.attendeePersonIds,
        linkedTaskIds: input.linkedTaskIds ? uniqueStrings(input.linkedTaskIds) : current.linkedTaskIds,
        linkedNoteIds: input.linkedNoteIds ? uniqueStrings(input.linkedNoteIds) : current.linkedNoteIds,
        reminders: input.reminders ? normalizeReminders(input.reminders) : current.reminders,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        archivedAt: input.archivedAt === null ? undefined : input.archivedAt ?? current.archivedAt,
        updatedAt: nowIso(),
      };
      eventsCollection.put(id, event);
      await syncEventIndex(event);
      appendAudit("events.updated", "events", { eventId: id });
      return event;
    },
    archive: async (id) => eventsApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      if (claw.time.configured) {
        const removed = await claw.time.delete(id);
        removeIndex("events", id);
        appendAudit("events.removed", "events", { eventId: id });
        return removed.ok;
      }
      const existing = eventsCollection.get(id);
      if (!existing) return false;
      eventsCollection.remove(id);
      removeIndex("events", id);
      appendAudit("events.removed", "events", { eventId: id });
      return true;
    },
    search: async (query, options = {}) => claw.time.configured
      ? (await eventsApi.list({ includeArchived: options.includeArchived, limit: options.limit }))
        .filter((event) => event.title.toLowerCase().includes(query.toLowerCase()) || (event.description ?? "").toLowerCase().includes(query.toLowerCase()) || (event.location ?? "").toLowerCase().includes(query.toLowerCase()))
        .map((event) => ({
          domain: "events" as const,
          id: event.id,
          title: event.title,
          snippet: [event.description, event.location].filter(Boolean).join(" "),
          score: 100,
          strategy: "keyword" as const,
          matchedFields: ["title"],
          updatedAt: event.updatedAt,
        }))
      : searchWorkspace({ ...options, query, domains: ["events"] }),
  };

  function dedupeIdentities(identities: PersonIdentity[]): PersonIdentity[] {
    const seen = new Set<string>();
    const output: PersonIdentity[] = [];
    for (const identity of identities) {
      const key = `${identity.channel}:${identity.handle}:${identity.externalId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(identity);
    }
    return output;
  }

  const contextApi: WorkspaceClawInstance["context"] = {
    build: async (input = {}) => buildContext(input),
    tools: () => [...TOOL_DESCRIPTORS],
  };

  const uiApi: WorkspaceClawInstance["ui"] = {
    surfaces: () => [...SURFACES],
    badges: async () => {
      const today = nowIso().slice(0, 10);
      const upcomingThreshold = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      return [
        {
          id: "inbox_unread",
          value: (await inboxApi.list({ unreadOnly: true })).length,
          label: "Unread inbox",
        },
        {
          id: "tasks_due_today",
          value: (await tasksApi.list()).filter((task) => task.dueAt?.startsWith(today)).length,
          label: "Tasks due today",
        },
        {
          id: "events_upcoming",
          value: (await eventsApi.list({ upcomingOnly: true })).filter((event) => event.startsAt <= upcomingThreshold).length,
          label: "Upcoming events",
        },
      ];
    },
  };

  await migrateTemporalCollectionsToTime();

  const sessions: WorkspaceClawInstance["sessions"] = {
    ...claw.sessions,
    streamAssistantReplyEvents: async function* (input) {
      const workspaceContext = input.workspaceContext ?? "off";
      const baseContextBlocks = input.contextBlocks ?? [];
      const generatedContext = workspaceContext === "off"
        ? null
        : await contextApi.build(workspaceContext === "auto"
          ? { sessionId: input.sessionId, strategy: "auto", limit: DEFAULT_CONTEXT_LIMIT }
          : workspaceContext);
      const { workspaceContext: _ignored, ...baseInput } = input;
      yield* claw.sessions.streamAssistantReplyEvents({
        ...baseInput,
        contextBlocks: [...baseContextBlocks, ...(generatedContext?.blocks ?? [])],
      });
    },
    streamAssistantReply: async function* (input) {
      const workspaceContext = input.workspaceContext ?? "off";
      const baseContextBlocks = input.contextBlocks ?? [];
      const generatedContext = workspaceContext === "off"
        ? null
        : await contextApi.build(workspaceContext === "auto"
          ? { sessionId: input.sessionId, strategy: "auto", limit: DEFAULT_CONTEXT_LIMIT }
          : workspaceContext);
      const { workspaceContext: _ignored, ...baseInput } = input;
      yield* claw.sessions.streamAssistantReply({
        ...baseInput,
        contextBlocks: [...baseContextBlocks, ...(generatedContext?.blocks ?? [])],
      });
    },
  };

  return {
    ...claw,
    workspace: {
      ...claw.workspace,
      tools: {
        describe: () => [...TOOL_DESCRIPTORS],
      },
    },
    sessions,
    tasks: tasksApi,
    goals: goalsApi,
    projects: projectsApi,
    reminders: remindersApi,
    deadlines: deadlinesApi,
    notes: notesApi,
    people: peopleApi,
    inbox: inboxApi,
    events: eventsApi,
    search: {
      query: async (input) => searchWorkspace(input),
    },
    context: contextApi,
    ui: uiApi,
    workspaceIndex: {
      rebuild: async () => rebuildIndexes(),
    },
  };
}

export async function createWorkspaceClaw(options: CreateWorkspaceClawOptions): Promise<WorkspaceClawInstance> {
  const { productivity, ...baseOptions } = options;
  const claw = await createClaw(baseOptions);
  return createWorkspaceExtension(claw, options.workspace.rootDir, productivity);
}

export async function extendClawWithWorkspace(
  claw: ClawInstance,
  options: {
    workspaceDir: string;
    productivity?: WorkspaceExtensionOptions;
  },
): Promise<WorkspaceClawInstance> {
  return createWorkspaceExtension(claw, options.workspaceDir, options.productivity);
}

export interface WorkspaceClawFactory {
  (options: CreateWorkspaceClawOptions): Promise<WorkspaceClawInstance>;
  create: (options: CreateWorkspaceClawOptions) => Promise<WorkspaceClawInstance>;
  extend: typeof extendClawWithWorkspace;
}

export const WorkspaceClaw: WorkspaceClawFactory = Object.assign(
  async (options: CreateWorkspaceClawOptions) => createWorkspaceClaw(options),
  {
    create: async (options: CreateWorkspaceClawOptions) => createWorkspaceClaw(options),
    extend: extendClawWithWorkspace,
  },
);

export { Claw };
