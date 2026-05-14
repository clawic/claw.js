export * from "./types-runtime-intent.ts";
import type { Attachment, PromptContextBlock } from "./types.ts";

export type WorkspaceDomain =
  | "areas"
  | "lists"
  | "sections"
  | "tasks"
  | "goals"
  | "projects"
  | "comments"
  | "attachments"
  | "saved_views"
  | "recurrences"
  | "cycles"
  | "epics"
  | "custom_fields"
  | "field_values"
  | "templates"
  | "milestones"
  | "activity"
  | "blockers"
  | "artifacts"
  | "decisions"
  | "work_sessions"
  | "assignments"
  | "handoffs"
  | "approvals"
  | "capacity"
  | "agents"
  | "releases"
  | "incidents"
  | "feedback"
  | "checks"
  | "reminders"
  | "deadlines"
  | "notes"
  | "people"
  | "inbox"
  | "events";

export type WorkspaceSearchStrategy =
  | "auto"
  | "keyword"
  | "semantic"
  | "hybrid";

export type LinkedEntityDomain =
  | "area"
  | "list"
  | "section"
  | "task"
  | "goal"
  | "project"
  | "comment"
  | "attachment"
  | "saved_view"
  | "recurrence"
  | "cycle"
  | "epic"
  | "custom_field"
  | "field_value"
  | "template"
  | "milestone"
  | "activity_entry"
  | "blocker"
  | "artifact"
  | "decision"
  | "work_session"
  | "assignment"
  | "handoff"
  | "approval"
  | "capacity"
  | "agent"
  | "release"
  | "incident"
  | "feedback_item"
  | "operational_check"
  | "reminder"
  | "deadline"
  | "note"
  | "person"
  | "inbox_thread"
  | "inbox_message"
  | "event";

export interface LinkedEntityRef {
  domain: LinkedEntityDomain;
  id: string;
  label?: string;
  relationship?: string;
}

export interface WorkspaceEntitySource {
  kind: "local" | "channel" | "imported" | "derived";
  channel?: string;
  externalId?: string;
}

export interface WorkspaceRecordBase {
  id: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  source: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface AreaRecord extends WorkspaceRecordBase {
  name: string;
  description?: string;
  status: "active" | "paused" | "archived";
  color?: string;
  ownerPersonId?: string;
}

export interface TaskRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  status: "triage" | "todo" | "ready" | "in_progress" | "blocked" | "done" | "cancelled";
  type?: "todo" | "task" | "bug" | "story" | "feature" | "chore";
  priority: "low" | "medium" | "high" | "urgent";
  rank?: number;
  labels: string[];
  areaId?: string;
  listId?: string;
  sectionId?: string;
  assigneePersonId?: string;
  reporterPersonId?: string;
  watcherPersonIds: string[];
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
  childTaskIds: string[];
  dependsOnTaskIds: string[];
  commentIds: string[];
  attachmentIds: string[];
  createdBy?: string;
  updatedBy?: string;
  assignedToAgentId?: string;
  assignedBy?: string;
  delegatedBy?: string;
  reviewerAgentId?: string;
  blockedByIds: string[];
  evidenceIds: string[];
  decisionIds: string[];
  assignmentIds: string[];
  handoffIds: string[];
  approvalIds: string[];
  sourceItemId?: string;
  confidence?: number;
  handoffTo?: string;
  approvedBy?: string;
  companyId?: string;
  portfolioId?: string;
  portfolioItemId?: string;
  checklist: TaskChecklistItem[];
  claimedByAgentId?: string;
  claimedAt?: string;
  claimExpiresAt?: string;
  failureCount?: number;
  lastFailureAt?: string;
  boardColumn?: string;
  boardOrder?: number;
}

