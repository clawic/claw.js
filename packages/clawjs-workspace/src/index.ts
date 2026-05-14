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
import { createWorkspaceIndexing } from "./workspace-indexing.ts";
import { createWorkspaceHumanActivityFacades } from "./workspace-human-activity-facades.ts";
import { createWorkspaceCoreProductivityFacades } from "./workspace-core-productivity-facades.ts";
import { createWorkspaceContextBuilder } from "./workspace-context-builder.ts";
import { createWorkspaceWorkSessionFacade } from "./workspace-work-session-facade.ts";
import { createWorkspaceInstance } from "./workspace-instance.ts";
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

  const {
    recordActivity,
    createSimpleApi,
    readInboxMessagesForThread,
    syncAreaIndex,
    syncTaskIndex,
    syncGoalIndex,
    syncProjectIndex,
    syncMilestoneIndex,
    syncActivityIndex,
    syncBlockerIndex,
    syncArtifactIndex,
    syncDecisionIndex,
    syncWorkSessionIndex,
    syncAssignmentIndex,
    syncHandoffIndex,
    syncApprovalIndex,
    syncCapacityIndex,
    syncAgentIndex,
    syncReleaseIndex,
    syncIncidentIndex,
    syncFeedbackIndex,
    syncCheckIndex,
    syncReminderIndex,
    syncDeadlineIndex,
    syncNoteIndex,
    syncPersonIndex,
    syncEventIndex,
    syncInboxThreadIndex,
    migrateProductivitySchema,
    rebuildIndexes,
    migrateTemporalCollectionsToTime,
    searchWorkspace,
    removeIndex,
    removeEmbedding,
  } = createWorkspaceIndexing({
    claw,
    options,
    useTimeService,
    appendAudit,
    readMeta,
    writeMeta,
    PRODUCTIVITY_SCHEMA_VERSION,
    PRODUCTIVITY_SCHEMA_HASH,
    areasCollection,
    listsCollection,
    sectionsCollection,
    tasksCollection,
    goalsCollection,
    projectsCollection,
    commentsCollection,
    attachmentsCollection,
    savedViewsCollection,
    recurrencesCollection,
    cyclesCollection,
    epicsCollection,
    customFieldsCollection,
    fieldValuesCollection,
    templatesCollection,
    milestonesCollection,
    activityCollection,
    blockersCollection,
    artifactsCollection,
    decisionsCollection,
    workSessionsCollection,
    assignmentsCollection,
    handoffsCollection,
    approvalsCollection,
    capacityCollection,
    agentsCollection,
    releasesCollection,
    incidentsCollection,
    feedbackCollection,
    checksCollection,
    remindersCollection,
    deadlinesCollection,
    notesCollection,
    peopleCollection,
    inboxThreadsCollection,
    inboxMessagesCollection,
    eventsCollection,
    workspaceMetaCollection,
    indexCollection,
    embeddingCollection,
  });

  const {
    areasApi,
    listsApi,
    sectionsApi,
    commentsApi,
    attachmentsApi,
    savedViewsApi,
    recurrencesApi,
    cyclesApi,
    epicsApi,
    customFieldsApi,
    fieldValuesApi,
    templatesApi,
    tasksApi,
    goalsApi,
    projectsApi,
    milestonesApi,
    activityApi,
    blockersApi,
    artifactsApi,
    decisionsApi,
    syncLinkedTask,
    reconcileTaskBlockState,
    reconcileTaskAssignmentState,
    reconcileTaskHandoffState,
    reconcileTaskApprovalState,
  } = createWorkspaceCoreProductivityFacades({
    claw,
    useTimeService,
    appendAudit,
    createSimpleApi,
    recordActivity,
    searchWorkspace,
    removeIndex,
    areasCollection,
    listsCollection,
    sectionsCollection,
    tasksCollection,
    goalsCollection,
    projectsCollection,
    commentsCollection,
    attachmentsCollection,
    savedViewsCollection,
    recurrencesCollection,
    cyclesCollection,
    epicsCollection,
    customFieldsCollection,
    fieldValuesCollection,
    templatesCollection,
    milestonesCollection,
    activityCollection,
    blockersCollection,
    artifactsCollection,
    decisionsCollection,
    assignmentsCollection,
    handoffsCollection,
    approvalsCollection,
    remindersCollection,
    syncAreaIndex,
    syncTaskIndex,
    syncGoalIndex,
    syncProjectIndex,
    syncMilestoneIndex,
    syncActivityIndex,
    syncBlockerIndex,
    syncArtifactIndex,
    syncDecisionIndex,
  });

  const { workSessions: workSessionsApi } = createWorkspaceWorkSessionFacade({
    appendAudit,
    workSessionsCollection,
    syncWorkSessionIndex,
    recordActivity,
    removeIndex,
    searchWorkspace,
  });

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

  const {
    notes: notesApi,
    people: peopleApi,
    inbox: inboxApi,
    events: eventsApi,
  } = createWorkspaceHumanActivityFacades({
    claw,
    useTimeService,
    appendAudit,
    notesCollection,
    peopleCollection,
    inboxThreadsCollection,
    inboxMessagesCollection,
    eventsCollection,
    tasksApi,
    remindersApi,
    syncNoteIndex,
    syncPersonIndex,
    syncInboxThreadIndex,
    syncEventIndex,
    readInboxMessagesForThread,
    searchWorkspace,
    recordActivity,
    removeIndex,
    removeEmbedding,
  });

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

  const buildContext = createWorkspaceContextBuilder({
    claw,
    appendAudit,
    DEFAULT_CONTEXT_LIMIT,
    inboxThreadsCollection,
    searchWorkspace,
    areasApi,
    tasksApi,
    goalsApi,
    projectsApi,
    milestonesApi,
    blockersApi,
    artifactsApi,
    decisionsApi,
    workSessionsApi,
    assignmentsApi,
    handoffsApi,
    approvalsApi,
    capacityApi,
    remindersApi,
    deadlinesApi,
    notesApi,
    inboxApi,
    eventsApi,
    peopleApi,
  });

  const { contextApi, uiApi } = createWorkspaceUiSessionFacades({ buildContext, TOOL_DESCRIPTORS, SURFACES, nowIso, inboxApi, tasksApi, blockersApi, decisionsApi, assignmentsApi, handoffsApi, approvalsApi, capacityApi, agentsApi, releasesApi, incidentsApi, feedbackApi, checksApi, eventsApi, claw, DEFAULT_CONTEXT_LIMIT });

  await migrateProductivitySchema();
  await migrateTemporalCollectionsToTime();

  return createWorkspaceInstance({
    claw,
    TOOL_DESCRIPTORS,
    contextApi,
    uiApi,
    searchWorkspace,
    rebuildIndexes,
    agendaApi,
    reviewApi,
    productivityApi,
    areasApi, listsApi, sectionsApi, tasksApi, goalsApi, projectsApi,
    commentsApi, attachmentsApi, savedViewsApi, recurrencesApi, cyclesApi, epicsApi,
    customFieldsApi, fieldValuesApi, templatesApi, milestonesApi, activityApi,
    blockersApi, artifactsApi, decisionsApi, workSessionsApi, assignmentsApi, handoffsApi,
    approvalsApi, capacityApi, agentsApi, releasesApi, incidentsApi, feedbackApi, checksApi,
    remindersApi, deadlinesApi, notesApi, peopleApi, inboxApi, eventsApi,
    DEFAULT_CONTEXT_LIMIT,
  });
}

export async function createWorkspaceClaw(options: CreateWorkspaceClawOptions): Promise<WorkspaceClawInstance> {
  const { productivity, ...baseOptions } = options;
  const claw = await createClaw(baseOptions);
  return createWorkspaceExtension(claw, options.workspace.rootDir, { ...productivity, useTimeService: claw.time.configured });
}

export async function extendClawWithWorkspace(claw: ClawInstance, options: { workspaceDir: string; productivity?: WorkspaceExtensionOptions }): Promise<WorkspaceClawInstance> {
  return createWorkspaceExtension(claw, options.workspaceDir, options.productivity);
}

export interface WorkspaceClawFactory {
  (options: CreateWorkspaceClawOptions): Promise<WorkspaceClawInstance>;
  create: (options: CreateWorkspaceClawOptions) => Promise<WorkspaceClawInstance>;
  extend: typeof extendClawWithWorkspace;
}

export const WorkspaceClaw: WorkspaceClawFactory = Object.assign(async (options: CreateWorkspaceClawOptions) => createWorkspaceClaw(options), {
  create: async (options: CreateWorkspaceClawOptions) => createWorkspaceClaw(options),
  extend: extendClawWithWorkspace,
});

export { Claw };
