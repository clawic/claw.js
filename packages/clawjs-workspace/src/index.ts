// @ts-nocheck
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import {
  Claw,
  WorkspaceAuditLog,
  createClaw,
  type ClawInstance,
  type SessionStreamEvent,
  type CreateClawOptions,
} from "@clawjs/claw";
import type {
  ActivityEntryRecord,
  AgentRecord,
  AssignmentRecord,
  ArtifactRecord,
  AreaRecord,
  AttachmentRecord,
  Attachment,
  BlockerRecord,
  CapacityRecord,
  CommentRecord,
  CustomFieldRecord,
  CycleRecord,
  DecisionRecord,
  DeadlineRecord,
  EpicRecord,
  EventRecord,
  FeedbackRecord,
  FieldValueRecord,
  GoalRecord,
  HandoffRecord,
  IncidentRecord,
  InboxMessageRecord,
  InboxReplyTarget,
  InboxThreadRecord,
  LinkedEntityRef,
  NoteBlock,
  NoteRecord,
  OperationalCheckRecord,
  PersonIdentity,
  PersonRecord,
  ProductivityApprovalRecord,
  ProductivityAgenda,
  ProductivityMyWork,
  ProductivityOperationsCockpit,
  ProductivityOperationsAgent,
  ProductivityReview,
  ProductivityTeamWork,
  ProjectRecord,
  RecurrenceRecord,
  PromptContextBlock,
  ReleaseRecord,
  ReminderRecord,
  SavedViewRecord,
  SectionRecord,
  ListRecord,
  MilestoneRecord,
  TaskChecklistItem,
  TaskRecord,
  TemplateRecord,
  WorkSessionRecord,
  WorkspaceBadgeSummary,
  WorkspaceContextBundle,
  WorkspaceContextRequest,
  WorkspaceDomain,
  WorkspaceEntitySource,
  WorkspaceRecordBase,
  WorkspaceSearchQuery,
  WorkspaceSearchResult,
  WorkspaceSearchStrategy,
  WorkspaceSurfaceDescriptor,
  WorkspaceToolDescriptor,
  TemporalItem,
} from "@clawjs/core";
import { createSqliteWorkspaceCollectionStore } from "./sqlite-store.ts";
import { createWorkspaceProductivityFacades } from "./workspace-productivity-facades.ts";
import { createWorkspaceUiSessionFacades } from "./workspace-ui-session-facades.ts";
import { SURFACES, TOOL_DESCRIPTORS } from "./workspace-descriptors.ts";
import {
  nowIso,
  uniqueStrings,
  normalizeSearchText,
  scoreKeyword,
  cosineSimilarity,
  toId,
  removeUndefined,
  assertRecord,
  toCollectionId,
  toSearchResult,
  defaultSource,
  clampNonNegativeNumber,
  clampConfidence,
  normalizeChecklist,
  normalizeBlocks,
  normalizeReminders,
  normalizeMilestoneIds,
  normalizeRecordIds,
  isArchived,
} from "./workspace-utils.ts";
import {
  isOverdue,
  toTimestamp,
  timelineOverlaps,
  minIso,
  maxIso,
  temporalToEventRecord,
  temporalStatusToProductivityStatus,
  productivityStatusToTemporalStatus,
  temporalToReminderRecord,
  temporalToDeadlineRecord,
} from "./workspace-temporal.ts";
import {
  summarizeSnippet,
  messagePreview,
  areaSearchText,
  taskSearchText,
  goalSearchText,
  projectSearchText,
  milestoneSearchText,
  activitySearchText,
  blockerSearchText,
  artifactSearchText,
  decisionSearchText,
  workSessionSearchText,
  assignmentSearchText,
  handoffSearchText,
  approvalSearchText,
  capacitySearchText,
  agentSearchText,
  releaseSearchText,
  incidentSearchText,
  feedbackSearchText,
  checkSearchText,
  reminderSearchText,
  deadlineSearchText,
  noteSearchText,
  personSearchText,
  eventSearchText,
  simpleRecordTitle,
  simpleRecordSearchText,
} from "./workspace-search-text.ts";

import type {
  CreateAgentInput,
  CreateApprovalInput,
  CreateAreaInput,
  CreateArtifactInput,
  CreateAssignmentInput,
  CreateAttachmentInput,
  CreateBlockerInput,
  CreateCapacityInput,
  CreateCommentInput,
  CreateCustomFieldInput,
  CreateCycleInput,
  CreateDeadlineInput,
  CreateDecisionInput,
  CreateEpicInput,
  CreateEventInput,
  CreateFeedbackInput,
  CreateFieldValueInput,
  CreateGoalInput,
  CreateHandoffInput,
  CreateInboxDraftInput,
  CreateIncidentInput,
  CreateListInput,
  CreateMilestoneInput,
  CreateNoteInput,
  CreateOperationalCheckInput,
  CreateProjectInput,
  CreateRecurrenceInput,
  CreateReleaseInput,
  CreateReminderInput,
  CreateSavedViewInput,
  CreateSectionInput,
  CreateTaskInput,
  CreateTemplateInput,
  CreateWorkSessionInput,
  CreateWorkspaceClawOptions,
  InboxThreadView,
  IngestInboxMessageInput,
  ProductivityTimeline,
  ProductivityTimelineCycleItem,
  ProductivityTimelineDeadlineItem,
  ProductivityTimelineDependencyState,
  ProductivityTimelineInput,
  ProductivityTimelineMilestoneItem,
  ProductivityTimelineNow,
  ProductivityTimelineProjectGroup,
  ProductivityTimelineTaskItem,
  RouteInboxReplyInput,
  UpdateAgentInput,
  UpdateApprovalInput,
  UpdateAreaInput,
  UpdateArtifactInput,
  UpdateAssignmentInput,
  UpdateAttachmentInput,
  UpdateBlockerInput,
  UpdateCapacityInput,
  UpdateCommentInput,
  UpdateCustomFieldInput,
  UpdateCycleInput,
  UpdateDeadlineInput,
  UpdateDecisionInput,
  UpdateEpicInput,
  UpdateEventInput,
  UpdateFeedbackInput,
  UpdateFieldValueInput,
  UpdateGoalInput,
  UpdateHandoffInput,
  UpdateIncidentInput,
  UpdateListInput,
  UpdateMilestoneInput,
  UpdateNoteInput,
  UpdateOperationalCheckInput,
  UpdateProjectInput,
  UpdateRecurrenceInput,
  UpdateReleaseInput,
  UpdateReminderInput,
  UpdateSavedViewInput,
  UpdateSectionInput,
  UpdateTaskInput,
  UpdateTemplateInput,
  UpdateWorkSessionInput,
  UpsertPersonInput,
  WorkspaceClawInstance,
  WorkspaceCollectionApi,
  WorkspaceConversationContextOption,
  WorkspaceConversationInput,
  WorkspaceEmbeddingRecord,
  WorkspaceEntityRecord,
  WorkspaceExtensionOptions,
  WorkspaceIndexRecord,
  WorkspaceSemanticSearchOptions,
} from "./workspace-contracts.ts";
export type { CreateAgentInput, CreateApprovalInput, CreateAreaInput, CreateArtifactInput, CreateAssignmentInput, CreateAttachmentInput, CreateBlockerInput, CreateCapacityInput, CreateCommentInput, CreateCustomFieldInput, CreateCycleInput, CreateDeadlineInput, CreateDecisionInput, CreateEpicInput, CreateEventInput, CreateFeedbackInput, CreateFieldValueInput, CreateGoalInput, CreateHandoffInput, CreateInboxDraftInput, CreateIncidentInput, CreateListInput, CreateMilestoneInput, CreateNoteInput, CreateOperationalCheckInput, CreateProjectInput, CreateRecurrenceInput, CreateReleaseInput, CreateReminderInput, CreateSavedViewInput, CreateSectionInput, CreateTaskInput, CreateTemplateInput, CreateWorkSessionInput, CreateWorkspaceClawOptions, InboxThreadView, IngestInboxMessageInput, ProductivityTimeline, ProductivityTimelineCycleItem, ProductivityTimelineDeadlineItem, ProductivityTimelineDependencyState, ProductivityTimelineInput, ProductivityTimelineMilestoneItem, ProductivityTimelineNow, ProductivityTimelineProjectGroup, ProductivityTimelineTaskItem, RouteInboxReplyInput, UpdateAgentInput, UpdateApprovalInput, UpdateAreaInput, UpdateArtifactInput, UpdateAssignmentInput, UpdateAttachmentInput, UpdateBlockerInput, UpdateCapacityInput, UpdateCommentInput, UpdateCustomFieldInput, UpdateCycleInput, UpdateDeadlineInput, UpdateDecisionInput, UpdateEpicInput, UpdateEventInput, UpdateFeedbackInput, UpdateFieldValueInput, UpdateGoalInput, UpdateHandoffInput, UpdateIncidentInput, UpdateListInput, UpdateMilestoneInput, UpdateNoteInput, UpdateOperationalCheckInput, UpdateProjectInput, UpdateRecurrenceInput, UpdateReleaseInput, UpdateReminderInput, UpdateSavedViewInput, UpdateSectionInput, UpdateTaskInput, UpdateTemplateInput, UpdateWorkSessionInput, UpsertPersonInput, WorkspaceClawInstance, WorkspaceCollectionApi, WorkspaceConversationContextOption, WorkspaceConversationInput, WorkspaceEmbeddingRecord, WorkspaceEntityRecord, WorkspaceExtensionOptions, WorkspaceIndexRecord, WorkspaceSemanticSearchOptions } from "./workspace-contracts.ts";

const DEFAULT_CONTEXT_LIMIT = 6;
const EMBEDDING_COLLECTION = "workspace_embeddings";
const INDEX_COLLECTION = "workspace_indexes";
const PRODUCTIVITY_SCHEMA_VERSION = 6;
const PRODUCTIVITY_SCHEMA_HASH = "productivity-v6-human-productivity-core";