export interface GoalRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  status: "active" | "paused" | "done";
  level?: "company" | "team" | "personal";
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
  reviewCadence?: "daily" | "weekly" | "monthly" | "quarterly";
  metricDirection?: "increase" | "decrease" | "maintain";
  healthStatus?: "green" | "yellow" | "red" | "unknown";
}

export interface ProjectRecord extends WorkspaceRecordBase {
  name: string;
  description?: string;
  status: "draft" | "in_progress" | "paused" | "done" | "archived";
  areaId?: string;
  goalId?: string;
  ownerPersonId?: string;
  leadAgentId?: string;
  companyId?: string;
  portfolioId?: string;
  portfolioItemId?: string;
  color?: string;
  kind?: "delivery" | "growth" | "ops" | "research" | "migration" | "other";
  rank?: number;
  statusCategory?: "active" | "someday" | "planned" | "done" | "archived";
  healthStatus?: "green" | "yellow" | "red" | "unknown";
  startAt?: string;
  startDate?: string;
  targetDate?: string;
  deadlineAt?: string;
  milestoneIds: string[];
  defaultSectionIds: string[];
  templateId?: string;
  reviewAt?: string;
  reviewCadence?: "daily" | "weekly" | "monthly" | "quarterly";
  archiveReason?: string;
  completedAt?: string;
}

export interface ListRecord extends WorkspaceRecordBase {
  title: string;
  kind: "inbox" | "today" | "upcoming" | "anytime" | "someday" | "backlog" | "project" | "custom";
  status: "active" | "archived";
  description?: string;
  areaId?: string;
  projectId?: string;
  rank?: number;
  filter?: Record<string, unknown>;
}

export interface SectionRecord extends WorkspaceRecordBase {
  title: string;
  status: "active" | "archived";
  description?: string;
  listId?: string;
  projectId?: string;
  areaId?: string;
  rank?: number;
}

export type ProductivityCommentEntityType = "task" | "project" | "goal" | "epic" | "cycle" | "note" | "inbox_thread" | "event";

export interface CommentRecord extends WorkspaceRecordBase {
  entityType: ProductivityCommentEntityType;
  entityId: string;
  body: string;
  authorPersonId?: string;
  authorAgentId?: string;
  visibility?: "internal" | "shared";
}

export interface AttachmentRecord extends WorkspaceRecordBase {
  title: string;
  entityType: ProductivityCommentEntityType;
  entityId: string;
  name?: string;
  mimeType?: string;
  uri?: string;
  path?: string;
  sizeBytes?: number;
  preview?: string;
  uploadedBy?: string;
}

export interface SavedViewRecord extends WorkspaceRecordBase {
  name: string;
  domain: "tasks" | "projects" | "goals" | "inbox" | "events" | "workspace";
  query?: string;
  filters?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  groupBy?: string;
  favorite?: boolean;
  rank?: number;
}

export interface RecurrenceRecord extends WorkspaceRecordBase {
  title: string;
  status: "active" | "paused" | "ended";
  rule: string;
  timezone?: string;
  anchorType?: "task" | "project" | "goal" | "event" | "standalone";
  anchorId?: string;
  nextRunAt?: string;
  lastRunAt?: string;
}

export interface CycleRecord extends WorkspaceRecordBase {
  name: string;
  status: "planned" | "active" | "completed" | "archived";
  description?: string;
  teamId?: string;
  projectId?: string;
  goalId?: string;
  startsAt?: string;
  endsAt?: string;
  capacityPoints?: number;
  taskIds: string[];
}

export interface EpicRecord extends WorkspaceRecordBase {
  title: string;
  status: "planned" | "active" | "done" | "archived";
  kind: "epic" | "initiative";
  description?: string;
  projectId?: string;
  goalId?: string;
  ownerPersonId?: string;
  rank?: number;
  targetDate?: string;
  healthStatus?: "green" | "yellow" | "red" | "unknown";
  taskIds: string[];
}

