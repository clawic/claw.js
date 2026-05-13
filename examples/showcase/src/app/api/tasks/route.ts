import { NextResponse } from "next/server";

import { isE2EEnabled } from "@/lib/e2e";
import { getWorkspaceClaw } from "@/lib/workspace-claw";
import {
  generateId,
  readCollection,
  writeCollection,
  type Approval,
  type AgentRecord,
  type Artifact,
  type Assignment,
  type Blocker,
  type CapacitySnapshot,
  type Decision,
  type FeedbackRecord,
  type Goal,
  type Handoff,
  type IncidentRecord,
  type InboxMessage,
  type OperationsCockpit,
  type OperationalCheckRecord,
  type ReleaseRecord,
  type Task,
  type WorkSession,
} from "@/lib/demo-store";

const SDK_TO_PAGE_STATUS: Record<string, Task["status"]> = {
  todo: "backlog",
  in_progress: "in_progress",
  done: "done",
  blocked: "blocked",
  cancelled: "done",
};

const PAGE_TO_SDK_STATUS: Record<Task["status"], string> = {
  backlog: "todo",
  in_progress: "in_progress",
  done: "done",
  blocked: "blocked",
};

function toSdkTaskStatus(value: unknown): string {
  if (typeof value !== "string") return "todo";
  return PAGE_TO_SDK_STATUS[value as Task["status"]] || value;
}

function toTimestamp(value?: string | number | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function taskToPage(task: any): Task {
  return {
    id: task.id,
    title: task.title,
    description: task.description || "",
    status: SDK_TO_PAGE_STATUS[task.status] || "backlog",
    priority: task.priority || "medium",
    goalId: task.goalId || task.metadata?.goalId,
    labels: task.labels || [],
    linkedSessionIds: task.metadata?.linkedSessionIds || [],
    blockedByIds: task.blockedByIds || [],
    evidenceIds: task.evidenceIds || [],
    decisionIds: task.decisionIds || [],
    assignmentIds: task.assignmentIds || [],
    handoffIds: task.handoffIds || [],
    approvalIds: task.approvalIds || [],
    assignedToAgentId: task.assignedToAgentId,
    reviewerAgentId: task.reviewerAgentId,
    handoffTo: task.handoffTo,
    approvedBy: task.approvedBy,
    createdAt: new Date(task.createdAt).getTime(),
    updatedAt: new Date(task.updatedAt).getTime(),
  };
}

function goalToPage(goal: any): Goal {
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description || "",
    parentId: goal.parentGoalId || goal.parentId,
    progress: typeof goal.currentValue === "number" && typeof goal.targetValue === "number" && goal.targetValue > 0
      ? Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))
      : 0,
    status: goal.status === "done" ? "completed" : goal.status === "paused" ? "paused" : "active",
    taskIds: [],
    createdAt: new Date(goal.createdAt).getTime(),
    updatedAt: new Date(goal.updatedAt).getTime(),
  };
}

function blockerToPage(blocker: any): Blocker {
  return {
    id: blocker.id,
    title: blocker.title,
    kind: blocker.kind,
    status: blocker.status,
    taskId: blocker.taskId,
    description: blocker.description,
    createdAt: new Date(blocker.createdAt).getTime(),
    updatedAt: new Date(blocker.updatedAt).getTime(),
  };
}

function artifactToPage(artifact: any): Artifact {
  return {
    id: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    taskId: artifact.taskId,
    summary: artifact.summary,
    uri: artifact.uri,
    content: artifact.content,
    createdAt: new Date(artifact.createdAt).getTime(),
    updatedAt: new Date(artifact.updatedAt).getTime(),
  };
}

function decisionToPage(decision: any): Decision {
  return {
    id: decision.id,
    title: decision.title,
    status: decision.status,
    taskId: decision.taskId,
    summary: decision.summary,
    alternatives: decision.alternatives || [],
    artifactIds: decision.artifactIds || [],
    createdAt: new Date(decision.createdAt).getTime(),
    updatedAt: new Date(decision.updatedAt).getTime(),
  };
}

function workSessionToPage(session: any): WorkSession {
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    taskIds: session.taskIds || [],
    blockerIds: session.blockerIds || [],
    objective: session.objective,
    outcome: session.outcome,
    timeboxMinutes: session.timeboxMinutes,
    startedAt: new Date(session.startedAt).getTime(),
    endedAt: session.endedAt ? new Date(session.endedAt).getTime() : undefined,
    createdAt: new Date(session.createdAt).getTime(),
    updatedAt: new Date(session.updatedAt).getTime(),
  };
}

function assignmentToPage(assignment: any): Assignment {
  return {
    id: assignment.id,
    title: assignment.title,
    status: assignment.status,
    taskId: assignment.taskId,
    projectId: assignment.projectId,
    goalId: assignment.goalId,
    assignedToAgentId: assignment.assignedToAgentId,
    assignedBy: assignment.assignedBy,
    delegatedBy: assignment.delegatedBy,
    reviewerAgentId: assignment.reviewerAgentId,
    rationale: assignment.rationale,
    rejectionReason: assignment.rejectionReason,
    acceptedAt: toTimestamp(assignment.acceptedAt),
    rejectedAt: toTimestamp(assignment.rejectedAt),
    completedAt: toTimestamp(assignment.completedAt),
    dueAt: toTimestamp(assignment.dueAt),
    priority: assignment.priority,
    createdAt: new Date(assignment.createdAt).getTime(),
    updatedAt: new Date(assignment.updatedAt).getTime(),
  };
}

function handoffToPage(handoff: any): Handoff {
  return {
    id: handoff.id,
    title: handoff.title,
    status: handoff.status,
    taskId: handoff.taskId,
    projectId: handoff.projectId,
    goalId: handoff.goalId,
    fromAgentId: handoff.fromAgentId,
    toAgentId: handoff.toAgentId,
    objective: handoff.objective,
    currentState: handoff.currentState,
    contextSummary: handoff.contextSummary,
    nextStep: handoff.nextStep,
    riskSummary: handoff.riskSummary,
    artifactIds: handoff.artifactIds || [],
    blockerIds: handoff.blockerIds || [],
    approvalId: handoff.approvalId,
    rejectionReason: handoff.rejectionReason,
    acceptedAt: toTimestamp(handoff.acceptedAt),
    completedAt: toTimestamp(handoff.completedAt),
    createdAt: new Date(handoff.createdAt).getTime(),
    updatedAt: new Date(handoff.updatedAt).getTime(),
  };
}

function approvalToPage(approval: any): Approval {
  return {
    id: approval.id,
    title: approval.title,
    status: approval.status,
    kind: approval.kind,
    taskId: approval.taskId,
    projectId: approval.projectId,
    goalId: approval.goalId,
    handoffId: approval.handoffId,
    requestedByAgentId: approval.requestedByAgentId,
    approverAgentId: approval.approverAgentId,
    policyReason: approval.policyReason,
    evidenceIds: approval.evidenceIds || [],
    decisionIds: approval.decisionIds || [],
    approvedBy: approval.approvedBy,
    outcome: approval.outcome,
    approvedAt: toTimestamp(approval.approvedAt),
    rejectedAt: toTimestamp(approval.rejectedAt),
    createdAt: new Date(approval.createdAt).getTime(),
    updatedAt: new Date(approval.updatedAt).getTime(),
  };
}

