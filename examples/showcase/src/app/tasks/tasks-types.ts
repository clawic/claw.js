export interface Task {
  id: string;
  title: string;
  description: string;
  status: "backlog" | "in_progress" | "done" | "blocked";
  priority: "low" | "medium" | "high" | "urgent";
  goalId?: string;
  labels: string[];
  linkedSessionIds: string[];
  blockedByIds?: string[];
  evidenceIds?: string[];
  decisionIds?: string[];
  assignmentIds?: string[];
  handoffIds?: string[];
  approvalIds?: string[];
  assignedToAgentId?: string;
  reviewerAgentId?: string;
  handoffTo?: string;
  approvedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  parentId?: string;
  progress: number;
  status: "active" | "completed" | "paused";
  taskIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Blocker {
  id: string;
  title: string;
  kind: "waiting_human" | "waiting_agent" | "waiting_system" | "missing_context" | "policy_block";
  status: "active" | "resolved" | "cancelled";
  taskId?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Artifact {
  id: string;
  title: string;
  kind: "link" | "file" | "command" | "test" | "screenshot" | "message" | "note";
  taskId?: string;
  summary?: string;
  uri?: string;
  content?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Decision {
  id: string;
  title: string;
  status: "proposed" | "accepted" | "rejected" | "superseded";
  taskId?: string;
  summary?: string;
  alternatives: string[];
  artifactIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkSession {
  id: string;
  title: string;
  status: "active" | "completed" | "cancelled";
  taskIds: string[];
  blockerIds: string[];
  objective?: string;
  outcome?: string;
  timeboxMinutes?: number;
  startedAt: number;
  endedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Assignment {
  id: string;
  title: string;
  status: "proposed" | "accepted" | "rejected" | "released" | "completed";
  taskId?: string;
  assignedToAgentId: string;
  assignedBy?: string;
  delegatedBy?: string;
  reviewerAgentId?: string;
  rationale?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Handoff {
  id: string;
  title: string;
  status: "proposed" | "accepted" | "rejected" | "returned" | "completed";
  taskId?: string;
  fromAgentId: string;
  toAgentId: string;
  objective?: string;
  nextStep?: string;
  artifactIds: string[];
  blockerIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Approval {
  id: string;
  title: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  kind: "deploy" | "publish" | "delete" | "external_send" | "spend" | "policy_gate" | "other";
  taskId?: string;
  handoffId?: string;
  requestedByAgentId?: string;
  approverAgentId?: string;
  policyReason: string;
  approvedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CapacitySnapshot {
  id: string;
  title: string;
  status: "active" | "limited" | "overloaded" | "offline";
  agentId: string;
  teamId?: string;
  availability: "available" | "busy" | "away" | "offline";
  maxWip?: number;
  currentWip: number;
  queueDepth: number;
  blockedCount: number;
  pendingApprovalIds: string[];
  pendingHandoffIds: string[];
  assignedTaskIds: string[];
  updatedAt: number;
}

export interface MyWork {
  generatedAt: string;
  summary: {
    triageThreads: number;
    readyTasks: number;
    blockedTasks: number;
    activeBlockers: number;
    pendingDecisions: number;
    activeWorkSessions: number;
  };
  triageThreads: Array<{ id: string; subject?: string; preview?: string; channel?: string }>;
  readyTasks: Task[];
  blockedTasks: Task[];
  activeBlockers: Blocker[];
  pendingDecisions: Decision[];
  activeWorkSession: WorkSession | null;
  recentArtifacts: Artifact[];
}

export interface TeamWork {
  generatedAt: string;
  summary: {
    activeAssignments: number;
    pendingHandoffs: number;
    pendingApprovals: number;
    overloadedAgents: number;
    agentsAtRisk: number;
  };
  activeAssignments: Assignment[];
  pendingHandoffs: Handoff[];
  pendingApprovals: Approval[];
  capacity: CapacitySnapshot[];
}

export interface AgentRecord {
  id: string;
  name: string;
  status: "active" | "limited" | "offline";
  role: string;
  teamId?: string;
  domains: string[];
  availability: "available" | "busy" | "away" | "offline";
  autonomyLevel: "observe" | "suggest" | "act_limited" | "act_full";
  permissions: string[];
  policyGate: "none" | "approval_required" | "restricted";
  currentFocus?: string;
  linkedTaskIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ReleaseRecord {
  id: string;
  title: string;
  status: "planned" | "active" | "at_risk" | "released" | "cancelled";
  goalId?: string;
  ownerAgentId?: string;
  targetDate?: number;
  riskSummary?: string;
  linkedTaskIds: string[];
  incidentIds: string[];
  approvalIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface IncidentRecord {
  id: string;
  title: string;
  status: "open" | "investigating" | "mitigating" | "resolved" | "closed";
  severity: "sev1" | "sev2" | "sev3" | "sev4";
  taskId?: string;
  releaseId?: string;
  ownerAgentId?: string;
  summary?: string;
  customerImpact?: string;
  blockerIds: string[];
  feedbackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface FeedbackRecord {
  id: string;
  title: string;
  status: "new" | "triaged" | "planned" | "closed";
  origin: "customer" | "agent" | "system" | "sales" | "support" | "ops";
  priority: "low" | "medium" | "high" | "urgent";
  taskId?: string;
  incidentId?: string;
  ownerAgentId?: string;
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OperationalCheckRecord {
  id: string;
  title: string;
  status: "pending" | "passing" | "failing" | "snoozed";
  kind: "release_readiness" | "incident_followup" | "sla" | "quality" | "compliance" | "ops";
  releaseId?: string;
  incidentId?: string;
  ownerAgentId?: string;
  cadence?: "hourly" | "daily" | "weekly" | "monthly";
  resultSummary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OperationsCockpit {
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
    activeGoals: Goal[];
    activeProjects: Array<{ id: string; name: string; status: string; updatedAt: number }>;
    atRiskProjects: Array<{ id: string; name: string; status: string; updatedAt: number }>;
  };
  releases: ReleaseRecord[];
  incidents: IncidentRecord[];
  feedback: FeedbackRecord[];
  checks: OperationalCheckRecord[];
  agents: Array<{
    agent: AgentRecord;
    capacity: CapacitySnapshot | null;
    openIncidentIds: string[];
    pendingApprovalIds: string[];
    activeReleaseIds: string[];
  }>;
}