export interface CustomFieldRecord extends WorkspaceRecordBase {
  name: string;
  entityType: "task" | "project" | "goal" | "epic" | "cycle" | "person";
  fieldType: "text" | "number" | "boolean" | "date" | "select" | "multi_select" | "person" | "relation" | "url" | "json";
  description?: string;
  options?: unknown[];
  required?: boolean;
  rank?: number;
}

export interface FieldValueRecord extends WorkspaceRecordBase {
  fieldId: string;
  entityType: "task" | "project" | "goal" | "epic" | "cycle" | "person";
  entityId: string;
  value?: unknown;
}

export interface TemplateRecord extends WorkspaceRecordBase {
  name: string;
  entityType: "task" | "project" | "goal" | "epic" | "cycle" | "note";
  status: "active" | "archived";
  description?: string;
  body?: Record<string, unknown>;
  rank?: number;
}

export interface MilestoneRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  status: "planned" | "active" | "done" | "archived";
  areaId?: string;
  projectId?: string;
  goalId?: string;
  targetDate?: string;
  completedAt?: string;
}

export interface ActivityEntryRecord extends WorkspaceRecordBase {
  entityType: LinkedEntityDomain;
  entityId: string;
  kind: "created" | "updated" | "completed" | "archived" | "processed" | "commented";
  title: string;
  content?: string;
  areaId?: string;
  projectId?: string;
  goalId?: string;
  milestoneId?: string;
  taskId?: string;
  threadId?: string;
  actor?: string;
}

export interface BlockerRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  status: "active" | "resolved" | "cancelled";
  kind: "waiting_human" | "waiting_agent" | "waiting_system" | "missing_context" | "policy_block";
  taskId?: string;
  projectId?: string;
  goalId?: string;
  ownerPersonId?: string;
  ownerAgentId?: string;
  dependencyTaskIds: string[];
  evidenceIds: string[];
  resolvedAt?: string;
  confidence?: number;
}

export interface ArtifactRecord extends WorkspaceRecordBase {
  title: string;
  kind: "link" | "file" | "command" | "test" | "screenshot" | "message" | "note";
  taskId?: string;
  projectId?: string;
  goalId?: string;
  threadId?: string;
  decisionId?: string;
  uri?: string;
  summary?: string;
  content?: string;
  confidence?: number;
}

export interface DecisionRecord extends WorkspaceRecordBase {
  title: string;
  summary?: string;
  status: "proposed" | "accepted" | "rejected" | "superseded";
  taskId?: string;
  projectId?: string;
  goalId?: string;
  ownerPersonId?: string;
  ownerAgentId?: string;
  outcome?: string;
  rationale?: string;
  alternatives: string[];
  artifactIds: string[];
  confidence?: number;
}

export interface WorkSessionRecord extends WorkspaceRecordBase {
  title: string;
  status: "active" | "completed" | "cancelled";
  objective?: string;
  taskIds: string[];
  blockerIds: string[];
  startedAt: string;
  endedAt?: string;
  outcome?: string;
  timeboxMinutes?: number;
  ownerAgentId?: string;
  confidence?: number;
}

export interface AssignmentRecord extends WorkspaceRecordBase {
  title: string;
  status: "proposed" | "accepted" | "rejected" | "released" | "completed";
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
}

export interface HandoffRecord extends WorkspaceRecordBase {
  title: string;
  status: "proposed" | "accepted" | "rejected" | "returned" | "completed";
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
  artifactIds: string[];
  blockerIds: string[];
  approvalId?: string;
  rejectionReason?: string;
  acceptedAt?: string;
  completedAt?: string;
  confidence?: number;
}

export interface ProductivityApprovalRecord extends WorkspaceRecordBase {
  title: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  kind: "deploy" | "publish" | "delete" | "external_send" | "spend" | "policy_gate" | "other";
  taskId?: string;
  projectId?: string;
  goalId?: string;
  handoffId?: string;
  requestedByAgentId?: string;
  approverAgentId?: string;
  policyReason: string;
  evidenceIds: string[];
  decisionIds: string[];
  approvedBy?: string;
  outcome?: string;
  approvedAt?: string;
  rejectedAt?: string;
  confidence?: number;
}