function capacityToPage(snapshot: any): CapacitySnapshot {
  return {
    id: snapshot.id,
    title: snapshot.title,
    status: snapshot.status,
    agentId: snapshot.agentId,
    teamId: snapshot.teamId,
    role: snapshot.role,
    availability: snapshot.availability,
    maxWip: snapshot.maxWip,
    currentWip: snapshot.currentWip,
    queueDepth: snapshot.queueDepth,
    blockedCount: snapshot.blockedCount,
    overdueCount: snapshot.overdueCount,
    responseLatencyMinutes: snapshot.responseLatencyMinutes,
    utilization: snapshot.utilization,
    assignedTaskIds: snapshot.assignedTaskIds || [],
    pendingApprovalIds: snapshot.pendingApprovalIds || [],
    pendingHandoffIds: snapshot.pendingHandoffIds || [],
    snapshotAt: toTimestamp(snapshot.snapshotAt),
    createdAt: new Date(snapshot.createdAt).getTime(),
    updatedAt: new Date(snapshot.updatedAt).getTime(),
  };
}

function agentToPage(agent: any): AgentRecord {
  return {
    id: agent.id,
    name: agent.name,
    status: agent.status,
    role: agent.role,
    teamId: agent.teamId,
    domains: agent.domains || [],
    shift: agent.shift,
    availability: agent.availability,
    autonomyLevel: agent.autonomyLevel,
    permissions: agent.permissions || [],
    policyGate: agent.policyGate,
    currentFocus: agent.currentFocus,
    linkedTaskIds: agent.linkedTaskIds || [],
    createdAt: new Date(agent.createdAt).getTime(),
    updatedAt: new Date(agent.updatedAt).getTime(),
  };
}

function releaseToPage(release: any): ReleaseRecord {
  return {
    id: release.id,
    title: release.title,
    status: release.status,
    projectId: release.projectId,
    goalId: release.goalId,
    ownerAgentId: release.ownerAgentId,
    targetDate: toTimestamp(release.targetDate),
    shippedAt: toTimestamp(release.shippedAt),
    riskSummary: release.riskSummary,
    linkedTaskIds: release.linkedTaskIds || [],
    incidentIds: release.incidentIds || [],
    approvalIds: release.approvalIds || [],
    createdAt: new Date(release.createdAt).getTime(),
    updatedAt: new Date(release.updatedAt).getTime(),
  };
}

function incidentToPage(incident: any): IncidentRecord {
  return {
    id: incident.id,
    title: incident.title,
    status: incident.status,
    severity: incident.severity,
    projectId: incident.projectId,
    goalId: incident.goalId,
    taskId: incident.taskId,
    releaseId: incident.releaseId,
    ownerAgentId: incident.ownerAgentId,
    summary: incident.summary,
    customerImpact: incident.customerImpact,
    blockerIds: incident.blockerIds || [],
    feedbackIds: incident.feedbackIds || [],
    startedAt: toTimestamp(incident.startedAt),
    resolvedAt: toTimestamp(incident.resolvedAt),
    createdAt: new Date(incident.createdAt).getTime(),
    updatedAt: new Date(incident.updatedAt).getTime(),
  };
}

function feedbackToPage(feedback: any): FeedbackRecord {
  return {
    id: feedback.id,
    title: feedback.title,
    status: feedback.status,
    origin: feedback.origin,
    priority: feedback.priority,
    projectId: feedback.projectId,
    goalId: feedback.goalId,
    taskId: feedback.taskId,
    incidentId: feedback.incidentId,
    ownerAgentId: feedback.ownerAgentId,
    summary: feedback.summary,
    followUpTaskId: feedback.followUpTaskId,
    createdAt: new Date(feedback.createdAt).getTime(),
    updatedAt: new Date(feedback.updatedAt).getTime(),
  };
}

function checkToPage(check: any): OperationalCheckRecord {
  return {
    id: check.id,
    title: check.title,
    status: check.status,
    kind: check.kind,
    projectId: check.projectId,
    goalId: check.goalId,
    releaseId: check.releaseId,
    incidentId: check.incidentId,
    ownerAgentId: check.ownerAgentId,
    cadence: check.cadence,
    lastRunAt: toTimestamp(check.lastRunAt),
    nextRunAt: toTimestamp(check.nextRunAt),
    resultSummary: check.resultSummary,
    playbook: check.playbook,
    createdAt: new Date(check.createdAt).getTime(),
    updatedAt: new Date(check.updatedAt).getTime(),
  };
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))];
}

function reconcileE2ETask(taskId: string): void {
  const tasks = readCollection<Task>("tasks");
  const blockers = readCollection<Blocker>("blockers");
  const artifacts = readCollection<Artifact>("artifacts");
  const decisions = readCollection<Decision>("decisions");
  const assignments = readCollection<Assignment>("assignments");
  const handoffs = readCollection<Handoff>("handoffs");
  const approvals = readCollection<Approval>("approvals");
  const task = tasks.find((entry) => entry.id === taskId);
  if (!task) return;

  const activeBlockers = blockers.filter((blocker) => blocker.taskId === taskId && blocker.status === "active");
  const relatedArtifacts = artifacts.filter((artifact) => artifact.taskId === taskId);
  const relatedDecisions = decisions.filter((decision) => decision.taskId === taskId);
  const relatedAssignments = assignments.filter((assignment) => assignment.taskId === taskId);
  const openAssignments = relatedAssignments.filter((assignment) => assignment.status === "proposed" || assignment.status === "accepted");
  const primaryAssignment = openAssignments.find((assignment) => assignment.status === "accepted") ?? openAssignments[0];
  const relatedHandoffs = handoffs.filter((handoff) => handoff.taskId === taskId);
  const activeHandoff = relatedHandoffs.find((handoff) => handoff.status === "proposed" || handoff.status === "accepted" || handoff.status === "returned");
  const relatedApprovals = approvals.filter((approval) => approval.taskId === taskId);
  const approved = relatedApprovals.find((approval) => approval.status === "approved");

  writeCollection("tasks", tasks.map((entry) => entry.id === taskId ? {
    ...entry,
    status: activeBlockers.length > 0 ? "blocked" : entry.status === "blocked" ? "backlog" : entry.status,
    blockedByIds: activeBlockers.map((blocker) => blocker.id),
    evidenceIds: relatedArtifacts.map((artifact) => artifact.id),
    decisionIds: relatedDecisions.map((decision) => decision.id),
    assignmentIds: relatedAssignments.map((assignment) => assignment.id),
    handoffIds: relatedHandoffs.map((handoff) => handoff.id),
    approvalIds: relatedApprovals.map((approval) => approval.id),
    assignedToAgentId: primaryAssignment?.assignedToAgentId,
    reviewerAgentId: primaryAssignment?.reviewerAgentId,
    handoffTo: activeHandoff?.toAgentId,
    approvedBy: approved?.approvedBy || approved?.approverAgentId,
    updatedAt: Date.now(),
  } : entry));
}

