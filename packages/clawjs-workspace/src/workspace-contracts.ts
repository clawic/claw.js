import type {
  Claw,
  type ClawInstance,
  type CreateClawOptions,
} from "@clawjs/claw";
import type {
  ActivityEntryRecord,
  AgentRecord,
  AssignmentRecord,
  ArtifactRecord,
  AreaRecord,
  AttachmentRecord,
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
  WorkspaceSearchQuery,
  WorkspaceSearchResult,
  WorkspaceSearchStrategy,
  WorkspaceSurfaceDescriptor,
  WorkspaceToolDescriptor,
} from "@clawjs/core";

export type WorkspaceEntityRecord =
  | AreaRecord
  | ListRecord
  | SectionRecord
  | TaskRecord
  | GoalRecord
  | ProjectRecord
  | CommentRecord
  | AttachmentRecord
  | SavedViewRecord
  | RecurrenceRecord
  | CycleRecord
  | EpicRecord
  | CustomFieldRecord
  | FieldValueRecord
  | TemplateRecord
  | MilestoneRecord
  | ActivityEntryRecord
  | BlockerRecord
  | ArtifactRecord
  | DecisionRecord
  | WorkSessionRecord
  | AssignmentRecord
  | HandoffRecord
  | ProductivityApprovalRecord
  | CapacityRecord
  | AgentRecord
  | ReleaseRecord
  | IncidentRecord
  | FeedbackRecord
  | OperationalCheckRecord
  | ReminderRecord
  | DeadlineRecord
  | NoteRecord
  | PersonRecord
  | InboxThreadRecord
  | EventRecord;

