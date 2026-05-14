import { z } from "zod";

export const intentDomainSchema = z.enum([
  "runtime",
  "models",
  "providers",
  "channels",
  "skills",
  "plugins",
  "files",
  "sessions",
  "speech",
]);

export const observedDomainSchema = z.enum([
  "runtime",
  "workspace",
  "models",
  "providers",
  "channels",
  "skills",
  "plugins",
  "memory",
  "scheduler",
  "sessions",
]);

export const featureOwnershipSchema = z.enum(["sdk-owned", "runtime-owned", "mirrored"]);
export const sessionPolicySchema = z.enum(["managed", "mirror", "native"]);

export const runtimeFeatureDescriptorSchema = z.object({
  featureId: z.string().min(1),
  ownership: featureOwnershipSchema,
  supported: z.boolean(),
  sessionPolicy: sessionPolicySchema.optional(),
  limitations: z.array(z.string()).optional(),
});

export const linkedEntityRefSchema = z.object({
  domain: z.enum(["area", "list", "section", "task", "goal", "project", "comment", "attachment", "saved_view", "recurrence", "cycle", "epic", "custom_field", "field_value", "template", "milestone", "activity_entry", "blocker", "artifact", "decision", "work_session", "assignment", "handoff", "approval", "capacity", "agent", "release", "incident", "feedback_item", "operational_check", "reminder", "deadline", "note", "person", "inbox_thread", "inbox_message", "event"]),
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  relationship: z.string().min(1).optional(),
});

export const workspaceEntitySourceSchema = z.object({
  kind: z.enum(["local", "channel", "imported", "derived"]),
  channel: z.string().min(1).optional(),
  externalId: z.string().min(1).optional(),
});

const workspaceRecordBaseShape = {
  id: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  archivedAt: z.string().min(1).optional(),
  source: workspaceEntitySourceSchema,
  links: z.array(linkedEntityRefSchema).optional(),
  metadata: z.record(z.unknown()).optional(),
} satisfies z.ZodRawShape;

export const taskChecklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  completed: z.boolean(),
});

export const areaRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "paused", "archived"]),
  color: z.string().min(1).optional(),
  ownerPersonId: z.string().min(1).optional(),
});

export const taskRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]),
  type: z.enum(["todo", "task", "bug", "story", "feature", "chore"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  rank: z.number().optional(),
  labels: z.array(z.string()),
  areaId: z.string().min(1).optional(),
  listId: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
  assigneePersonId: z.string().min(1).optional(),
  reporterPersonId: z.string().min(1).optional(),
  watcherPersonIds: z.array(z.string()),
  startAt: z.string().min(1).optional(),
  deferUntil: z.string().min(1).optional(),
  dueAt: z.string().min(1).optional(),
  deadlineAt: z.string().min(1).optional(),
  snoozedUntil: z.string().min(1).optional(),
  recurrenceRule: z.string().min(1).optional(),
  estimateMinutes: z.number().int().nonnegative().optional(),
  actualMinutes: z.number().int().nonnegative().optional(),
  storyPoints: z.number().nonnegative().optional(),
  blockedReason: z.string().min(1).optional(),
  waitingOn: z.string().min(1).optional(),
  startedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  cancelledAt: z.string().min(1).optional(),
  scheduledEventId: z.string().min(1).optional(),
  eventId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  cycleId: z.string().min(1).optional(),
  epicId: z.string().min(1).optional(),
  parentTaskId: z.string().min(1).optional(),
  childTaskIds: z.array(z.string()),
  dependsOnTaskIds: z.array(z.string()),
  commentIds: z.array(z.string()),
  attachmentIds: z.array(z.string()),
  createdBy: z.string().min(1).optional(),
  updatedBy: z.string().min(1).optional(),
  assignedToAgentId: z.string().min(1).optional(),
  assignedBy: z.string().min(1).optional(),
  delegatedBy: z.string().min(1).optional(),
  reviewerAgentId: z.string().min(1).optional(),
  blockedByIds: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  decisionIds: z.array(z.string()),
  assignmentIds: z.array(z.string()),
  handoffIds: z.array(z.string()),
  approvalIds: z.array(z.string()),
  sourceItemId: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  handoffTo: z.string().min(1).optional(),
  approvedBy: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  portfolioId: z.string().min(1).optional(),
  portfolioItemId: z.string().min(1).optional(),
  checklist: z.array(taskChecklistItemSchema),
});