function buildE2EMyWork(tasks: Task[], blockers: Blocker[], decisions: Decision[], workSessions: WorkSession[], inbox: InboxMessage[]) {
  const triageThreads = inbox
    .filter((message) => !message.read)
    .slice(0, 5)
    .map((message) => ({
      id: message.id,
      subject: message.subject,
      preview: message.preview,
      channel: message.channel,
    }));
  const readyTasks = tasks
    .filter((task) => task.status === "backlog" || task.status === "in_progress")
    .filter((task) => (task.blockedByIds?.length ?? 0) === 0)
    .slice(0, 5);
  const blockedTasks = tasks.filter((task) => task.status === "blocked").slice(0, 5);
  const activeBlockers = blockers.filter((blocker) => blocker.status === "active").slice(0, 5);
  const pendingDecisions = decisions.filter((decision) => decision.status === "proposed" || decision.status === "accepted").slice(0, 5);
  const activeWorkSession = workSessions.find((session) => session.status === "active") ?? null;
  const recentArtifacts = readCollection<Artifact>("artifacts").slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      triageThreads: triageThreads.length,
      readyTasks: readyTasks.length,
      blockedTasks: blockedTasks.length,
      activeBlockers: activeBlockers.length,
      pendingDecisions: pendingDecisions.length,
      activeWorkSessions: activeWorkSession ? 1 : 0,
      recentArtifacts: recentArtifacts.length,
    },
    triageThreads,
    readyTasks,
    blockedTasks,
    activeBlockers,
    pendingDecisions,
    activeWorkSession,
    recentArtifacts,
  };
}

function buildE2ETeamWork(tasks: Task[], assignments: Assignment[], handoffs: Handoff[], approvals: Approval[], snapshots: CapacitySnapshot[]) {
  const agentIds = new Set<string>([
    ...snapshots.map((snapshot) => snapshot.agentId),
    ...assignments.map((assignment) => assignment.assignedToAgentId),
    ...handoffs.flatMap((handoff) => [handoff.fromAgentId, handoff.toAgentId]),
    ...approvals.flatMap((approval) => [approval.requestedByAgentId, approval.approverAgentId]).filter(Boolean) as string[],
  ]);
  const capacity = [...agentIds].map((agentId) => {
    const existing = snapshots.find((snapshot) => snapshot.agentId === agentId);
    const assignedTaskIds = uniqueStrings(assignments.filter((assignment) => assignment.assignedToAgentId === agentId).map((assignment) => assignment.taskId));
    const pendingApprovalIds = approvals.filter((approval) => (approval.approverAgentId === agentId || approval.requestedByAgentId === agentId) && approval.status === "pending").map((approval) => approval.id);
    const pendingHandoffIds = handoffs.filter((handoff) => (handoff.toAgentId === agentId || handoff.fromAgentId === agentId) && handoff.status !== "completed" && handoff.status !== "rejected").map((handoff) => handoff.id);
    const assignedTasks = tasks.filter((task) => assignedTaskIds.includes(task.id));
    const currentWip = assignedTasks.filter((task) => task.status !== "done").length;
    const blockedCount = assignedTasks.filter((task) => task.status === "blocked").length;
    const maxWip = existing?.maxWip ?? 3;
    const utilization = maxWip > 0 ? Math.min(1, currentWip / maxWip) : 0;
    return {
      id: existing?.id ?? `capacity-${agentId}`,
      title: existing?.title ?? agentId,
      status: existing?.status ?? (currentWip > maxWip || blockedCount >= 2 ? "overloaded" : pendingApprovalIds.length > 0 ? "limited" : "active"),
      agentId,
      teamId: existing?.teamId,
      role: existing?.role,
      availability: existing?.availability ?? "available",
      maxWip,
      currentWip,
      queueDepth: currentWip + pendingApprovalIds.length + pendingHandoffIds.length,
      blockedCount,
      overdueCount: 0,
      responseLatencyMinutes: existing?.responseLatencyMinutes,
      utilization,
      assignedTaskIds,
      pendingApprovalIds,
      pendingHandoffIds,
      snapshotAt: existing?.snapshotAt ?? Date.now(),
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: existing?.updatedAt ?? Date.now(),
    } satisfies CapacitySnapshot;
  });
  const activeAssignments = assignments.filter((assignment) => assignment.status === "proposed" || assignment.status === "accepted").slice(0, 5);
  const pendingHandoffs = handoffs.filter((handoff) => handoff.status === "proposed" || handoff.status === "accepted" || handoff.status === "returned").slice(0, 5);
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending").slice(0, 5);
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      activeAssignments: activeAssignments.length,
      pendingHandoffs: pendingHandoffs.length,
      pendingApprovals: pendingApprovals.length,
      overloadedAgents: capacity.filter((snapshot) => snapshot.status === "overloaded").length,
      agentsAtRisk: capacity.filter((snapshot) => snapshot.status === "limited" || snapshot.status === "overloaded").length,
    },
    activeAssignments,
    pendingHandoffs,
    pendingApprovals,
    capacity,
  };
}

function buildE2EOperationsCockpit(
  goals: Goal[],
  agents: AgentRecord[],
  releases: ReleaseRecord[],
  incidents: IncidentRecord[],
  feedback: FeedbackRecord[],
  checks: OperationalCheckRecord[],
  capacity: CapacitySnapshot[],
  approvals: Approval[],
): OperationsCockpit {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      activeGoals: goals.filter((goal) => goal.status === "active").length,
      activeProjects: 0,
      activeReleases: releases.filter((release) => release.status === "planned" || release.status === "active" || release.status === "at_risk").length,
      atRiskReleases: releases.filter((release) => release.status === "at_risk").length,
      openIncidents: incidents.filter((incident) => incident.status !== "resolved" && incident.status !== "closed").length,
      criticalIncidents: incidents.filter((incident) => incident.severity === "sev1" || incident.severity === "sev2").length,
      failingChecks: checks.filter((check) => check.status === "failing").length,
      newFeedback: feedback.filter((item) => item.status === "new").length,
      activeAgents: agents.filter((agent) => agent.status === "active" || agent.status === "limited").length,
      approvalGatedAgents: agents.filter((agent) => agent.policyGate !== "none").length,
    },
    portfolio: {
      activeGoals: goals.filter((goal) => goal.status === "active").slice(0, 5),
      activeProjects: [],
      atRiskProjects: [],
    },
    releases: releases
      .filter((release) => release.status === "planned" || release.status === "active" || release.status === "at_risk")
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 5),
    incidents: incidents
      .filter((incident) => incident.status !== "resolved" && incident.status !== "closed")
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 5),
    feedback: feedback
      .filter((item) => item.status === "new" || item.status === "triaged" || item.status === "planned")
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 5),
    checks: checks
      .filter((check) => check.status === "pending" || check.status === "failing")
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 5),
    agents: agents
      .filter((agent) => agent.status === "active" || agent.status === "limited")
      .map((agent) => ({
        agent,
        capacity: capacity.find((snapshot) => snapshot.agentId === agent.id || snapshot.agentId === agent.name) ?? null,
        openIncidentIds: incidents
          .filter((incident) => incident.ownerAgentId === agent.id || incident.ownerAgentId === agent.name)
          .filter((incident) => incident.status !== "resolved" && incident.status !== "closed")
          .map((incident) => incident.id),
        pendingApprovalIds: approvals
          .filter((approval) => approval.status === "pending")
          .filter((approval) => approval.approverAgentId === agent.id || approval.approverAgentId === agent.name || approval.requestedByAgentId === agent.id || approval.requestedByAgentId === agent.name)
          .map((approval) => approval.id),
        activeReleaseIds: releases
          .filter((release) => release.ownerAgentId === agent.id || release.ownerAgentId === agent.name)
          .filter((release) => release.status === "planned" || release.status === "active" || release.status === "at_risk")
          .map((release) => release.id),
      }))
      .slice(0, 5),
  };
}