export interface CapacityRecord extends WorkspaceRecordBase {
  title: string;
  status: "active" | "limited" | "overloaded" | "offline";
  agentId: string;
  teamId?: string;
  role?: string;
  availability: "available" | "busy" | "away" | "offline";
  maxWip?: number;
  currentWip: number;
  queueDepth: number;
  blockedCount: number;
  overdueCount: number;
  responseLatencyMinutes?: number;
  utilization?: number;
  assignedTaskIds: string[];
  pendingApprovalIds: string[];
  pendingHandoffIds: string[];
  snapshotAt?: string;
  confidence?: number;
}

export interface AgentRecord extends WorkspaceRecordBase {
  name: string;
  status: "active" | "limited" | "offline";
  role: string;
  teamId?: string;
  domains: string[];
  shift?: string;
  availability: "available" | "busy" | "away" | "offline";
  autonomyLevel: "observe" | "suggest" | "act_limited" | "act_full";
  permissions: string[];
  policyGate: "none" | "approval_required" | "restricted";
  currentFocus?: string;
  linkedTaskIds: string[];
  confidence?: number;
}

export interface ReleaseRecord extends WorkspaceRecordBase {
  title: string;
  status: "planned" | "active" | "at_risk" | "released" | "cancelled";
  projectId?: string;
  goalId?: string;
  ownerAgentId?: string;
  targetDate?: string;
  shippedAt?: string;
  riskSummary?: string;
  linkedTaskIds: string[];
  incidentIds: string[];
  approvalIds: string[];
  confidence?: number;
}

export interface IncidentRecord extends WorkspaceRecordBase {
  title: string;
  status: "open" | "investigating" | "mitigating" | "resolved" | "closed";
  severity: "sev1" | "sev2" | "sev3" | "sev4";
  projectId?: string;
  goalId?: string;
  taskId?: string;
  releaseId?: string;
  ownerAgentId?: string;
  summary?: string;
  customerImpact?: string;
  blockerIds: string[];
  feedbackIds: string[];
  startedAt?: string;
  resolvedAt?: string;
  confidence?: number;
}

export interface FeedbackRecord extends WorkspaceRecordBase {
  title: string;
  status: "new" | "triaged" | "planned" | "closed";
  origin: "customer" | "agent" | "system" | "sales" | "support" | "ops";
  priority: "low" | "medium" | "high" | "urgent";
  projectId?: string;
  goalId?: string;
  taskId?: string;
  incidentId?: string;
  ownerAgentId?: string;
  summary?: string;
  followUpTaskId?: string;
  confidence?: number;
}

export interface OperationalCheckRecord extends WorkspaceRecordBase {
  title: string;
  status: "pending" | "passing" | "failing" | "snoozed";
  kind: "release_readiness" | "incident_followup" | "sla" | "quality" | "compliance" | "ops";
  projectId?: string;
  goalId?: string;
  releaseId?: string;
  incidentId?: string;
  ownerAgentId?: string;
  cadence?: "hourly" | "daily" | "weekly" | "monthly";
  lastRunAt?: string;
  nextRunAt?: string;
  resultSummary?: string;
  playbook?: string;
  confidence?: number;
}

export type ProductivityAnchorType =
  | "task"
  | "project"
  | "goal"
  | "event"
  | "thread"
  | "standalone";

export interface ReminderRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  status: "active" | "paused" | "done" | "cancelled";
  triggerAt: string;
  anchorType?: ProductivityAnchorType;
  anchorId?: string;
  channel?: string;
}

export interface DeadlineRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  status: "active" | "paused" | "done" | "cancelled";
  dueAt: string;
  anchorType?: ProductivityAnchorType;
  anchorId?: string;
}