export const goalRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "paused", "done"]),
  level: z.enum(["company", "team", "personal"]).optional(),
  areaId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(),
  parentGoalId: z.string().min(1).optional(),
  ownerPersonId: z.string().min(1).optional(),
  ownerAgentId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  portfolioId: z.string().min(1).optional(),
  portfolioItemId: z.string().min(1).optional(),
  metricKey: z.string().min(1).optional(),
  metricLabel: z.string().min(1).optional(),
  targetValue: z.number().optional(),
  currentValue: z.number().optional(),
  unit: z.string().min(1).optional(),
  period: z.string().min(1).optional(),
  timeframeStart: z.string().min(1).optional(),
  timeframeEnd: z.string().min(1).optional(),
  reviewCadence: z.enum(["daily", "weekly", "monthly", "quarterly"]).optional(),
  metricDirection: z.enum(["increase", "decrease", "maintain"]).optional(),
  healthStatus: z.enum(["green", "yellow", "red", "unknown"]).optional(),
});

export const projectRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["draft", "in_progress", "paused", "done", "archived"]),
  areaId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  ownerPersonId: z.string().min(1).optional(),
  leadAgentId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  portfolioId: z.string().min(1).optional(),
  portfolioItemId: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  kind: z.enum(["delivery", "growth", "ops", "research", "migration", "other"]).optional(),
  rank: z.number().optional(),
  statusCategory: z.enum(["active", "someday", "planned", "done", "archived"]).optional(),
  healthStatus: z.enum(["green", "yellow", "red", "unknown"]).optional(),
  startAt: z.string().min(1).optional(),
  startDate: z.string().min(1).optional(),
  targetDate: z.string().min(1).optional(),
  deadlineAt: z.string().min(1).optional(),
  milestoneIds: z.array(z.string()),
  defaultSectionIds: z.array(z.string()),
  templateId: z.string().min(1).optional(),
  reviewAt: z.string().min(1).optional(),
  reviewCadence: z.enum(["daily", "weekly", "monthly", "quarterly"]).optional(),
  archiveReason: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
});

export const listRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  kind: z.enum(["inbox", "today", "upcoming", "anytime", "someday", "backlog", "project", "custom"]),
  status: z.enum(["active", "archived"]),
  description: z.string().optional(),
  areaId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  rank: z.number().optional(),
  filter: z.record(z.unknown()).optional(),
});

export const sectionRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["active", "archived"]),
  description: z.string().optional(),
  listId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  areaId: z.string().min(1).optional(),
  rank: z.number().optional(),
});

const productivityCommentEntityTypeSchema = z.enum(["task", "project", "goal", "epic", "cycle", "note", "inbox_thread", "event"]);

export const commentRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  entityType: productivityCommentEntityTypeSchema,
  entityId: z.string().min(1),
  body: z.string().min(1),
  authorPersonId: z.string().min(1).optional(),
  authorAgentId: z.string().min(1).optional(),
  visibility: z.enum(["internal", "shared"]).optional(),
});

export const attachmentRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  entityType: productivityCommentEntityTypeSchema,
  entityId: z.string().min(1),
  name: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  uri: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  preview: z.string().optional(),
  uploadedBy: z.string().min(1).optional(),
});

export const savedViewRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  name: z.string().min(1),
  domain: z.enum(["tasks", "projects", "goals", "inbox", "events", "workspace"]),
  query: z.string().optional(),
  filters: z.record(z.unknown()).optional(),
  sort: z.record(z.unknown()).optional(),
  groupBy: z.string().min(1).optional(),
  favorite: z.boolean().optional(),
  rank: z.number().optional(),
});

export const recurrenceRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["active", "paused", "ended"]),
  rule: z.string().min(1),
  timezone: z.string().min(1).optional(),
  anchorType: z.enum(["task", "project", "goal", "event", "standalone"]).optional(),
  anchorId: z.string().min(1).optional(),
  nextRunAt: z.string().min(1).optional(),
  lastRunAt: z.string().min(1).optional(),
});

export const cycleRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  name: z.string().min(1),
  status: z.enum(["planned", "active", "completed", "archived"]),
  description: z.string().optional(),
  teamId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
  capacityPoints: z.number().nonnegative().optional(),
  taskIds: z.array(z.string()),
});

export const epicRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["planned", "active", "done", "archived"]),
  kind: z.enum(["epic", "initiative"]),
  description: z.string().optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  ownerPersonId: z.string().min(1).optional(),
  rank: z.number().optional(),
  targetDate: z.string().min(1).optional(),
  healthStatus: z.enum(["green", "yellow", "red", "unknown"]).optional(),
  taskIds: z.array(z.string()),
});

