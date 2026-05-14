import type {
  ActivityEntryRecord,
  AgentRecord,
  ArtifactRecord,
  AssignmentRecord,
  AreaRecord,
  BlockerRecord,
  CapacityRecord,
  DeadlineRecord,
  DecisionRecord,
  EventRecord,
  FeedbackRecord,
  GoalRecord,
  HandoffRecord,
  IncidentRecord,
  MilestoneRecord,
  NoteRecord,
  OperationalCheckRecord,
  PersonRecord,
  ProductivityApprovalRecord,
  ProjectRecord,
  ReleaseRecord,
  ReminderRecord,
  TaskRecord,
  WorkSessionRecord,
} from "@clawjs/core";

export function summarizeSnippet(value: string, maxLength = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3).trim()}...`;
}



export function messagePreview(value: string): string {
  return summarizeSnippet(value, 140);
}



export function areaSearchText(area: AreaRecord): string {
  return [
    area.name,
    area.description,
    area.status,
  ].filter(Boolean).join(" ");
}



export function taskSearchText(task: TaskRecord): string {
  return [
    task.title,
    task.description,
    task.status,
    task.type,
    task.priority,
    task.areaId,
    task.listId,
    task.sectionId,
    task.projectId,
    task.goalId,
    task.cycleId,
    task.epicId,
    task.assignedToAgentId,
    task.reporterPersonId,
    task.reviewerAgentId,
    task.handoffTo,
    task.approvedBy,
    task.blockedReason,
    task.waitingOn,
    task.recurrenceRule,
    ...task.labels,
    ...task.commentIds,
    ...task.attachmentIds,
    ...task.assignmentIds,
    ...task.handoffIds,
    ...task.approvalIds,
    ...task.checklist.map((item) => item.text),
  ].filter(Boolean).join(" ");
}



export function goalSearchText(goal: GoalRecord): string {
  return [
    goal.title,
    goal.description,
    goal.status,
    goal.areaId,
    goal.metricKey,
    goal.metricLabel,
    goal.unit,
    goal.period,
    goal.reviewCadence,
  ].filter(Boolean).join(" ");
}



export function projectSearchText(project: ProjectRecord): string {
  return [
    project.name,
    project.description,
    project.status,
    project.statusCategory,
    project.areaId,
    project.kind,
    project.goalId,
    project.reviewCadence,
    project.archiveReason,
    project.templateId,
  ].filter(Boolean).join(" ");
}



export function milestoneSearchText(milestone: MilestoneRecord): string {
  return [
    milestone.title,
    milestone.description,
    milestone.status,
    milestone.areaId,
    milestone.projectId,
    milestone.goalId,
  ].filter(Boolean).join(" ");
}



export function activitySearchText(activity: ActivityEntryRecord): string {
  return [
    activity.title,
    activity.content,
    activity.kind,
    activity.entityType,
    activity.entityId,
    activity.areaId,
    activity.projectId,
    activity.goalId,
    activity.taskId,
    activity.threadId,
  ].filter(Boolean).join(" ");
}



export function blockerSearchText(blocker: BlockerRecord): string {
  return [
    blocker.title,
    blocker.description,
    blocker.status,
    blocker.kind,
    blocker.taskId,
    blocker.projectId,
    blocker.goalId,
    blocker.ownerPersonId,
    blocker.ownerAgentId,
    ...blocker.dependencyTaskIds,
  ].filter(Boolean).join(" ");
}



export function artifactSearchText(artifact: ArtifactRecord): string {
  return [
    artifact.title,
    artifact.kind,
    artifact.summary,
    artifact.content,
    artifact.uri,
    artifact.taskId,
    artifact.projectId,
    artifact.goalId,
    artifact.threadId,
    artifact.decisionId,
  ].filter(Boolean).join(" ");
}



export function decisionSearchText(decision: DecisionRecord): string {
  return [
    decision.title,
    decision.summary,
    decision.status,
    decision.outcome,
    decision.rationale,
    decision.taskId,
    decision.projectId,
    decision.goalId,
    ...decision.alternatives,
  ].filter(Boolean).join(" ");
}



export function workSessionSearchText(session: WorkSessionRecord): string {
  return [
    session.title,
    session.status,
    session.objective,
    session.outcome,
    session.ownerAgentId,
    ...session.taskIds,
    ...session.blockerIds,
  ].filter(Boolean).join(" ");
}



export function assignmentSearchText(assignment: AssignmentRecord): string {
  return [
    assignment.title,
    assignment.status,
    assignment.taskId,
    assignment.projectId,
    assignment.goalId,
    assignment.assignedToAgentId,
    assignment.assignedBy,
    assignment.delegatedBy,
    assignment.reviewerAgentId,
    assignment.rationale,
    assignment.rejectionReason,
  ].filter(Boolean).join(" ");
}



export function handoffSearchText(handoff: HandoffRecord): string {
  return [
    handoff.title,
    handoff.status,
    handoff.taskId,
    handoff.projectId,
    handoff.goalId,
    handoff.fromAgentId,
    handoff.toAgentId,
    handoff.objective,
    handoff.currentState,
    handoff.contextSummary,
    handoff.nextStep,
    handoff.riskSummary,
    ...handoff.artifactIds,
    ...handoff.blockerIds,
  ].filter(Boolean).join(" ");
}



export function approvalSearchText(approval: ProductivityApprovalRecord): string {
  return [
    approval.title,
    approval.status,
    approval.kind,
    approval.taskId,
    approval.projectId,
    approval.goalId,
    approval.handoffId,
    approval.requestedByAgentId,
    approval.approverAgentId,
    approval.policyReason,
    approval.outcome,
    ...approval.evidenceIds,
    ...approval.decisionIds,
  ].filter(Boolean).join(" ");
}



export function capacitySearchText(capacity: CapacityRecord): string {
  return [
    capacity.title,
    capacity.status,
    capacity.agentId,
    capacity.teamId,
    capacity.role,
    capacity.availability,
    ...capacity.assignedTaskIds,
    ...capacity.pendingApprovalIds,
    ...capacity.pendingHandoffIds,
  ].filter(Boolean).join(" ");
}



export function agentSearchText(agent: AgentRecord): string {
  return [
    agent.name,
    agent.status,
    agent.role,
    agent.teamId,
    agent.shift,
    agent.availability,
    agent.autonomyLevel,
    agent.policyGate,
    agent.currentFocus,
    ...agent.domains,
    ...agent.permissions,
    ...agent.linkedTaskIds,
  ].filter(Boolean).join(" ");
}



export function releaseSearchText(release: ReleaseRecord): string {
  return [
    release.title,
    release.status,
    release.projectId,
    release.goalId,
    release.ownerAgentId,
    release.riskSummary,
    ...release.linkedTaskIds,
    ...release.incidentIds,
    ...release.approvalIds,
  ].filter(Boolean).join(" ");
}



export function incidentSearchText(incident: IncidentRecord): string {
  return [
    incident.title,
    incident.status,
    incident.severity,
    incident.projectId,
    incident.goalId,
    incident.taskId,
    incident.releaseId,
    incident.ownerAgentId,
    incident.summary,
    incident.customerImpact,
    ...incident.blockerIds,
    ...incident.feedbackIds,
  ].filter(Boolean).join(" ");
}



export function feedbackSearchText(feedback: FeedbackRecord): string {
  return [
    feedback.title,
    feedback.status,
    feedback.origin,
    feedback.priority,
    feedback.projectId,
    feedback.goalId,
    feedback.taskId,
    feedback.incidentId,
    feedback.ownerAgentId,
    feedback.summary,
    feedback.followUpTaskId,
  ].filter(Boolean).join(" ");
}



export function checkSearchText(check: OperationalCheckRecord): string {
  return [
    check.title,
    check.status,
    check.kind,
    check.projectId,
    check.goalId,
    check.releaseId,
    check.incidentId,
    check.ownerAgentId,
    check.cadence,
    check.resultSummary,
    check.playbook,
  ].filter(Boolean).join(" ");
}



export function reminderSearchText(reminder: ReminderRecord): string {
  return [
    reminder.title,
    reminder.description,
    reminder.status,
    reminder.anchorType,
    reminder.anchorId,
    reminder.channel,
  ].filter(Boolean).join(" ");
}



export function deadlineSearchText(deadline: DeadlineRecord): string {
  return [
    deadline.title,
    deadline.description,
    deadline.status,
    deadline.anchorType,
    deadline.anchorId,
  ].filter(Boolean).join(" ");
}



export function noteSearchText(note: NoteRecord): string {
  return [
    note.title,
    note.summary,
    ...note.tags,
    ...note.blocks.map((block) => block.text),
  ].filter(Boolean).join(" ");
}



export function personSearchText(person: PersonRecord): string {
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



export function eventSearchText(event: EventRecord): string {
  return [
    event.title,
    event.description,
    event.location,
  ].filter(Boolean).join(" ");
}



export function simpleRecordTitle(record: Record<string, unknown>): string {
  return String(record.title ?? record.name ?? record.body ?? record.fieldId ?? record.id ?? "");
}



export function simpleRecordSearchText(record: Record<string, unknown>): string {
  return [
    record.title,
    record.name,
    record.description,
    record.body,
    record.status,
    record.kind,
    record.entityType,
    record.entityId,
    record.rule,
    record.query,
    record.mimeType,
    record.uri,
    record.path,
  ].filter((value) => typeof value === "string" || typeof value === "number" || typeof value === "boolean").join(" ");
}