export interface WorkspaceIndexRecord {
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
export interface WorkspaceEmbeddingRecord {
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
  useTimeService?: boolean;
}

export interface CreateWorkspaceClawOptions extends CreateClawOptions {
  productivity?: WorkspaceExtensionOptions;
}

export interface WorkspaceCollectionApi<TRecord, TCreate, TUpdate> {
  list: (options?: {
    includeArchived?: boolean;
    status?: string | string[];
    kind?: string | string[];
    entityType?: string;
    entityId?: string;
    projectId?: string;
    goalId?: string;
    areaId?: string;
    listId?: string;
    anchorId?: string;
    limit?: number;
  }) => Promise<TRecord[]>;
  get: (id: string) => Promise<TRecord | null>;
  create: (input: TCreate) => Promise<TRecord>;
  update: (id: string, input: TUpdate) => Promise<TRecord>;
  archive: (id: string) => Promise<TRecord>;
  remove: (id: string) => Promise<boolean>;
  search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
}

export interface CreateTaskInput {
  id?: string;
  title: string;
  description?: string;
  status?: TaskRecord["status"];
  type?: TaskRecord["type"];
  priority?: TaskRecord["priority"];
  rank?: number;
  labels?: string[];
  areaId?: string;
  listId?: string;
  sectionId?: string;
  assigneePersonId?: string;
  reporterPersonId?: string;
  watcherPersonIds?: string[];
  startAt?: string;
  deferUntil?: string;
  dueAt?: string;
  deadlineAt?: string;
  snoozedUntil?: string;
  recurrenceRule?: string;
  estimateMinutes?: number;
  actualMinutes?: number;
  storyPoints?: number;
  blockedReason?: string;
  waitingOn?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  scheduledEventId?: string;
  eventId?: string;
  projectId?: string;
  goalId?: string;
  cycleId?: string;
  epicId?: string;
  parentTaskId?: string;
  childTaskIds?: string[];
  dependsOnTaskIds?: string[];
  commentIds?: string[];
  attachmentIds?: string[];
  createdBy?: string;
  updatedBy?: string;
  assignedToAgentId?: string;
  assignedBy?: string;
  delegatedBy?: string;
  reviewerAgentId?: string;
  blockedByIds?: string[];
  evidenceIds?: string[];
  decisionIds?: string[];
  assignmentIds?: string[];
  handoffIds?: string[];
  approvalIds?: string[];
  sourceItemId?: string;
  confidence?: number;
  handoffTo?: string;
  approvedBy?: string;
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

export interface CreateAreaInput {
  id?: string;
  name: string;
  description?: string;
  status?: AreaRecord["status"];
  color?: string;
  ownerPersonId?: string;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateAreaInput extends Partial<Omit<CreateAreaInput, "id" | "name">> {
  name?: string;
  archivedAt?: string | null;
}

export interface CreateGoalInput {
  id?: string;
  title: string;
  description?: string;
  status?: GoalRecord["status"];
  level?: GoalRecord["level"];
  areaId?: string;
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
  timeframeStart?: string;
  timeframeEnd?: string;
  reviewCadence?: GoalRecord["reviewCadence"];
  metricDirection?: GoalRecord["metricDirection"];
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
  areaId?: string;
  goalId?: string;
  ownerPersonId?: string;
  leadAgentId?: string;
  companyId?: string;
  portfolioId?: string;
  portfolioItemId?: string;
  color?: string;
  kind?: ProjectRecord["kind"];
  rank?: number;
  statusCategory?: ProjectRecord["statusCategory"];
  healthStatus?: ProjectRecord["healthStatus"];
  startAt?: string;
  startDate?: string;
  targetDate?: string;
  deadlineAt?: string;
  milestoneIds?: string[];
  defaultSectionIds?: string[];
  templateId?: string;
  reviewAt?: string;
  reviewCadence?: ProjectRecord["reviewCadence"];
  archiveReason?: string;
  completedAt?: string;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectInput extends Partial<Omit<CreateProjectInput, "id" | "name">> {
  name?: string;
  archivedAt?: string | null;
}

export interface CreateListInput {
  id?: string;
  title: string;
  kind?: ListRecord["kind"];
  status?: ListRecord["status"];
  description?: string;
  areaId?: string;
  projectId?: string;
  rank?: number;
  filter?: Record<string, unknown>;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateListInput extends Partial<Omit<CreateListInput, "id" | "title">> {
  title?: string;
  archivedAt?: string | null;
}

export interface CreateSectionInput {
  id?: string;
  title: string;
  status?: SectionRecord["status"];
  description?: string;
  listId?: string;
  projectId?: string;
  areaId?: string;
  rank?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateSectionInput extends Partial<Omit<CreateSectionInput, "id" | "title">> {
  title?: string;
  archivedAt?: string | null;
}

export interface CreateCommentInput {
  id?: string;
  entityType: CommentRecord["entityType"];
  entityId: string;
  body: string;
  authorPersonId?: string;
  authorAgentId?: string;
  visibility?: CommentRecord["visibility"];
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateCommentInput extends Partial<Omit<CreateCommentInput, "id" | "entityType" | "entityId" | "body">> {
  entityType?: CommentRecord["entityType"];
  entityId?: string;
  body?: string;
  archivedAt?: string | null;
}

export interface CreateAttachmentInput {
  id?: string;
  title: string;
  entityType: AttachmentRecord["entityType"];
  entityId: string;
  name?: string;
  mimeType?: string;
  uri?: string;
  path?: string;
  sizeBytes?: number;
  preview?: string;
  uploadedBy?: string;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateAttachmentInput extends Partial<Omit<CreateAttachmentInput, "id" | "title" | "entityType" | "entityId">> {
  title?: string;
  entityType?: AttachmentRecord["entityType"];
  entityId?: string;
  archivedAt?: string | null;
}

export interface CreateSavedViewInput {
  id?: string;
  name: string;
  domain: SavedViewRecord["domain"];
  query?: string;
  filters?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  groupBy?: string;
  favorite?: boolean;
  rank?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateSavedViewInput extends Partial<Omit<CreateSavedViewInput, "id" | "name" | "domain">> {
  name?: string;
  domain?: SavedViewRecord["domain"];
  archivedAt?: string | null;
}

export interface CreateRecurrenceInput {
  id?: string;
  title: string;
  status?: RecurrenceRecord["status"];
  rule: string;
  timezone?: string;
  anchorType?: RecurrenceRecord["anchorType"];
  anchorId?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateRecurrenceInput extends Partial<Omit<CreateRecurrenceInput, "id" | "title" | "rule">> {
  title?: string;
  rule?: string;
  archivedAt?: string | null;
}

export interface CreateCycleInput {
  id?: string;
  name: string;
  status?: CycleRecord["status"];
  description?: string;
  teamId?: string;
  projectId?: string;
  goalId?: string;
  startsAt?: string;
  endsAt?: string;
  capacityPoints?: number;
  taskIds?: string[];
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateCycleInput extends Partial<Omit<CreateCycleInput, "id" | "name">> {
  name?: string;
  archivedAt?: string | null;
}

export interface CreateEpicInput {
  id?: string;
  title: string;
  status?: EpicRecord["status"];
  kind?: EpicRecord["kind"];
  description?: string;
  projectId?: string;
  goalId?: string;
  ownerPersonId?: string;
  rank?: number;
  targetDate?: string;
  healthStatus?: EpicRecord["healthStatus"];
  taskIds?: string[];
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateEpicInput extends Partial<Omit<CreateEpicInput, "id" | "title">> {
  title?: string;
  archivedAt?: string | null;
}

export interface CreateCustomFieldInput {
  id?: string;
  name: string;
  entityType: CustomFieldRecord["entityType"];
  fieldType: CustomFieldRecord["fieldType"];
  description?: string;
  options?: unknown[];
  required?: boolean;
  rank?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateCustomFieldInput extends Partial<Omit<CreateCustomFieldInput, "id" | "name" | "entityType" | "fieldType">> {
  name?: string;
  entityType?: CustomFieldRecord["entityType"];
  fieldType?: CustomFieldRecord["fieldType"];
  archivedAt?: string | null;
}

export interface CreateFieldValueInput {
  id?: string;
  fieldId: string;
  entityType: FieldValueRecord["entityType"];
  entityId: string;
  value?: unknown;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateFieldValueInput extends Partial<Omit<CreateFieldValueInput, "id" | "fieldId" | "entityType" | "entityId">> {
  fieldId?: string;
  entityType?: FieldValueRecord["entityType"];
  entityId?: string;
  archivedAt?: string | null;
}

export interface CreateTemplateInput {
  id?: string;
  name: string;
  entityType: TemplateRecord["entityType"];
  status?: TemplateRecord["status"];
  description?: string;
  body?: Record<string, unknown>;
  rank?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateTemplateInput extends Partial<Omit<CreateTemplateInput, "id" | "name" | "entityType">> {
  name?: string;
  entityType?: TemplateRecord["entityType"];
  archivedAt?: string | null;
}

export interface CreateMilestoneInput {
  id?: string;
  title: string;
  description?: string;
  status?: MilestoneRecord["status"];
  areaId?: string;
  projectId?: string;
  goalId?: string;
  targetDate?: string;
  completedAt?: string;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateMilestoneInput extends Partial<Omit<CreateMilestoneInput, "id" | "title">> {
  title?: string;
  archivedAt?: string | null;
}

export interface ProductivityTimelineInput {
  start: string;
  end: string;
  projectId?: string;
  includeDone?: boolean;
}

export interface ProductivityTimelineDependencyState {
  ready: boolean;
  total: number;
  completed: number;
  blockedByIds: string[];
}

export interface ProductivityTimelineTaskItem {
  kind: "task";
  id: string;
  title: string;
  status: TaskRecord["status"];
  priority: TaskRecord["priority"];
  projectId?: string;
  goalId?: string;
  cycleId?: string;
  epicId?: string;
  start: string;
  end: string;
  startSource: "startAt" | "deferUntil" | "dueAt" | "deadlineAt";
  endSource: "dueAt" | "deadlineAt" | "start";
  dependencyState: ProductivityTimelineDependencyState;
}

export interface ProductivityTimelineMilestoneItem {
  kind: "milestone";
  id: string;
  title: string;
  status: MilestoneRecord["status"];
  projectId?: string;
  goalId?: string;
  date: string;
}

export interface ProductivityTimelineDeadlineItem {
  kind: "deadline";
  id: string;
  title: string;
  status: DeadlineRecord["status"];
  anchorType?: DeadlineRecord["anchorType"];
  anchorId?: string;
  projectId?: string;
  date: string;
}

export interface ProductivityTimelineCycleItem {
  kind: "cycle";
  id: string;
  name: string;
  status: CycleRecord["status"];
  projectId?: string;
  goalId?: string;
  start: string;
  end: string;
  capacityPoints?: number;
}

export interface ProductivityTimelineProjectGroup {
  projectId?: string;
  title: string;
  start?: string;
  end?: string;
  tasks: ProductivityTimelineTaskItem[];
  milestones: ProductivityTimelineMilestoneItem[];
  deadlines: ProductivityTimelineDeadlineItem[];
  cycles: ProductivityTimelineCycleItem[];
}

export interface ProductivityTimelineNow {
  primary?: ProductivityTimelineTaskItem;
  readyTasks: ProductivityTimelineTaskItem[];
  blockedTasks: ProductivityTimelineTaskItem[];
}

export interface ProductivityTimeline {
  start: string;
  end: string;
  generatedAt: string;
  projects: ProductivityTimelineProjectGroup[];
  tasks: ProductivityTimelineTaskItem[];
  milestones: ProductivityTimelineMilestoneItem[];
  deadlines: ProductivityTimelineDeadlineItem[];
  cycles: ProductivityTimelineCycleItem[];
  now: ProductivityTimelineNow;
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

export interface CreateBlockerInput {
  id?: string;
  title: string;
  description?: string;
  status?: BlockerRecord["status"];
  kind: BlockerRecord["kind"];
  taskId?: string;
  projectId?: string;
  goalId?: string;
  ownerPersonId?: string;
  ownerAgentId?: string;
  dependencyTaskIds?: string[];
  evidenceIds?: string[];
  resolvedAt?: string;
  confidence?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateBlockerInput extends Partial<Omit<CreateBlockerInput, "id" | "title" | "kind">> {
  title?: string;
  kind?: BlockerRecord["kind"];
  archivedAt?: string | null;
}

export interface CreateArtifactInput {
  id?: string;
  title: string;
  kind: ArtifactRecord["kind"];
  taskId?: string;
  projectId?: string;
  goalId?: string;
  threadId?: string;
  decisionId?: string;
  uri?: string;
  summary?: string;
  content?: string;
  confidence?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateArtifactInput extends Partial<Omit<CreateArtifactInput, "id" | "title" | "kind">> {
  title?: string;
  kind?: ArtifactRecord["kind"];
  archivedAt?: string | null;
}

export interface CreateDecisionInput {
  id?: string;
  title: string;
  summary?: string;
  status?: DecisionRecord["status"];
  taskId?: string;
  projectId?: string;
  goalId?: string;
  ownerPersonId?: string;
  ownerAgentId?: string;
  outcome?: string;
  rationale?: string;
  alternatives?: string[];
  artifactIds?: string[];
  confidence?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateDecisionInput extends Partial<Omit<CreateDecisionInput, "id" | "title">> {
  title?: string;
  archivedAt?: string | null;
}

export interface CreateWorkSessionInput {
  id?: string;
  title: string;
  status?: WorkSessionRecord["status"];
  objective?: string;
  taskIds?: string[];
  blockerIds?: string[];
  startedAt?: string;
  endedAt?: string;
  outcome?: string;
  timeboxMinutes?: number;
  ownerAgentId?: string;
  confidence?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateWorkSessionInput extends Partial<Omit<CreateWorkSessionInput, "id" | "title">> {
  title?: string;
  archivedAt?: string | null;
}

export interface CreateAssignmentInput {
  id?: string;
  title: string;
  status?: AssignmentRecord["status"];
  taskId?: string;
  projectId?: string;
  goalId?: string;
  assignedToAgentId: string;
  assignedBy?: string;
  delegatedBy?: string;
  reviewerAgentId?: string;
  rationale?: string;
  rejectionReason?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  completedAt?: string;
  dueAt?: string;
  priority?: TaskRecord["priority"];
  confidence?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateAssignmentInput extends Partial<Omit<CreateAssignmentInput, "id" | "title" | "assignedToAgentId">> {
  title?: string;
  assignedToAgentId?: string;
  archivedAt?: string | null;
}

export interface CreateHandoffInput {
  id?: string;
  title: string;
  status?: HandoffRecord["status"];
  taskId?: string;
  projectId?: string;
  goalId?: string;
  fromAgentId: string;
  toAgentId: string;
  objective?: string;
  currentState?: string;
  contextSummary?: string;
  nextStep?: string;
  riskSummary?: string;
  artifactIds?: string[];
  blockerIds?: string[];
  approvalId?: string;
  rejectionReason?: string;
  acceptedAt?: string;
  completedAt?: string;
  confidence?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateHandoffInput extends Partial<Omit<CreateHandoffInput, "id" | "title" | "fromAgentId" | "toAgentId">> {
  title?: string;
  fromAgentId?: string;
  toAgentId?: string;
  archivedAt?: string | null;
}

export interface CreateApprovalInput {
  id?: string;
  title: string;
  status?: ProductivityApprovalRecord["status"];
  kind: ProductivityApprovalRecord["kind"];
  taskId?: string;
  projectId?: string;
  goalId?: string;
  handoffId?: string;
  requestedByAgentId?: string;
  approverAgentId?: string;
  policyReason: string;
  evidenceIds?: string[];
  decisionIds?: string[];
  approvedBy?: string;
  outcome?: string;
  approvedAt?: string;
  rejectedAt?: string;
  confidence?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateApprovalInput extends Partial<Omit<CreateApprovalInput, "id" | "title" | "kind" | "policyReason">> {
  title?: string;
  kind?: ProductivityApprovalRecord["kind"];
  policyReason?: string;
  archivedAt?: string | null;
}

export interface CreateCapacityInput {
  id?: string;
  title: string;
  status?: CapacityRecord["status"];
  agentId: string;
  teamId?: string;
  role?: string;
  availability?: CapacityRecord["availability"];
  maxWip?: number;
  currentWip?: number;
  queueDepth?: number;
  blockedCount?: number;
  overdueCount?: number;
  responseLatencyMinutes?: number;
  utilization?: number;
  assignedTaskIds?: string[];
  pendingApprovalIds?: string[];
  pendingHandoffIds?: string[];
  snapshotAt?: string;
  confidence?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateCapacityInput extends Partial<Omit<CreateCapacityInput, "id" | "title" | "agentId">> {
  title?: string;
  agentId?: string;
  archivedAt?: string | null;
}

export interface CreateAgentInput {
  id?: string;
  name: string;
  status?: AgentRecord["status"];
  role: string;
  teamId?: string;
  domains?: string[];
  shift?: string;
  availability?: AgentRecord["availability"];
  autonomyLevel?: AgentRecord["autonomyLevel"];
  permissions?: string[];
  policyGate?: AgentRecord["policyGate"];
  currentFocus?: string;
  linkedTaskIds?: string[];
  confidence?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateAgentInput extends Partial<Omit<CreateAgentInput, "id" | "name" | "role">> {
  name?: string;
  role?: string;
  archivedAt?: string | null;
}

export interface CreateReleaseInput {
  id?: string;
  title: string;
  status?: ReleaseRecord["status"];
  projectId?: string;
  goalId?: string;
  ownerAgentId?: string;
  targetDate?: string;
  shippedAt?: string;
  riskSummary?: string;
  linkedTaskIds?: string[];
  incidentIds?: string[];
  approvalIds?: string[];
  confidence?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateReleaseInput extends Partial<Omit<CreateReleaseInput, "id" | "title">> {
  title?: string;
  archivedAt?: string | null;
}

export interface CreateIncidentInput {
  id?: string;
  title: string;
  status?: IncidentRecord["status"];
  severity: IncidentRecord["severity"];
  projectId?: string;
  goalId?: string;
  taskId?: string;
  releaseId?: string;
  ownerAgentId?: string;
  summary?: string;
  customerImpact?: string;
  blockerIds?: string[];
  feedbackIds?: string[];
  startedAt?: string;
  resolvedAt?: string;
  confidence?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateIncidentInput extends Partial<Omit<CreateIncidentInput, "id" | "title" | "severity">> {
  title?: string;
  severity?: IncidentRecord["severity"];
  archivedAt?: string | null;
}

export interface CreateFeedbackInput {
  id?: string;
  title: string;
  status?: FeedbackRecord["status"];
  origin: FeedbackRecord["origin"];
  priority?: FeedbackRecord["priority"];
  projectId?: string;
  goalId?: string;
  taskId?: string;
  incidentId?: string;
  ownerAgentId?: string;
  summary?: string;
  followUpTaskId?: string;
  confidence?: number;
  sourceMeta?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateFeedbackInput extends Partial<Omit<CreateFeedbackInput, "id" | "title" | "origin">> {
  title?: string;
  origin?: FeedbackRecord["origin"];
  archivedAt?: string | null;
}

export interface CreateOperationalCheckInput {
  id?: string;
  title: string;
  status?: OperationalCheckRecord["status"];
  kind: OperationalCheckRecord["kind"];
  projectId?: string;
  goalId?: string;
  releaseId?: string;
  incidentId?: string;
  ownerAgentId?: string;
  cadence?: OperationalCheckRecord["cadence"];
  lastRunAt?: string;
  nextRunAt?: string;
  resultSummary?: string;
  playbook?: string;
  confidence?: number;
  source?: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface UpdateOperationalCheckInput extends Partial<Omit<CreateOperationalCheckInput, "id" | "title" | "kind">> {
  title?: string;
  kind?: OperationalCheckRecord["kind"];
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

export interface WorkspaceClawInstance extends Omit<ClawInstance, "workspace" | "sessions" | "context"> {
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
    list: (options?: {
      includeArchived?: boolean;
      status?: TaskRecord["status"] | TaskRecord["status"][];
      assigneePersonId?: string;
      projectId?: string;
      goalId?: string;
      areaId?: string;
      listId?: string;
      sectionId?: string;
      cycleId?: string;
      epicId?: string;
      blocked?: boolean;
      overdue?: boolean;
      hasReminder?: boolean;
      ids?: string[];
      limit?: number;
    }) => Promise<TaskRecord[]>;
    get: (id: string) => Promise<TaskRecord | null>;
    create: (input: CreateTaskInput) => Promise<TaskRecord>;
    update: (id: string, input: UpdateTaskInput) => Promise<TaskRecord>;
    complete: (id: string) => Promise<TaskRecord>;
    archive: (id: string) => Promise<TaskRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  lists: WorkspaceCollectionApi<ListRecord, CreateListInput, UpdateListInput>;
  sections: WorkspaceCollectionApi<SectionRecord, CreateSectionInput, UpdateSectionInput>;
  comments: WorkspaceCollectionApi<CommentRecord, CreateCommentInput, UpdateCommentInput>;
  attachments: WorkspaceCollectionApi<AttachmentRecord, CreateAttachmentInput, UpdateAttachmentInput>;
  savedViews: WorkspaceCollectionApi<SavedViewRecord, CreateSavedViewInput, UpdateSavedViewInput>;
  recurrences: WorkspaceCollectionApi<RecurrenceRecord, CreateRecurrenceInput, UpdateRecurrenceInput>;
  cycles: WorkspaceCollectionApi<CycleRecord, CreateCycleInput, UpdateCycleInput>;
  epics: WorkspaceCollectionApi<EpicRecord, CreateEpicInput, UpdateEpicInput>;
  customFields: WorkspaceCollectionApi<CustomFieldRecord, CreateCustomFieldInput, UpdateCustomFieldInput>;
  fieldValues: WorkspaceCollectionApi<FieldValueRecord, CreateFieldValueInput, UpdateFieldValueInput>;
  templates: WorkspaceCollectionApi<TemplateRecord, CreateTemplateInput, UpdateTemplateInput>;
  areas: {
    list: (options?: { includeArchived?: boolean; status?: AreaRecord["status"] | AreaRecord["status"][]; limit?: number }) => Promise<AreaRecord[]>;
    get: (id: string) => Promise<AreaRecord | null>;
    create: (input: CreateAreaInput) => Promise<AreaRecord>;
    update: (id: string, input: UpdateAreaInput) => Promise<AreaRecord>;
    archive: (id: string) => Promise<AreaRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  goals: {
    list: (options?: {
      includeArchived?: boolean;
      status?: GoalRecord["status"] | GoalRecord["status"][];
      projectId?: string;
      areaId?: string;
      limit?: number;
    }) => Promise<GoalRecord[]>;
    get: (id: string) => Promise<GoalRecord | null>;
    create: (input: CreateGoalInput) => Promise<GoalRecord>;
    update: (id: string, input: UpdateGoalInput) => Promise<GoalRecord>;
    archive: (id: string) => Promise<GoalRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  projects: {
    list: (options?: {
      includeArchived?: boolean;
      status?: ProjectRecord["status"] | ProjectRecord["status"][];
      goalId?: string;
      areaId?: string;
      limit?: number;
    }) => Promise<ProjectRecord[]>;
    get: (id: string) => Promise<ProjectRecord | null>;
    create: (input: CreateProjectInput) => Promise<ProjectRecord>;
    update: (id: string, input: UpdateProjectInput) => Promise<ProjectRecord>;
    archive: (id: string) => Promise<ProjectRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  milestones: {
    list: (options?: {
      includeArchived?: boolean;
      status?: MilestoneRecord["status"] | MilestoneRecord["status"][];
      projectId?: string;
      goalId?: string;
      areaId?: string;
      limit?: number;
    }) => Promise<MilestoneRecord[]>;
    get: (id: string) => Promise<MilestoneRecord | null>;
    create: (input: CreateMilestoneInput) => Promise<MilestoneRecord>;
    update: (id: string, input: UpdateMilestoneInput) => Promise<MilestoneRecord>;
    archive: (id: string) => Promise<MilestoneRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  activity: {
    list: (options?: {
      entityType?: ActivityEntryRecord["entityType"];
      entityId?: string;
      projectId?: string;
      taskId?: string;
      threadId?: string;
      limit?: number;
    }) => Promise<ActivityEntryRecord[]>;
    get: (id: string) => Promise<ActivityEntryRecord | null>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  blockers: {
    list: (options?: {
      includeArchived?: boolean;
      status?: BlockerRecord["status"] | BlockerRecord["status"][];
      kind?: BlockerRecord["kind"] | BlockerRecord["kind"][];
      taskId?: string;
      projectId?: string;
      goalId?: string;
      limit?: number;
    }) => Promise<BlockerRecord[]>;
    get: (id: string) => Promise<BlockerRecord | null>;
    create: (input: CreateBlockerInput) => Promise<BlockerRecord>;
    update: (id: string, input: UpdateBlockerInput) => Promise<BlockerRecord>;
    archive: (id: string) => Promise<BlockerRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  artifacts: {
    list: (options?: {
      includeArchived?: boolean;
      kind?: ArtifactRecord["kind"] | ArtifactRecord["kind"][];
      taskId?: string;
      projectId?: string;
      goalId?: string;
      threadId?: string;
      decisionId?: string;
      limit?: number;
    }) => Promise<ArtifactRecord[]>;
    get: (id: string) => Promise<ArtifactRecord | null>;
    create: (input: CreateArtifactInput) => Promise<ArtifactRecord>;
    update: (id: string, input: UpdateArtifactInput) => Promise<ArtifactRecord>;
    archive: (id: string) => Promise<ArtifactRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  decisions: {
    list: (options?: {
      includeArchived?: boolean;
      status?: DecisionRecord["status"] | DecisionRecord["status"][];
      taskId?: string;
      projectId?: string;
      goalId?: string;
      ownerPersonId?: string;
      ownerAgentId?: string;
      limit?: number;
    }) => Promise<DecisionRecord[]>;
    get: (id: string) => Promise<DecisionRecord | null>;
    create: (input: CreateDecisionInput) => Promise<DecisionRecord>;
    update: (id: string, input: UpdateDecisionInput) => Promise<DecisionRecord>;
    archive: (id: string) => Promise<DecisionRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  workSessions: {
    list: (options?: {
      includeArchived?: boolean;
      status?: WorkSessionRecord["status"] | WorkSessionRecord["status"][];
      taskId?: string;
      limit?: number;
    }) => Promise<WorkSessionRecord[]>;
    get: (id: string) => Promise<WorkSessionRecord | null>;
    create: (input: CreateWorkSessionInput) => Promise<WorkSessionRecord>;
    update: (id: string, input: UpdateWorkSessionInput) => Promise<WorkSessionRecord>;
    complete: (id: string, outcome?: string) => Promise<WorkSessionRecord>;
    cancel: (id: string) => Promise<WorkSessionRecord>;
    archive: (id: string) => Promise<WorkSessionRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  assignments: {
    list: (options?: {
      includeArchived?: boolean;
      status?: AssignmentRecord["status"] | AssignmentRecord["status"][];
      taskId?: string;
      projectId?: string;
      goalId?: string;
      assignedToAgentId?: string;
      limit?: number;
    }) => Promise<AssignmentRecord[]>;
    get: (id: string) => Promise<AssignmentRecord | null>;
    create: (input: CreateAssignmentInput) => Promise<AssignmentRecord>;
    update: (id: string, input: UpdateAssignmentInput) => Promise<AssignmentRecord>;
    archive: (id: string) => Promise<AssignmentRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  handoffs: {
    list: (options?: {
      includeArchived?: boolean;
      status?: HandoffRecord["status"] | HandoffRecord["status"][];
      taskId?: string;
      projectId?: string;
      goalId?: string;
      fromAgentId?: string;
      toAgentId?: string;
      limit?: number;
    }) => Promise<HandoffRecord[]>;
    get: (id: string) => Promise<HandoffRecord | null>;
    create: (input: CreateHandoffInput) => Promise<HandoffRecord>;
    update: (id: string, input: UpdateHandoffInput) => Promise<HandoffRecord>;
    archive: (id: string) => Promise<HandoffRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  approvals: {
    list: (options?: {
      includeArchived?: boolean;
      status?: ProductivityApprovalRecord["status"] | ProductivityApprovalRecord["status"][];
      kind?: ProductivityApprovalRecord["kind"] | ProductivityApprovalRecord["kind"][];
      taskId?: string;
      projectId?: string;
      goalId?: string;
      handoffId?: string;
      approverAgentId?: string;
      limit?: number;
    }) => Promise<ProductivityApprovalRecord[]>;
    get: (id: string) => Promise<ProductivityApprovalRecord | null>;
    create: (input: CreateApprovalInput) => Promise<ProductivityApprovalRecord>;
    update: (id: string, input: UpdateApprovalInput) => Promise<ProductivityApprovalRecord>;
    archive: (id: string) => Promise<ProductivityApprovalRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  capacity: {
    list: (options?: {
      includeArchived?: boolean;
      status?: CapacityRecord["status"] | CapacityRecord["status"][];
      availability?: CapacityRecord["availability"] | CapacityRecord["availability"][];
      teamId?: string;
      agentId?: string;
      limit?: number;
    }) => Promise<CapacityRecord[]>;
    get: (id: string) => Promise<CapacityRecord | null>;
    create: (input: CreateCapacityInput) => Promise<CapacityRecord>;
    update: (id: string, input: UpdateCapacityInput) => Promise<CapacityRecord>;
    archive: (id: string) => Promise<CapacityRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  agents: {
    list: (options?: {
      includeArchived?: boolean;
      status?: AgentRecord["status"] | AgentRecord["status"][];
      availability?: AgentRecord["availability"] | AgentRecord["availability"][];
      teamId?: string;
      limit?: number;
    }) => Promise<AgentRecord[]>;
    get: (id: string) => Promise<AgentRecord | null>;
    create: (input: CreateAgentInput) => Promise<AgentRecord>;
    update: (id: string, input: UpdateAgentInput) => Promise<AgentRecord>;
    archive: (id: string) => Promise<AgentRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  releases: {
    list: (options?: {
      includeArchived?: boolean;
      status?: ReleaseRecord["status"] | ReleaseRecord["status"][];
      projectId?: string;
      goalId?: string;
      ownerAgentId?: string;
      limit?: number;
    }) => Promise<ReleaseRecord[]>;
    get: (id: string) => Promise<ReleaseRecord | null>;
    create: (input: CreateReleaseInput) => Promise<ReleaseRecord>;
    update: (id: string, input: UpdateReleaseInput) => Promise<ReleaseRecord>;
    archive: (id: string) => Promise<ReleaseRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  incidents: {
    list: (options?: {
      includeArchived?: boolean;
      status?: IncidentRecord["status"] | IncidentRecord["status"][];
      severity?: IncidentRecord["severity"] | IncidentRecord["severity"][];
      projectId?: string;
      releaseId?: string;
      ownerAgentId?: string;
      limit?: number;
    }) => Promise<IncidentRecord[]>;
    get: (id: string) => Promise<IncidentRecord | null>;
    create: (input: CreateIncidentInput) => Promise<IncidentRecord>;
    update: (id: string, input: UpdateIncidentInput) => Promise<IncidentRecord>;
    archive: (id: string) => Promise<IncidentRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  feedback: {
    list: (options?: {
      includeArchived?: boolean;
      status?: FeedbackRecord["status"] | FeedbackRecord["status"][];
      origin?: FeedbackRecord["origin"] | FeedbackRecord["origin"][];
      priority?: FeedbackRecord["priority"] | FeedbackRecord["priority"][];
      projectId?: string;
      incidentId?: string;
      limit?: number;
    }) => Promise<FeedbackRecord[]>;
    get: (id: string) => Promise<FeedbackRecord | null>;
    create: (input: CreateFeedbackInput) => Promise<FeedbackRecord>;
    update: (id: string, input: UpdateFeedbackInput) => Promise<FeedbackRecord>;
    archive: (id: string) => Promise<FeedbackRecord>;
    remove: (id: string) => Promise<boolean>;
    search: (query: string, options?: Omit<WorkspaceSearchQuery, "query" | "domains">) => Promise<WorkspaceSearchResult[]>;
  };
  checks: {
    list: (options?: {
      includeArchived?: boolean;
      status?: OperationalCheckRecord["status"] | OperationalCheckRecord["status"][];
      kind?: OperationalCheckRecord["kind"] | OperationalCheckRecord["kind"][];
      releaseId?: string;
      incidentId?: string;
      ownerAgentId?: string;
      limit?: number;
    }) => Promise<OperationalCheckRecord[]>;
    get: (id: string) => Promise<OperationalCheckRecord | null>;
    create: (input: CreateOperationalCheckInput) => Promise<OperationalCheckRecord>;
    update: (id: string, input: UpdateOperationalCheckInput) => Promise<OperationalCheckRecord>;
    archive: (id: string) => Promise<OperationalCheckRecord>;
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
    after: ClawInstance["reminders"]["after"];
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
    process: (threadId: string, input: {
      taskTitle?: string;
      noteTitle?: string;
      reminderTitle?: string;
      reminderAt?: string;
      areaId?: string;
      projectId?: string;
      goalId?: string;
    }) => Promise<{ thread: InboxThreadRecord; task?: TaskRecord; note?: NoteRecord; reminder?: ReminderRecord }>;
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
  context: ClawInstance["context"] & {
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
  agenda: {
    list: (input?: { start?: string; end?: string; includeCompleted?: boolean }) => Promise<ProductivityAgenda>;
  };
  review: {
    daily: () => Promise<ProductivityReview>;
    weekly: () => Promise<ProductivityReview>;
  };
  productivity: {
    myWork: (input?: { limit?: number }) => Promise<ProductivityMyWork>;
    teamWork: (input?: { limit?: number }) => Promise<ProductivityTeamWork>;
    operationsCockpit: (input?: { limit?: number }) => Promise<ProductivityOperationsCockpit>;
    inspect: () => Promise<{
      schemaVersion: number;
      schemaHash: string;
      dataPath: string;
      collectionCounts: Record<string, number>;
      indexCount: number;
      embeddingCount: number;
      time: {
        configured: boolean;
        itemCount: number;
        executionCount: number;
      };
    }>;
    exportSnapshot: () => Promise<Record<string, unknown>>;
    importSnapshot: (input: Record<string, unknown>, options?: { replace?: boolean }) => Promise<{ importedCollections: Record<string, number>; importedTemporalItems: number }>;
    backup: (targetDir: string) => Promise<{ files: string[] }>;
    repair: () => Promise<{ repairedRecords: number; reindexed: number; embeddings: number; recomputedTemporalItems: number }>;
    timeline: (input: ProductivityTimelineInput) => Promise<ProductivityTimeline>;
  };
}