export const customFieldRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  name: z.string().min(1),
  entityType: z.enum(["task", "project", "goal", "epic", "cycle", "person"]),
  fieldType: z.enum(["text", "number", "boolean", "date", "select", "multi_select", "person", "relation", "url", "json"]),
  description: z.string().optional(),
  options: z.array(z.unknown()).optional(),
  required: z.boolean().optional(),
  rank: z.number().optional(),
});

export const fieldValueRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  fieldId: z.string().min(1),
  entityType: z.enum(["task", "project", "goal", "epic", "cycle", "person"]),
  entityId: z.string().min(1),
  value: z.unknown().optional(),
});

export const productivityTemplateRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  name: z.string().min(1),
  entityType: z.enum(["task", "project", "goal", "epic", "cycle", "note"]),
  status: z.enum(["active", "archived"]),
  description: z.string().optional(),
  body: z.record(z.unknown()).optional(),
  rank: z.number().optional(),
});

export const milestoneRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["planned", "active", "done", "archived"]),
  areaId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  targetDate: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
});

export const activityEntryRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  entityType: z.enum(["area", "list", "section", "task", "goal", "project", "comment", "attachment", "saved_view", "recurrence", "cycle", "epic", "custom_field", "field_value", "template", "milestone", "activity_entry", "blocker", "artifact", "decision", "work_session", "assignment", "handoff", "approval", "capacity", "agent", "release", "incident", "feedback_item", "operational_check", "reminder", "deadline", "note", "person", "inbox_thread", "inbox_message", "event"]),
  entityId: z.string().min(1),
  kind: z.enum(["created", "updated", "completed", "archived", "processed", "commented"]),
  title: z.string().min(1),
  content: z.string().optional(),
  areaId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  milestoneId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
});

export const blockerRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "resolved", "cancelled"]),
  kind: z.enum(["waiting_human", "waiting_agent", "waiting_system", "missing_context", "policy_block"]),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  ownerPersonId: z.string().min(1).optional(),
  ownerAgentId: z.string().min(1).optional(),
  dependencyTaskIds: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  resolvedAt: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const artifactRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  kind: z.enum(["link", "file", "command", "test", "screenshot", "message", "note"]),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  decisionId: z.string().min(1).optional(),
  uri: z.string().min(1).optional(),
  summary: z.string().optional(),
  content: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const decisionRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  summary: z.string().optional(),
  status: z.enum(["proposed", "accepted", "rejected", "superseded"]),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  ownerPersonId: z.string().min(1).optional(),
  ownerAgentId: z.string().min(1).optional(),
  outcome: z.string().optional(),
  rationale: z.string().optional(),
  alternatives: z.array(z.string()),
  artifactIds: z.array(z.string()),
  confidence: z.number().min(0).max(1).optional(),
});