async function createWorkspaceExtension(
  claw: ClawInstance,
  workspaceDir: string,
  options: WorkspaceExtensionOptions = {},
): Promise<WorkspaceClawInstance> {
  const audit = new WorkspaceAuditLog();
  const data = createSqliteWorkspaceCollectionStore(workspaceDir);
  const useTimeService = options.useTimeService === true;
  const areasCollection = data.collection<AreaRecord>("areas");
  const listsCollection = data.collection<ListRecord>("lists");
  const sectionsCollection = data.collection<SectionRecord>("sections");
  const tasksCollection = data.collection<TaskRecord>("tasks");
  const goalsCollection = data.collection<GoalRecord>("goals");
  const projectsCollection = data.collection<ProjectRecord>("projects");
  const commentsCollection = data.collection<CommentRecord>("comments");
  const attachmentsCollection = data.collection<AttachmentRecord>("attachments");
  const savedViewsCollection = data.collection<SavedViewRecord>("saved_views");
  const recurrencesCollection = data.collection<RecurrenceRecord>("recurrences");
  const cyclesCollection = data.collection<CycleRecord>("cycles");
  const epicsCollection = data.collection<EpicRecord>("epics");
  const customFieldsCollection = data.collection<CustomFieldRecord>("custom_fields");
  const fieldValuesCollection = data.collection<FieldValueRecord>("field_values");
  const templatesCollection = data.collection<TemplateRecord>("templates");
  const milestonesCollection = data.collection<MilestoneRecord>("milestones");
  const activityCollection = data.collection<ActivityEntryRecord>("activity_entries");
  const blockersCollection = data.collection<BlockerRecord>("blockers");
  const artifactsCollection = data.collection<ArtifactRecord>("artifacts");
  const decisionsCollection = data.collection<DecisionRecord>("decisions");
  const workSessionsCollection = data.collection<WorkSessionRecord>("work_sessions");
  const assignmentsCollection = data.collection<AssignmentRecord>("assignments");
  const handoffsCollection = data.collection<HandoffRecord>("handoffs");
  const approvalsCollection = data.collection<ProductivityApprovalRecord>("approvals");
  const capacityCollection = data.collection<CapacityRecord>("capacity");
  const agentsCollection = data.collection<AgentRecord>("agents");
  const releasesCollection = data.collection<ReleaseRecord>("releases");
  const incidentsCollection = data.collection<IncidentRecord>("incidents");
  const feedbackCollection = data.collection<FeedbackRecord>("feedback");
  const checksCollection = data.collection<OperationalCheckRecord>("checks");
  const remindersCollection = data.collection<ReminderRecord>("reminders");
  const deadlinesCollection = data.collection<DeadlineRecord>("deadlines");
  const notesCollection = data.collection<NoteRecord>("notes");
  const peopleCollection = data.collection<PersonRecord>("people");
  const inboxThreadsCollection = data.collection<InboxThreadRecord>("inbox_threads");
  const inboxMessagesCollection = data.collection<InboxMessageRecord>("inbox_messages");
  const eventsCollection = data.collection<EventRecord>("events");
  const workspaceMetaCollection = data.collection<{ id: string; value?: string; updatedAt?: string; migratedAt?: string }>("_workspace_meta");
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

  function readMeta(key: string): string | null {
    const value = workspaceMetaCollection.get(key);
    return value?.value ?? value?.migratedAt ?? null;
  }

  function writeMeta(key: string, value: string): void {
    workspaceMetaCollection.put(key, {
      id: key,
      value,
      updatedAt: nowIso(),
    });
  }

  async function recordActivity(entry: Omit<ActivityEntryRecord, "id" | "createdAt" | "updatedAt" | "source"> & {
    source?: WorkspaceEntitySource;
  }): Promise<ActivityEntryRecord> {
    const timestamp = nowIso();
    const activity: ActivityEntryRecord = {
      id: toId("activity"),
      createdAt: timestamp,
      updatedAt: timestamp,
      source: defaultSource(entry.source ?? { kind: "derived" }),
      entityType: entry.entityType,
      entityId: entry.entityId,
      kind: entry.kind,
      title: entry.title,
      ...(entry.content ? { content: entry.content } : {}),
      ...(entry.areaId ? { areaId: entry.areaId } : {}),
      ...(entry.projectId ? { projectId: entry.projectId } : {}),
      ...(entry.goalId ? { goalId: entry.goalId } : {}),
      ...(entry.milestoneId ? { milestoneId: entry.milestoneId } : {}),
      ...(entry.taskId ? { taskId: entry.taskId } : {}),
      ...(entry.threadId ? { threadId: entry.threadId } : {}),
      ...(entry.actor ? { actor: entry.actor } : {}),
      ...(entry.links ? { links: entry.links } : {}),
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
    };
    activityCollection.put(activity.id, activity);
    await syncActivityIndex(activity);
    return activity;
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

  async function syncSimpleIndex(domain: WorkspaceDomain, record: WorkspaceRecordBase): Promise<void> {
    const searchable = record as WorkspaceRecordBase & Record<string, unknown>;
    const title = simpleRecordTitle(searchable);
    putIndex({
      id: toCollectionId(domain, record.id),
      domain,
      entityId: record.id,
      title,
      searchText: simpleRecordSearchText(searchable),
      snippet: summarizeSnippet(String(searchable.description ?? searchable.body ?? searchable.query ?? title)),
      updatedAt: record.updatedAt,
      ...(record.archivedAt ? { archivedAt: record.archivedAt } : {}),
      ...(record.links ? { links: record.links } : {}),
    });
  }

  function createSimpleApi<TRecord extends WorkspaceRecordBase & Record<string, any>, TCreate extends Record<string, any>, TUpdate extends Record<string, any>>(config: {
    domain: WorkspaceDomain;
    entityType: ActivityEntryRecord["entityType"];
    collection: ReturnType<typeof data.collection<TRecord>>;
    prefix: string;
    titleField: "title" | "name" | "body" | "fieldId";
    defaults?: Record<string, unknown>;
    arrayFields?: string[];
    archiveStatus?: string;
  }): WorkspaceCollectionApi<TRecord, TCreate, TUpdate> {
    const normalizeArrayFields = (record: TRecord): TRecord => {
      const mutable = record as Record<string, unknown>;
      for (const field of config.arrayFields ?? []) {
        if (Array.isArray(mutable[field])) mutable[field] = uniqueStrings(mutable[field]);
        else mutable[field] = [];
      }
      return record;
    };
    return {
      list: async (options = {}) => config.collection.list()
        .filter((record) => !isArchived(record, options.includeArchived))
        .filter((record) => {
          if (!options.status) return true;
          const statuses = Array.isArray(options.status) ? options.status : [options.status];
          return statuses.includes(String(record.status));
        })
        .filter((record) => {
          if (!options.kind) return true;
          const kinds = Array.isArray(options.kind) ? options.kind : [options.kind];
          return kinds.includes(String(record.kind));
        })
        .filter((record) => !options.entityType || record.entityType === options.entityType)
        .filter((record) => !options.entityId || record.entityId === options.entityId)
        .filter((record) => !options.projectId || record.projectId === options.projectId)
        .filter((record) => !options.goalId || record.goalId === options.goalId)
        .filter((record) => !options.areaId || record.areaId === options.areaId)
        .filter((record) => !options.listId || record.listId === options.listId)
        .filter((record) => !options.anchorId || record.anchorId === options.anchorId)
        .sort((left, right) => {
          if (typeof left.rank === "number" && typeof right.rank === "number" && left.rank !== right.rank) return left.rank - right.rank;
          return right.updatedAt.localeCompare(left.updatedAt);
        })
        .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
      get: async (id) => config.collection.get(id),
      create: async (input) => {
        const timestamp = nowIso();
        const { id, source, links, metadata, ...rest } = input;
        const rawTitle = rest[config.titleField];
        const record = normalizeArrayFields({
          id: toId(config.prefix, typeof id === "string" ? id : undefined),
          createdAt: timestamp,
          updatedAt: timestamp,
          source: defaultSource(source),
          ...config.defaults,
          ...removeUndefined(rest),
          ...(typeof rawTitle === "string" ? { [config.titleField]: rawTitle.trim() } : {}),
          ...(links ? { links } : {}),
          ...(metadata ? { metadata } : {}),
        } as TRecord);
        config.collection.put(record.id, record);
        await syncSimpleIndex(config.domain, record);
        await recordActivity({
          entityType: config.entityType,
          entityId: record.id,
          kind: "created",
          title: `${config.domain} created: ${simpleRecordTitle(record)}`,
          projectId: typeof record.projectId === "string" ? record.projectId : undefined,
          goalId: typeof record.goalId === "string" ? record.goalId : undefined,
          taskId: typeof record.taskId === "string" ? record.taskId : undefined,
        });
        appendAudit(`${config.domain}.created`, config.domain, { id: record.id });
        return record;
      },
      update: async (id, input) => {
        const current = assertRecord(config.collection.get(id), String(config.domain), id);
        const { source: _source, links, metadata, ...rest } = input;
        const rawTitle = rest[config.titleField];
        const record = normalizeArrayFields({
          ...current,
          ...removeUndefined({
            ...rest,
            archivedAt: rest.archivedAt === null ? undefined : rest.archivedAt,
          }),
          ...(typeof rawTitle === "string" ? { [config.titleField]: rawTitle.trim() } : {}),
          links: links ?? current.links,
          metadata: metadata ?? current.metadata,
          updatedAt: nowIso(),
        } as TRecord);
        config.collection.put(id, record);
        await syncSimpleIndex(config.domain, record);
        await recordActivity({
          entityType: config.entityType,
          entityId: id,
          kind: rest.archivedAt ? "archived" : "updated",
          title: `${config.domain} ${rest.archivedAt ? "archived" : "updated"}: ${simpleRecordTitle(record)}`,
          projectId: typeof record.projectId === "string" ? record.projectId : undefined,
          goalId: typeof record.goalId === "string" ? record.goalId : undefined,
          taskId: typeof record.taskId === "string" ? record.taskId : undefined,
        });
        appendAudit(`${config.domain}.updated`, config.domain, { id });
        return record;
      },
      archive: async (id) => {
        const current = assertRecord(config.collection.get(id), String(config.domain), id);
        const record = normalizeArrayFields({
          ...current,
          ...(typeof current.status === "string" && config.archiveStatus ? { status: config.archiveStatus } : {}),
          archivedAt: nowIso(),
          updatedAt: nowIso(),
        } as TRecord);
        config.collection.put(id, record);
        await syncSimpleIndex(config.domain, record);
        await recordActivity({
          entityType: config.entityType,
          entityId: id,
          kind: "archived",
          title: `${config.domain} archived: ${simpleRecordTitle(record)}`,
          projectId: typeof record.projectId === "string" ? record.projectId : undefined,
          goalId: typeof record.goalId === "string" ? record.goalId : undefined,
          taskId: typeof record.taskId === "string" ? record.taskId : undefined,
        });
        appendAudit(`${config.domain}.updated`, config.domain, { id });
        return record;
      },
      remove: async (id) => {
        const existing = config.collection.get(id);
        if (!existing) return false;
        config.collection.remove(id);
        removeIndex(config.domain, id);
        appendAudit(`${config.domain}.removed`, config.domain, { id });
        return true;
      },
      search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: [config.domain] }),
    };
  }

  function readInboxMessagesForThread(threadId: string): InboxMessageRecord[] {
    return inboxMessagesCollection.entries()
      .map((entry) => entry.value)
      .filter((message) => message.threadId === threadId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async function syncAreaIndex(area: AreaRecord): Promise<void> {
    putIndex({
      id: toCollectionId("areas", area.id),
      domain: "areas",
      entityId: area.id,
      title: area.name,
      searchText: areaSearchText(area),
      snippet: summarizeSnippet(area.description || area.name),
      updatedAt: area.updatedAt,
      ...(area.archivedAt ? { archivedAt: area.archivedAt } : {}),
      ...(area.links ? { links: area.links } : {}),
    });
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

  async function syncMilestoneIndex(milestone: MilestoneRecord): Promise<void> {
    putIndex({
      id: toCollectionId("milestones", milestone.id),
      domain: "milestones",
      entityId: milestone.id,
      title: milestone.title,
      searchText: milestoneSearchText(milestone),
      snippet: summarizeSnippet(milestone.description || milestone.title),
      updatedAt: milestone.updatedAt,
      ...(milestone.archivedAt ? { archivedAt: milestone.archivedAt } : {}),
      ...(milestone.links ? { links: milestone.links } : {}),
    });
  }

  async function syncActivityIndex(activity: ActivityEntryRecord): Promise<void> {
    putIndex({
      id: toCollectionId("activity", activity.id),
      domain: "activity",
      entityId: activity.id,
      title: activity.title,
      searchText: activitySearchText(activity),
      snippet: summarizeSnippet(activity.content || activity.title),
      updatedAt: activity.updatedAt,
      ...(activity.archivedAt ? { archivedAt: activity.archivedAt } : {}),
      ...(activity.links ? { links: activity.links } : {}),
    });
  }

  async function syncBlockerIndex(blocker: BlockerRecord): Promise<void> {
    putIndex({
      id: toCollectionId("blockers", blocker.id),
      domain: "blockers",
      entityId: blocker.id,
      title: blocker.title,
      searchText: blockerSearchText(blocker),
      snippet: summarizeSnippet(blocker.description || blocker.title),
      updatedAt: blocker.updatedAt,
      ...(blocker.archivedAt ? { archivedAt: blocker.archivedAt } : {}),
      ...(blocker.links ? { links: blocker.links } : {}),
    });
  }

  async function syncArtifactIndex(artifact: ArtifactRecord): Promise<void> {
    putIndex({
      id: toCollectionId("artifacts", artifact.id),
      domain: "artifacts",
      entityId: artifact.id,
      title: artifact.title,
      searchText: artifactSearchText(artifact),
      snippet: summarizeSnippet(artifact.summary || artifact.content || artifact.uri || artifact.title),
      updatedAt: artifact.updatedAt,
      ...(artifact.archivedAt ? { archivedAt: artifact.archivedAt } : {}),
      ...(artifact.links ? { links: artifact.links } : {}),
    });
  }

  async function syncDecisionIndex(decision: DecisionRecord): Promise<void> {
    putIndex({
      id: toCollectionId("decisions", decision.id),
      domain: "decisions",
      entityId: decision.id,
      title: decision.title,
      searchText: decisionSearchText(decision),
      snippet: summarizeSnippet(decision.summary || decision.outcome || decision.title),
      updatedAt: decision.updatedAt,
      ...(decision.archivedAt ? { archivedAt: decision.archivedAt } : {}),
      ...(decision.links ? { links: decision.links } : {}),
    });
  }

  async function syncWorkSessionIndex(session: WorkSessionRecord): Promise<void> {
    putIndex({
      id: toCollectionId("work_sessions", session.id),
      domain: "work_sessions",
      entityId: session.id,
      title: session.title,
      searchText: workSessionSearchText(session),
      snippet: summarizeSnippet(session.objective || session.outcome || session.title),
      updatedAt: session.updatedAt,
      ...(session.archivedAt ? { archivedAt: session.archivedAt } : {}),
      ...(session.links ? { links: session.links } : {}),
    });
  }

  async function syncAssignmentIndex(assignment: AssignmentRecord): Promise<void> {
    putIndex({
      id: toCollectionId("assignments", assignment.id),
      domain: "assignments",
      entityId: assignment.id,
      title: assignment.title,
      searchText: assignmentSearchText(assignment),
      snippet: summarizeSnippet(assignment.rationale || assignment.rejectionReason || assignment.title),
      updatedAt: assignment.updatedAt,
      ...(assignment.archivedAt ? { archivedAt: assignment.archivedAt } : {}),
      ...(assignment.links ? { links: assignment.links } : {}),
    });
  }

  async function syncHandoffIndex(handoff: HandoffRecord): Promise<void> {
    putIndex({
      id: toCollectionId("handoffs", handoff.id),
      domain: "handoffs",
      entityId: handoff.id,
      title: handoff.title,
      searchText: handoffSearchText(handoff),
      snippet: summarizeSnippet(handoff.objective || handoff.nextStep || handoff.contextSummary || handoff.title),
      updatedAt: handoff.updatedAt,
      ...(handoff.archivedAt ? { archivedAt: handoff.archivedAt } : {}),
      ...(handoff.links ? { links: handoff.links } : {}),
    });
  }

  async function syncApprovalIndex(approval: ProductivityApprovalRecord): Promise<void> {
    putIndex({
      id: toCollectionId("approvals", approval.id),
      domain: "approvals",
      entityId: approval.id,
      title: approval.title,
      searchText: approvalSearchText(approval),
      snippet: summarizeSnippet(approval.policyReason || approval.outcome || approval.title),
      updatedAt: approval.updatedAt,
      ...(approval.archivedAt ? { archivedAt: approval.archivedAt } : {}),
      ...(approval.links ? { links: approval.links } : {}),
    });
  }

  async function syncCapacityIndex(capacity: CapacityRecord): Promise<void> {
    putIndex({
      id: toCollectionId("capacity", capacity.id),
      domain: "capacity",
      entityId: capacity.id,
      title: capacity.title,
      searchText: capacitySearchText(capacity),
      snippet: summarizeSnippet(`${capacity.status} ${capacity.availability} wip=${capacity.currentWip} queue=${capacity.queueDepth}`),
      updatedAt: capacity.updatedAt,
      ...(capacity.archivedAt ? { archivedAt: capacity.archivedAt } : {}),
      ...(capacity.links ? { links: capacity.links } : {}),
    });
  }

  async function syncAgentIndex(agent: AgentRecord): Promise<void> {
    putIndex({
      id: toCollectionId("agents", agent.id),
      domain: "agents",
      entityId: agent.id,
      title: agent.name,
      searchText: agentSearchText(agent),
      snippet: summarizeSnippet(agent.currentFocus || `${agent.role} ${agent.autonomyLevel}`),
      updatedAt: agent.updatedAt,
      ...(agent.archivedAt ? { archivedAt: agent.archivedAt } : {}),
      ...(agent.links ? { links: agent.links } : {}),
    });
  }

  async function syncReleaseIndex(release: ReleaseRecord): Promise<void> {
    putIndex({
      id: toCollectionId("releases", release.id),
      domain: "releases",
      entityId: release.id,
      title: release.title,
      searchText: releaseSearchText(release),
      snippet: summarizeSnippet(release.riskSummary || release.title),
      updatedAt: release.updatedAt,
      ...(release.archivedAt ? { archivedAt: release.archivedAt } : {}),
      ...(release.links ? { links: release.links } : {}),
    });
  }

  async function syncIncidentIndex(incident: IncidentRecord): Promise<void> {
    putIndex({
      id: toCollectionId("incidents", incident.id),
      domain: "incidents",
      entityId: incident.id,
      title: incident.title,
      searchText: incidentSearchText(incident),
      snippet: summarizeSnippet(incident.summary || incident.customerImpact || incident.title),
      updatedAt: incident.updatedAt,
      ...(incident.archivedAt ? { archivedAt: incident.archivedAt } : {}),
      ...(incident.links ? { links: incident.links } : {}),
    });
  }

  async function syncFeedbackIndex(feedback: FeedbackRecord): Promise<void> {
    putIndex({
      id: toCollectionId("feedback", feedback.id),
      domain: "feedback",
      entityId: feedback.id,
      title: feedback.title,
      searchText: feedbackSearchText(feedback),
      snippet: summarizeSnippet(feedback.summary || feedback.title),
      updatedAt: feedback.updatedAt,
      ...(feedback.archivedAt ? { archivedAt: feedback.archivedAt } : {}),
      ...(feedback.links ? { links: feedback.links } : {}),
    });
  }

  async function syncCheckIndex(check: OperationalCheckRecord): Promise<void> {
    putIndex({
      id: toCollectionId("checks", check.id),
      domain: "checks",
      entityId: check.id,
      title: check.title,
      searchText: checkSearchText(check),
      snippet: summarizeSnippet(check.resultSummary || check.playbook || check.title),
      updatedAt: check.updatedAt,
      ...(check.archivedAt ? { archivedAt: check.archivedAt } : {}),
      ...(check.links ? { links: check.links } : {}),
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

  async function migrateProductivitySchema(): Promise<void> {
    const currentVersion = Number(readMeta("productivity_schema_version") ?? "1");
    if (currentVersion >= PRODUCTIVITY_SCHEMA_VERSION) return;

    for (const task of tasksCollection.list()) {
      tasksCollection.put(task.id, {
        ...task,
        labels: uniqueStrings(task.labels ?? []),
        watcherPersonIds: uniqueStrings(task.watcherPersonIds ?? []),
        childTaskIds: uniqueStrings(task.childTaskIds ?? []),
        dependsOnTaskIds: uniqueStrings(task.dependsOnTaskIds ?? []),
        commentIds: uniqueStrings(task.commentIds ?? []),
        attachmentIds: uniqueStrings(task.attachmentIds ?? []),
        blockedByIds: uniqueStrings(task.blockedByIds ?? []),
        evidenceIds: uniqueStrings(task.evidenceIds ?? []),
        decisionIds: uniqueStrings(task.decisionIds ?? []),
        assignmentIds: uniqueStrings(task.assignmentIds ?? []),
        handoffIds: uniqueStrings(task.handoffIds ?? []),
        approvalIds: uniqueStrings(task.approvalIds ?? []),
        checklist: normalizeChecklist(task.checklist),
      });
    }
    for (const goal of goalsCollection.list()) {
      goalsCollection.put(goal.id, {
        ...goal,
      });
    }
    for (const project of projectsCollection.list()) {
      projectsCollection.put(project.id, {
        ...project,
        milestoneIds: normalizeMilestoneIds(project.milestoneIds ?? []),
        defaultSectionIds: uniqueStrings(project.defaultSectionIds ?? []),
      });
    }
    for (const blocker of blockersCollection.list()) {
      blockersCollection.put(blocker.id, {
        ...blocker,
        dependencyTaskIds: uniqueStrings(blocker.dependencyTaskIds ?? []),
        evidenceIds: uniqueStrings(blocker.evidenceIds ?? []),
      });
    }
    for (const decision of decisionsCollection.list()) {
      decisionsCollection.put(decision.id, {
        ...decision,
        alternatives: uniqueStrings(decision.alternatives ?? []),
        artifactIds: uniqueStrings(decision.artifactIds ?? []),
      });
    }
    for (const session of workSessionsCollection.list()) {
      workSessionsCollection.put(session.id, {
        ...session,
        taskIds: uniqueStrings(session.taskIds ?? []),
        blockerIds: uniqueStrings(session.blockerIds ?? []),
      });
    }
    for (const assignment of assignmentsCollection.list()) {
      assignmentsCollection.put(assignment.id, {
        ...assignment,
      });
    }
    for (const handoff of handoffsCollection.list()) {
      handoffsCollection.put(handoff.id, {
        ...handoff,
        artifactIds: uniqueStrings(handoff.artifactIds ?? []),
        blockerIds: uniqueStrings(handoff.blockerIds ?? []),
      });
    }
    for (const approval of approvalsCollection.list()) {
      approvalsCollection.put(approval.id, {
        ...approval,
        evidenceIds: uniqueStrings(approval.evidenceIds ?? []),
        decisionIds: uniqueStrings(approval.decisionIds ?? []),
      });
    }
    for (const snapshot of capacityCollection.list()) {
      capacityCollection.put(snapshot.id, {
        ...snapshot,
        assignedTaskIds: uniqueStrings(snapshot.assignedTaskIds ?? []),
        pendingApprovalIds: uniqueStrings(snapshot.pendingApprovalIds ?? []),
        pendingHandoffIds: uniqueStrings(snapshot.pendingHandoffIds ?? []),
      });
    }
    for (const agent of agentsCollection.list()) {
      agentsCollection.put(agent.id, {
        ...agent,
        domains: uniqueStrings(agent.domains ?? []),
        permissions: uniqueStrings(agent.permissions ?? []),
        linkedTaskIds: uniqueStrings(agent.linkedTaskIds ?? []),
      });
    }
    for (const release of releasesCollection.list()) {
      releasesCollection.put(release.id, {
        ...release,
        linkedTaskIds: uniqueStrings(release.linkedTaskIds ?? []),
        incidentIds: uniqueStrings(release.incidentIds ?? []),
        approvalIds: uniqueStrings(release.approvalIds ?? []),
      });
    }
    for (const incident of incidentsCollection.list()) {
      incidentsCollection.put(incident.id, {
        ...incident,
        blockerIds: uniqueStrings(incident.blockerIds ?? []),
        feedbackIds: uniqueStrings(incident.feedbackIds ?? []),
      });
    }
    writeMeta("productivity_schema_version", String(PRODUCTIVITY_SCHEMA_VERSION));
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
    for (const area of areasCollection.list()) {
      await syncAreaIndex(area);
      reindexed += 1;
    }
    for (const item of listsCollection.list()) {
      await syncSimpleIndex("lists", item);
      reindexed += 1;
    }
    for (const item of sectionsCollection.list()) {
      await syncSimpleIndex("sections", item);
      reindexed += 1;
    }
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
    for (const item of commentsCollection.list()) {
      await syncSimpleIndex("comments", item);
      reindexed += 1;
    }
    for (const item of attachmentsCollection.list()) {
      await syncSimpleIndex("attachments", item);
      reindexed += 1;
    }
    for (const item of savedViewsCollection.list()) {
      await syncSimpleIndex("saved_views", item);
      reindexed += 1;
    }
    for (const item of recurrencesCollection.list()) {
      await syncSimpleIndex("recurrences", item);
      reindexed += 1;
    }
    for (const item of cyclesCollection.list()) {
      await syncSimpleIndex("cycles", item);
      reindexed += 1;
    }
    for (const item of epicsCollection.list()) {
      await syncSimpleIndex("epics", item);
      reindexed += 1;
    }
    for (const item of customFieldsCollection.list()) {
      await syncSimpleIndex("custom_fields", item);
      reindexed += 1;
    }
    for (const item of fieldValuesCollection.list()) {
      await syncSimpleIndex("field_values", item);
      reindexed += 1;
    }
    for (const item of templatesCollection.list()) {
      await syncSimpleIndex("templates", item);
      reindexed += 1;
    }
    for (const milestone of milestonesCollection.list()) {
      await syncMilestoneIndex(milestone);
      reindexed += 1;
    }
    for (const blocker of blockersCollection.list()) {
      await syncBlockerIndex(blocker);
      reindexed += 1;
    }
    for (const artifact of artifactsCollection.list()) {
      await syncArtifactIndex(artifact);
      reindexed += 1;
    }
    for (const decision of decisionsCollection.list()) {
      await syncDecisionIndex(decision);
      reindexed += 1;
    }
    for (const session of workSessionsCollection.list()) {
      await syncWorkSessionIndex(session);
      reindexed += 1;
    }
    for (const assignment of assignmentsCollection.list()) {
      await syncAssignmentIndex(assignment);
      reindexed += 1;
    }
    for (const handoff of handoffsCollection.list()) {
      await syncHandoffIndex(handoff);
      reindexed += 1;
    }
    for (const approval of approvalsCollection.list()) {
      await syncApprovalIndex(approval);
      reindexed += 1;
    }
    for (const snapshot of capacityCollection.list()) {
      await syncCapacityIndex(snapshot);
      reindexed += 1;
    }
    for (const agent of agentsCollection.list()) {
      await syncAgentIndex(agent);
      reindexed += 1;
    }
    for (const release of releasesCollection.list()) {
      await syncReleaseIndex(release);
      reindexed += 1;
    }
    for (const incident of incidentsCollection.list()) {
      await syncIncidentIndex(incident);
      reindexed += 1;
    }
    for (const item of feedbackCollection.list()) {
      await syncFeedbackIndex(item);
      reindexed += 1;
    }
    for (const check of checksCollection.list()) {
      await syncCheckIndex(check);
      reindexed += 1;
    }
    if (useTimeService) {
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
    if (useTimeService) {
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
    for (const activity of activityCollection.list()) {
      await syncActivityIndex(activity);
      reindexed += 1;
    }
    embeddings = embeddingCollection.listIds().length;
    appendAudit("workspace.index.rebuilt", "workspace_search", { reindexed, embeddings });
    return { reindexed, embeddings };
  }

  async function migrateTemporalCollectionsToTime(): Promise<void> {
    if (!useTimeService) return;
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
    const domains = new Set(input.domains && input.domains.length > 0 ? input.domains : ["areas", "tasks", "goals", "projects", "milestones", "activity", "blockers", "artifacts", "decisions", "work_sessions", "assignments", "handoffs", "approvals", "capacity", "agents", "releases", "incidents", "feedback", "checks", "reminders", "deadlines", "notes", "people", "inbox", "events"]);
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
    const domains = new Set(input.domains && input.domains.length > 0 ? input.domains : ["areas", "tasks", "goals", "projects", "milestones", "activity", "blockers", "artifacts", "decisions", "work_sessions", "assignments", "handoffs", "approvals", "capacity", "agents", "releases", "incidents", "feedback", "checks", "reminders", "deadlines", "notes", "people", "inbox", "events"]);
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

    const areaRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "areas").map((result) => areasApi.get(result.id)))
      : await areasApi.list({ limit: 2, status: ["active", "paused"] });
    const taskRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "tasks").map((result) => tasksApi.get(result.id)))
      : await tasksApi.list({ limit: 3, status: ["todo", "in_progress", "blocked"] });
    const goalRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "goals").map((result) => goalsApi.get(result.id)))
      : await goalsApi.list({ limit: 2, status: ["active", "paused"] });
    const projectRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "projects").map((result) => projectsApi.get(result.id)))
      : await projectsApi.list({ limit: 2, status: ["draft", "in_progress", "paused"] });
    const milestoneRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "milestones").map((result) => milestonesApi.get(result.id)))
      : await milestonesApi.list({ limit: 2, status: ["planned", "active"] });
    const blockerRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "blockers").map((result) => blockersApi.get(result.id)))
      : await blockersApi.list({ limit: 2, status: "active" });
    const artifactRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "artifacts").map((result) => artifactsApi.get(result.id)))
      : await artifactsApi.list({ limit: 2 });
    const decisionRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "decisions").map((result) => decisionsApi.get(result.id)))
      : await decisionsApi.list({ limit: 2, status: ["proposed", "accepted"] });
    const workSessionRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "work_sessions").map((result) => workSessionsApi.get(result.id)))
      : await workSessionsApi.list({ limit: 1, status: "active" });
    const assignmentRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "assignments").map((result) => assignmentsApi.get(result.id)))
      : await assignmentsApi.list({ limit: 3, status: ["proposed", "accepted"] });
    const handoffRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "handoffs").map((result) => handoffsApi.get(result.id)))
      : await handoffsApi.list({ limit: 3, status: ["proposed", "accepted", "returned"] });
    const approvalRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "approvals").map((result) => approvalsApi.get(result.id)))
      : await approvalsApi.list({ limit: 3, status: "pending" });
    const capacityRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "capacity").map((result) => capacityApi.get(result.id)))
      : await capacityApi.list({ limit: 3 });
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
      ...areaRecords.flatMap((area) => area ? [area.ownerPersonId] : []),
      ...taskRecords.flatMap((task) => task ? [task.assigneePersonId, ...task.watcherPersonIds] : []),
      ...goalRecords.flatMap((goal) => goal ? [goal.ownerPersonId] : []),
      ...projectRecords.flatMap((project) => project ? [project.ownerPersonId] : []),
      ...blockerRecords.flatMap((blocker) => blocker ? [blocker.ownerPersonId] : []),
      ...decisionRecords.flatMap((decision) => decision ? [decision.ownerPersonId] : []),
      ...inboxThreads.flatMap((thread) => thread?.participantPersonIds ?? []),
      ...eventRecords.flatMap((event) => event?.attendeePersonIds ?? []),
    ]);
    const peopleRecords = await Promise.all(linkedPeopleIds.map((id) => peopleApi.get(id)));

    const blocks: PromptContextBlock[] = [];
    const filteredAreas = areaRecords.filter((area): area is AreaRecord => Boolean(area)).filter((area) => request.includeDoneTasks || area.status !== "archived");
    const filteredTasks = taskRecords.filter((task): task is TaskRecord => Boolean(task)).filter((task) => request.includeDoneTasks || task.status !== "done");
    const filteredGoals = goalRecords.filter((goal): goal is GoalRecord => Boolean(goal)).filter((goal) => request.includeDoneTasks || goal.status !== "done");
    const filteredProjects = projectRecords.filter((project): project is ProjectRecord => Boolean(project)).filter((project) => request.includeDoneTasks || project.status !== "done");
    const filteredMilestones = milestoneRecords.filter((milestone): milestone is MilestoneRecord => Boolean(milestone)).filter((milestone) => request.includeDoneTasks || milestone.status !== "done");
    const filteredBlockers = blockerRecords.filter((blocker): blocker is BlockerRecord => Boolean(blocker)).filter((blocker) => request.includeDoneTasks || blocker.status === "active");
    const filteredArtifacts = artifactRecords.filter((artifact): artifact is ArtifactRecord => Boolean(artifact));
    const filteredDecisions = decisionRecords.filter((decision): decision is DecisionRecord => Boolean(decision)).filter((decision) => request.includeDoneTasks || decision.status !== "rejected");
    const filteredWorkSessions = workSessionRecords.filter((session): session is WorkSessionRecord => Boolean(session)).filter((session) => request.includeDoneTasks || session.status === "active");
    const filteredAssignments = assignmentRecords.filter((assignment): assignment is AssignmentRecord => Boolean(assignment)).filter((assignment) => request.includeDoneTasks || assignment.status !== "completed");
    const filteredHandoffs = handoffRecords.filter((handoff): handoff is HandoffRecord => Boolean(handoff)).filter((handoff) => request.includeDoneTasks || handoff.status !== "completed");
    const filteredApprovals = approvalRecords.filter((approval): approval is ProductivityApprovalRecord => Boolean(approval)).filter((approval) => request.includeDoneTasks || approval.status === "pending");
    const filteredCapacity = capacityRecords.filter((snapshot): snapshot is CapacityRecord => Boolean(snapshot));
    const filteredReminders = reminderRecords.filter((reminder): reminder is ReminderRecord => Boolean(reminder)).filter((reminder) => request.includeDoneTasks || reminder.status !== "done");
    const filteredDeadlines = deadlineRecords.filter((deadline): deadline is DeadlineRecord => Boolean(deadline)).filter((deadline) => request.includeDoneTasks || deadline.status !== "done");
    const filteredNotes = noteRecords.filter((note): note is NoteRecord => Boolean(note));
    const filteredThreads = inboxThreads.filter((thread): thread is InboxThreadRecord => Boolean(thread));
    const filteredEvents = eventRecords.filter((event): event is EventRecord => Boolean(event));
    const filteredPeople = peopleRecords.filter((person): person is PersonRecord => Boolean(person));

    if (filteredAreas.length > 0) {
      blocks.push({
        id: "workspace-areas",
        title: "Relevant areas",
        content: filteredAreas.map((area) => `- [${area.status}] ${area.name}`).join("\n"),
      });
    }
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
    if (filteredMilestones.length > 0) {
      blocks.push({
        id: "workspace-milestones",
        title: "Relevant milestones",
        content: filteredMilestones.map((milestone) => `- [${milestone.status}] ${milestone.title}${milestone.targetDate ? ` (${milestone.targetDate})` : ""}`).join("\n"),
      });
    }
    if (filteredBlockers.length > 0) {
      blocks.push({
        id: "workspace-blockers",
        title: "Active blockers",
        content: filteredBlockers.map((blocker) => `- [${blocker.kind}] ${blocker.title}`).join("\n"),
      });
    }
    if (filteredDecisions.length > 0) {
      blocks.push({
        id: "workspace-decisions",
        title: "Recent decisions",
        content: filteredDecisions.map((decision) => `- [${decision.status}] ${decision.title}`).join("\n"),
      });
    }
    if (filteredWorkSessions.length > 0) {
      blocks.push({
        id: "workspace-work-sessions",
        title: "Active focus sessions",
        content: filteredWorkSessions.map((session) => `- [${session.status}] ${session.title}${session.objective ? `: ${session.objective}` : ""}`).join("\n"),
      });
    }
    if (filteredAssignments.length > 0) {
      blocks.push({
        id: "workspace-assignments",
        title: "Assignments",
        content: filteredAssignments.map((assignment) => `- [${assignment.status}] ${assignment.title} -> ${assignment.assignedToAgentId}`).join("\n"),
      });
    }
    if (filteredHandoffs.length > 0) {
      blocks.push({
        id: "workspace-handoffs",
        title: "Active handoffs",
        content: filteredHandoffs.map((handoff) => `- [${handoff.status}] ${handoff.title} (${handoff.fromAgentId} -> ${handoff.toAgentId})`).join("\n"),
      });
    }
    if (filteredApprovals.length > 0) {
      blocks.push({
        id: "workspace-approvals",
        title: "Pending approvals",
        content: filteredApprovals.map((approval) => `- [${approval.status}] ${approval.title} (${approval.kind})`).join("\n"),
      });
    }
    if (filteredCapacity.length > 0) {
      blocks.push({
        id: "workspace-capacity",
        title: "Team capacity",
        content: filteredCapacity.map((snapshot) => `- [${snapshot.status}] ${snapshot.title} wip=${snapshot.currentWip}/${snapshot.maxWip ?? "?"} queue=${snapshot.queueDepth}`).join("\n"),
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
    if (filteredArtifacts.length > 0) {
      blocks.push({
        id: "workspace-artifacts",
        title: "Recent evidence",
        content: filteredArtifacts.map((artifact) => `- [${artifact.kind}] ${artifact.title}${artifact.summary ? `: ${artifact.summary}` : ""}`).join("\n"),
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

  const areasApi: WorkspaceClawInstance["areas"] = {
    list: async (options = {}) => areasCollection.list()
      .filter((area) => !isArchived(area, options.includeArchived))
      .filter((area) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(area.status);
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => areasCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const area: AreaRecord = {
        id: toId("area", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        name: input.name.trim(),
        ...(input.description ? { description: input.description } : {}),
        status: input.status ?? "active",
        ...(input.color ? { color: input.color } : {}),
        ...(input.ownerPersonId ? { ownerPersonId: input.ownerPersonId } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      areasCollection.put(area.id, area);
      await syncAreaIndex(area);
      await recordActivity({
        entityType: "area",
        entityId: area.id,
        kind: "created",
        title: `Area created: ${area.name}`,
        areaId: area.id,
      });
      appendAudit("areas.created", "areas", { areaId: area.id, name: area.name });
      return area;
    },
    update: async (id, input) => {
      const current = assertRecord(areasCollection.get(id), "Area", id);
      const area: AreaRecord = {
        ...current,
        name: input.name?.trim() || current.name,
        status: input.status ?? current.status,
        ...removeUndefined({
          description: input.description,
          color: input.color,
          ownerPersonId: input.ownerPersonId,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      areasCollection.put(id, area);
      await syncAreaIndex(area);
      await recordActivity({
        entityType: "area",
        entityId: id,
        kind: input.archivedAt ? "archived" : "updated",
        title: `Area ${input.archivedAt ? "archived" : "updated"}: ${area.name}`,
        areaId: id,
      });
      appendAudit("areas.updated", "areas", { areaId: id });
      return area;
    },
    archive: async (id) => areasApi.update(id, { status: "archived", archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = areasCollection.get(id);
      if (!existing) return false;
      areasCollection.remove(id);
      removeIndex("areas", id);
      appendAudit("areas.removed", "areas", { areaId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["areas"] }),
  };

  const listsApi: WorkspaceClawInstance["lists"] = createSimpleApi<ListRecord, CreateListInput, UpdateListInput>({
    domain: "lists",
    entityType: "list",
    collection: listsCollection,
    prefix: "list",
    titleField: "title",
    defaults: { kind: "custom", status: "active" },
    archiveStatus: "archived",
  });

  const sectionsApi: WorkspaceClawInstance["sections"] = createSimpleApi<SectionRecord, CreateSectionInput, UpdateSectionInput>({
    domain: "sections",
    entityType: "section",
    collection: sectionsCollection,
    prefix: "section",
    titleField: "title",
    defaults: { status: "active" },
    archiveStatus: "archived",
  });

  const commentsApi: WorkspaceClawInstance["comments"] = createSimpleApi<CommentRecord, CreateCommentInput, UpdateCommentInput>({
    domain: "comments",
    entityType: "comment",
    collection: commentsCollection,
    prefix: "comment",
    titleField: "body",
  });

  const attachmentsApi: WorkspaceClawInstance["attachments"] = createSimpleApi<AttachmentRecord, CreateAttachmentInput, UpdateAttachmentInput>({
    domain: "attachments",
    entityType: "attachment",
    collection: attachmentsCollection,
    prefix: "attachment",
    titleField: "title",
  });

  const savedViewsApi: WorkspaceClawInstance["savedViews"] = createSimpleApi<SavedViewRecord, CreateSavedViewInput, UpdateSavedViewInput>({
    domain: "saved_views",
    entityType: "saved_view",
    collection: savedViewsCollection,
    prefix: "view",
    titleField: "name",
  });

  const recurrencesApi: WorkspaceClawInstance["recurrences"] = createSimpleApi<RecurrenceRecord, CreateRecurrenceInput, UpdateRecurrenceInput>({
    domain: "recurrences",
    entityType: "recurrence",
    collection: recurrencesCollection,
    prefix: "recurrence",
    titleField: "title",
    defaults: { status: "active" },
  });

  const cyclesApi: WorkspaceClawInstance["cycles"] = createSimpleApi<CycleRecord, CreateCycleInput, UpdateCycleInput>({
    domain: "cycles",
    entityType: "cycle",
    collection: cyclesCollection,
    prefix: "cycle",
    titleField: "name",
    defaults: { status: "planned", taskIds: [] },
    arrayFields: ["taskIds"],
    archiveStatus: "archived",
  });

  const epicsApi: WorkspaceClawInstance["epics"] = createSimpleApi<EpicRecord, CreateEpicInput, UpdateEpicInput>({
    domain: "epics",
    entityType: "epic",
    collection: epicsCollection,
    prefix: "epic",
    titleField: "title",
    defaults: { status: "planned", kind: "epic", taskIds: [] },
    arrayFields: ["taskIds"],
    archiveStatus: "archived",
  });

  const customFieldsApi: WorkspaceClawInstance["customFields"] = createSimpleApi<CustomFieldRecord, CreateCustomFieldInput, UpdateCustomFieldInput>({
    domain: "custom_fields",
    entityType: "custom_field",
    collection: customFieldsCollection,
    prefix: "field",
    titleField: "name",
  });

  const fieldValuesApi: WorkspaceClawInstance["fieldValues"] = createSimpleApi<FieldValueRecord, CreateFieldValueInput, UpdateFieldValueInput>({
    domain: "field_values",
    entityType: "field_value",
    collection: fieldValuesCollection,
    prefix: "field-value",
    titleField: "fieldId",
  });

  const templatesApi: WorkspaceClawInstance["templates"] = createSimpleApi<TemplateRecord, CreateTemplateInput, UpdateTemplateInput>({
    domain: "templates",
    entityType: "template",
    collection: templatesCollection,
    prefix: "template",
    titleField: "name",
    defaults: { status: "active" },
    archiveStatus: "archived",
  });

  const tasksApi: WorkspaceClawInstance["tasks"] = {
    list: async (options = {}) => {
      const reminderAnchorIds = options.hasReminder
        ? new Set(
            useTimeService
              ? (await claw.time.list({ kind: "reminder" })).items
                .filter((item) => item.anchorType === "task" && item.anchorId)
                .map((item) => item.anchorId as string)
              : remindersCollection.list()
                .filter((reminder) => reminder.anchorType === "task" && reminder.anchorId)
                .map((reminder) => reminder.anchorId as string),
          )
        : null;
      return tasksCollection.list()
        .filter((task) => !isArchived(task, options.includeArchived))
        .filter((task) => {
          if (!options.status) return true;
          const statuses = Array.isArray(options.status) ? options.status : [options.status];
          return statuses.includes(task.status);
        })
        .filter((task) => !options.assigneePersonId || task.assigneePersonId === options.assigneePersonId)
        .filter((task) => !options.projectId || task.projectId === options.projectId)
        .filter((task) => !options.goalId || task.goalId === options.goalId)
        .filter((task) => !options.areaId || task.areaId === options.areaId)
        .filter((task) => !options.listId || task.listId === options.listId)
        .filter((task) => !options.sectionId || task.sectionId === options.sectionId)
        .filter((task) => !options.cycleId || task.cycleId === options.cycleId)
        .filter((task) => !options.epicId || task.epicId === options.epicId)
        .filter((task) => !options.blocked || task.status === "blocked" || Boolean(task.blockedReason))
        .filter((task) => !options.overdue || isOverdue(task.dueAt))
        .filter((task) => !options.ids || options.ids.includes(task.id))
        .filter((task) => !options.hasReminder || Boolean(reminderAnchorIds?.has(task.id)))
        .sort((left, right) => (right.updatedAt).localeCompare(left.updatedAt))
        .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER);
    },
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
        ...(input.type ? { type: input.type } : {}),
        priority: input.priority ?? "medium",
        ...(clampNonNegativeNumber(input.rank) !== undefined ? { rank: clampNonNegativeNumber(input.rank) } : {}),
        labels: uniqueStrings(input.labels ?? []),
        ...(input.areaId ? { areaId: input.areaId } : {}),
        ...(input.listId ? { listId: input.listId } : {}),
        ...(input.sectionId ? { sectionId: input.sectionId } : {}),
        ...(input.assigneePersonId ? { assigneePersonId: input.assigneePersonId } : {}),
        ...(input.reporterPersonId ? { reporterPersonId: input.reporterPersonId } : {}),
        watcherPersonIds: uniqueStrings(input.watcherPersonIds ?? []),
        ...(input.startAt ? { startAt: input.startAt } : {}),
        ...(input.deferUntil ? { deferUntil: input.deferUntil } : {}),
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
        ...(input.deadlineAt ? { deadlineAt: input.deadlineAt } : {}),
        ...(input.snoozedUntil ? { snoozedUntil: input.snoozedUntil } : {}),
        ...(input.recurrenceRule ? { recurrenceRule: input.recurrenceRule } : {}),
        ...(clampNonNegativeNumber(input.estimateMinutes) !== undefined ? { estimateMinutes: clampNonNegativeNumber(input.estimateMinutes) } : {}),
        ...(clampNonNegativeNumber(input.actualMinutes) !== undefined ? { actualMinutes: clampNonNegativeNumber(input.actualMinutes) } : {}),
        ...(clampNonNegativeNumber(input.storyPoints) !== undefined ? { storyPoints: clampNonNegativeNumber(input.storyPoints) } : {}),
        ...(input.blockedReason ? { blockedReason: input.blockedReason } : {}),
        ...(input.waitingOn ? { waitingOn: input.waitingOn } : {}),
        ...(input.startedAt ? { startedAt: input.startedAt } : {}),
        ...(input.completedAt ? { completedAt: input.completedAt } : {}),
        ...(input.cancelledAt ? { cancelledAt: input.cancelledAt } : {}),
        ...(input.scheduledEventId ? { scheduledEventId: input.scheduledEventId } : {}),
        ...(input.eventId ? { eventId: input.eventId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.cycleId ? { cycleId: input.cycleId } : {}),
        ...(input.epicId ? { epicId: input.epicId } : {}),
        ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}),
        childTaskIds: uniqueStrings(input.childTaskIds ?? []),
        dependsOnTaskIds: uniqueStrings(input.dependsOnTaskIds ?? []),
        commentIds: uniqueStrings(input.commentIds ?? []),
        attachmentIds: uniqueStrings(input.attachmentIds ?? []),
        ...(input.createdBy ? { createdBy: input.createdBy } : {}),
        ...(input.updatedBy ? { updatedBy: input.updatedBy } : {}),
        ...(input.assignedToAgentId ? { assignedToAgentId: input.assignedToAgentId } : {}),
        ...(input.assignedBy ? { assignedBy: input.assignedBy } : {}),
        ...(input.delegatedBy ? { delegatedBy: input.delegatedBy } : {}),
        ...(input.reviewerAgentId ? { reviewerAgentId: input.reviewerAgentId } : {}),
        blockedByIds: uniqueStrings(input.blockedByIds ?? []),
        evidenceIds: uniqueStrings(input.evidenceIds ?? []),
        decisionIds: uniqueStrings(input.decisionIds ?? []),
        assignmentIds: uniqueStrings(input.assignmentIds ?? []),
        handoffIds: uniqueStrings(input.handoffIds ?? []),
        approvalIds: uniqueStrings(input.approvalIds ?? []),
        ...(input.sourceItemId ? { sourceItemId: input.sourceItemId } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.handoffTo ? { handoffTo: input.handoffTo } : {}),
        ...(input.approvedBy ? { approvedBy: input.approvedBy } : {}),
        ...(input.companyId ? { companyId: input.companyId } : {}),
        ...(input.portfolioId ? { portfolioId: input.portfolioId } : {}),
        ...(input.portfolioItemId ? { portfolioItemId: input.portfolioItemId } : {}),
        checklist: normalizeChecklist(input.checklist),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      if (task.status === "in_progress" && !task.startedAt) task.startedAt = timestamp;
      if (task.status === "done" && !task.completedAt) task.completedAt = timestamp;
      tasksCollection.put(task.id, task);
      await syncTaskIndex(task);
      await recordActivity({
        entityType: "task",
        entityId: task.id,
        kind: "created",
        title: `Task created: ${task.title}`,
        areaId: task.areaId,
        projectId: task.projectId,
        goalId: task.goalId,
        taskId: task.id,
      });
      appendAudit("tasks.created", "tasks", { taskId: task.id, title: task.title });
      return task;
    },
    update: async (id, input) => {
      const current = assertRecord(tasksCollection.get(id), "Task", id);
      const task: TaskRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        type: input.type ?? current.type,
        priority: input.priority ?? current.priority,
        ...removeUndefined({
          description: input.description,
          rank: clampNonNegativeNumber(input.rank),
          areaId: input.areaId,
          listId: input.listId,
          sectionId: input.sectionId,
          assigneePersonId: input.assigneePersonId,
          reporterPersonId: input.reporterPersonId,
          startAt: input.startAt,
          deferUntil: input.deferUntil,
          dueAt: input.dueAt,
          deadlineAt: input.deadlineAt,
          snoozedUntil: input.snoozedUntil,
          recurrenceRule: input.recurrenceRule,
          estimateMinutes: clampNonNegativeNumber(input.estimateMinutes),
          actualMinutes: clampNonNegativeNumber(input.actualMinutes),
          storyPoints: clampNonNegativeNumber(input.storyPoints),
          blockedReason: input.blockedReason,
          waitingOn: input.waitingOn,
          startedAt: input.startedAt,
          completedAt: input.completedAt,
          cancelledAt: input.cancelledAt,
          scheduledEventId: input.scheduledEventId,
          eventId: input.eventId,
          projectId: input.projectId,
          goalId: input.goalId,
          cycleId: input.cycleId,
          epicId: input.epicId,
          parentTaskId: input.parentTaskId,
          createdBy: input.createdBy,
          updatedBy: input.updatedBy,
          assignedToAgentId: input.assignedToAgentId,
          assignedBy: input.assignedBy,
          delegatedBy: input.delegatedBy,
          reviewerAgentId: input.reviewerAgentId,
          sourceItemId: input.sourceItemId,
          confidence: clampConfidence(input.confidence),
          handoffTo: input.handoffTo,
          approvedBy: input.approvedBy,
          companyId: input.companyId,
          portfolioId: input.portfolioId,
          portfolioItemId: input.portfolioItemId,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        labels: input.labels ? uniqueStrings(input.labels) : current.labels,
        watcherPersonIds: input.watcherPersonIds ? uniqueStrings(input.watcherPersonIds) : current.watcherPersonIds,
        childTaskIds: input.childTaskIds ? uniqueStrings(input.childTaskIds) : current.childTaskIds,
        dependsOnTaskIds: input.dependsOnTaskIds ? uniqueStrings(input.dependsOnTaskIds) : current.dependsOnTaskIds,
        commentIds: input.commentIds ? uniqueStrings(input.commentIds) : current.commentIds,
        attachmentIds: input.attachmentIds ? uniqueStrings(input.attachmentIds) : current.attachmentIds,
        blockedByIds: input.blockedByIds ? uniqueStrings(input.blockedByIds) : current.blockedByIds,
        evidenceIds: input.evidenceIds ? uniqueStrings(input.evidenceIds) : current.evidenceIds,
        decisionIds: input.decisionIds ? uniqueStrings(input.decisionIds) : current.decisionIds,
        assignmentIds: input.assignmentIds ? uniqueStrings(input.assignmentIds) : current.assignmentIds,
        handoffIds: input.handoffIds ? uniqueStrings(input.handoffIds) : current.handoffIds,
        approvalIds: input.approvalIds ? uniqueStrings(input.approvalIds) : current.approvalIds,
        checklist: input.checklist ? normalizeChecklist(input.checklist) : current.checklist,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      if (task.status === "in_progress" && !task.startedAt) task.startedAt = nowIso();
      tasksCollection.put(id, task);
      if (current.status !== "done" && task.status === "done" && useTimeService) {
        await claw.time.signalAnchor({ anchorId: id, signal: "task_completed" });
      }
      if (current.status !== "done" && task.status === "done" && !task.completedAt) {
        task.completedAt = nowIso();
        tasksCollection.put(id, task);
      }
      await syncTaskIndex(task);
      await recordActivity({
        entityType: "task",
        entityId: id,
        kind: task.status === "done" && current.status !== "done" ? "completed" : input.archivedAt ? "archived" : "updated",
        title: `Task ${task.status === "done" && current.status !== "done" ? "completed" : input.archivedAt ? "archived" : "updated"}: ${task.title}`,
        areaId: task.areaId,
        projectId: task.projectId,
        goalId: task.goalId,
        taskId: task.id,
      });
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
      .filter((goal) => !options.areaId || goal.areaId === options.areaId)
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
        ...(input.areaId ? { areaId: input.areaId } : {}),
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
        ...(input.timeframeStart ? { timeframeStart: input.timeframeStart } : {}),
        ...(input.timeframeEnd ? { timeframeEnd: input.timeframeEnd } : {}),
        ...(input.reviewCadence ? { reviewCadence: input.reviewCadence } : {}),
        ...(input.metricDirection ? { metricDirection: input.metricDirection } : {}),
        ...(input.healthStatus ? { healthStatus: input.healthStatus } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      goalsCollection.put(goal.id, goal);
      await syncGoalIndex(goal);
      await recordActivity({
        entityType: "goal",
        entityId: goal.id,
        kind: "created",
        title: `Goal created: ${goal.title}`,
        areaId: goal.areaId,
        projectId: goal.projectId,
        goalId: goal.id,
      });
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
          areaId: input.areaId,
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
          timeframeStart: input.timeframeStart,
          timeframeEnd: input.timeframeEnd,
          reviewCadence: input.reviewCadence,
          metricDirection: input.metricDirection,
          healthStatus: input.healthStatus,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      goalsCollection.put(id, goal);
      await syncGoalIndex(goal);
      await recordActivity({
        entityType: "goal",
        entityId: id,
        kind: input.archivedAt ? "archived" : "updated",
        title: `Goal ${input.archivedAt ? "archived" : "updated"}: ${goal.title}`,
        areaId: goal.areaId,
        projectId: goal.projectId,
        goalId: goal.id,
      });
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
      .filter((project) => !options.areaId || project.areaId === options.areaId)
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
        ...(input.areaId ? { areaId: input.areaId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.ownerPersonId ? { ownerPersonId: input.ownerPersonId } : {}),
        ...(input.leadAgentId ? { leadAgentId: input.leadAgentId } : {}),
        ...(input.companyId ? { companyId: input.companyId } : {}),
        ...(input.portfolioId ? { portfolioId: input.portfolioId } : {}),
        ...(input.portfolioItemId ? { portfolioItemId: input.portfolioItemId } : {}),
        ...(input.color ? { color: input.color } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(clampNonNegativeNumber(input.rank) !== undefined ? { rank: clampNonNegativeNumber(input.rank) } : {}),
        ...(input.statusCategory ? { statusCategory: input.statusCategory } : {}),
        ...(input.healthStatus ? { healthStatus: input.healthStatus } : {}),
        ...(input.startAt ? { startAt: input.startAt } : {}),
        ...(input.startDate ? { startDate: input.startDate } : {}),
        ...(input.targetDate ? { targetDate: input.targetDate } : {}),
        ...(input.deadlineAt ? { deadlineAt: input.deadlineAt } : {}),
        milestoneIds: normalizeMilestoneIds(input.milestoneIds ?? []),
        defaultSectionIds: uniqueStrings(input.defaultSectionIds ?? []),
        ...(input.templateId ? { templateId: input.templateId } : {}),
        ...(input.reviewAt ? { reviewAt: input.reviewAt } : {}),
        ...(input.reviewCadence ? { reviewCadence: input.reviewCadence } : {}),
        ...(input.archiveReason ? { archiveReason: input.archiveReason } : {}),
        ...(input.completedAt ? { completedAt: input.completedAt } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      if (project.status === "done" && !project.completedAt) project.completedAt = timestamp;
      projectsCollection.put(project.id, project);
      await syncProjectIndex(project);
      await recordActivity({
        entityType: "project",
        entityId: project.id,
        kind: "created",
        title: `Project created: ${project.name}`,
        areaId: project.areaId,
        projectId: project.id,
        goalId: project.goalId,
      });
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
          areaId: input.areaId,
          goalId: input.goalId,
          ownerPersonId: input.ownerPersonId,
          leadAgentId: input.leadAgentId,
          companyId: input.companyId,
          portfolioId: input.portfolioId,
          portfolioItemId: input.portfolioItemId,
          color: input.color,
          kind: input.kind,
          rank: clampNonNegativeNumber(input.rank),
          statusCategory: input.statusCategory,
          healthStatus: input.healthStatus,
          startAt: input.startAt,
          startDate: input.startDate,
          targetDate: input.targetDate,
          deadlineAt: input.deadlineAt,
          templateId: input.templateId,
          reviewAt: input.reviewAt,
          reviewCadence: input.reviewCadence,
          archiveReason: input.archiveReason,
          completedAt: input.completedAt,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        milestoneIds: input.milestoneIds ? normalizeMilestoneIds(input.milestoneIds) : current.milestoneIds,
        defaultSectionIds: input.defaultSectionIds ? uniqueStrings(input.defaultSectionIds) : current.defaultSectionIds,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      if (project.status === "done" && !project.completedAt) project.completedAt = nowIso();
      projectsCollection.put(id, project);
      await syncProjectIndex(project);
      await recordActivity({
        entityType: "project",
        entityId: id,
        kind: input.archivedAt ? "archived" : "updated",
        title: `Project ${input.archivedAt ? "archived" : "updated"}: ${project.name}`,
        areaId: project.areaId,
        projectId: project.id,
        goalId: project.goalId,
      });
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

  const milestonesApi: WorkspaceClawInstance["milestones"] = {
    list: async (options = {}) => milestonesCollection.list()
      .filter((milestone) => !isArchived(milestone, options.includeArchived))
      .filter((milestone) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(milestone.status);
      })
      .filter((milestone) => !options.areaId || milestone.areaId === options.areaId)
      .filter((milestone) => !options.projectId || milestone.projectId === options.projectId)
      .filter((milestone) => !options.goalId || milestone.goalId === options.goalId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => milestonesCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const milestone: MilestoneRecord = {
        id: toId("milestone", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        ...(input.description ? { description: input.description } : {}),
        status: input.status ?? "planned",
        ...(input.areaId ? { areaId: input.areaId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.targetDate ? { targetDate: input.targetDate } : {}),
        ...(input.completedAt ? { completedAt: input.completedAt } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      if (milestone.status === "done" && !milestone.completedAt) milestone.completedAt = timestamp;
      milestonesCollection.put(milestone.id, milestone);
      await syncMilestoneIndex(milestone);
      await recordActivity({
        entityType: "milestone",
        entityId: milestone.id,
        kind: "created",
        title: `Milestone created: ${milestone.title}`,
        areaId: milestone.areaId,
        projectId: milestone.projectId,
        goalId: milestone.goalId,
        milestoneId: milestone.id,
      });
      appendAudit("milestones.created", "milestones", { milestoneId: milestone.id, title: milestone.title });
      return milestone;
    },
    update: async (id, input) => {
      const current = assertRecord(milestonesCollection.get(id), "Milestone", id);
      const milestone: MilestoneRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        ...removeUndefined({
          description: input.description,
          areaId: input.areaId,
          projectId: input.projectId,
          goalId: input.goalId,
          targetDate: input.targetDate,
          completedAt: input.completedAt,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      if (milestone.status === "done" && !milestone.completedAt) milestone.completedAt = nowIso();
      milestonesCollection.put(id, milestone);
      await syncMilestoneIndex(milestone);
      await recordActivity({
        entityType: "milestone",
        entityId: id,
        kind: input.archivedAt ? "archived" : milestone.status === "done" && current.status !== "done" ? "completed" : "updated",
        title: `Milestone ${input.archivedAt ? "archived" : milestone.status === "done" && current.status !== "done" ? "completed" : "updated"}: ${milestone.title}`,
        areaId: milestone.areaId,
        projectId: milestone.projectId,
        goalId: milestone.goalId,
        milestoneId: milestone.id,
      });
      appendAudit("milestones.updated", "milestones", { milestoneId: id });
      return milestone;
    },
    archive: async (id) => milestonesApi.update(id, { status: "archived", archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = milestonesCollection.get(id);
      if (!existing) return false;
      milestonesCollection.remove(id);
      removeIndex("milestones", id);
      appendAudit("milestones.removed", "milestones", { milestoneId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["milestones"] }),
  };

  const activityApi: WorkspaceClawInstance["activity"] = {
    list: async (options = {}) => activityCollection.list()
      .filter((entry) => !options.entityType || entry.entityType === options.entityType)
      .filter((entry) => !options.entityId || entry.entityId === options.entityId)
      .filter((entry) => !options.projectId || entry.projectId === options.projectId)
      .filter((entry) => !options.taskId || entry.taskId === options.taskId)
      .filter((entry) => !options.threadId || entry.threadId === options.threadId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => activityCollection.get(id),
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["activity"] }),
  };

  async function syncLinkedTask(taskId: string, input: Partial<TaskRecord>): Promise<void> {
    const current = tasksCollection.get(taskId);
    if (!current) return;
    const next: TaskRecord = {
      ...current,
      ...input,
      updatedAt: nowIso(),
    };
    tasksCollection.put(taskId, next);
    await syncTaskIndex(next);
  }

  async function reconcileTaskBlockState(taskId: string): Promise<void> {
    const task = tasksCollection.get(taskId);
    if (!task) return;
    const activeBlockers = (task.blockedByIds ?? [])
      .map((blockerId) => blockersCollection.get(blockerId))
      .filter((blocker): blocker is BlockerRecord => Boolean(blocker && blocker.status === "active" && !blocker.archivedAt));
    if (activeBlockers.length > 0) {
      await syncLinkedTask(taskId, {
        blockedByIds: activeBlockers.map((blocker) => blocker.id),
        status: task.status === "done" || task.status === "cancelled" ? task.status : "blocked",
        blockedReason: task.blockedReason ?? activeBlockers[0]?.title,
      });
      return;
    }
    await syncLinkedTask(taskId, {
      blockedByIds: [],
      status: task.status === "blocked" ? "todo" : task.status,
      blockedReason: undefined,
    });
  }

  async function reconcileTaskAssignmentState(taskId: string): Promise<void> {
    const task = tasksCollection.get(taskId);
    if (!task) return;
    const linkedAssignments = assignmentsCollection.list()
      .filter((assignment) => assignment.taskId === taskId && !assignment.archivedAt)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const activeAssignments = linkedAssignments.filter((assignment) => assignment.status !== "released" && assignment.status !== "completed");
    const primaryAssignment = activeAssignments.find((assignment) => assignment.status === "accepted")
      ?? activeAssignments.find((assignment) => assignment.status === "proposed")
      ?? null;
    await syncLinkedTask(taskId, {
      assignmentIds: linkedAssignments.map((assignment) => assignment.id),
      assignedToAgentId: primaryAssignment?.assignedToAgentId,
      assignedBy: primaryAssignment?.assignedBy,
      delegatedBy: primaryAssignment?.delegatedBy,
      reviewerAgentId: primaryAssignment?.reviewerAgentId,
    });
  }

  async function reconcileTaskHandoffState(taskId: string): Promise<void> {
    const task = tasksCollection.get(taskId);
    if (!task) return;
    const linkedHandoffs = handoffsCollection.list()
      .filter((handoff) => handoff.taskId === taskId && !handoff.archivedAt)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const activeHandoff = linkedHandoffs.find((handoff) => handoff.status === "proposed" || handoff.status === "accepted" || handoff.status === "returned") ?? null;
    await syncLinkedTask(taskId, {
      handoffIds: linkedHandoffs.map((handoff) => handoff.id),
      handoffTo: activeHandoff?.toAgentId,
    });
  }

  async function reconcileTaskApprovalState(taskId: string): Promise<void> {
    const task = tasksCollection.get(taskId);
    if (!task) return;
    const linkedApprovals = approvalsCollection.list()
      .filter((approval) => approval.taskId === taskId && !approval.archivedAt)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const latestApproved = linkedApprovals.find((approval) => approval.status === "approved") ?? null;
    await syncLinkedTask(taskId, {
      approvalIds: linkedApprovals.map((approval) => approval.id),
      approvedBy: latestApproved?.approvedBy ?? latestApproved?.approverAgentId,
    });
  }

  function buildDerivedCapacitySnapshot(input: {
    agentId: string;
    stored?: CapacityRecord;
    assignments: AssignmentRecord[];
    handoffs: HandoffRecord[];
    approvals: ProductivityApprovalRecord[];
    tasks: TaskRecord[];
  }): CapacityRecord {
    const timestamp = nowIso();
    const assignedTaskIds = uniqueStrings(input.assignments.map((assignment) => assignment.taskId).filter(Boolean));
    const pendingApprovalIds = input.approvals
      .filter((approval) => approval.status === "pending")
      .map((approval) => approval.id);
    const pendingHandoffIds = input.handoffs
      .filter((handoff) => handoff.status === "proposed" || handoff.status === "accepted" || handoff.status === "returned")
      .map((handoff) => handoff.id);
    const relatedTasks = input.tasks.filter((task) => assignedTaskIds.includes(task.id));
    const currentWip = relatedTasks.filter((task) => task.status !== "done" && task.status !== "cancelled").length;
    const blockedCount = relatedTasks.filter((task) => task.status === "blocked" || task.blockedByIds.length > 0).length;
    const overdueCount = relatedTasks.filter((task) => isOverdue(task.dueAt) && task.status !== "done" && task.status !== "cancelled").length;
    const maxWip = input.stored?.maxWip ?? 3;
    const queueDepth = currentWip + pendingHandoffIds.length + pendingApprovalIds.length;
    const utilizationRaw = maxWip > 0 ? currentWip / maxWip : 0;
    const utilization = Math.max(0, Math.min(1, utilizationRaw));
    const status: CapacityRecord["status"] = input.stored?.status === "offline"
      ? "offline"
      : utilizationRaw > 1 || blockedCount >= Math.max(2, maxWip)
        ? "overloaded"
        : utilizationRaw >= 0.75 || pendingApprovalIds.length > 0
          ? "limited"
          : "active";
    const availability: CapacityRecord["availability"] = input.stored?.availability
      ?? (status === "overloaded" ? "busy" : "available");
    return {
      id: input.stored?.id ?? `capacity-${input.agentId}`,
      createdAt: input.stored?.createdAt ?? timestamp,
      updatedAt: timestamp,
      source: input.stored?.source ?? { kind: "derived" },
      title: input.stored?.title ?? input.agentId,
      status,
      agentId: input.agentId,
      ...(input.stored?.teamId ? { teamId: input.stored.teamId } : {}),
      ...(input.stored?.role ? { role: input.stored.role } : {}),
      availability,
      ...(maxWip ? { maxWip } : {}),
      currentWip,
      queueDepth,
      blockedCount,
      overdueCount,
      ...(input.stored?.responseLatencyMinutes !== undefined ? { responseLatencyMinutes: input.stored.responseLatencyMinutes } : {}),
      utilization,
      assignedTaskIds,
      pendingApprovalIds,
      pendingHandoffIds,
      snapshotAt: input.stored?.snapshotAt ?? timestamp,
      ...(input.stored?.confidence !== undefined ? { confidence: input.stored.confidence } : {}),
      ...(input.stored?.links ? { links: input.stored.links } : {}),
      ...(input.stored?.metadata ? { metadata: input.stored.metadata } : {}),
      ...(input.stored?.archivedAt ? { archivedAt: input.stored.archivedAt } : {}),
    };
  }

  const blockersApi: WorkspaceClawInstance["blockers"] = {
    list: async (options = {}) => blockersCollection.list()
      .filter((blocker) => !isArchived(blocker, options.includeArchived))
      .filter((blocker) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(blocker.status);
      })
      .filter((blocker) => {
        if (!options.kind) return true;
        const kinds = Array.isArray(options.kind) ? options.kind : [options.kind];
        return kinds.includes(blocker.kind);
      })
      .filter((blocker) => !options.taskId || blocker.taskId === options.taskId)
      .filter((blocker) => !options.projectId || blocker.projectId === options.projectId)
      .filter((blocker) => !options.goalId || blocker.goalId === options.goalId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => blockersCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const blocker: BlockerRecord = {
        id: toId("blocker", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        kind: input.kind,
        status: input.status ?? "active",
        ...(input.description ? { description: input.description } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.ownerPersonId ? { ownerPersonId: input.ownerPersonId } : {}),
        ...(input.ownerAgentId ? { ownerAgentId: input.ownerAgentId } : {}),
        dependencyTaskIds: normalizeRecordIds(input.dependencyTaskIds ?? []),
        evidenceIds: normalizeRecordIds(input.evidenceIds ?? []),
        ...(input.resolvedAt ? { resolvedAt: input.resolvedAt } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      blockersCollection.put(blocker.id, blocker);
      await syncBlockerIndex(blocker);
      if (blocker.taskId) {
        const currentTask = tasksCollection.get(blocker.taskId);
        if (currentTask) {
          await syncLinkedTask(blocker.taskId, {
            blockedByIds: uniqueStrings([...(currentTask.blockedByIds ?? []), blocker.id]),
            status: currentTask.status === "done" || currentTask.status === "cancelled" ? currentTask.status : "blocked",
            blockedReason: currentTask.blockedReason ?? blocker.title,
          });
        }
      }
      await recordActivity({
        entityType: "blocker",
        entityId: blocker.id,
        kind: "created",
        title: `Blocker created: ${blocker.title}`,
        projectId: blocker.projectId,
        goalId: blocker.goalId,
        taskId: blocker.taskId,
      });
      appendAudit("blockers.created", "blockers", { blockerId: blocker.id, title: blocker.title });
      return blocker;
    },
    update: async (id, input) => {
      const current = assertRecord(blockersCollection.get(id), "Blocker", id);
      const blocker: BlockerRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        kind: input.kind ?? current.kind,
        status: input.status ?? current.status,
        ...removeUndefined({
          description: input.description,
          taskId: input.taskId,
          projectId: input.projectId,
          goalId: input.goalId,
          ownerPersonId: input.ownerPersonId,
          ownerAgentId: input.ownerAgentId,
          resolvedAt: input.resolvedAt,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        dependencyTaskIds: input.dependencyTaskIds ? normalizeRecordIds(input.dependencyTaskIds) : current.dependencyTaskIds,
        evidenceIds: input.evidenceIds ? normalizeRecordIds(input.evidenceIds) : current.evidenceIds,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      if (blocker.status === "resolved" && !blocker.resolvedAt) blocker.resolvedAt = nowIso();
      blockersCollection.put(id, blocker);
      await syncBlockerIndex(blocker);
      if (current.taskId && current.taskId !== blocker.taskId) {
        const previousTask = tasksCollection.get(current.taskId);
        if (previousTask) {
          await syncLinkedTask(current.taskId, {
            blockedByIds: previousTask.blockedByIds.filter((blockerId) => blockerId !== id),
          });
          await reconcileTaskBlockState(current.taskId);
        }
      }
      if (blocker.taskId) {
        const currentTask = tasksCollection.get(blocker.taskId);
        if (currentTask) {
          await syncLinkedTask(blocker.taskId, {
            blockedByIds: uniqueStrings([...(currentTask.blockedByIds ?? []), blocker.id]),
            status: blocker.status === "active" && currentTask.status !== "done" && currentTask.status !== "cancelled"
              ? "blocked"
              : currentTask.status,
            blockedReason: blocker.status === "active"
              ? (currentTask.blockedReason ?? blocker.title)
              : currentTask.blockedReason,
          });
          if (blocker.status !== "active") {
            await reconcileTaskBlockState(blocker.taskId);
          }
        }
      }
      await recordActivity({
        entityType: "blocker",
        entityId: id,
        kind: input.archivedAt ? "archived" : blocker.status === "resolved" && current.status !== "resolved" ? "completed" : "updated",
        title: `Blocker ${input.archivedAt ? "archived" : blocker.status === "resolved" && current.status !== "resolved" ? "resolved" : "updated"}: ${blocker.title}`,
        projectId: blocker.projectId,
        goalId: blocker.goalId,
        taskId: blocker.taskId,
      });
      appendAudit("blockers.updated", "blockers", { blockerId: id });
      return blocker;
    },
    archive: async (id) => blockersApi.update(id, { archivedAt: nowIso(), status: "cancelled" }),
    remove: async (id) => {
      const existing = blockersCollection.get(id);
      if (!existing) return false;
      blockersCollection.remove(id);
      removeIndex("blockers", id);
      if (existing.taskId) {
        const currentTask = tasksCollection.get(existing.taskId);
        if (currentTask) {
          await syncLinkedTask(existing.taskId, {
            blockedByIds: currentTask.blockedByIds.filter((blockerId) => blockerId !== id),
          });
          await reconcileTaskBlockState(existing.taskId);
        }
      }
      appendAudit("blockers.removed", "blockers", { blockerId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["blockers"] }),
  };

  const artifactsApi: WorkspaceClawInstance["artifacts"] = {
    list: async (options = {}) => artifactsCollection.list()
      .filter((artifact) => !isArchived(artifact, options.includeArchived))
      .filter((artifact) => {
        if (!options.kind) return true;
        const kinds = Array.isArray(options.kind) ? options.kind : [options.kind];
        return kinds.includes(artifact.kind);
      })
      .filter((artifact) => !options.taskId || artifact.taskId === options.taskId)
      .filter((artifact) => !options.projectId || artifact.projectId === options.projectId)
      .filter((artifact) => !options.goalId || artifact.goalId === options.goalId)
      .filter((artifact) => !options.threadId || artifact.threadId === options.threadId)
      .filter((artifact) => !options.decisionId || artifact.decisionId === options.decisionId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => artifactsCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const artifact: ArtifactRecord = {
        id: toId("artifact", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        kind: input.kind,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.threadId ? { threadId: input.threadId } : {}),
        ...(input.decisionId ? { decisionId: input.decisionId } : {}),
        ...(input.uri ? { uri: input.uri } : {}),
        ...(input.summary ? { summary: input.summary } : {}),
        ...(input.content ? { content: input.content } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      artifactsCollection.put(artifact.id, artifact);
      await syncArtifactIndex(artifact);
      if (artifact.taskId) {
        const currentTask = tasksCollection.get(artifact.taskId);
        if (currentTask) {
          await syncLinkedTask(artifact.taskId, {
            evidenceIds: uniqueStrings([...(currentTask.evidenceIds ?? []), artifact.id]),
          });
        }
      }
      await recordActivity({
        entityType: "artifact",
        entityId: artifact.id,
        kind: "created",
        title: `Artifact captured: ${artifact.title}`,
        projectId: artifact.projectId,
        goalId: artifact.goalId,
        taskId: artifact.taskId,
        threadId: artifact.threadId,
      });
      appendAudit("artifacts.created", "artifacts", { artifactId: artifact.id, title: artifact.title });
      return artifact;
    },
    update: async (id, input) => {
      const current = assertRecord(artifactsCollection.get(id), "Artifact", id);
      const artifact: ArtifactRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        kind: input.kind ?? current.kind,
        ...removeUndefined({
          taskId: input.taskId,
          projectId: input.projectId,
          goalId: input.goalId,
          threadId: input.threadId,
          decisionId: input.decisionId,
          uri: input.uri,
          summary: input.summary,
          content: input.content,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      artifactsCollection.put(id, artifact);
      await syncArtifactIndex(artifact);
      await recordActivity({
        entityType: "artifact",
        entityId: id,
        kind: input.archivedAt ? "archived" : "updated",
        title: `Artifact ${input.archivedAt ? "archived" : "updated"}: ${artifact.title}`,
        projectId: artifact.projectId,
        goalId: artifact.goalId,
        taskId: artifact.taskId,
        threadId: artifact.threadId,
      });
      appendAudit("artifacts.updated", "artifacts", { artifactId: id });
      return artifact;
    },
    archive: async (id) => artifactsApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = artifactsCollection.get(id);
      if (!existing) return false;
      artifactsCollection.remove(id);
      removeIndex("artifacts", id);
      if (existing.taskId) {
        const currentTask = tasksCollection.get(existing.taskId);
        if (currentTask) {
          await syncLinkedTask(existing.taskId, {
            evidenceIds: currentTask.evidenceIds.filter((artifactId) => artifactId !== id),
          });
        }
      }
      appendAudit("artifacts.removed", "artifacts", { artifactId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["artifacts"] }),
  };

  const decisionsApi: WorkspaceClawInstance["decisions"] = {
    list: async (options = {}) => decisionsCollection.list()
      .filter((decision) => !isArchived(decision, options.includeArchived))
      .filter((decision) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(decision.status);
      })
      .filter((decision) => !options.taskId || decision.taskId === options.taskId)
      .filter((decision) => !options.projectId || decision.projectId === options.projectId)
      .filter((decision) => !options.goalId || decision.goalId === options.goalId)
      .filter((decision) => !options.ownerPersonId || decision.ownerPersonId === options.ownerPersonId)
      .filter((decision) => !options.ownerAgentId || decision.ownerAgentId === options.ownerAgentId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => decisionsCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const decision: DecisionRecord = {
        id: toId("decision", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        status: input.status ?? "proposed",
        ...(input.summary ? { summary: input.summary } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.ownerPersonId ? { ownerPersonId: input.ownerPersonId } : {}),
        ...(input.ownerAgentId ? { ownerAgentId: input.ownerAgentId } : {}),
        ...(input.outcome ? { outcome: input.outcome } : {}),
        ...(input.rationale ? { rationale: input.rationale } : {}),
        alternatives: uniqueStrings(input.alternatives ?? []),
        artifactIds: normalizeRecordIds(input.artifactIds ?? []),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      decisionsCollection.put(decision.id, decision);
      await syncDecisionIndex(decision);
      if (decision.taskId) {
        const currentTask = tasksCollection.get(decision.taskId);
        if (currentTask) {
          await syncLinkedTask(decision.taskId, {
            decisionIds: uniqueStrings([...(currentTask.decisionIds ?? []), decision.id]),
          });
        }
      }
      await recordActivity({
        entityType: "decision",
        entityId: decision.id,
        kind: "created",
        title: `Decision recorded: ${decision.title}`,
        projectId: decision.projectId,
        goalId: decision.goalId,
        taskId: decision.taskId,
      });
      appendAudit("decisions.created", "decisions", { decisionId: decision.id, title: decision.title });
      return decision;
    },
    update: async (id, input) => {
      const current = assertRecord(decisionsCollection.get(id), "Decision", id);
      const decision: DecisionRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        ...removeUndefined({
          summary: input.summary,
          taskId: input.taskId,
          projectId: input.projectId,
          goalId: input.goalId,
          ownerPersonId: input.ownerPersonId,
          ownerAgentId: input.ownerAgentId,
          outcome: input.outcome,
          rationale: input.rationale,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        alternatives: input.alternatives ? uniqueStrings(input.alternatives) : current.alternatives,
        artifactIds: input.artifactIds ? normalizeRecordIds(input.artifactIds) : current.artifactIds,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      decisionsCollection.put(id, decision);
      await syncDecisionIndex(decision);
      await recordActivity({
        entityType: "decision",
        entityId: id,
        kind: input.archivedAt ? "archived" : "updated",
        title: `Decision ${input.archivedAt ? "archived" : "updated"}: ${decision.title}`,
        projectId: decision.projectId,
        goalId: decision.goalId,
        taskId: decision.taskId,
      });
      appendAudit("decisions.updated", "decisions", { decisionId: id });
      return decision;
    },
    archive: async (id) => decisionsApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = decisionsCollection.get(id);
      if (!existing) return false;
      decisionsCollection.remove(id);
      removeIndex("decisions", id);
      if (existing.taskId) {
        const currentTask = tasksCollection.get(existing.taskId);
        if (currentTask) {
          await syncLinkedTask(existing.taskId, {
            decisionIds: currentTask.decisionIds.filter((decisionId) => decisionId !== id),
          });
        }
      }
      appendAudit("decisions.removed", "decisions", { decisionId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["decisions"] }),
  };

  const workSessionsApi: WorkspaceClawInstance["workSessions"] = {
    list: async (options = {}) => workSessionsCollection.list()
      .filter((session) => !isArchived(session, options.includeArchived))
      .filter((session) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(session.status);
      })
      .filter((session) => !options.taskId || session.taskIds.includes(options.taskId))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => workSessionsCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const session: WorkSessionRecord = {
        id: toId("work-session", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        status: input.status ?? "active",
        ...(input.objective ? { objective: input.objective } : {}),
        taskIds: normalizeRecordIds(input.taskIds ?? []),
        blockerIds: normalizeRecordIds(input.blockerIds ?? []),
        startedAt: input.startedAt ?? timestamp,
        ...(input.endedAt ? { endedAt: input.endedAt } : {}),
        ...(input.outcome ? { outcome: input.outcome } : {}),
        ...(clampNonNegativeNumber(input.timeboxMinutes) !== undefined ? { timeboxMinutes: clampNonNegativeNumber(input.timeboxMinutes) } : {}),
        ...(input.ownerAgentId ? { ownerAgentId: input.ownerAgentId } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      workSessionsCollection.put(session.id, session);
      await syncWorkSessionIndex(session);
      const taskId = session.taskIds[0];
      await recordActivity({
        entityType: "work_session",
        entityId: session.id,
        kind: "created",
        title: `Work session started: ${session.title}`,
        taskId,
      });
      appendAudit("work_sessions.created", "work_sessions", { workSessionId: session.id, title: session.title });
      return session;
    },
    update: async (id, input) => {
      const current = assertRecord(workSessionsCollection.get(id), "Work session", id);
      const session: WorkSessionRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        ...removeUndefined({
          objective: input.objective,
          startedAt: input.startedAt ?? current.startedAt,
          endedAt: input.endedAt,
          outcome: input.outcome,
          timeboxMinutes: clampNonNegativeNumber(input.timeboxMinutes),
          ownerAgentId: input.ownerAgentId,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        taskIds: input.taskIds ? normalizeRecordIds(input.taskIds) : current.taskIds,
        blockerIds: input.blockerIds ? normalizeRecordIds(input.blockerIds) : current.blockerIds,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      if (session.status !== "active" && !session.endedAt) session.endedAt = nowIso();
      workSessionsCollection.put(id, session);
      await syncWorkSessionIndex(session);
      await recordActivity({
        entityType: "work_session",
        entityId: id,
        kind: input.archivedAt ? "archived" : session.status === "completed" && current.status !== "completed" ? "completed" : "updated",
        title: `Work session ${input.archivedAt ? "archived" : session.status === "completed" && current.status !== "completed" ? "completed" : "updated"}: ${session.title}`,
        taskId: session.taskIds[0],
      });
      appendAudit("work_sessions.updated", "work_sessions", { workSessionId: id });
      return session;
    },
    complete: async (id, outcome) => workSessionsApi.update(id, { status: "completed", outcome }),
    cancel: async (id) => workSessionsApi.update(id, { status: "cancelled" }),
    archive: async (id) => workSessionsApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = workSessionsCollection.get(id);
      if (!existing) return false;
      workSessionsCollection.remove(id);
      removeIndex("work_sessions", id);
      appendAudit("work_sessions.removed", "work_sessions", { workSessionId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["work_sessions"] }),
  };

  const assignmentsApi: WorkspaceClawInstance["assignments"] = {
    list: async (options = {}) => assignmentsCollection.list()
      .filter((assignment) => !isArchived(assignment, options.includeArchived))
      .filter((assignment) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(assignment.status);
      })
      .filter((assignment) => !options.taskId || assignment.taskId === options.taskId)
      .filter((assignment) => !options.projectId || assignment.projectId === options.projectId)
      .filter((assignment) => !options.goalId || assignment.goalId === options.goalId)
      .filter((assignment) => !options.assignedToAgentId || assignment.assignedToAgentId === options.assignedToAgentId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => assignmentsCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const assignment: AssignmentRecord = {
        id: toId("assignment", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        status: input.status ?? "proposed",
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        assignedToAgentId: input.assignedToAgentId.trim(),
        ...(input.assignedBy ? { assignedBy: input.assignedBy } : {}),
        ...(input.delegatedBy ? { delegatedBy: input.delegatedBy } : {}),
        ...(input.reviewerAgentId ? { reviewerAgentId: input.reviewerAgentId } : {}),
        ...(input.rationale ? { rationale: input.rationale } : {}),
        ...(input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}),
        ...(input.acceptedAt ? { acceptedAt: input.acceptedAt } : {}),
        ...(input.rejectedAt ? { rejectedAt: input.rejectedAt } : {}),
        ...(input.completedAt ? { completedAt: input.completedAt } : {}),
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      if (assignment.status === "accepted" && !assignment.acceptedAt) assignment.acceptedAt = timestamp;
      if (assignment.status === "rejected" && !assignment.rejectedAt) assignment.rejectedAt = timestamp;
      if (assignment.status === "completed" && !assignment.completedAt) assignment.completedAt = timestamp;
      assignmentsCollection.put(assignment.id, assignment);
      await syncAssignmentIndex(assignment);
      if (assignment.taskId) await reconcileTaskAssignmentState(assignment.taskId);
      await recordActivity({
        entityType: "assignment",
        entityId: assignment.id,
        kind: "created",
        title: `Assignment created: ${assignment.title}`,
        projectId: assignment.projectId,
        goalId: assignment.goalId,
        taskId: assignment.taskId,
      });
      appendAudit("assignments.created", "tasks", { assignmentId: assignment.id, taskId: assignment.taskId, assignedTo: assignment.assignedToAgentId });
      return assignment;
    },
    update: async (id, input) => {
      const current = assertRecord(assignmentsCollection.get(id), "Assignment", id);
      const assignment: AssignmentRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        assignedToAgentId: input.assignedToAgentId?.trim() || current.assignedToAgentId,
        ...removeUndefined({
          taskId: input.taskId,
          projectId: input.projectId,
          goalId: input.goalId,
          assignedBy: input.assignedBy,
          delegatedBy: input.delegatedBy,
          reviewerAgentId: input.reviewerAgentId,
          rationale: input.rationale,
          rejectionReason: input.rejectionReason,
          acceptedAt: input.acceptedAt,
          rejectedAt: input.rejectedAt,
          completedAt: input.completedAt,
          dueAt: input.dueAt,
          priority: input.priority,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      if (assignment.status === "accepted" && !assignment.acceptedAt) assignment.acceptedAt = nowIso();
      if (assignment.status === "rejected" && !assignment.rejectedAt) assignment.rejectedAt = nowIso();
      if (assignment.status === "completed" && !assignment.completedAt) assignment.completedAt = nowIso();
      assignmentsCollection.put(id, assignment);
      await syncAssignmentIndex(assignment);
      if (current.taskId && current.taskId !== assignment.taskId) await reconcileTaskAssignmentState(current.taskId);
      if (assignment.taskId) await reconcileTaskAssignmentState(assignment.taskId);
      await recordActivity({
        entityType: "assignment",
        entityId: id,
        kind: input.archivedAt ? "archived" : assignment.status === "accepted" && current.status !== "accepted" ? "completed" : "updated",
        title: `Assignment ${input.archivedAt ? "archived" : "updated"}: ${assignment.title}`,
        projectId: assignment.projectId,
        goalId: assignment.goalId,
        taskId: assignment.taskId,
      });
      appendAudit("assignments.updated", "tasks", { assignmentId: id, taskId: assignment.taskId });
      return assignment;
    },
    archive: async (id) => assignmentsApi.update(id, { archivedAt: nowIso(), status: "released" }),
    remove: async (id) => {
      const existing = assignmentsCollection.get(id);
      if (!existing) return false;
      assignmentsCollection.remove(id);
      removeIndex("assignments", id);
      if (existing.taskId) await reconcileTaskAssignmentState(existing.taskId);
      appendAudit("assignments.removed", "tasks", { assignmentId: id, taskId: existing.taskId });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["assignments"] }),
  };

  const handoffsApi: WorkspaceClawInstance["handoffs"] = {
    list: async (options = {}) => handoffsCollection.list()
      .filter((handoff) => !isArchived(handoff, options.includeArchived))
      .filter((handoff) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(handoff.status);
      })
      .filter((handoff) => !options.taskId || handoff.taskId === options.taskId)
      .filter((handoff) => !options.projectId || handoff.projectId === options.projectId)
      .filter((handoff) => !options.goalId || handoff.goalId === options.goalId)
      .filter((handoff) => !options.fromAgentId || handoff.fromAgentId === options.fromAgentId)
      .filter((handoff) => !options.toAgentId || handoff.toAgentId === options.toAgentId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => handoffsCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const handoff: HandoffRecord = {
        id: toId("handoff", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        status: input.status ?? "proposed",
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        fromAgentId: input.fromAgentId.trim(),
        toAgentId: input.toAgentId.trim(),
        ...(input.objective ? { objective: input.objective } : {}),
        ...(input.currentState ? { currentState: input.currentState } : {}),
        ...(input.contextSummary ? { contextSummary: input.contextSummary } : {}),
        ...(input.nextStep ? { nextStep: input.nextStep } : {}),
        ...(input.riskSummary ? { riskSummary: input.riskSummary } : {}),
        artifactIds: uniqueStrings(input.artifactIds ?? []),
        blockerIds: uniqueStrings(input.blockerIds ?? []),
        ...(input.approvalId ? { approvalId: input.approvalId } : {}),
        ...(input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}),
        ...(input.acceptedAt ? { acceptedAt: input.acceptedAt } : {}),
        ...(input.completedAt ? { completedAt: input.completedAt } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      if (handoff.status === "accepted" && !handoff.acceptedAt) handoff.acceptedAt = timestamp;
      if (handoff.status === "completed" && !handoff.completedAt) handoff.completedAt = timestamp;
      handoffsCollection.put(handoff.id, handoff);
      await syncHandoffIndex(handoff);
      if (handoff.taskId) await reconcileTaskHandoffState(handoff.taskId);
      await recordActivity({
        entityType: "handoff",
        entityId: handoff.id,
        kind: "created",
        title: `Handoff created: ${handoff.title}`,
        projectId: handoff.projectId,
        goalId: handoff.goalId,
        taskId: handoff.taskId,
      });
      appendAudit("handoffs.created", "tasks", { handoffId: handoff.id, taskId: handoff.taskId, toAgent: handoff.toAgentId });
      return handoff;
    },
    update: async (id, input) => {
      const current = assertRecord(handoffsCollection.get(id), "Handoff", id);
      const handoff: HandoffRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        fromAgentId: input.fromAgentId?.trim() || current.fromAgentId,
        toAgentId: input.toAgentId?.trim() || current.toAgentId,
        ...removeUndefined({
          taskId: input.taskId,
          projectId: input.projectId,
          goalId: input.goalId,
          objective: input.objective,
          currentState: input.currentState,
          contextSummary: input.contextSummary,
          nextStep: input.nextStep,
          riskSummary: input.riskSummary,
          approvalId: input.approvalId,
          rejectionReason: input.rejectionReason,
          acceptedAt: input.acceptedAt,
          completedAt: input.completedAt,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        artifactIds: input.artifactIds ? uniqueStrings(input.artifactIds) : current.artifactIds,
        blockerIds: input.blockerIds ? uniqueStrings(input.blockerIds) : current.blockerIds,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      if (handoff.status === "accepted" && !handoff.acceptedAt) handoff.acceptedAt = nowIso();
      if (handoff.status === "completed" && !handoff.completedAt) handoff.completedAt = nowIso();
      handoffsCollection.put(id, handoff);
      await syncHandoffIndex(handoff);
      if (current.taskId && current.taskId !== handoff.taskId) await reconcileTaskHandoffState(current.taskId);
      if (handoff.taskId) await reconcileTaskHandoffState(handoff.taskId);
      await recordActivity({
        entityType: "handoff",
        entityId: id,
        kind: input.archivedAt ? "archived" : handoff.status === "completed" && current.status !== "completed" ? "completed" : "updated",
        title: `Handoff ${input.archivedAt ? "archived" : "updated"}: ${handoff.title}`,
        projectId: handoff.projectId,
        goalId: handoff.goalId,
        taskId: handoff.taskId,
      });
      appendAudit("handoffs.updated", "tasks", { handoffId: id, taskId: handoff.taskId });
      return handoff;
    },
    archive: async (id) => handoffsApi.update(id, { archivedAt: nowIso(), status: "completed" }),
    remove: async (id) => {
      const existing = handoffsCollection.get(id);
      if (!existing) return false;
      handoffsCollection.remove(id);
      removeIndex("handoffs", id);
      if (existing.taskId) await reconcileTaskHandoffState(existing.taskId);
      appendAudit("handoffs.removed", "tasks", { handoffId: id, taskId: existing.taskId });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["handoffs"] }),
  };

  const approvalsApi: WorkspaceClawInstance["approvals"] = {
    list: async (options = {}) => approvalsCollection.list()
      .filter((approval) => !isArchived(approval, options.includeArchived))
      .filter((approval) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(approval.status);
      })
      .filter((approval) => {
        if (!options.kind) return true;
        const kinds = Array.isArray(options.kind) ? options.kind : [options.kind];
        return kinds.includes(approval.kind);
      })
      .filter((approval) => !options.taskId || approval.taskId === options.taskId)
      .filter((approval) => !options.projectId || approval.projectId === options.projectId)
      .filter((approval) => !options.goalId || approval.goalId === options.goalId)
      .filter((approval) => !options.handoffId || approval.handoffId === options.handoffId)
      .filter((approval) => !options.approverAgentId || approval.approverAgentId === options.approverAgentId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => approvalsCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const approval: ProductivityApprovalRecord = {
        id: toId("approval", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        status: input.status ?? "pending",
        kind: input.kind,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.handoffId ? { handoffId: input.handoffId } : {}),
        ...(input.requestedByAgentId ? { requestedByAgentId: input.requestedByAgentId } : {}),
        ...(input.approverAgentId ? { approverAgentId: input.approverAgentId } : {}),
        policyReason: input.policyReason.trim(),
        evidenceIds: uniqueStrings(input.evidenceIds ?? []),
        decisionIds: uniqueStrings(input.decisionIds ?? []),
        ...(input.approvedBy ? { approvedBy: input.approvedBy } : {}),
        ...(input.outcome ? { outcome: input.outcome } : {}),
        ...(input.approvedAt ? { approvedAt: input.approvedAt } : {}),
        ...(input.rejectedAt ? { rejectedAt: input.rejectedAt } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      if (approval.status === "approved" && !approval.approvedAt) approval.approvedAt = timestamp;
      if (approval.status === "rejected" && !approval.rejectedAt) approval.rejectedAt = timestamp;
      approvalsCollection.put(approval.id, approval);
      await syncApprovalIndex(approval);
      if (approval.taskId) await reconcileTaskApprovalState(approval.taskId);
      await recordActivity({
        entityType: "approval",
        entityId: approval.id,
        kind: "created",
        title: `Approval created: ${approval.title}`,
        projectId: approval.projectId,
        goalId: approval.goalId,
        taskId: approval.taskId,
      });
      appendAudit("approvals.created", "tasks", { approvalId: approval.id, taskId: approval.taskId, kind: approval.kind });
      return approval;
    },
    update: async (id, input) => {
      const current = assertRecord(approvalsCollection.get(id), "Approval", id);
      const approval: ProductivityApprovalRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        kind: input.kind ?? current.kind,
        policyReason: input.policyReason?.trim() || current.policyReason,
        ...removeUndefined({
          taskId: input.taskId,
          projectId: input.projectId,
          goalId: input.goalId,
          handoffId: input.handoffId,
          requestedByAgentId: input.requestedByAgentId,
          approverAgentId: input.approverAgentId,
          approvedBy: input.approvedBy,
          outcome: input.outcome,
          approvedAt: input.approvedAt,
          rejectedAt: input.rejectedAt,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        evidenceIds: input.evidenceIds ? uniqueStrings(input.evidenceIds) : current.evidenceIds,
        decisionIds: input.decisionIds ? uniqueStrings(input.decisionIds) : current.decisionIds,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      if (approval.status === "approved" && !approval.approvedAt) approval.approvedAt = nowIso();
      if (approval.status === "rejected" && !approval.rejectedAt) approval.rejectedAt = nowIso();
      approvalsCollection.put(id, approval);
      await syncApprovalIndex(approval);
      if (current.taskId && current.taskId !== approval.taskId) await reconcileTaskApprovalState(current.taskId);
      if (approval.taskId) await reconcileTaskApprovalState(approval.taskId);
      await recordActivity({
        entityType: "approval",
        entityId: id,
        kind: input.archivedAt ? "archived" : approval.status === "approved" && current.status !== "approved" ? "completed" : "updated",
        title: `Approval ${input.archivedAt ? "archived" : "updated"}: ${approval.title}`,
        projectId: approval.projectId,
        goalId: approval.goalId,
        taskId: approval.taskId,
      });
      appendAudit("approvals.updated", "tasks", { approvalId: id, taskId: approval.taskId });
      return approval;
    },
    archive: async (id) => approvalsApi.update(id, { archivedAt: nowIso(), status: "cancelled" }),
    remove: async (id) => {
      const existing = approvalsCollection.get(id);
      if (!existing) return false;
      approvalsCollection.remove(id);
      removeIndex("approvals", id);
      if (existing.taskId) await reconcileTaskApprovalState(existing.taskId);
      appendAudit("approvals.removed", "tasks", { approvalId: id, taskId: existing.taskId });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["approvals"] }),
  };

  const capacityApi: WorkspaceClawInstance["capacity"] = {
    list: async (options = {}) => {
      const stored = capacityCollection.list()
        .filter((snapshot) => !isArchived(snapshot, options.includeArchived));
      const tasks = await tasksApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER });
      const assignments = await assignmentsApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER });
      const handoffs = await handoffsApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER });
      const approvals = await approvalsApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER });
      const agentIds = new Set<string>([
        ...stored.map((snapshot) => snapshot.agentId),
        ...assignments.map((assignment) => assignment.assignedToAgentId),
        ...handoffs.flatMap((handoff) => [handoff.fromAgentId, handoff.toAgentId]),
        ...approvals.flatMap((approval) => [approval.requestedByAgentId, approval.approverAgentId]).filter(Boolean) as string[],
      ]);
      return [...agentIds]
        .map((agentId) => buildDerivedCapacitySnapshot({
          agentId,
          stored: stored.find((snapshot) => snapshot.agentId === agentId),
          assignments: assignments.filter((assignment) => assignment.assignedToAgentId === agentId),
          handoffs: handoffs.filter((handoff) => handoff.toAgentId === agentId || handoff.fromAgentId === agentId),
          approvals: approvals.filter((approval) => approval.approverAgentId === agentId || approval.requestedByAgentId === agentId),
          tasks,
        }))
        .filter((snapshot) => {
          if (options.status) {
            const statuses = Array.isArray(options.status) ? options.status : [options.status];
            if (!statuses.includes(snapshot.status)) return false;
          }
          if (options.availability) {
            const availabilities = Array.isArray(options.availability) ? options.availability : [options.availability];
            if (!availabilities.includes(snapshot.availability)) return false;
          }
          if (options.teamId && snapshot.teamId !== options.teamId) return false;
          if (options.agentId && snapshot.agentId !== options.agentId) return false;
          return true;
        })
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER);
    },
    get: async (id) => {
      const existing = capacityCollection.get(id);
      if (existing) return buildDerivedCapacitySnapshot({
        agentId: existing.agentId,
        stored: existing,
        assignments: await assignmentsApi.list({ includeArchived: false, assignedToAgentId: existing.agentId, limit: Number.MAX_SAFE_INTEGER }),
        handoffs: await handoffsApi.list({ includeArchived: false, toAgentId: existing.agentId, limit: Number.MAX_SAFE_INTEGER }),
        approvals: await approvalsApi.list({ includeArchived: false, approverAgentId: existing.agentId, limit: Number.MAX_SAFE_INTEGER }),
        tasks: await tasksApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER }),
      });
      return null;
    },
    create: async (input) => {
      const timestamp = nowIso();
      const snapshot: CapacityRecord = {
        id: toId("capacity", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source ?? { kind: "derived" }),
        title: input.title.trim(),
        status: input.status ?? "active",
        agentId: input.agentId.trim(),
        ...(input.teamId ? { teamId: input.teamId } : {}),
        ...(input.role ? { role: input.role } : {}),
        availability: input.availability ?? "available",
        ...(clampNonNegativeNumber(input.maxWip) !== undefined ? { maxWip: clampNonNegativeNumber(input.maxWip) } : {}),
        currentWip: clampNonNegativeNumber(input.currentWip) ?? 0,
        queueDepth: clampNonNegativeNumber(input.queueDepth) ?? 0,
        blockedCount: clampNonNegativeNumber(input.blockedCount) ?? 0,
        overdueCount: clampNonNegativeNumber(input.overdueCount) ?? 0,
        ...(clampNonNegativeNumber(input.responseLatencyMinutes) !== undefined ? { responseLatencyMinutes: clampNonNegativeNumber(input.responseLatencyMinutes) } : {}),
        ...(clampConfidence(input.utilization) !== undefined ? { utilization: clampConfidence(input.utilization) } : {}),
        assignedTaskIds: uniqueStrings(input.assignedTaskIds ?? []),
        pendingApprovalIds: uniqueStrings(input.pendingApprovalIds ?? []),
        pendingHandoffIds: uniqueStrings(input.pendingHandoffIds ?? []),
        ...(input.snapshotAt ? { snapshotAt: input.snapshotAt } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      capacityCollection.put(snapshot.id, snapshot);
      await syncCapacityIndex(snapshot);
      await recordActivity({
        entityType: "capacity",
        entityId: snapshot.id,
        kind: "created",
        title: `Capacity snapshot created: ${snapshot.title}`,
      });
      appendAudit("capacity.created", "tasks", { capacityId: snapshot.id, agentId: snapshot.agentId });
      return buildDerivedCapacitySnapshot({
        agentId: snapshot.agentId,
        stored: snapshot,
        assignments: await assignmentsApi.list({ includeArchived: false, assignedToAgentId: snapshot.agentId, limit: Number.MAX_SAFE_INTEGER }),
        handoffs: await handoffsApi.list({ includeArchived: false, toAgentId: snapshot.agentId, limit: Number.MAX_SAFE_INTEGER }),
        approvals: await approvalsApi.list({ includeArchived: false, approverAgentId: snapshot.agentId, limit: Number.MAX_SAFE_INTEGER }),
        tasks: await tasksApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER }),
      });
    },
    update: async (id, input) => {
      const current = assertRecord(capacityCollection.get(id), "Capacity snapshot", id);
      const snapshot: CapacityRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        agentId: input.agentId?.trim() || current.agentId,
        status: input.status ?? current.status,
        availability: input.availability ?? current.availability,
        currentWip: clampNonNegativeNumber(input.currentWip) ?? current.currentWip,
        queueDepth: clampNonNegativeNumber(input.queueDepth) ?? current.queueDepth,
        blockedCount: clampNonNegativeNumber(input.blockedCount) ?? current.blockedCount,
        overdueCount: clampNonNegativeNumber(input.overdueCount) ?? current.overdueCount,
        ...removeUndefined({
          teamId: input.teamId,
          role: input.role,
          maxWip: clampNonNegativeNumber(input.maxWip),
          responseLatencyMinutes: clampNonNegativeNumber(input.responseLatencyMinutes),
          utilization: clampConfidence(input.utilization),
          snapshotAt: input.snapshotAt,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        assignedTaskIds: input.assignedTaskIds ? uniqueStrings(input.assignedTaskIds) : current.assignedTaskIds,
        pendingApprovalIds: input.pendingApprovalIds ? uniqueStrings(input.pendingApprovalIds) : current.pendingApprovalIds,
        pendingHandoffIds: input.pendingHandoffIds ? uniqueStrings(input.pendingHandoffIds) : current.pendingHandoffIds,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      capacityCollection.put(id, snapshot);
      await syncCapacityIndex(snapshot);
      await recordActivity({
        entityType: "capacity",
        entityId: id,
        kind: input.archivedAt ? "archived" : "updated",
        title: `Capacity snapshot ${input.archivedAt ? "archived" : "updated"}: ${snapshot.title}`,
      });
      appendAudit("capacity.updated", "tasks", { capacityId: id, agentId: snapshot.agentId });
      return buildDerivedCapacitySnapshot({
        agentId: snapshot.agentId,
        stored: snapshot,
        assignments: await assignmentsApi.list({ includeArchived: false, assignedToAgentId: snapshot.agentId, limit: Number.MAX_SAFE_INTEGER }),
        handoffs: await handoffsApi.list({ includeArchived: false, toAgentId: snapshot.agentId, limit: Number.MAX_SAFE_INTEGER }),
        approvals: await approvalsApi.list({ includeArchived: false, approverAgentId: snapshot.agentId, limit: Number.MAX_SAFE_INTEGER }),
        tasks: await tasksApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER }),
      });
    },
    archive: async (id) => capacityApi.update(id, { archivedAt: nowIso(), status: "offline", availability: "offline" }),
    remove: async (id) => {
      const existing = capacityCollection.get(id);
      if (!existing) return false;
      capacityCollection.remove(id);
      removeIndex("capacity", id);
      appendAudit("capacity.removed", "tasks", { capacityId: id, agentId: existing.agentId });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["capacity"] }),
  };

  const agentsApi: WorkspaceClawInstance["agents"] = {
    list: async (options = {}) => agentsCollection.list()
      .filter((agent) => !isArchived(agent, options.includeArchived))
      .filter((agent) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(agent.status);
      })
      .filter((agent) => {
        if (!options.availability) return true;
        const values = Array.isArray(options.availability) ? options.availability : [options.availability];
        return values.includes(agent.availability);
      })
      .filter((agent) => !options.teamId || agent.teamId === options.teamId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => agentsCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const agent: AgentRecord = {
        id: toId("agent", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        name: input.name.trim(),
        status: input.status ?? "active",
        role: input.role.trim(),
        ...(input.teamId ? { teamId: input.teamId } : {}),
        domains: uniqueStrings(input.domains ?? []),
        ...(input.shift ? { shift: input.shift } : {}),
        availability: input.availability ?? "available",
        autonomyLevel: input.autonomyLevel ?? "suggest",
        permissions: uniqueStrings(input.permissions ?? []),
        policyGate: input.policyGate ?? "none",
        ...(input.currentFocus ? { currentFocus: input.currentFocus } : {}),
        linkedTaskIds: uniqueStrings(input.linkedTaskIds ?? []),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      agentsCollection.put(agent.id, agent);
      await syncAgentIndex(agent);
      await recordActivity({
        entityType: "agent",
        entityId: agent.id,
        kind: "created",
        title: `Agent created: ${agent.name}`,
      });
      appendAudit("agents.created", "tasks", { agentId: agent.id, status: agent.status });
      return agent;
    },
    update: async (id, input) => {
      const current = assertRecord(agentsCollection.get(id), "Agent", id);
      const agent: AgentRecord = {
        ...current,
        name: input.name?.trim() || current.name,
        role: input.role?.trim() || current.role,
        status: input.status ?? current.status,
        availability: input.availability ?? current.availability,
        autonomyLevel: input.autonomyLevel ?? current.autonomyLevel,
        policyGate: input.policyGate ?? current.policyGate,
        ...removeUndefined({
          teamId: input.teamId,
          shift: input.shift,
          currentFocus: input.currentFocus,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        domains: input.domains ? uniqueStrings(input.domains) : current.domains,
        permissions: input.permissions ? uniqueStrings(input.permissions) : current.permissions,
        linkedTaskIds: input.linkedTaskIds ? uniqueStrings(input.linkedTaskIds) : current.linkedTaskIds,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      agentsCollection.put(id, agent);
      await syncAgentIndex(agent);
      await recordActivity({
        entityType: "agent",
        entityId: id,
        kind: input.archivedAt ? "archived" : "updated",
        title: `Agent ${input.archivedAt ? "archived" : "updated"}: ${agent.name}`,
      });
      appendAudit("agents.updated", "tasks", { agentId: id, status: agent.status });
      return agent;
    },
    archive: async (id) => agentsApi.update(id, { archivedAt: nowIso(), status: "offline", availability: "offline" }),
    remove: async (id) => {
      const existing = agentsCollection.get(id);
      if (!existing) return false;
      agentsCollection.remove(id);
      removeIndex("agents", id);
      appendAudit("agents.removed", "tasks", { agentId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["agents"] }),
  };

  const releasesApi: WorkspaceClawInstance["releases"] = {
    list: async (options = {}) => releasesCollection.list()
      .filter((release) => !isArchived(release, options.includeArchived))
      .filter((release) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(release.status);
      })
      .filter((release) => !options.projectId || release.projectId === options.projectId)
      .filter((release) => !options.goalId || release.goalId === options.goalId)
      .filter((release) => !options.ownerAgentId || release.ownerAgentId === options.ownerAgentId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => releasesCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const release: ReleaseRecord = {
        id: toId("release", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        status: input.status ?? "planned",
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.ownerAgentId ? { ownerAgentId: input.ownerAgentId } : {}),
        ...(input.targetDate ? { targetDate: input.targetDate } : {}),
        ...(input.shippedAt ? { shippedAt: input.shippedAt } : {}),
        ...(input.riskSummary ? { riskSummary: input.riskSummary } : {}),
        linkedTaskIds: uniqueStrings(input.linkedTaskIds ?? []),
        incidentIds: uniqueStrings(input.incidentIds ?? []),
        approvalIds: uniqueStrings(input.approvalIds ?? []),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      releasesCollection.put(release.id, release);
      await syncReleaseIndex(release);
      await recordActivity({
        entityType: "release",
        entityId: release.id,
        kind: "created",
        title: `Release created: ${release.title}`,
        projectId: release.projectId,
        goalId: release.goalId,
      });
      appendAudit("releases.created", "tasks", { releaseId: release.id, status: release.status });
      return release;
    },
    update: async (id, input) => {
      const current = assertRecord(releasesCollection.get(id), "Release", id);
      const release: ReleaseRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        ...removeUndefined({
          projectId: input.projectId,
          goalId: input.goalId,
          ownerAgentId: input.ownerAgentId,
          targetDate: input.targetDate,
          shippedAt: input.shippedAt,
          riskSummary: input.riskSummary,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        linkedTaskIds: input.linkedTaskIds ? uniqueStrings(input.linkedTaskIds) : current.linkedTaskIds,
        incidentIds: input.incidentIds ? uniqueStrings(input.incidentIds) : current.incidentIds,
        approvalIds: input.approvalIds ? uniqueStrings(input.approvalIds) : current.approvalIds,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      releasesCollection.put(id, release);
      await syncReleaseIndex(release);
      await recordActivity({
        entityType: "release",
        entityId: id,
        kind: input.archivedAt ? "archived" : release.status === "released" && current.status !== "released" ? "completed" : "updated",
        title: `Release ${input.archivedAt ? "archived" : "updated"}: ${release.title}`,
        projectId: release.projectId,
        goalId: release.goalId,
      });
      appendAudit("releases.updated", "tasks", { releaseId: id, status: release.status });
      return release;
    },
    archive: async (id) => releasesApi.update(id, { archivedAt: nowIso(), status: "cancelled" }),
    remove: async (id) => {
      const existing = releasesCollection.get(id);
      if (!existing) return false;
      releasesCollection.remove(id);
      removeIndex("releases", id);
      appendAudit("releases.removed", "tasks", { releaseId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["releases"] }),
  };

  const incidentsApi: WorkspaceClawInstance["incidents"] = {
    list: async (options = {}) => incidentsCollection.list()
      .filter((incident) => !isArchived(incident, options.includeArchived))
      .filter((incident) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(incident.status);
      })
      .filter((incident) => {
        if (!options.severity) return true;
        const severities = Array.isArray(options.severity) ? options.severity : [options.severity];
        return severities.includes(incident.severity);
      })
      .filter((incident) => !options.projectId || incident.projectId === options.projectId)
      .filter((incident) => !options.releaseId || incident.releaseId === options.releaseId)
      .filter((incident) => !options.ownerAgentId || incident.ownerAgentId === options.ownerAgentId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => incidentsCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const incident: IncidentRecord = {
        id: toId("incident", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        status: input.status ?? "open",
        severity: input.severity,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.releaseId ? { releaseId: input.releaseId } : {}),
        ...(input.ownerAgentId ? { ownerAgentId: input.ownerAgentId } : {}),
        ...(input.summary ? { summary: input.summary } : {}),
        ...(input.customerImpact ? { customerImpact: input.customerImpact } : {}),
        blockerIds: uniqueStrings(input.blockerIds ?? []),
        feedbackIds: uniqueStrings(input.feedbackIds ?? []),
        ...(input.startedAt ? { startedAt: input.startedAt } : {}),
        ...(input.resolvedAt ? { resolvedAt: input.resolvedAt } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      incidentsCollection.put(incident.id, incident);
      await syncIncidentIndex(incident);
      await recordActivity({
        entityType: "incident",
        entityId: incident.id,
        kind: "created",
        title: `Incident created: ${incident.title}`,
        projectId: incident.projectId,
        goalId: incident.goalId,
        taskId: incident.taskId,
      });
      appendAudit("incidents.created", "tasks", { incidentId: incident.id, severity: incident.severity });
      return incident;
    },
    update: async (id, input) => {
      const current = assertRecord(incidentsCollection.get(id), "Incident", id);
      const incident: IncidentRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        severity: input.severity ?? current.severity,
        ...removeUndefined({
          projectId: input.projectId,
          goalId: input.goalId,
          taskId: input.taskId,
          releaseId: input.releaseId,
          ownerAgentId: input.ownerAgentId,
          summary: input.summary,
          customerImpact: input.customerImpact,
          startedAt: input.startedAt,
          resolvedAt: input.resolvedAt,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        blockerIds: input.blockerIds ? uniqueStrings(input.blockerIds) : current.blockerIds,
        feedbackIds: input.feedbackIds ? uniqueStrings(input.feedbackIds) : current.feedbackIds,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      if ((incident.status === "resolved" || incident.status === "closed") && !incident.resolvedAt) incident.resolvedAt = nowIso();
      incidentsCollection.put(id, incident);
      await syncIncidentIndex(incident);
      await recordActivity({
        entityType: "incident",
        entityId: id,
        kind: input.archivedAt ? "archived" : incident.status === "resolved" && current.status !== "resolved" ? "completed" : "updated",
        title: `Incident ${input.archivedAt ? "archived" : "updated"}: ${incident.title}`,
        projectId: incident.projectId,
        goalId: incident.goalId,
        taskId: incident.taskId,
      });
      appendAudit("incidents.updated", "tasks", { incidentId: id, status: incident.status });
      return incident;
    },
    archive: async (id) => incidentsApi.update(id, { archivedAt: nowIso(), status: "closed" }),
    remove: async (id) => {
      const existing = incidentsCollection.get(id);
      if (!existing) return false;
      incidentsCollection.remove(id);
      removeIndex("incidents", id);
      appendAudit("incidents.removed", "tasks", { incidentId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["incidents"] }),
  };

  const feedbackApi: WorkspaceClawInstance["feedback"] = {
    list: async (options = {}) => feedbackCollection.list()
      .filter((item) => !isArchived(item, options.includeArchived))
      .filter((item) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(item.status);
      })
      .filter((item) => {
        if (!options.origin) return true;
        const values = Array.isArray(options.origin) ? options.origin : [options.origin];
        return values.includes(item.origin);
      })
      .filter((item) => {
        if (!options.priority) return true;
        const values = Array.isArray(options.priority) ? options.priority : [options.priority];
        return values.includes(item.priority);
      })
      .filter((item) => !options.projectId || item.projectId === options.projectId)
      .filter((item) => !options.incidentId || item.incidentId === options.incidentId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => feedbackCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const item: FeedbackRecord = {
        id: toId("feedback", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.sourceMeta),
        title: input.title.trim(),
        status: input.status ?? "new",
        origin: input.origin,
        priority: input.priority ?? "medium",
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.incidentId ? { incidentId: input.incidentId } : {}),
        ...(input.ownerAgentId ? { ownerAgentId: input.ownerAgentId } : {}),
        ...(input.summary ? { summary: input.summary } : {}),
        ...(input.followUpTaskId ? { followUpTaskId: input.followUpTaskId } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      feedbackCollection.put(item.id, item);
      await syncFeedbackIndex(item);
      await recordActivity({
        entityType: "feedback_item",
        entityId: item.id,
        kind: "created",
        title: `Feedback captured: ${item.title}`,
        projectId: item.projectId,
        goalId: item.goalId,
        taskId: item.taskId,
      });
      appendAudit("feedback.created", "tasks", { feedbackId: item.id, origin: item.origin });
      return item;
    },
    update: async (id, input) => {
      const current = assertRecord(feedbackCollection.get(id), "Feedback item", id);
      const item: FeedbackRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        origin: input.origin ?? current.origin,
        priority: input.priority ?? current.priority,
        ...removeUndefined({
          projectId: input.projectId,
          goalId: input.goalId,
          taskId: input.taskId,
          incidentId: input.incidentId,
          ownerAgentId: input.ownerAgentId,
          summary: input.summary,
          followUpTaskId: input.followUpTaskId,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      feedbackCollection.put(id, item);
      await syncFeedbackIndex(item);
      await recordActivity({
        entityType: "feedback_item",
        entityId: id,
        kind: input.archivedAt ? "archived" : "updated",
        title: `Feedback ${input.archivedAt ? "archived" : "updated"}: ${item.title}`,
        projectId: item.projectId,
        goalId: item.goalId,
        taskId: item.taskId,
      });
      appendAudit("feedback.updated", "tasks", { feedbackId: id, status: item.status });
      return item;
    },
    archive: async (id) => feedbackApi.update(id, { archivedAt: nowIso(), status: "closed" }),
    remove: async (id) => {
      const existing = feedbackCollection.get(id);
      if (!existing) return false;
      feedbackCollection.remove(id);
      removeIndex("feedback", id);
      appendAudit("feedback.removed", "tasks", { feedbackId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["feedback"] }),
  };

  const checksApi: WorkspaceClawInstance["checks"] = {
    list: async (options = {}) => checksCollection.list()
      .filter((check) => !isArchived(check, options.includeArchived))
      .filter((check) => {
        if (!options.status) return true;
        const values = Array.isArray(options.status) ? options.status : [options.status];
        return values.includes(check.status);
      })
      .filter((check) => {
        if (!options.kind) return true;
        const values = Array.isArray(options.kind) ? options.kind : [options.kind];
        return values.includes(check.kind);
      })
      .filter((check) => !options.releaseId || check.releaseId === options.releaseId)
      .filter((check) => !options.incidentId || check.incidentId === options.incidentId)
      .filter((check) => !options.ownerAgentId || check.ownerAgentId === options.ownerAgentId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => checksCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const check: OperationalCheckRecord = {
        id: toId("check", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        status: input.status ?? "pending",
        kind: input.kind,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.releaseId ? { releaseId: input.releaseId } : {}),
        ...(input.incidentId ? { incidentId: input.incidentId } : {}),
        ...(input.ownerAgentId ? { ownerAgentId: input.ownerAgentId } : {}),
        ...(input.cadence ? { cadence: input.cadence } : {}),
        ...(input.lastRunAt ? { lastRunAt: input.lastRunAt } : {}),
        ...(input.nextRunAt ? { nextRunAt: input.nextRunAt } : {}),
        ...(input.resultSummary ? { resultSummary: input.resultSummary } : {}),
        ...(input.playbook ? { playbook: input.playbook } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      checksCollection.put(check.id, check);
      await syncCheckIndex(check);
      await recordActivity({
        entityType: "operational_check",
        entityId: check.id,
        kind: "created",
        title: `Check created: ${check.title}`,
        projectId: check.projectId,
        goalId: check.goalId,
      });
      appendAudit("checks.created", "tasks", { checkId: check.id, kind: check.kind });
      return check;
    },
    update: async (id, input) => {
      const current = assertRecord(checksCollection.get(id), "Operational check", id);
      const check: OperationalCheckRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        kind: input.kind ?? current.kind,
        ...removeUndefined({
          projectId: input.projectId,
          goalId: input.goalId,
          releaseId: input.releaseId,
          incidentId: input.incidentId,
          ownerAgentId: input.ownerAgentId,
          cadence: input.cadence,
          lastRunAt: input.lastRunAt,
          nextRunAt: input.nextRunAt,
          resultSummary: input.resultSummary,
          playbook: input.playbook,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      checksCollection.put(id, check);
      await syncCheckIndex(check);
      await recordActivity({
        entityType: "operational_check",
        entityId: id,
        kind: input.archivedAt ? "archived" : check.status === "passing" && current.status !== "passing" ? "completed" : "updated",
        title: `Check ${input.archivedAt ? "archived" : "updated"}: ${check.title}`,
        projectId: check.projectId,
        goalId: check.goalId,
      });
      appendAudit("checks.updated", "tasks", { checkId: id, status: check.status });
      return check;
    },
    archive: async (id) => checksApi.update(id, { archivedAt: nowIso(), status: "snoozed" }),
    remove: async (id) => {
      const existing = checksCollection.get(id);
      if (!existing) return false;
      checksCollection.remove(id);
      removeIndex("checks", id);
      appendAudit("checks.removed", "tasks", { checkId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["checks"] }),
  };

  const remindersApi: WorkspaceClawInstance["reminders"] = {
    list: async (options = {}) => useTimeService
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
      if (useTimeService) {
        const payload = await claw.time.get(id).catch(() => null);
        return payload ? temporalToReminderRecord(payload.item) : null;
      }
      return remindersCollection.get(id);
    },
    create: async (input) => {
      if (useTimeService) {
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
      if (useTimeService) {
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
    after: async (input) => claw.reminders.after(input),
    pause: async (id) => remindersApi.update(id, { status: "paused" }),
    resume: async (id) => remindersApi.update(id, { status: "active" }),
    archive: async (id) => remindersApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      if (useTimeService) {
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
    list: async (options = {}) => useTimeService
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
      if (useTimeService) {
        const payload = await claw.time.get(id).catch(() => null);
        return payload ? temporalToDeadlineRecord(payload.item) : null;
      }
      return deadlinesCollection.get(id);
    },
    create: async (input) => {
      if (useTimeService) {
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
      if (useTimeService) {
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
      if (useTimeService) {
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
    process: async (threadId, input) => {
      const thread = assertRecord(inboxThreadsCollection.get(threadId), "Inbox thread", threadId);
      const view = await inboxApi.readThread(threadId);
      const subject = thread.subject || thread.preview || thread.id;
      const task = input.taskTitle
        ? await tasksApi.create({
            title: input.taskTitle,
            description: `Inbox thread: ${subject}`,
            areaId: input.areaId,
            projectId: input.projectId,
            goalId: input.goalId,
          })
        : undefined;
      const note = input.noteTitle
        ? await notesApi.create({
            title: input.noteTitle,
            content: view?.messages.map((message) => `${message.direction}: ${message.content}`).join("\n") || thread.preview || "",
            linkedEntityIds: uniqueStrings([task?.id]),
          })
        : undefined;
      const reminder = input.reminderTitle && input.reminderAt
        ? await remindersApi.create({
            title: input.reminderTitle,
            triggerAt: input.reminderAt,
            anchorType: "thread",
            anchorId: threadId,
          })
        : undefined;
      const updatedThread: InboxThreadRecord = {
        ...thread,
        linkedTaskIds: uniqueStrings([...(thread.linkedTaskIds ?? []), task?.id]),
        linkedNoteIds: uniqueStrings([...(thread.linkedNoteIds ?? []), note?.id]),
        updatedAt: nowIso(),
      };
      inboxThreadsCollection.put(threadId, updatedThread);
      await syncInboxThreadIndex(threadId);
      await recordActivity({
        entityType: "inbox_thread",
        entityId: threadId,
        kind: "processed",
        title: `Inbox processed: ${subject}`,
        areaId: input.areaId,
        projectId: input.projectId,
        goalId: input.goalId,
        taskId: task?.id,
        threadId,
      });
      appendAudit("inbox.processed", "inbox", { threadId, taskId: task?.id, noteId: note?.id, reminderId: reminder?.id });
      return { thread: updatedThread, ...(task ? { task } : {}), ...(note ? { note } : {}), ...(reminder ? { reminder } : {}) };
    },
  };

  const eventsApi: WorkspaceClawInstance["events"] = {
    list: async (options = {}) => useTimeService
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
      if (useTimeService) {
        const payload = await claw.time.get(id).catch(() => null);
        return payload ? temporalToEventRecord(payload.item) : null;
      }
      return eventsCollection.get(id);
    },
    create: async (input) => {
      if (useTimeService) {
        const eventId = toId("event", input.id);
        const created = await claw.time.create({
          id: eventId,
          kind: "event",
          title: input.title,
          description: input.description,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          location: input.location,
          participants: (input.attendeePersonIds ?? []).map((personId) => ({ kind: "human", label: personId, personId })),
          actions: (input.reminders ?? []).map((reminder) => ({ kind: "notify", target: reminder.channel, id: reminder.id })),
          projections: [{
            id: `${eventId}-workspace-events`,
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
      if (useTimeService) {
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
      if (useTimeService) {
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
    search: async (query, options = {}) => useTimeService
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

  const { agendaApi, reviewApi, productivityApi } = createWorkspaceProductivityFacades({ nowIso, isOverdue, toTimestamp, timelineOverlaps, minIso, maxIso, temporalToEventRecord, temporalStatusToProductivityStatus, data, workspaceDir, readMeta, writeMeta, rebuildIndexes, PRODUCTIVITY_SCHEMA_VERSION, PRODUCTIVITY_SCHEMA_HASH, areasCollection, listsCollection, sectionsCollection, tasksCollection, goalsCollection, projectsCollection, commentsCollection, attachmentsCollection, savedViewsCollection, recurrencesCollection, cyclesCollection, epicsCollection, customFieldsCollection, fieldValuesCollection, templatesCollection, milestonesCollection, activityCollection, blockersCollection, artifactsCollection, decisionsCollection, workSessionsCollection, assignmentsCollection, handoffsCollection, approvalsCollection, capacityCollection, agentsCollection, releasesCollection, incidentsCollection, feedbackCollection, checksCollection, notesCollection, peopleCollection, inboxThreadsCollection, inboxMessagesCollection, eventsCollection, remindersCollection, deadlinesCollection, indexCollection, embeddingCollection, workSessionsApi, tasksApi, eventsApi, remindersApi, deadlinesApi, inboxApi, blockersApi, decisionsApi, assignmentsApi, handoffsApi, approvalsApi, capacityApi, agentsApi, releasesApi, incidentsApi, feedbackApi, checksApi, projectsApi, milestonesApi, goalsApi, areasApi, activityApi, notesApi, peopleApi, artifactsApi, useTimeService, claw });

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

  const { contextApi, uiApi } = createWorkspaceUiSessionFacades({ buildContext, TOOL_DESCRIPTORS, SURFACES, nowIso, inboxApi, tasksApi, blockersApi, decisionsApi, assignmentsApi, handoffsApi, approvalsApi, capacityApi, agentsApi, releasesApi, incidentsApi, feedbackApi, checksApi, eventsApi, claw, DEFAULT_CONTEXT_LIMIT });

  await migrateProductivitySchema();
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
    areas: areasApi,
    lists: listsApi,
    sections: sectionsApi,
    tasks: tasksApi,
    goals: goalsApi,
    projects: projectsApi,
    comments: commentsApi,
    attachments: attachmentsApi,
    savedViews: savedViewsApi,
    recurrences: recurrencesApi,
    cycles: cyclesApi,
    epics: epicsApi,
    customFields: customFieldsApi,
    fieldValues: fieldValuesApi,
    templates: templatesApi,
    milestones: milestonesApi,
    activity: activityApi,
    blockers: blockersApi,
    artifacts: artifactsApi,
    decisions: decisionsApi,
    workSessions: workSessionsApi,
    assignments: assignmentsApi,
    handoffs: handoffsApi,
    approvals: approvalsApi,
    capacity: capacityApi,
    agents: agentsApi,
    releases: releasesApi,
    incidents: incidentsApi,
    feedback: feedbackApi,
    checks: checksApi,
    reminders: remindersApi,
    deadlines: deadlinesApi,
    notes: notesApi,
    people: peopleApi,
    inbox: inboxApi,
    events: eventsApi,
    search: {
      query: async (input) => searchWorkspace(input),
    },
    context: {
      ...claw.context,
      ...contextApi,
    },
    ui: uiApi,
    workspaceIndex: {
      rebuild: async () => rebuildIndexes(),
    },
    agenda: agendaApi,
    review: reviewApi,
    productivity: productivityApi,
  };
}

export async function createWorkspaceClaw(options: CreateWorkspaceClawOptions): Promise<WorkspaceClawInstance> {
  const { productivity, ...baseOptions } = options;
  const claw = await createClaw(baseOptions);
  return createWorkspaceExtension(claw, options.workspace.rootDir, {
    ...productivity,
    useTimeService: claw.time.configured,
  });
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