export interface NoteBlock {
  id: string;
  type: "paragraph" | "heading" | "bullet_list" | "checklist" | "quote" | "code";
  text: string;
}

export interface NoteRecord extends WorkspaceRecordBase {
  title: string;
  blocks: NoteBlock[];
  tags: string[];
  summary?: string;
  attachments?: Attachment[];
  linkedEntityIds: string[];
  searchText: string;
}

export interface PersonIdentity {
  channel: string;
  handle: string;
  externalId?: string;
  label?: string;
}

export interface PersonRecord extends WorkspaceRecordBase {
  displayName: string;
  kind: "human" | "agent" | "org";
  identities: PersonIdentity[];
  emails: string[];
  phones: string[];
  handles: string[];
  role?: string;
  organization?: string;
}

export interface InboxReplyTarget {
  channel: string;
  threadId?: string;
  messageId?: string;
  address?: string;
}

export interface InboxThreadRecord extends WorkspaceRecordBase {
  channel: string;
  subject?: string;
  externalThreadId?: string;
  participantPersonIds: string[];
  status: "unread" | "read" | "archived";
  replyTarget?: InboxReplyTarget;
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  latestMessageAt?: string;
  preview?: string;
}

export interface InboxMessageRecord extends WorkspaceRecordBase {
  threadId: string;
  channel: string;
  externalThreadId?: string;
  externalMessageId?: string;
  participantPersonIds: string[];
  direction: "inbound" | "outbound" | "system";
  status: "unread" | "read" | "archived" | "draft" | "sent" | "failed";
  replyTarget?: InboxReplyTarget;
  attachments?: Attachment[];
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  content: string;
}

export interface EventReminder {
  id: string;
  minutesBeforeStart: number;
  channel?: string;
}

export interface EventRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  attendeePersonIds: string[];
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  reminders: EventReminder[];
}