export const workSessionRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["active", "completed", "cancelled"]),
  objective: z.string().optional(),
  taskIds: z.array(z.string()),
  blockerIds: z.array(z.string()),
  startedAt: z.string().min(1),
  endedAt: z.string().min(1).optional(),
  outcome: z.string().optional(),
  timeboxMinutes: z.number().int().nonnegative().optional(),
  ownerAgentId: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const assignmentRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["proposed", "accepted", "rejected", "released", "completed"]),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  assignedToAgentId: z.string().min(1),
  assignedBy: z.string().min(1).optional(),
  delegatedBy: z.string().min(1).optional(),
  reviewerAgentId: z.string().min(1).optional(),
  rationale: z.string().optional(),
  rejectionReason: z.string().optional(),
  acceptedAt: z.string().min(1).optional(),
  rejectedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  dueAt: z.string().min(1).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const handoffRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["proposed", "accepted", "rejected", "returned", "completed"]),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1),
  objective: z.string().optional(),
  currentState: z.string().optional(),
  contextSummary: z.string().optional(),
  nextStep: z.string().optional(),
  riskSummary: z.string().optional(),
  artifactIds: z.array(z.string()),
  blockerIds: z.array(z.string()),
  approvalId: z.string().min(1).optional(),
  rejectionReason: z.string().optional(),
  acceptedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const productivityApprovalRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected", "cancelled"]),
  kind: z.enum(["deploy", "publish", "delete", "external_send", "spend", "policy_gate", "other"]),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  handoffId: z.string().min(1).optional(),
  requestedByAgentId: z.string().min(1).optional(),
  approverAgentId: z.string().min(1).optional(),
  policyReason: z.string().min(1),
  evidenceIds: z.array(z.string()),
  decisionIds: z.array(z.string()),
  approvedBy: z.string().min(1).optional(),
  outcome: z.string().optional(),
  approvedAt: z.string().min(1).optional(),
  rejectedAt: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const capacityRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["active", "limited", "overloaded", "offline"]),
  agentId: z.string().min(1),
  teamId: z.string().min(1).optional(),
  role: z.string().optional(),
  availability: z.enum(["available", "busy", "away", "offline"]),
  maxWip: z.number().int().nonnegative().optional(),
  currentWip: z.number().int().nonnegative(),
  queueDepth: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  overdueCount: z.number().int().nonnegative(),
  responseLatencyMinutes: z.number().int().nonnegative().optional(),
  utilization: z.number().min(0).max(1).optional(),
  assignedTaskIds: z.array(z.string()),
  pendingApprovalIds: z.array(z.string()),
  pendingHandoffIds: z.array(z.string()),
  snapshotAt: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const agentRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  name: z.string().min(1),
  status: z.enum(["active", "limited", "offline"]),
  role: z.string().min(1),
  teamId: z.string().min(1).optional(),
  domains: z.array(z.string()),
  shift: z.string().optional(),
  availability: z.enum(["available", "busy", "away", "offline"]),
  autonomyLevel: z.enum(["observe", "suggest", "act_limited", "act_full"]),
  permissions: z.array(z.string()),
  policyGate: z.enum(["none", "approval_required", "restricted"]),
  currentFocus: z.string().optional(),
  linkedTaskIds: z.array(z.string()),
  confidence: z.number().min(0).max(1).optional(),
});

export const releaseRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["planned", "active", "at_risk", "released", "cancelled"]),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  ownerAgentId: z.string().min(1).optional(),
  targetDate: z.string().min(1).optional(),
  shippedAt: z.string().min(1).optional(),
  riskSummary: z.string().optional(),
  linkedTaskIds: z.array(z.string()),
  incidentIds: z.array(z.string()),
  approvalIds: z.array(z.string()),
  confidence: z.number().min(0).max(1).optional(),
});

export const incidentRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["open", "investigating", "mitigating", "resolved", "closed"]),
  severity: z.enum(["sev1", "sev2", "sev3", "sev4"]),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  releaseId: z.string().min(1).optional(),
  ownerAgentId: z.string().min(1).optional(),
  summary: z.string().optional(),
  customerImpact: z.string().optional(),
  blockerIds: z.array(z.string()),
  feedbackIds: z.array(z.string()),
  startedAt: z.string().min(1).optional(),
  resolvedAt: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const feedbackRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["new", "triaged", "planned", "closed"]),
  origin: z.enum(["customer", "agent", "system", "sales", "support", "ops"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  incidentId: z.string().min(1).optional(),
  ownerAgentId: z.string().min(1).optional(),
  summary: z.string().optional(),
  followUpTaskId: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const operationalCheckRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["pending", "passing", "failing", "snoozed"]),
  kind: z.enum(["release_readiness", "incident_followup", "sla", "quality", "compliance", "ops"]),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  releaseId: z.string().min(1).optional(),
  incidentId: z.string().min(1).optional(),
  ownerAgentId: z.string().min(1).optional(),
  cadence: z.enum(["hourly", "daily", "weekly", "monthly"]).optional(),
  lastRunAt: z.string().min(1).optional(),
  nextRunAt: z.string().min(1).optional(),
  resultSummary: z.string().optional(),
  playbook: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const productivityAnchorTypeSchema = z.enum(["task", "project", "goal", "event", "thread", "standalone"]);

export const reminderRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "paused", "done", "cancelled"]),
  triggerAt: z.string().min(1),
  anchorType: productivityAnchorTypeSchema.optional(),
  anchorId: z.string().min(1).optional(),
  channel: z.string().min(1).optional(),
});

export const deadlineRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "paused", "done", "cancelled"]),
  dueAt: z.string().min(1),
  anchorType: productivityAnchorTypeSchema.optional(),
  anchorId: z.string().min(1).optional(),
});

export const noteBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["paragraph", "heading", "bullet_list", "checklist", "quote", "code"]),
  text: z.string(),
});