export async function GET() {
  if (isE2EEnabled()) {
    const tasks = readCollection<Task>("tasks");
    const goals = readCollection<Goal>("goals");
    const blockers = readCollection<Blocker>("blockers");
    const artifacts = readCollection<Artifact>("artifacts");
    const decisions = readCollection<Decision>("decisions");
    const workSessions = readCollection<WorkSession>("work-sessions");
    const assignments = readCollection<Assignment>("assignments");
    const handoffs = readCollection<Handoff>("handoffs");
    const approvals = readCollection<Approval>("approvals");
    const capacity = readCollection<CapacitySnapshot>("capacity");
    const agents = readCollection<AgentRecord>("agents");
    const releases = readCollection<ReleaseRecord>("releases");
    const incidents = readCollection<IncidentRecord>("incidents");
    const feedback = readCollection<FeedbackRecord>("feedback");
    const checks = readCollection<OperationalCheckRecord>("checks");
    const inbox = readCollection<InboxMessage>("inbox");
    return NextResponse.json({
      tasks,
      goals,
      blockers,
      artifacts,
      decisions,
      workSessions,
      assignments,
      handoffs,
      approvals,
      capacity,
      agents,
      releases,
      incidents,
      feedback,
      checks,
      myWork: buildE2EMyWork(tasks, blockers, decisions, workSessions, inbox),
      teamWork: buildE2ETeamWork(tasks, assignments, handoffs, approvals, capacity),
      operationsCockpit: buildE2EOperationsCockpit(goals, agents, releases, incidents, feedback, checks, capacity, approvals),
    });
  }

  try {
    const claw = await getWorkspaceClaw();
    const [sdkTasks, sdkGoals, sdkBlockers, sdkArtifacts, sdkDecisions, sdkWorkSessions, sdkAssignments, sdkHandoffs, sdkApprovals, sdkCapacity, sdkAgents, sdkReleases, sdkIncidents, sdkFeedback, sdkChecks, myWork, teamWork, operationsCockpit] = await Promise.all([
      claw.tasks.list(),
      claw.goals.list(),
      claw.blockers.list(),
      claw.artifacts.list(),
      claw.decisions.list(),
      claw.workSessions.list(),
      claw.assignments.list(),
      claw.handoffs.list(),
      claw.approvals.list(),
      claw.capacity.list(),
      claw.agents.list(),
      claw.releases.list(),
      claw.incidents.list(),
      claw.feedback.list(),
      claw.checks.list(),
      claw.productivity.myWork(),
      claw.productivity.teamWork(),
      claw.productivity.operationsCockpit(),
    ]);
    return NextResponse.json({
      tasks: sdkTasks.map(taskToPage),
      goals: sdkGoals.map(goalToPage),
      blockers: sdkBlockers.map(blockerToPage),
      artifacts: sdkArtifacts.map(artifactToPage),
      decisions: sdkDecisions.map(decisionToPage),
      workSessions: sdkWorkSessions.map(workSessionToPage),
      assignments: sdkAssignments.map(assignmentToPage),
      handoffs: sdkHandoffs.map(handoffToPage),
      approvals: sdkApprovals.map(approvalToPage),
      capacity: sdkCapacity.map(capacityToPage),
      agents: sdkAgents.map(agentToPage),
      releases: sdkReleases.map(releaseToPage),
      incidents: sdkIncidents.map(incidentToPage),
      feedback: sdkFeedback.map(feedbackToPage),
      checks: sdkChecks.map(checkToPage),
      myWork,
      teamWork,
      operationsCockpit: {
        ...operationsCockpit,
        portfolio: {
          ...operationsCockpit.portfolio,
          activeGoals: operationsCockpit.portfolio.activeGoals.map(goalToPage),
          activeProjects: operationsCockpit.portfolio.activeProjects.map((project) => ({
            id: project.id,
            name: project.name,
            status: project.status,
            updatedAt: new Date(project.updatedAt).getTime(),
          })),
          atRiskProjects: operationsCockpit.portfolio.atRiskProjects.map((project) => ({
            id: project.id,
            name: project.name,
            status: project.status,
            updatedAt: new Date(project.updatedAt).getTime(),
          })),
        },
        releases: operationsCockpit.releases.map(releaseToPage),
        incidents: operationsCockpit.incidents.map(incidentToPage),
        feedback: operationsCockpit.feedback.map(feedbackToPage),
        checks: operationsCockpit.checks.map(checkToPage),
        agents: operationsCockpit.agents.map((entry) => ({
          agent: agentToPage(entry.agent),
          capacity: entry.capacity ? capacityToPage(entry.capacity) : null,
          openIncidentIds: entry.openIncidentIds,
          pendingApprovalIds: entry.pendingApprovalIds,
          activeReleaseIds: entry.activeReleaseIds,
        })),
      },
    });
  } catch (err) {
    console.error("[api/tasks] GET failed:", err);
    return NextResponse.json({
      tasks: [],
      goals: [],
      blockers: [],
      artifacts: [],
      decisions: [],
      workSessions: [],
      assignments: [],
      handoffs: [],
      approvals: [],
      capacity: [],
      agents: [],
      releases: [],
      incidents: [],
      feedback: [],
      checks: [],
      myWork: {
        generatedAt: new Date().toISOString(),
        summary: { triageThreads: 0, readyTasks: 0, blockedTasks: 0, activeBlockers: 0, pendingDecisions: 0, activeWorkSessions: 0, recentArtifacts: 0 },
        triageThreads: [],
        readyTasks: [],
        blockedTasks: [],
        activeBlockers: [],
        pendingDecisions: [],
        activeWorkSession: null,
        recentArtifacts: [],
      },
      teamWork: {
        generatedAt: new Date().toISOString(),
        summary: { activeAssignments: 0, pendingHandoffs: 0, pendingApprovals: 0, overloadedAgents: 0, agentsAtRisk: 0 },
        activeAssignments: [],
        pendingHandoffs: [],
        pendingApprovals: [],
        capacity: [],
      },
      operationsCockpit: {
        generatedAt: new Date().toISOString(),
        summary: {
          activeGoals: 0,
          activeProjects: 0,
          activeReleases: 0,
          atRiskReleases: 0,
          openIncidents: 0,
          criticalIncidents: 0,
          failingChecks: 0,
          newFeedback: 0,
          activeAgents: 0,
          approvalGatedAgents: 0,
        },
        portfolio: {
          activeGoals: [],
          activeProjects: [],
          atRiskProjects: [],
        },
        releases: [],
        incidents: [],
        feedback: [],
        checks: [],
        agents: [],
      },
    });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const type = body.type || "task";

  if (isE2EEnabled()) {
    const now = Date.now();
    if (type === "goal") {
      const goals = readCollection<Goal>("goals");
      const goal: Goal = {
        id: generateId(),
        title: body.title || "New Goal",
        description: body.description || "",
        parentId: body.parentId,
        progress: 0,
        status: "active",
        taskIds: [],
        createdAt: now,
        updatedAt: now,
      };
      writeCollection("goals", [...goals, goal]);
      return NextResponse.json(goal);
    }
    if (type === "blocker") {
      const blockers = readCollection<Blocker>("blockers");
      const blocker: Blocker = {
        id: generateId(),
        title: body.title || "New blocker",
        kind: body.kind || "missing_context",
        status: body.status || "active",
        taskId: body.taskId,
        description: body.description,
        createdAt: now,
        updatedAt: now,
      };
      writeCollection("blockers", [...blockers, blocker]);
      if (body.taskId) reconcileE2ETask(body.taskId);
      return NextResponse.json(blocker);
    }
    if (type === "artifact") {
      const artifacts = readCollection<Artifact>("artifacts");
      const artifact: Artifact = {
        id: generateId(),
        title: body.title || "New artifact",
        kind: body.kind || "note",
        taskId: body.taskId,
        summary: body.summary,
        uri: body.uri,
        content: body.content,
        createdAt: now,
        updatedAt: now,
      };
      writeCollection("artifacts", [...artifacts, artifact]);
      if (body.taskId) reconcileE2ETask(body.taskId);
      return NextResponse.json(artifact);
    }
    if (type === "decision") {
      const decisions = readCollection<Decision>("decisions");
      const decision: Decision = {
        id: generateId(),
        title: body.title || "New decision",
        status: body.status || "proposed",
        taskId: body.taskId,
        summary: body.summary,
        alternatives: body.alternatives || [],
        artifactIds: body.artifactIds || [],
        createdAt: now,
        updatedAt: now,
      };
      writeCollection("decisions", [...decisions, decision]);
      if (body.taskId) reconcileE2ETask(body.taskId);
      return NextResponse.json(decision);
    }
    if (type === "workSession") {
      const sessions = readCollection<WorkSession>("work-sessions");
      const session: WorkSession = {
        id: generateId(),
        title: body.title || "Focus session",
        status: body.status || "active",
        taskIds: body.taskIds || [],
        blockerIds: body.blockerIds || [],
        objective: body.objective,
        outcome: body.outcome,
        timeboxMinutes: body.timeboxMinutes,
        startedAt: body.startedAt || now,
        endedAt: body.endedAt,
        createdAt: now,
        updatedAt: now,
      };
      writeCollection("work-sessions", [...sessions, session]);
      return NextResponse.json(session);
    }
    if (type === "assignment") {
      const assignments = readCollection<Assignment>("assignments");
      const assignment: Assignment = {
        id: generateId(),
        title: body.title || "New assignment",
        status: body.status || "proposed",
        taskId: body.taskId,
        projectId: body.projectId,
        goalId: body.goalId,
        assignedToAgentId: body.assignedToAgentId || "agent",
        assignedBy: body.assignedBy,
        delegatedBy: body.delegatedBy,
        reviewerAgentId: body.reviewerAgentId,
        rationale: body.rationale,
        rejectionReason: body.rejectionReason,
        acceptedAt: body.acceptedAt,
        rejectedAt: body.rejectedAt,
        completedAt: body.completedAt,
        dueAt: body.dueAt,
        priority: body.priority,
        createdAt: now,
        updatedAt: now,
      };
      writeCollection("assignments", [...assignments, assignment]);
      if (body.taskId) reconcileE2ETask(body.taskId);
      return NextResponse.json(assignment);
    }
    if (type === "handoff") {
      const handoffs = readCollection<Handoff>("handoffs");
      const handoff: Handoff = {
        id: generateId(),
        title: body.title || "New handoff",
        status: body.status || "proposed",
        taskId: body.taskId,
        projectId: body.projectId,
        goalId: body.goalId,
        fromAgentId: body.fromAgentId || "agent-a",
        toAgentId: body.toAgentId || "agent-b",
        objective: body.objective,
        currentState: body.currentState,
        contextSummary: body.contextSummary,
        nextStep: body.nextStep,
        riskSummary: body.riskSummary,
        artifactIds: body.artifactIds || [],
        blockerIds: body.blockerIds || [],
        approvalId: body.approvalId,
        rejectionReason: body.rejectionReason,
        acceptedAt: body.acceptedAt,
        completedAt: body.completedAt,
        createdAt: now,
        updatedAt: now,
      };
      writeCollection("handoffs", [...handoffs, handoff]);
      if (body.taskId) reconcileE2ETask(body.taskId);
      return NextResponse.json(handoff);
    }
    if (type === "approval") {
      const approvals = readCollection<Approval>("approvals");
      const approval: Approval = {
        id: generateId(),
        title: body.title || "New approval",
        status: body.status || "pending",
        kind: body.kind || "policy_gate",
        taskId: body.taskId,
        projectId: body.projectId,
        goalId: body.goalId,
        handoffId: body.handoffId,
        requestedByAgentId: body.requestedByAgentId,
        approverAgentId: body.approverAgentId,
        policyReason: body.policyReason || "Approval required",
        evidenceIds: body.evidenceIds || [],
        decisionIds: body.decisionIds || [],
        approvedBy: body.approvedBy,
        outcome: body.outcome,
        approvedAt: body.approvedAt,
        rejectedAt: body.rejectedAt,
        createdAt: now,
        updatedAt: now,
      };
      writeCollection("approvals", [...approvals, approval]);
      if (body.taskId) reconcileE2ETask(body.taskId);
      return NextResponse.json(approval);
    }
    if (type === "capacity") {
      const snapshots = readCollection<CapacitySnapshot>("capacity");
      const snapshot: CapacitySnapshot = {
        id: generateId(),
        title: body.title || "Capacity",
        status: body.status || "active",
        agentId: body.agentId || "agent",
        teamId: body.teamId,
        role: body.role,
        availability: body.availability || "available",
        maxWip: body.maxWip,
        currentWip: body.currentWip || 0,
        queueDepth: body.queueDepth || 0,
        blockedCount: body.blockedCount || 0,
        overdueCount: body.overdueCount || 0,
        responseLatencyMinutes: body.responseLatencyMinutes,
        utilization: body.utilization,
        assignedTaskIds: body.assignedTaskIds || [],
        pendingApprovalIds: body.pendingApprovalIds || [],
        pendingHandoffIds: body.pendingHandoffIds || [],
        snapshotAt: body.snapshotAt,
        createdAt: now,
        updatedAt: now,
      };
      writeCollection("capacity", [...snapshots, snapshot]);
      return NextResponse.json(snapshot);
    }
    if (type === "agent") {
      const agents = readCollection<AgentRecord>("agents");
      const agent: AgentRecord = {
        id: generateId(),
        name: body.name || "agent",
        status: body.status || "active",
        role: body.role || "operator",
        teamId: body.teamId,
        domains: body.domains || [],
        shift: body.shift,
        availability: body.availability || "available",
        autonomyLevel: body.autonomyLevel || "suggest",
        permissions: body.permissions || [],
        policyGate: body.policyGate || "none",
        currentFocus: body.currentFocus,
        linkedTaskIds: body.linkedTaskIds || [],
        createdAt: now,
        updatedAt: now,
      };
      writeCollection("agents", [...agents, agent]);
      return NextResponse.json(agent);
    }
    if (type === "release") {
      const releases = readCollection<ReleaseRecord>("releases");
      const release: ReleaseRecord = {
        id: generateId(),
        title: body.title || "New release",
        status: body.status || "planned",
        projectId: body.projectId,
        goalId: body.goalId,
        ownerAgentId: body.ownerAgentId,
        targetDate: body.targetDate,
        shippedAt: body.shippedAt,
        riskSummary: body.riskSummary,
        linkedTaskIds: body.linkedTaskIds || [],
        incidentIds: body.incidentIds || [],
        approvalIds: body.approvalIds || [],
        createdAt: now,
        updatedAt: now,
      };
      writeCollection("releases", [...releases, release]);
      return NextResponse.json(release);
    }
    if (type === "incident") {
      const incidents = readCollection<IncidentRecord>("incidents");
      const incident: IncidentRecord = {
        id: generateId(),
        title: body.title || "New incident",
        status: body.status || "open",
        severity: body.severity || "sev3",
        projectId: body.projectId,
        goalId: body.goalId,
        taskId: body.taskId,
        releaseId: body.releaseId,
        ownerAgentId: body.ownerAgentId,
        summary: body.summary,
        customerImpact: body.customerImpact,
        blockerIds: body.blockerIds || [],
        feedbackIds: body.feedbackIds || [],
        startedAt: body.startedAt || now,
        resolvedAt: body.resolvedAt,
        createdAt: now,
        updatedAt: now,
      };
      writeCollection("incidents", [...incidents, incident]);
      return NextResponse.json(incident);
    }
    if (type === "feedback") {
      const feedback = readCollection<FeedbackRecord>("feedback");
      const item: FeedbackRecord = {
        id: generateId(),
        title: body.title || "New feedback",
        status: body.status || "new",
        origin: body.origin || "customer",
        priority: body.priority || "medium",
        projectId: body.projectId,
        goalId: body.goalId,
        taskId: body.taskId,
        incidentId: body.incidentId,
        ownerAgentId: body.ownerAgentId,
        summary: body.summary,
        followUpTaskId: body.followUpTaskId,
        createdAt: now,
        updatedAt: now,
      };
      writeCollection("feedback", [...feedback, item]);
      return NextResponse.json(item);
    }
    if (type === "check") {
      const checks = readCollection<OperationalCheckRecord>("checks");
      const check: OperationalCheckRecord = {
        id: generateId(),
        title: body.title || "New operational check",
        status: body.status || "pending",
        kind: body.kind || "ops",
        projectId: body.projectId,
        goalId: body.goalId,
        releaseId: body.releaseId,
        incidentId: body.incidentId,
        ownerAgentId: body.ownerAgentId,
        cadence: body.cadence,
        lastRunAt: body.lastRunAt,
        nextRunAt: body.nextRunAt,
        resultSummary: body.resultSummary,
        playbook: body.playbook,
        createdAt: now,
        updatedAt: now,
      };
      writeCollection("checks", [...checks, check]);
      return NextResponse.json(check);
    }

    const tasks = readCollection<Task>("tasks");
    const task: Task = {
      id: generateId(),
      title: body.title || "New Task",
      description: body.description || "",
      status: body.status || "backlog",
      priority: body.priority || "medium",
      goalId: body.goalId,
      labels: body.labels || [],
      linkedSessionIds: [],
      blockedByIds: [],
      evidenceIds: [],
      decisionIds: [],
      assignmentIds: [],
      handoffIds: [],
      approvalIds: [],
      createdAt: now,
      updatedAt: now,
    };
    writeCollection("tasks", [...tasks, task]);
    return NextResponse.json(task);
  }

  try {
    const claw = await getWorkspaceClaw();
    if (type === "goal") {
      return NextResponse.json(goalToPage(await claw.goals.create({
        title: body.title || "New Goal",
        description: body.description || undefined,
      })));
    }
    if (type === "blocker") {
      return NextResponse.json(blockerToPage(await claw.blockers.create({
        title: body.title || "New blocker",
        description: body.description || undefined,
        kind: body.kind || "missing_context",
        status: body.status || "active",
        taskId: body.taskId,
      })));
    }
    if (type === "artifact") {
      return NextResponse.json(artifactToPage(await claw.artifacts.create({
        title: body.title || "New artifact",
        kind: body.kind || "note",
        taskId: body.taskId,
        summary: body.summary || undefined,
        uri: body.uri || undefined,
        content: body.content || undefined,
      })));
    }
    if (type === "decision") {
      return NextResponse.json(decisionToPage(await claw.decisions.create({
        title: body.title || "New decision",
        status: body.status || "proposed",
        taskId: body.taskId,
        summary: body.summary || undefined,
        alternatives: body.alternatives || [],
        artifactIds: body.artifactIds || [],
      })));
    }
    if (type === "workSession") {
      return NextResponse.json(workSessionToPage(await claw.workSessions.create({
        title: body.title || "Focus session",
        status: body.status || "active",
        taskIds: body.taskIds || [],
        blockerIds: body.blockerIds || [],
        objective: body.objective || undefined,
        outcome: body.outcome || undefined,
        timeboxMinutes: body.timeboxMinutes,
      })));
    }
    if (type === "assignment") {
      return NextResponse.json(assignmentToPage(await claw.assignments.create({
        title: body.title || "New assignment",
        status: body.status || "proposed",
        taskId: body.taskId,
        projectId: body.projectId,
        goalId: body.goalId,
        assignedToAgentId: body.assignedToAgentId || "agent",
        assignedBy: body.assignedBy || undefined,
        delegatedBy: body.delegatedBy || undefined,
        reviewerAgentId: body.reviewerAgentId || undefined,
        rationale: body.rationale || undefined,
        rejectionReason: body.rejectionReason || undefined,
      })));
    }
    if (type === "handoff") {
      return NextResponse.json(handoffToPage(await claw.handoffs.create({
        title: body.title || "New handoff",
        status: body.status || "proposed",
        taskId: body.taskId,
        projectId: body.projectId,
        goalId: body.goalId,
        fromAgentId: body.fromAgentId || "agent-a",
        toAgentId: body.toAgentId || "agent-b",
        objective: body.objective || undefined,
        currentState: body.currentState || undefined,
        contextSummary: body.contextSummary || undefined,
        nextStep: body.nextStep || undefined,
        riskSummary: body.riskSummary || undefined,
        artifactIds: body.artifactIds || [],
        blockerIds: body.blockerIds || [],
        approvalId: body.approvalId || undefined,
      })));
    }
    if (type === "approval") {
      return NextResponse.json(approvalToPage(await claw.approvals.create({
        title: body.title || "New approval",
        status: body.status || "pending",
        kind: body.kind || "policy_gate",
        taskId: body.taskId,
        projectId: body.projectId,
        goalId: body.goalId,
        handoffId: body.handoffId,
        requestedByAgentId: body.requestedByAgentId || undefined,
        approverAgentId: body.approverAgentId || undefined,
        policyReason: body.policyReason || "Approval required",
        evidenceIds: body.evidenceIds || [],
        decisionIds: body.decisionIds || [],
        approvedBy: body.approvedBy || undefined,
        outcome: body.outcome || undefined,
      })));
    }
    if (type === "capacity") {
      return NextResponse.json(capacityToPage(await claw.capacity.create({
        title: body.title || "Capacity",
        status: body.status || "active",
        agentId: body.agentId || "agent",
        teamId: body.teamId || undefined,
        role: body.role || undefined,
        availability: body.availability || "available",
        maxWip: body.maxWip,
        currentWip: body.currentWip,
        queueDepth: body.queueDepth,
        blockedCount: body.blockedCount,
        overdueCount: body.overdueCount,
        responseLatencyMinutes: body.responseLatencyMinutes,
        utilization: body.utilization,
        assignedTaskIds: body.assignedTaskIds || [],
        pendingApprovalIds: body.pendingApprovalIds || [],
        pendingHandoffIds: body.pendingHandoffIds || [],
      })));
    }
    if (type === "agent") {
      return NextResponse.json(agentToPage(await claw.agents.create({
        name: body.name || "agent",
        status: body.status || "active",
        role: body.role || "operator",
        teamId: body.teamId || undefined,
        domains: body.domains || [],
        shift: body.shift || undefined,
        availability: body.availability || "available",
        autonomyLevel: body.autonomyLevel || "suggest",
        permissions: body.permissions || [],
        policyGate: body.policyGate || "none",
        currentFocus: body.currentFocus || undefined,
        linkedTaskIds: body.linkedTaskIds || [],
      })));
    }
    if (type === "release") {
      return NextResponse.json(releaseToPage(await claw.releases.create({
        title: body.title || "New release",
        status: body.status || "planned",
        projectId: body.projectId || undefined,
        goalId: body.goalId || undefined,
        ownerAgentId: body.ownerAgentId || undefined,
        targetDate: body.targetDate ? new Date(body.targetDate).toISOString() : undefined,
        shippedAt: body.shippedAt ? new Date(body.shippedAt).toISOString() : undefined,
        riskSummary: body.riskSummary || undefined,
        linkedTaskIds: body.linkedTaskIds || [],
        incidentIds: body.incidentIds || [],
        approvalIds: body.approvalIds || [],
      })));
    }
    if (type === "incident") {
      return NextResponse.json(incidentToPage(await claw.incidents.create({
        title: body.title || "New incident",
        status: body.status || "open",
        severity: body.severity || "sev3",
        projectId: body.projectId || undefined,
        goalId: body.goalId || undefined,
        taskId: body.taskId || undefined,
        releaseId: body.releaseId || undefined,
        ownerAgentId: body.ownerAgentId || undefined,
        summary: body.summary || undefined,
        customerImpact: body.customerImpact || undefined,
        blockerIds: body.blockerIds || [],
        feedbackIds: body.feedbackIds || [],
        startedAt: body.startedAt ? new Date(body.startedAt).toISOString() : undefined,
        resolvedAt: body.resolvedAt ? new Date(body.resolvedAt).toISOString() : undefined,
      })));
    }
    if (type === "feedback") {
      return NextResponse.json(feedbackToPage(await claw.feedback.create({
        title: body.title || "New feedback",
        status: body.status || "new",
        origin: body.origin || "customer",
        priority: body.priority || "medium",
        projectId: body.projectId || undefined,
        goalId: body.goalId || undefined,
        taskId: body.taskId || undefined,
        incidentId: body.incidentId || undefined,
        ownerAgentId: body.ownerAgentId || undefined,
        summary: body.summary || undefined,
        followUpTaskId: body.followUpTaskId || undefined,
      })));
    }
    if (type === "check") {
      return NextResponse.json(checkToPage(await claw.checks.create({
        title: body.title || "New operational check",
        status: body.status || "pending",
        kind: body.kind || "ops",
        projectId: body.projectId || undefined,
        goalId: body.goalId || undefined,
        releaseId: body.releaseId || undefined,
        incidentId: body.incidentId || undefined,
        ownerAgentId: body.ownerAgentId || undefined,
        cadence: body.cadence || undefined,
        lastRunAt: body.lastRunAt ? new Date(body.lastRunAt).toISOString() : undefined,
        nextRunAt: body.nextRunAt ? new Date(body.nextRunAt).toISOString() : undefined,
        resultSummary: body.resultSummary || undefined,
        playbook: body.playbook || undefined,
      })));
    }

    return NextResponse.json(taskToPage(await claw.tasks.create({
      title: body.title || "New Task",
      description: body.description || undefined,
      status: toSdkTaskStatus(body.status) as any,
      priority: body.priority || "medium",
      labels: body.labels || [],
      goalId: body.goalId || undefined,
    })));
  } catch (err) {
    console.error("[api/tasks] POST failed:", err);
    return NextResponse.json({ error: "Failed to create record" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = await request.json();
  const type = body.type || "task";

  if (isE2EEnabled()) {
    const now = Date.now();
    const updateCollection = <T extends { id: string; updatedAt: number }>(name: string, onUpdated?: (record: T) => void) => {
      const collection = readCollection<T>(name);
      const index = collection.findIndex((entry) => entry.id === body.id);
      if (index === -1) return null;
      collection[index] = { ...collection[index], ...body, updatedAt: now };
      delete (collection[index] as T & { type?: string }).type;
      writeCollection(name, collection);
      onUpdated?.(collection[index]);
      return collection[index];
    };

    if (type === "goal") {
      const goal = updateCollection<Goal>("goals");
      return goal ? NextResponse.json(goal) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (type === "blocker") {
      const blocker = updateCollection<Blocker>("blockers", (record) => { if (record.taskId) reconcileE2ETask(record.taskId); });
      return blocker ? NextResponse.json(blocker) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (type === "artifact") {
      const artifact = updateCollection<Artifact>("artifacts", (record) => { if (record.taskId) reconcileE2ETask(record.taskId); });
      return artifact ? NextResponse.json(artifact) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (type === "decision") {
      const decision = updateCollection<Decision>("decisions", (record) => { if (record.taskId) reconcileE2ETask(record.taskId); });
      return decision ? NextResponse.json(decision) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (type === "workSession") {
      const session = updateCollection<WorkSession>("work-sessions", (record) => {
        if (body.status && body.status !== "active" && !record.endedAt) {
          record.endedAt = now;
        }
      });
      return session ? NextResponse.json(session) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (type === "assignment") {
      const assignment = updateCollection<Assignment>("assignments", (record) => { if (record.taskId) reconcileE2ETask(record.taskId); });
      return assignment ? NextResponse.json(assignment) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (type === "handoff") {
      const handoff = updateCollection<Handoff>("handoffs", (record) => { if (record.taskId) reconcileE2ETask(record.taskId); });
      return handoff ? NextResponse.json(handoff) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (type === "approval") {
      const approval = updateCollection<Approval>("approvals", (record) => { if (record.taskId) reconcileE2ETask(record.taskId); });
      return approval ? NextResponse.json(approval) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (type === "capacity") {
      const snapshot = updateCollection<CapacitySnapshot>("capacity");
      return snapshot ? NextResponse.json(snapshot) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (type === "agent") {
      const agent = updateCollection<AgentRecord>("agents");
      return agent ? NextResponse.json(agent) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (type === "release") {
      const release = updateCollection<ReleaseRecord>("releases");
      return release ? NextResponse.json(release) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (type === "incident") {
      const incident = updateCollection<IncidentRecord>("incidents");
      return incident ? NextResponse.json(incident) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (type === "feedback") {
      const feedback = updateCollection<FeedbackRecord>("feedback");
      return feedback ? NextResponse.json(feedback) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (type === "check") {
      const check = updateCollection<OperationalCheckRecord>("checks");
      return check ? NextResponse.json(check) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const task = updateCollection<Task>("tasks");
    return task ? NextResponse.json(task) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const claw = await getWorkspaceClaw();
    if (type === "goal") {
      return NextResponse.json(goalToPage(await claw.goals.update(body.id, {
        title: body.title,
        description: body.description,
        status: body.status === "completed" ? "done" : body.status,
      })));
    }
    if (type === "blocker") return NextResponse.json(blockerToPage(await claw.blockers.update(body.id, body)));
    if (type === "artifact") return NextResponse.json(artifactToPage(await claw.artifacts.update(body.id, body)));
    if (type === "decision") return NextResponse.json(decisionToPage(await claw.decisions.update(body.id, body)));
    if (type === "workSession") {
      return NextResponse.json(workSessionToPage(await claw.workSessions.update(body.id, {
        title: body.title,
        status: body.status,
        objective: body.objective,
        outcome: body.outcome,
        endedAt: body.endedAt ? new Date(body.endedAt).toISOString() : undefined,
      })));
    }
    if (type === "assignment") return NextResponse.json(assignmentToPage(await claw.assignments.update(body.id, body)));
    if (type === "handoff") return NextResponse.json(handoffToPage(await claw.handoffs.update(body.id, body)));
    if (type === "approval") return NextResponse.json(approvalToPage(await claw.approvals.update(body.id, body)));
    if (type === "capacity") return NextResponse.json(capacityToPage(await claw.capacity.update(body.id, body)));
    if (type === "agent") return NextResponse.json(agentToPage(await claw.agents.update(body.id, body)));
    if (type === "release") return NextResponse.json(releaseToPage(await claw.releases.update(body.id, body)));
    if (type === "incident") return NextResponse.json(incidentToPage(await claw.incidents.update(body.id, body)));
    if (type === "feedback") return NextResponse.json(feedbackToPage(await claw.feedback.update(body.id, body)));
    if (type === "check") return NextResponse.json(checkToPage(await claw.checks.update(body.id, body)));

    const updates: any = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = toSdkTaskStatus(body.status);
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.labels !== undefined) updates.labels = body.labels;
    if (body.goalId !== undefined) updates.goalId = body.goalId || undefined;
    return NextResponse.json(taskToPage(await claw.tasks.update(body.id, updates)));
  } catch (err) {
    console.error("[api/tasks] PUT failed:", err);
    return NextResponse.json({ error: "Failed to update record" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const type = searchParams.get("type") || "task";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (isE2EEnabled()) {
    const maybeReconcile = (collectionName: string, field: string) => {
      const collection = readCollection<Record<string, unknown>>(collectionName);
      const found = collection.find((entry) => entry.id === id);
      writeCollection(collectionName, collection.filter((entry) => entry.id !== id));
      const taskId = typeof found?.[field] === "string" ? found[field] as string : undefined;
      if (taskId) reconcileE2ETask(taskId);
    };
    if (type === "goal") {
      writeCollection("goals", readCollection<Goal>("goals").filter((goal) => goal.id !== id));
      return NextResponse.json({ ok: true });
    }
    if (type === "blocker") maybeReconcile("blockers", "taskId");
    else if (type === "artifact") maybeReconcile("artifacts", "taskId");
    else if (type === "decision") maybeReconcile("decisions", "taskId");
    else if (type === "assignment") maybeReconcile("assignments", "taskId");
    else if (type === "handoff") maybeReconcile("handoffs", "taskId");
    else if (type === "approval") maybeReconcile("approvals", "taskId");
    else if (type === "capacity") writeCollection("capacity", readCollection<CapacitySnapshot>("capacity").filter((entry) => entry.id !== id));
    else if (type === "agent") writeCollection("agents", readCollection<AgentRecord>("agents").filter((entry) => entry.id !== id));
    else if (type === "release") writeCollection("releases", readCollection<ReleaseRecord>("releases").filter((entry) => entry.id !== id));
    else if (type === "incident") writeCollection("incidents", readCollection<IncidentRecord>("incidents").filter((entry) => entry.id !== id));
    else if (type === "feedback") writeCollection("feedback", readCollection<FeedbackRecord>("feedback").filter((entry) => entry.id !== id));
    else if (type === "check") writeCollection("checks", readCollection<OperationalCheckRecord>("checks").filter((entry) => entry.id !== id));
    else if (type === "workSession") writeCollection("work-sessions", readCollection<WorkSession>("work-sessions").filter((entry) => entry.id !== id));
    else writeCollection("tasks", readCollection<Task>("tasks").filter((task) => task.id !== id));
    return NextResponse.json({ ok: true });
  }

  try {
    const claw = await getWorkspaceClaw();
    if (type === "goal") await claw.goals.remove(id);
    else if (type === "blocker") await claw.blockers.remove(id);
    else if (type === "artifact") await claw.artifacts.remove(id);
    else if (type === "decision") await claw.decisions.remove(id);
    else if (type === "workSession") await claw.workSessions.remove(id);
    else if (type === "assignment") await claw.assignments.remove(id);
    else if (type === "handoff") await claw.handoffs.remove(id);
    else if (type === "approval") await claw.approvals.remove(id);
    else if (type === "capacity") await claw.capacity.remove(id);
    else if (type === "agent") await claw.agents.remove(id);
    else if (type === "release") await claw.releases.remove(id);
    else if (type === "incident") await claw.incidents.remove(id);
    else if (type === "feedback") await claw.feedback.remove(id);
    else if (type === "check") await claw.checks.remove(id);
    else await claw.tasks.remove(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/tasks] DELETE failed:", err);
    return NextResponse.json({ error: "Failed to delete record" }, { status: 500 });
  }
}