export interface TemporalParticipant {
  id: string;
  kind: "human" | "agent" | "org" | "external";
  label: string;
  personId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface TemporalAction {
  id: string;
  kind: "notify" | "agent_prompt" | "workflow" | "create_task" | "calendar_sync";
  target?: string;
  payload?: Record<string, unknown>;
}

export interface TemporalOccurrenceOverride {
  originalStartAt: string;
  startsAt?: string;
  endsAt?: string;
  cancelled?: boolean;
}

export interface TemporalSchedule {
  mode: "one_off" | "cron" | "rrule" | "relative";
  timezone: string;
  startsAt?: string;
  cron?: string;
  rrule?: string;
  staggerMs?: number;
  relative?: {
    anchorType: "thread" | "task" | "project" | "goal" | "event" | "execution" | "standalone";
    anchorId: string;
    anchorAt: string;
    offsetMs: number;
    cancelOn?: "reply_received" | "task_completed" | "event_started" | "execution_succeeded";
  };
  overrides?: TemporalOccurrenceOverride[];
  cancelledOccurrences?: string[];
}

export interface TemporalProjection {
  id: string;
  itemId: string;
  target: "workspace_events" | "relay_routines" | "google_calendar" | "runtime_scheduler" | "notify";
  status: "pending" | "active" | "synced" | "failed";
  provider?: string;
  externalId?: string;
  detail?: Record<string, unknown>;
  updatedAt: string;
}

export interface TemporalExecution {
  id: string;
  itemId: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  scheduledFor: string;
  startedAt?: string;
  completedAt?: string;
  triggeredBy: "scheduler" | "manual" | "system";
  output?: string;
  error?: string;
}

export interface TemporalRunLogEntry {
  id: string;
  itemId: string;
  status: "succeeded" | "failed" | "cancelled" | "noop";
  scheduledFor: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  triggeredBy: "scheduler" | "manual" | "system";
  summary?: string;
  error?: string;
  agentResult?: TemporalHeartbeatAgentResult;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface TemporalHeartbeatMatch {
  source: string;
  id: string;
  title?: string;
  updatedAt?: string;
  payload?: Record<string, unknown>;
}

export interface TemporalHeartbeatAgentResult {
  status: "done" | "continue" | "disable" | "error" | "noop";
  summary?: string;
  error?: string;
  usage?: TemporalRunLogEntry["usage"];
}

export interface TemporalHeartbeatState {
  lastEvaluatedAt?: string;
  lastWakeAt?: string;
  lastSkipAt?: string;
  skipCount: number;
  lastSkipReason?: string;
  lastNoopAt?: string;
  lastCompletedAt?: string;
  lastMatches?: TemporalHeartbeatMatch[];
  lastResult?: TemporalHeartbeatAgentResult & { at: string };
  wakeTimestamps?: string[];
}

export interface TemporalHeartbeatPolicy {
  when: string[];
  stopWhen?: string[];
  context: "diff";
  limit: number;
  target?: "main" | "isolated";
  deliver?: boolean | { target?: string; mode?: "summary" | "none" };
  activeHours?: {
    start: string;
    end: string;
    timezone?: string;
  };
  cooldownMs?: number;
  maxWakesPerWindow?: {
    count: number;
    windowMs: number;
  };
  staggerMs?: number;
  prompt?: string;
  gate?: {
    path?: string;
    policy?: Record<string, unknown>;
  };
  allowedCustomChecks?: string[];
  state?: TemporalHeartbeatState;
}

export interface TemporalRuntimeState {
  runningExecutionId?: string;
  runningAt?: string;
  consecutiveErrors?: number;
  lastErrorAt?: string;
  lastError?: string;
  nextRetryAt?: string;
  lastDurationMs?: number;
}

export interface TemporalNaturalInput {
  command: "at" | "every" | "after";
  expression: string;
  timezone?: string;
  anchorType?: "thread" | "task" | "project" | "goal" | "event" | "execution" | "standalone";
  anchorId?: string;
  anchorAt?: string;
}

export interface TemporalItem {
  id: string;
  kind: "event" | "routine" | "reminder" | "deadline" | "follow_up";
  status: "active" | "paused" | "cancelled" | "completed";
  title: string;
  description?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  dueAt?: string;
  timezone: string;
  schedule: TemporalSchedule;
  participants: TemporalParticipant[];
  actions: TemporalAction[];
  projections: TemporalProjection[];
  heartbeat?: TemporalHeartbeatPolicy;
  runtime?: TemporalRuntimeState;
  ownerId?: string;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  sourceProvider?: string;
  anchorType?: "thread" | "task" | "project" | "goal" | "event" | "execution" | "standalone";
  anchorId?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSearchQuery {
  query: string;
  domains?: WorkspaceDomain[];
  strategy?: WorkspaceSearchStrategy;
  limit?: number;
  includeArchived?: boolean;
}

export interface WorkspaceSearchResult {
  domain: WorkspaceDomain;
  id: string;
  title: string;
  snippet: string;
  score: number;
  strategy: Exclude<WorkspaceSearchStrategy, "auto">;
  matchedFields: string[];
  links?: LinkedEntityRef[];
  updatedAt?: string;
}

export interface ProductivityAgendaItem {
  domain: "tasks" | "milestones" | "reminders" | "deadlines" | "events" | "activity";
  id: string;
  title: string;
  when: string;
  status: string;
  overdue: boolean;
  areaId?: string;
  projectId?: string;
  goalId?: string;
  milestoneId?: string;
  taskId?: string;
}

export interface ProductivityAgenda {
  start: string;
  end: string;
  generatedAt: string;
  items: ProductivityAgendaItem[];
  summary: {
    overdue: number;
    dueToday: number;
    upcoming: number;
  };
}

export interface ProductivityReview {
  cadence: "daily" | "weekly";
  generatedAt: string;
  summary: {
    blockedTasks: number;
    overdueTasks: number;
    activeGoals: number;
    activeProjects: number;
    pendingMilestones: number;
    unreadThreads: number;
    dueDeadlines: number;
    pendingReminders: number;
    upcomingEvents: number;
    activeBlockers: number;
    pendingDecisions: number;
    activeWorkSessions: number;
  };
  blockedTasks: TaskRecord[];
  overdueTasks: TaskRecord[];
  activeGoals: GoalRecord[];
  activeProjects: ProjectRecord[];
  pendingMilestones: MilestoneRecord[];
  unreadThreads: InboxThreadRecord[];
  dueDeadlines: DeadlineRecord[];
  pendingReminders: ReminderRecord[];
  upcomingEvents: EventRecord[];
  activeBlockers: BlockerRecord[];
  pendingDecisions: DecisionRecord[];
  activeWorkSessions: WorkSessionRecord[];
}

export interface ProductivityMyWork {
  generatedAt: string;
  summary: {
    triageThreads: number;
    readyTasks: number;
    blockedTasks: number;
    activeBlockers: number;
    pendingDecisions: number;
    activeWorkSessions: number;
    recentArtifacts: number;
  };
  triageThreads: InboxThreadRecord[];
  readyTasks: TaskRecord[];
  blockedTasks: TaskRecord[];
  activeBlockers: BlockerRecord[];
  pendingDecisions: DecisionRecord[];
  activeWorkSession: WorkSessionRecord | null;
  recentArtifacts: ArtifactRecord[];
}

export interface ProductivityTeamWork {
  generatedAt: string;
  summary: {
    activeAssignments: number;
    pendingHandoffs: number;
    pendingApprovals: number;
    overloadedAgents: number;
    agentsAtRisk: number;
  };
  activeAssignments: AssignmentRecord[];
  pendingHandoffs: HandoffRecord[];
  pendingApprovals: ProductivityApprovalRecord[];
  capacity: CapacityRecord[];
}

export interface ProductivityOperationsAgent {
  agent: AgentRecord;
  capacity: CapacityRecord | null;
  openIncidentIds: string[];
  pendingApprovalIds: string[];
  activeReleaseIds: string[];
}

export interface ProductivityOperationsCockpit {
  generatedAt: string;
  summary: {
    activeGoals: number;
    activeProjects: number;
    activeReleases: number;
    atRiskReleases: number;
    openIncidents: number;
    criticalIncidents: number;
    failingChecks: number;
    newFeedback: number;
    activeAgents: number;
    approvalGatedAgents: number;
  };
  portfolio: {
    activeGoals: GoalRecord[];
    activeProjects: ProjectRecord[];
    atRiskProjects: ProjectRecord[];
  };
  releases: ReleaseRecord[];
  incidents: IncidentRecord[];
  feedback: FeedbackRecord[];
  checks: OperationalCheckRecord[];
  agents: ProductivityOperationsAgent[];
}

export interface WorkspaceSurfaceDescriptor {
  id: WorkspaceDomain;
  title: string;
  route: string;
  icon?: string;
  badgeId?: string;
  order: number;
}

export interface WorkspaceBadgeSummary {
  id: string;
  value: number;
  label: string;
}

export interface WorkspaceContextRequest {
  query?: string;
  domains?: WorkspaceDomain[];
  strategy?: Exclude<WorkspaceSearchStrategy, "semantic"> | "semantic";
  limit?: number;
  includeDoneTasks?: boolean;
  sessionId?: string;
  threadId?: string;
}

export interface WorkspaceContextBundle {
  request: WorkspaceContextRequest;
  generatedAt: string;
  blocks: PromptContextBlock[];
  results: WorkspaceSearchResult[];
}

export interface WorkspaceToolDescriptor {
  id: string;
  title: string;
  description: string;
  domain: WorkspaceDomain | "workspace";
}