export const noteRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  blocks: z.array(noteBlockSchema),
  tags: z.array(z.string()),
  summary: z.string().optional(),
  attachments: z.array(z.object({
    name: z.string().min(1),
    mimeType: z.string().min(1),
    data: z.string().optional(),
    preview: z.string().optional(),
  })).optional(),
  linkedEntityIds: z.array(z.string()),
  searchText: z.string(),
});

export const personIdentitySchema = z.object({
  channel: z.string().min(1),
  handle: z.string().min(1),
  externalId: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
});

export const personRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  displayName: z.string().min(1),
  kind: z.enum(["human", "agent", "org"]),
  identities: z.array(personIdentitySchema),
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  handles: z.array(z.string()),
  role: z.string().optional(),
  organization: z.string().optional(),
});

export const eventReminderSchema = z.object({
  id: z.string().min(1),
  minutesBeforeStart: z.number().int(),
  channel: z.string().min(1).optional(),
});

export const eventRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1).optional(),
  location: z.string().optional(),
  attendeePersonIds: z.array(z.string()),
  linkedTaskIds: z.array(z.string()),
  linkedNoteIds: z.array(z.string()),
  reminders: z.array(eventReminderSchema),
});

export const temporalParticipantSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["human", "agent", "org", "external"]),
  label: z.string().min(1),
  personId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const temporalActionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["notify", "agent_prompt", "workflow", "create_task", "calendar_sync"]),
  target: z.string().min(1).optional(),
  payload: z.record(z.unknown()).optional(),
});

export const temporalOccurrenceOverrideSchema = z.object({
  originalStartAt: z.string().min(1),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
  cancelled: z.boolean().optional(),
});

export const temporalScheduleSchema = z.object({
  mode: z.enum(["one_off", "cron", "rrule", "relative"]),
  timezone: z.string().min(1),
  startsAt: z.string().min(1).optional(),
  cron: z.string().min(1).optional(),
  rrule: z.string().min(1).optional(),
  staggerMs: z.number().int().nonnegative().optional(),
  relative: z.object({
    anchorType: z.enum(["thread", "task", "project", "goal", "event", "execution", "standalone"]),
    anchorId: z.string().min(1),
    anchorAt: z.string().min(1),
    offsetMs: z.number().int().nonnegative(),
    cancelOn: z.enum(["reply_received", "task_completed", "event_started", "execution_succeeded"]).optional(),
  }).optional(),
  overrides: z.array(temporalOccurrenceOverrideSchema).optional(),
  cancelledOccurrences: z.array(z.string()).optional(),
});

export const temporalProjectionSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  target: z.enum(["workspace_events", "relay_routines", "google_calendar", "runtime_scheduler", "notify"]),
  status: z.enum(["pending", "active", "synced", "failed"]),
  provider: z.string().min(1).optional(),
  externalId: z.string().min(1).optional(),
  detail: z.record(z.unknown()).optional(),
  updatedAt: z.string().min(1),
});

export const temporalExecutionSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  status: z.enum(["pending", "running", "succeeded", "failed", "cancelled"]),
  scheduledFor: z.string().min(1),
  startedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  triggeredBy: z.enum(["scheduler", "manual", "system"]),
  output: z.string().optional(),
  error: z.string().optional(),
});

export const temporalHeartbeatUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});

export const temporalHeartbeatAgentResultSchema = z.object({
  status: z.enum(["done", "continue", "disable", "error", "noop"]),
  summary: z.string().optional(),
  error: z.string().optional(),
  usage: temporalHeartbeatUsageSchema.optional(),
});

export const temporalRunLogEntrySchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  status: z.enum(["succeeded", "failed", "cancelled", "noop"]),
  scheduledFor: z.string().min(1),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  triggeredBy: z.enum(["scheduler", "manual", "system"]),
  summary: z.string().optional(),
  error: z.string().optional(),
  agentResult: temporalHeartbeatAgentResultSchema.optional(),
  usage: temporalHeartbeatUsageSchema.optional(),
});

export const temporalHeartbeatPolicySchema = z.object({
  when: z.array(z.string().min(1)),
  stopWhen: z.array(z.string().min(1)).optional(),
  context: z.literal("diff"),
  limit: z.number().int().positive(),
  target: z.enum(["main", "isolated"]).optional(),
  deliver: z.union([
    z.boolean(),
    z.object({
      target: z.string().min(1).optional(),
      mode: z.enum(["summary", "none"]).optional(),
    }),
  ]).optional(),
  activeHours: z.object({
    start: z.string().min(1),
    end: z.string().min(1),
    timezone: z.string().min(1).optional(),
  }).optional(),
  cooldownMs: z.number().int().nonnegative().optional(),
  maxWakesPerWindow: z.object({
    count: z.number().int().positive(),
    windowMs: z.number().int().positive(),
  }).optional(),
  staggerMs: z.number().int().nonnegative().optional(),
  prompt: z.string().optional(),
  gate: z.object({
    path: z.string().min(1).optional(),
    policy: z.record(z.unknown()).optional(),
  }).optional(),
  allowedCustomChecks: z.array(z.string().min(1)).optional(),
  state: z.object({
    lastEvaluatedAt: z.string().min(1).optional(),
    lastWakeAt: z.string().min(1).optional(),
    lastSkipAt: z.string().min(1).optional(),
    skipCount: z.number().int().nonnegative(),
    lastSkipReason: z.string().optional(),
    lastNoopAt: z.string().min(1).optional(),
    lastCompletedAt: z.string().min(1).optional(),
    lastMatches: z.array(z.object({
      source: z.string().min(1),
      id: z.string().min(1),
      title: z.string().optional(),
      updatedAt: z.string().optional(),
      payload: z.record(z.unknown()).optional(),
    })).optional(),
    lastResult: temporalHeartbeatAgentResultSchema.extend({ at: z.string().min(1) }).optional(),
    wakeTimestamps: z.array(z.string().min(1)).optional(),
  }).optional(),
});

export const temporalNaturalInputSchema = z.object({
  command: z.enum(["at", "every", "after"]),
  expression: z.string().min(1),
  timezone: z.string().min(1).optional(),
  anchorType: z.enum(["thread", "task", "project", "goal", "event", "execution", "standalone"]).optional(),
  anchorId: z.string().min(1).optional(),
  anchorAt: z.string().min(1).optional(),
});

export const temporalItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["event", "routine", "reminder", "deadline", "follow_up"]),
  status: z.enum(["active", "paused", "cancelled", "completed"]),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
  dueAt: z.string().min(1).optional(),
  timezone: z.string().min(1),
  schedule: temporalScheduleSchema,
  participants: z.array(temporalParticipantSchema),
  actions: z.array(temporalActionSchema),
  projections: z.array(temporalProjectionSchema),
  heartbeat: temporalHeartbeatPolicySchema.optional(),
  runtime: z.object({
    runningExecutionId: z.string().min(1).optional(),
    runningAt: z.string().min(1).optional(),
    consecutiveErrors: z.number().int().nonnegative().optional(),
    lastErrorAt: z.string().min(1).optional(),
    lastError: z.string().optional(),
    nextRetryAt: z.string().min(1).optional(),
    lastDurationMs: z.number().int().nonnegative().optional(),
  }).optional(),
  ownerId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  sourceProvider: z.string().min(1).optional(),
  anchorType: z.enum(["thread", "task", "project", "goal", "event", "execution", "standalone"]).optional(),
  anchorId: z.string().min(1).optional(),
  nextRunAt: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const workspaceSearchQuerySchema = z.object({
  query: z.string().min(1),
  domains: z.array(z.enum(["areas", "lists", "sections", "tasks", "goals", "projects", "comments", "attachments", "saved_views", "recurrences", "cycles", "epics", "custom_fields", "field_values", "templates", "milestones", "activity", "blockers", "artifacts", "decisions", "work_sessions", "assignments", "handoffs", "approvals", "capacity", "agents", "releases", "incidents", "feedback", "checks", "reminders", "deadlines", "notes", "people", "inbox", "events"])).optional(),
  strategy: z.enum(["auto", "keyword", "semantic", "hybrid"]).optional(),
  limit: z.number().int().positive().optional(),
  includeArchived: z.boolean().optional(),
});

export const workspaceSearchResultSchema = z.object({
  domain: z.enum(["areas", "lists", "sections", "tasks", "goals", "projects", "comments", "attachments", "saved_views", "recurrences", "cycles", "epics", "custom_fields", "field_values", "templates", "milestones", "activity", "blockers", "artifacts", "decisions", "work_sessions", "assignments", "handoffs", "approvals", "capacity", "agents", "releases", "incidents", "feedback", "checks", "reminders", "deadlines", "notes", "people", "inbox", "events"]),
  id: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string(),
  score: z.number(),
  strategy: z.enum(["keyword", "semantic", "hybrid"]),
  matchedFields: z.array(z.string()),
  links: z.array(linkedEntityRefSchema).optional(),
  updatedAt: z.string().min(1).optional(),
});
