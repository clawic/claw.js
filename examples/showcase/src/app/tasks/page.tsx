"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Flag,
  GripVertical,
  Loader2,
  Plus,
  Target,
  Trash2,
  X,
} from "lucide-react";

interface Task {
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

interface Goal {
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

interface Blocker {
  id: string;
  title: string;
  kind: "waiting_human" | "waiting_agent" | "waiting_system" | "missing_context" | "policy_block";
  status: "active" | "resolved" | "cancelled";
  taskId?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

interface Artifact {
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

interface Decision {
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

interface WorkSession {
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

interface Assignment {
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

interface Handoff {
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

interface Approval {
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

interface CapacitySnapshot {
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

interface MyWork {
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

interface TeamWork {
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

interface AgentRecord {
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

interface ReleaseRecord {
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

interface IncidentRecord {
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

interface FeedbackRecord {
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

interface OperationalCheckRecord {
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

interface OperationsCockpit {
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

type ColumnKey = Task["status"];

const COLUMNS: { key: ColumnKey; label: string; icon: React.ReactNode; accent: string }[] = [
  { key: "backlog", label: "Backlog", icon: <Circle className="w-3.5 h-3.5" />, accent: "text-muted-foreground" },
  { key: "in_progress", label: "In Progress", icon: <Clock className="w-3.5 h-3.5" />, accent: "text-blue-500" },
  { key: "done", label: "Done", icon: <CheckCircle2 className="w-3.5 h-3.5" />, accent: "text-emerald-500" },
  { key: "blocked", label: "Blocked", icon: <AlertTriangle className="w-3.5 h-3.5" />, accent: "text-red-500" },
];

const PRIORITY_CONFIG: Record<Task["priority"], { label: string; color: string }> = {
  urgent: { label: "Urgent", color: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
  high: { label: "High", color: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  medium: { label: "Medium", color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" },
  low: { label: "Low", color: "bg-muted text-muted-foreground border-border" },
};

const BLOCKER_LABELS: Record<Blocker["kind"], string> = {
  waiting_human: "Waiting human",
  waiting_agent: "Waiting agent",
  waiting_system: "Waiting system",
  missing_context: "Missing context",
  policy_block: "Policy block",
};

const ARTIFACT_LABELS: Record<Artifact["kind"], string> = {
  link: "Link",
  file: "File",
  command: "Command",
  test: "Test",
  screenshot: "Screenshot",
  message: "Message",
  note: "Note",
};

const DECISION_LABELS: Record<Decision["status"], string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  rejected: "Rejected",
  superseded: "Superseded",
};

const ASSIGNMENT_LABELS: Record<Assignment["status"], string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  rejected: "Rejected",
  released: "Released",
  completed: "Completed",
};

const HANDOFF_LABELS: Record<Handoff["status"], string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  rejected: "Rejected",
  returned: "Returned",
  completed: "Completed",
};

const APPROVAL_LABELS: Record<Approval["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export default function TasksPage() {
  const { messages, formatDate } = useLocale();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [workSessions, setWorkSessions] = useState<WorkSession[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [capacity, setCapacity] = useState<CapacitySnapshot[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [releases, setReleases] = useState<ReleaseRecord[]>([]);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [myWork, setMyWork] = useState<MyWork | null>(null);
  const [teamWork, setTeamWork] = useState<TeamWork | null>(null);
  const [operationsCockpit, setOperationsCockpit] = useState<OperationsCockpit | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [goalsExpanded, setGoalsExpanded] = useState(true);
  const [newTaskColumn, setNewTaskColumn] = useState<ColumnKey | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Task["priority"]>("medium");
  const [creating, setCreating] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnKey | null>(null);
  const [editingTask, setEditingTask] = useState<Partial<Task> | null>(null);
  const [saving, setSaving] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newBlockerTitle, setNewBlockerTitle] = useState("");
  const [newBlockerKind, setNewBlockerKind] = useState<Blocker["kind"]>("missing_context");
  const [newArtifactTitle, setNewArtifactTitle] = useState("");
  const [newArtifactKind, setNewArtifactKind] = useState<Artifact["kind"]>("note");
  const [newArtifactSummary, setNewArtifactSummary] = useState("");
  const [newDecisionTitle, setNewDecisionTitle] = useState("");
  const [newDecisionStatus, setNewDecisionStatus] = useState<Decision["status"]>("proposed");
  const [newDecisionSummary, setNewDecisionSummary] = useState("");
  const [newAssignmentTitle, setNewAssignmentTitle] = useState("");
  const [newAssignmentAgentId, setNewAssignmentAgentId] = useState("reviewer");
  const [newAssignmentStatus, setNewAssignmentStatus] = useState<Assignment["status"]>("proposed");
  const [newHandoffTitle, setNewHandoffTitle] = useState("");
  const [newHandoffToAgentId, setNewHandoffToAgentId] = useState("reviewer");
  const [newApprovalTitle, setNewApprovalTitle] = useState("");
  const [newApprovalKind, setNewApprovalKind] = useState<Approval["kind"]>("policy_gate");
  const [newReleaseTitle, setNewReleaseTitle] = useState("");
  const [newReleaseOwnerAgentId, setNewReleaseOwnerAgentId] = useState("reviewer");
  const [newIncidentTitle, setNewIncidentTitle] = useState("");
  const [newIncidentSeverity, setNewIncidentSeverity] = useState<IncidentRecord["severity"]>("sev2");
  const [newIncidentReleaseId, setNewIncidentReleaseId] = useState("");
  const [newFeedbackTitle, setNewFeedbackTitle] = useState("");
  const [newFeedbackOrigin, setNewFeedbackOrigin] = useState<FeedbackRecord["origin"]>("customer");
  const [newFeedbackIncidentId, setNewFeedbackIncidentId] = useState("");
  const [newCheckTitle, setNewCheckTitle] = useState("");
  const [newCheckKind, setNewCheckKind] = useState<OperationalCheckRecord["kind"]>("release_readiness");
  const [newCheckReleaseId, setNewCheckReleaseId] = useState("");
  const [newCheckIncidentId, setNewCheckIncidentId] = useState("");

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks ?? []);
        setGoals(data.goals ?? []);
        setBlockers(data.blockers ?? []);
        setArtifacts(data.artifacts ?? []);
        setDecisions(data.decisions ?? []);
        setWorkSessions(data.workSessions ?? []);
        setAssignments(data.assignments ?? []);
        setHandoffs(data.handoffs ?? []);
        setApprovals(data.approvals ?? []);
        setCapacity(data.capacity ?? []);
        setAgents(data.agents ?? []);
        setReleases(data.releases ?? []);
        setIncidents(data.incidents ?? []);
        setMyWork(data.myWork ?? null);
        setTeamWork(data.teamWork ?? null);
        setOperationsCockpit(data.operationsCockpit ?? null);
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const refreshTask = (taskId: string | undefined) => {
    if (!taskId) return;
    const latest = tasks.find((task) => task.id === taskId);
    if (latest) setSelectedTask(latest);
  };

  const createTask = async () => {
    if (!newTaskTitle.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          status: newTaskColumn || "backlog",
          priority: newTaskPriority,
        }),
      });
      if (res.ok) {
        setNewTaskTitle("");
        setNewTaskPriority("medium");
        setNewTaskColumn(null);
        await loadData();
      }
    } finally {
      setCreating(false);
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    const res = await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks((prev) => prev.map((task) => task.id === id ? updated : task));
      if (selectedTask?.id === id) setSelectedTask(updated);
      await loadData();
    }
  };

  const deleteTask = async (id: string) => {
    const res = await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setSelectedTask(null);
      await loadData();
    }
  };

  const saveTaskEdits = async () => {
    if (!selectedTask || !editingTask) return;
    setSaving(true);
    await updateTask(selectedTask.id, editingTask);
    setEditingTask(null);
    setSaving(false);
  };

  const createGoal = async () => {
    if (!newGoalTitle.trim() || creatingGoal) return;
    setCreatingGoal(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "goal", title: newGoalTitle.trim() }),
      });
      if (res.ok) {
        setNewGoalTitle("");
        setShowGoalForm(false);
        await loadData();
      }
    } finally {
      setCreatingGoal(false);
    }
  };

  const deleteGoal = async (id: string) => {
    const res = await fetch(`/api/tasks?id=${id}&type=goal`, { method: "DELETE" });
    if (res.ok) await loadData();
  };

  const createBlocker = async () => {
    if (!selectedTask || !newBlockerTitle.trim()) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "blocker",
        title: newBlockerTitle.trim(),
        kind: newBlockerKind,
        taskId: selectedTask.id,
      }),
    });
    if (res.ok) {
      setNewBlockerTitle("");
      await loadData();
      refreshTask(selectedTask.id);
    }
  };

  const resolveBlocker = async (id: string) => {
    const res = await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "blocker", id, status: "resolved" }),
    });
    if (res.ok) {
      await loadData();
      refreshTask(selectedTask?.id);
    }
  };

  const createArtifact = async () => {
    if (!selectedTask || !newArtifactTitle.trim()) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "artifact",
        title: newArtifactTitle.trim(),
        kind: newArtifactKind,
        summary: newArtifactSummary.trim() || undefined,
        taskId: selectedTask.id,
      }),
    });
    if (res.ok) {
      setNewArtifactTitle("");
      setNewArtifactSummary("");
      setNewArtifactKind("note");
      await loadData();
      refreshTask(selectedTask.id);
    }
  };

  const createDecision = async () => {
    if (!selectedTask || !newDecisionTitle.trim()) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "decision",
        title: newDecisionTitle.trim(),
        status: newDecisionStatus,
        summary: newDecisionSummary.trim() || undefined,
        taskId: selectedTask.id,
      }),
    });
    if (res.ok) {
      setNewDecisionTitle("");
      setNewDecisionStatus("proposed");
      setNewDecisionSummary("");
      await loadData();
      refreshTask(selectedTask.id);
    }
  };

  const createAssignment = async () => {
    if (!selectedTask || !newAssignmentTitle.trim() || !newAssignmentAgentId.trim()) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "assignment",
        title: newAssignmentTitle.trim(),
        taskId: selectedTask.id,
        assignedToAgentId: newAssignmentAgentId.trim(),
        assignedBy: "planner",
        reviewerAgentId: "lead",
        status: newAssignmentStatus,
      }),
    });
    if (res.ok) {
      setNewAssignmentTitle("");
      setNewAssignmentStatus("proposed");
      await loadData();
    }
  };

  const updateAssignmentStatus = async (id: string, status: Assignment["status"]) => {
    const res = await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "assignment", id, status }),
    });
    if (res.ok) await loadData();
  };

  const createHandoff = async () => {
    if (!selectedTask || !newHandoffTitle.trim() || !newHandoffToAgentId.trim()) return;
    const taskArtifactIds = artifacts.filter((artifact) => artifact.taskId === selectedTask.id).map((artifact) => artifact.id);
    const taskBlockerIds = blockers.filter((blocker) => blocker.taskId === selectedTask.id && blocker.status === "active").map((blocker) => blocker.id);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "handoff",
        title: newHandoffTitle.trim(),
        taskId: selectedTask.id,
        fromAgentId: selectedTask.assignedToAgentId || "planner",
        toAgentId: newHandoffToAgentId.trim(),
        objective: selectedTask.description || "Continue the task with full context.",
        nextStep: "Pick up the next blocking action.",
        artifactIds: taskArtifactIds,
        blockerIds: taskBlockerIds,
      }),
    });
    if (res.ok) {
      setNewHandoffTitle("");
      await loadData();
    }
  };

  const updateHandoffStatus = async (id: string, status: Handoff["status"]) => {
    const res = await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "handoff", id, status }),
    });
    if (res.ok) await loadData();
  };

  const createApproval = async () => {
    if (!selectedTask || !newApprovalTitle.trim()) return;
    const latestHandoff = handoffs.filter((handoff) => handoff.taskId === selectedTask.id).sort((left, right) => right.updatedAt - left.updatedAt)[0];
    const taskArtifactIds = artifacts.filter((artifact) => artifact.taskId === selectedTask.id).map((artifact) => artifact.id);
    const taskDecisionIds = decisions.filter((decision) => decision.taskId === selectedTask.id).map((decision) => decision.id);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "approval",
        title: newApprovalTitle.trim(),
        taskId: selectedTask.id,
        handoffId: latestHandoff?.id,
        kind: newApprovalKind,
        approverAgentId: "lead",
        requestedByAgentId: selectedTask.assignedToAgentId || "reviewer",
        policyReason: "Sensitive coordination step requires a gate.",
        evidenceIds: taskArtifactIds,
        decisionIds: taskDecisionIds,
      }),
    });
    if (res.ok) {
      setNewApprovalTitle("");
      setNewApprovalKind("policy_gate");
      await loadData();
    }
  };

  const updateApprovalStatus = async (id: string, status: Approval["status"]) => {
    const res = await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "approval", id, status, approvedBy: status === "approved" ? "lead" : undefined }),
    });
    if (res.ok) await loadData();
  };

  const createRelease = async () => {
    if (!newReleaseTitle.trim()) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "release",
        title: newReleaseTitle.trim(),
        status: "at_risk",
        ownerAgentId: newReleaseOwnerAgentId.trim() || undefined,
        goalId: selectedTask?.goalId,
        linkedTaskIds: selectedTask ? [selectedTask.id] : [],
        riskSummary: "Operational risk detected from the board.",
      }),
    });
    if (res.ok) {
      setNewReleaseTitle("");
      await loadData();
    }
  };

  const createIncident = async () => {
    if (!newIncidentTitle.trim()) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "incident",
        title: newIncidentTitle.trim(),
        severity: newIncidentSeverity,
        status: "open",
        releaseId: newIncidentReleaseId || undefined,
        taskId: selectedTask?.id,
        ownerAgentId: selectedTask?.assignedToAgentId || newReleaseOwnerAgentId || undefined,
        summary: "Operational issue raised from the tasks board.",
      }),
    });
    if (res.ok) {
      setNewIncidentTitle("");
      await loadData();
    }
  };

  const updateIncidentStatus = async (id: string, status: IncidentRecord["status"]) => {
    const res = await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "incident", id, status }),
    });
    if (res.ok) await loadData();
  };

  const createFeedback = async () => {
    if (!newFeedbackTitle.trim()) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "feedback",
        title: newFeedbackTitle.trim(),
        origin: newFeedbackOrigin,
        priority: "high",
        incidentId: newFeedbackIncidentId || undefined,
        taskId: selectedTask?.id,
        ownerAgentId: selectedTask?.assignedToAgentId || undefined,
        summary: "Signal captured directly into the operational graph.",
      }),
    });
    if (res.ok) {
      setNewFeedbackTitle("");
      await loadData();
    }
  };

  const createCheck = async () => {
    if (!newCheckTitle.trim()) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "check",
        title: newCheckTitle.trim(),
        kind: newCheckKind,
        status: "failing",
        releaseId: newCheckReleaseId || undefined,
        incidentId: newCheckIncidentId || undefined,
        ownerAgentId: newReleaseOwnerAgentId.trim() || undefined,
        cadence: "daily",
        resultSummary: "The latest review still needs follow-up.",
      }),
    });
    if (res.ok) {
      setNewCheckTitle("");
      await loadData();
    }
  };

  const updateCheckStatus = async (id: string, status: OperationalCheckRecord["status"]) => {
    const res = await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "check", id, status }),
    });
    if (res.ok) await loadData();
  };

  const startFocusSession = async () => {
    if (!selectedTask) return;
    const taskBlockers = blockers.filter((blocker) => blocker.taskId === selectedTask.id && blocker.status === "active").map((blocker) => blocker.id);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "workSession",
        title: `Focus: ${selectedTask.title}`,
        objective: selectedTask.description || "Move the task forward with a focused work block.",
        taskIds: [selectedTask.id],
        blockerIds: taskBlockers,
        timeboxMinutes: 25,
      }),
    });
    if (res.ok) await loadData();
  };

  const updateWorkSession = async (id: string, status: WorkSession["status"], outcome?: string) => {
    const res = await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "workSession", id, status, outcome }),
    });
    if (res.ok) await loadData();
  };

  const handleDragStart = (taskId: string) => setDraggedTaskId(taskId);

  const handleDragOver = (event: React.DragEvent, column: ColumnKey) => {
    event.preventDefault();
    setDragOverColumn(column);
  };

  const handleDrop = async (column: ColumnKey) => {
    if (!draggedTaskId) return;
    const task = tasks.find((entry) => entry.id === draggedTaskId);
    if (task && task.status !== column) {
      await updateTask(draggedTaskId, { status: column });
    }
    setDraggedTaskId(null);
    setDragOverColumn(null);
  };

  const tasksByColumn = (column: ColumnKey) => tasks
    .filter((task) => task.status === column)
    .sort((left, right) => right.updatedAt - left.updatedAt);

  const goalForTask = (task: Task) => goals.find((goal) => goal.id === task.goalId);
  const blockersForTask = (taskId: string) => blockers.filter((blocker) => blocker.taskId === taskId).sort((left, right) => right.updatedAt - left.updatedAt);
  const artifactsForTask = (taskId: string) => artifacts.filter((artifact) => artifact.taskId === taskId).sort((left, right) => right.updatedAt - left.updatedAt);
  const decisionsForTask = (taskId: string) => decisions.filter((decision) => decision.taskId === taskId).sort((left, right) => right.updatedAt - left.updatedAt);
  const activeSessionForTask = (taskId: string) => workSessions.find((session) => session.status === "active" && session.taskIds.includes(taskId)) ?? null;
  const assignmentsForTask = (taskId: string) => assignments.filter((assignment) => assignment.taskId === taskId).sort((left, right) => right.updatedAt - left.updatedAt);
  const handoffsForTask = (taskId: string) => handoffs.filter((handoff) => handoff.taskId === taskId).sort((left, right) => right.updatedAt - left.updatedAt);
  const approvalsForTask = (taskId: string) => approvals.filter((approval) => approval.taskId === taskId).sort((left, right) => right.updatedAt - left.updatedAt);

  const computeGoalProgress = (goal: Goal) => {
    const linked = tasks.filter((task) => task.goalId === goal.id);
    if (linked.length === 0) return goal.progress || 0;
    const done = linked.filter((task) => task.status === "done").length;
    return Math.round((done / linked.length) * 100);
  };

  const addLabel = async () => {
    if (!selectedTask || !newLabel.trim()) return;
    await updateTask(selectedTask.id, {
      labels: [...new Set([...(selectedTask.labels || []), newLabel.trim()])],
    });
    setNewLabel("");
  };

  const removeLabel = async (label: string) => {
    if (!selectedTask) return;
    await updateTask(selectedTask.id, {
      labels: selectedTask.labels.filter((entry) => entry !== label),
    });
  };

  if (!loaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" data-testid="tasks-page">
      <div className="flex-shrink-0 px-6 pt-6 pb-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Target className="w-5 h-5 text-muted-foreground" />
              {messages.nav?.tasks ?? "Tasks & Goals"}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              Run the single-agent loop from triage to evidence without leaving the board
            </p>
          </div>
          <button
            data-testid="tasks-new-button"
            onClick={() => setNewTaskColumn("backlog")}
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            New Task
          </button>
        </div>

        {myWork && (
          <div className="space-y-3" data-testid="my-work-panel">
            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
              {[
                { id: "triage", label: "Needs triage", value: myWork.summary.triageThreads },
                { id: "ready", label: "Ready now", value: myWork.summary.readyTasks },
                { id: "blocked", label: "Blocked", value: myWork.summary.blockedTasks },
                { id: "blockers", label: "Active blockers", value: myWork.summary.activeBlockers },
                { id: "decisions", label: "Pending decisions", value: myWork.summary.pendingDecisions },
                { id: "focus", label: "Focus sessions", value: myWork.summary.activeWorkSessions },
              ].map((metric) => (
                <div key={metric.id} data-testid={`my-work-stat-${metric.id}`} className="rounded-xl border border-border bg-card px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{metric.label}</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{metric.value}</div>
                </div>
              ))}
            </div>
            {myWork.triageThreads.length > 0 && (
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Inbox triage</div>
                <div className="space-y-2">
                  {myWork.triageThreads.slice(0, 3).map((thread) => (
                    <div key={thread.id} className="rounded-lg bg-muted/50 px-3 py-2" data-testid="my-work-triage-thread">
                      <div className="text-[12px] font-medium text-foreground">{thread.subject || `Thread ${thread.id}`}</div>
                      <div className="text-[11px] text-muted-foreground">{thread.preview || thread.channel || "Unread inbox item"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {teamWork && (
          <div className="space-y-3" data-testid="team-work-panel">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              {[
                { id: "assignments", label: "Assignments", value: teamWork.summary.activeAssignments },
                { id: "handoffs", label: "Handoffs", value: teamWork.summary.pendingHandoffs },
                { id: "approvals", label: "Approvals", value: teamWork.summary.pendingApprovals },
                { id: "overloaded", label: "Overloaded", value: teamWork.summary.overloadedAgents },
                { id: "risk", label: "At risk", value: teamWork.summary.agentsAtRisk },
              ].map((metric) => (
                <div key={metric.id} data-testid={`team-work-stat-${metric.id}`} className="rounded-xl border border-border bg-card px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{metric.label}</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{metric.value}</div>
                </div>
              ))}
            </div>
            {teamWork.capacity.length > 0 && (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {teamWork.capacity.slice(0, 3).map((snapshot) => (
                  <div key={snapshot.id} data-testid="team-capacity-card" className="rounded-xl border border-border bg-card px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[12px] font-semibold text-foreground">{snapshot.title}</div>
                        <div className="text-[11px] text-muted-foreground">{snapshot.agentId} · {snapshot.availability}</div>
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded-full border ${
                        snapshot.status === "overloaded"
                          ? "bg-red-500/10 text-red-600 border-red-500/20"
                          : snapshot.status === "limited"
                            ? "bg-yellow-500/10 text-yellow-700 border-yellow-500/20"
                            : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      }`}>
                        {snapshot.status}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                      <div>
                        <div className="uppercase tracking-wider">WIP</div>
                        <div className="mt-1 text-foreground font-medium">{snapshot.currentWip}/{snapshot.maxWip ?? "?"}</div>
                      </div>
                      <div>
                        <div className="uppercase tracking-wider">Queue</div>
                        <div className="mt-1 text-foreground font-medium">{snapshot.queueDepth}</div>
                      </div>
                      <div>
                        <div className="uppercase tracking-wider">Blocked</div>
                        <div className="mt-1 text-foreground font-medium">{snapshot.blockedCount}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {operationsCockpit && (
          <div className="space-y-3" data-testid="operations-cockpit-panel">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              {[
                { id: "releases", label: "Active releases", value: operationsCockpit.summary.activeReleases },
                { id: "risk", label: "At risk releases", value: operationsCockpit.summary.atRiskReleases },
                { id: "incidents", label: "Open incidents", value: operationsCockpit.summary.openIncidents },
                { id: "checks", label: "Failing checks", value: operationsCockpit.summary.failingChecks },
                { id: "feedback", label: "New feedback", value: operationsCockpit.summary.newFeedback },
              ].map((metric) => (
                <div key={metric.id} data-testid={`operations-cockpit-stat-${metric.id}`} className="rounded-xl border border-border bg-card px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{metric.label}</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{metric.value}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div>
                  <div className="text-[12px] font-semibold text-foreground">Operations cockpit</div>
                  <div className="text-[11px] text-muted-foreground">Portfolio risk, active incidents, external signal, and operational checks on the same graph.</div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg bg-muted/50 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Agents</div>
                    <div className="mt-1 text-[14px] font-semibold text-foreground">{operationsCockpit.summary.activeAgents}</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Gated agents</div>
                    <div className="mt-1 text-[14px] font-semibold text-foreground">{operationsCockpit.summary.approvalGatedAgents}</div>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {operationsCockpit.agents.slice(0, 2).map((entry) => (
                    <div key={entry.agent.id} data-testid="operations-agent-card" className="rounded-lg border border-border px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[12px] font-medium text-foreground">{entry.agent.name}</div>
                          <div className="text-[11px] text-muted-foreground">{entry.agent.role}</div>
                        </div>
                        <span className="text-[10px] rounded-full border px-2 py-1 bg-muted text-muted-foreground">{entry.agent.autonomyLevel}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <div className="uppercase tracking-wider text-muted-foreground">Releases</div>
                          <div className="mt-1 font-medium text-foreground">{entry.activeReleaseIds.length}</div>
                        </div>
                        <div>
                          <div className="uppercase tracking-wider text-muted-foreground">Incidents</div>
                          <div className="mt-1 font-medium text-foreground">{entry.openIncidentIds.length}</div>
                        </div>
                        <div>
                          <div className="uppercase tracking-wider text-muted-foreground">Approvals</div>
                          <div className="mt-1 font-medium text-foreground">{entry.pendingApprovalIds.length}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <input
                      data-testid="operations-release-title-input"
                      value={newReleaseTitle}
                      onChange={(event) => setNewReleaseTitle(event.target.value)}
                      placeholder="Release title"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                    />
                    <select
                      data-testid="operations-release-owner-select"
                      value={newReleaseOwnerAgentId}
                      onChange={(event) => setNewReleaseOwnerAgentId(event.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                    >
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.name}>{agent.name}</option>
                      ))}
                    </select>
                    <button data-testid="operations-release-add-button" onClick={createRelease} className="w-full rounded-lg border border-border text-[12px] font-medium px-3 py-2 text-muted-foreground hover:text-foreground hover:border-foreground/20">
                      Add release
                    </button>
                  </div>

                  <div className="space-y-2">
                    <input
                      data-testid="operations-incident-title-input"
                      value={newIncidentTitle}
                      onChange={(event) => setNewIncidentTitle(event.target.value)}
                      placeholder="Incident title"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        data-testid="operations-incident-severity-select"
                        value={newIncidentSeverity}
                        onChange={(event) => setNewIncidentSeverity(event.target.value as IncidentRecord["severity"])}
                        className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                      >
                        {(["sev1", "sev2", "sev3", "sev4"] as const).map((severity) => (
                          <option key={severity} value={severity}>{severity}</option>
                        ))}
                      </select>
                      <select
                        data-testid="operations-incident-release-select"
                        value={newIncidentReleaseId}
                        onChange={(event) => setNewIncidentReleaseId(event.target.value)}
                        className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                      >
                        <option value="">No release</option>
                        {releases.map((release) => (
                          <option key={release.id} value={release.id}>{release.title}</option>
                        ))}
                      </select>
                    </div>
                    <button data-testid="operations-incident-add-button" onClick={createIncident} className="w-full rounded-lg border border-border text-[12px] font-medium px-3 py-2 text-muted-foreground hover:text-foreground hover:border-foreground/20">
                      Add incident
                    </button>
                  </div>

                  <div className="space-y-2">
                    <input
                      data-testid="operations-feedback-title-input"
                      value={newFeedbackTitle}
                      onChange={(event) => setNewFeedbackTitle(event.target.value)}
                      placeholder="Feedback title"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        data-testid="operations-feedback-origin-select"
                        value={newFeedbackOrigin}
                        onChange={(event) => setNewFeedbackOrigin(event.target.value as FeedbackRecord["origin"])}
                        className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                      >
                        {(["customer", "agent", "system", "sales", "support", "ops"] as const).map((origin) => (
                          <option key={origin} value={origin}>{origin}</option>
                        ))}
                      </select>
                      <select
                        data-testid="operations-feedback-incident-select"
                        value={newFeedbackIncidentId}
                        onChange={(event) => setNewFeedbackIncidentId(event.target.value)}
                        className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                      >
                        <option value="">No incident</option>
                        {incidents.map((incident) => (
                          <option key={incident.id} value={incident.id}>{incident.title}</option>
                        ))}
                      </select>
                    </div>
                    <button data-testid="operations-feedback-add-button" onClick={createFeedback} className="w-full rounded-lg border border-border text-[12px] font-medium px-3 py-2 text-muted-foreground hover:text-foreground hover:border-foreground/20">
                      Add feedback
                    </button>
                  </div>

                  <div className="space-y-2">
                    <input
                      data-testid="operations-check-title-input"
                      value={newCheckTitle}
                      onChange={(event) => setNewCheckTitle(event.target.value)}
                      placeholder="Operational check"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        data-testid="operations-check-kind-select"
                        value={newCheckKind}
                        onChange={(event) => setNewCheckKind(event.target.value as OperationalCheckRecord["kind"])}
                        className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                      >
                        {(["release_readiness", "incident_followup", "sla", "quality", "compliance", "ops"] as const).map((kind) => (
                          <option key={kind} value={kind}>{kind}</option>
                        ))}
                      </select>
                      <select
                        data-testid="operations-check-release-select"
                        value={newCheckReleaseId}
                        onChange={(event) => setNewCheckReleaseId(event.target.value)}
                        className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                      >
                        <option value="">No release</option>
                        {releases.map((release) => (
                          <option key={release.id} value={release.id}>{release.title}</option>
                        ))}
                      </select>
                      <select
                        data-testid="operations-check-incident-select"
                        value={newCheckIncidentId}
                        onChange={(event) => setNewCheckIncidentId(event.target.value)}
                        className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                      >
                        <option value="">No incident</option>
                        {incidents.map((incident) => (
                          <option key={incident.id} value={incident.id}>{incident.title}</option>
                        ))}
                      </select>
                    </div>
                    <button data-testid="operations-check-add-button" onClick={createCheck} className="w-full rounded-lg border border-border text-[12px] font-medium px-3 py-2 text-muted-foreground hover:text-foreground hover:border-foreground/20">
                      Add check
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="text-[12px] font-semibold text-foreground">Releases</div>
                {operationsCockpit.releases.map((release) => (
                  <div key={release.id} data-testid="operations-release-item" className="rounded-lg bg-muted/50 px-3 py-2">
                    <div className="text-[12px] font-medium text-foreground">{release.title}</div>
                    <div className="text-[11px] text-muted-foreground">{release.status} · {release.ownerAgentId || "unowned"}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="text-[12px] font-semibold text-foreground">Incidents</div>
                {operationsCockpit.incidents.map((incident) => (
                  <div key={incident.id} data-testid="operations-incident-item" className="rounded-lg bg-muted/50 px-3 py-2 space-y-2">
                    <div>
                      <div className="text-[12px] font-medium text-foreground">{incident.title}</div>
                      <div className="text-[11px] text-muted-foreground">{incident.severity} · {incident.status}</div>
                    </div>
                    {(incident.status === "open" || incident.status === "investigating" || incident.status === "mitigating") && (
                      <button data-testid="operations-incident-resolve-button" onClick={() => updateIncidentStatus(incident.id, "resolved")} className="rounded-md border border-border text-[11px] px-2 py-1 text-muted-foreground hover:text-foreground hover:border-foreground/20">
                        Resolve
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="text-[12px] font-semibold text-foreground">Feedback</div>
                {operationsCockpit.feedback.map((item) => (
                  <div key={item.id} data-testid="operations-feedback-item" className="rounded-lg bg-muted/50 px-3 py-2">
                    <div className="text-[12px] font-medium text-foreground">{item.title}</div>
                    <div className="text-[11px] text-muted-foreground">{item.origin} · {item.priority}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="text-[12px] font-semibold text-foreground">Checks</div>
                {operationsCockpit.checks.map((check) => (
                  <div key={check.id} data-testid="operations-check-item" className="rounded-lg bg-muted/50 px-3 py-2 space-y-2">
                    <div>
                      <div className="text-[12px] font-medium text-foreground">{check.title}</div>
                      <div className="text-[11px] text-muted-foreground">{check.kind} · {check.status}</div>
                    </div>
                    {(check.status === "pending" || check.status === "failing") && (
                      <button data-testid="operations-check-pass-button" onClick={() => updateCheckStatus(check.id, "passing")} className="rounded-md border border-border text-[11px] px-2 py-1 text-muted-foreground hover:text-foreground hover:border-foreground/20">
                        Mark passing
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-6 pb-4">
        <button
          onClick={() => setGoalsExpanded(!goalsExpanded)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors mb-2"
        >
          {goalsExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Goals ({goals.length})
        </button>

        {goalsExpanded && (
          <div className="space-y-2">
            {goals.map((goal) => {
              const progress = computeGoalProgress(goal);
              const linkedCount = tasks.filter((task) => task.goalId === goal.id).length;
              return (
                <div key={goal.id} className="bg-card border border-border rounded-xl px-4 py-3 group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Target className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-[13px] font-medium text-foreground truncate">{goal.title}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {linkedCount} task{linkedCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-muted-foreground">{progress}%</span>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 p-1 rounded-lg hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              );
            })}

            {showGoalForm ? (
              <div className="bg-card border border-border rounded-xl px-4 py-3">
                <div className="flex gap-2">
                  <input
                    data-testid="tasks-goal-title-input"
                    type="text"
                    value={newGoalTitle}
                    onChange={(event) => setNewGoalTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") createGoal();
                      if (event.key === "Escape") {
                        setShowGoalForm(false);
                        setNewGoalTitle("");
                      }
                    }}
                    autoFocus
                    placeholder="Goal title..."
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors"
                  />
                  <button
                    data-testid="tasks-goal-add-confirm"
                    onClick={createGoal}
                    disabled={!newGoalTitle.trim() || creatingGoal}
                    className="px-3 py-1.5 bg-foreground text-primary-foreground text-[12px] font-medium rounded-lg hover:bg-foreground-intense disabled:opacity-40 transition-colors"
                  >
                    {creatingGoal ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
                  </button>
                  <button
                    onClick={() => {
                      setShowGoalForm(false);
                      setNewGoalTitle("");
                    }}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                data-testid="tasks-add-goal-button"
                onClick={() => setShowGoalForm(true)}
                className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Goal
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-x-auto px-6 pb-6">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map((column) => {
            const columnTasks = tasksByColumn(column.key);
            const isOver = dragOverColumn === column.key;
            return (
              <div
                key={column.key}
                data-testid={`tasks-column-${column.key}`}
                className={`w-72 flex flex-col rounded-xl transition-colors ${isOver ? "bg-muted/60 ring-2 ring-foreground/10" : "bg-muted/30"}`}
                onDragOver={(event) => handleDragOver(event, column.key)}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={() => handleDrop(column.key)}
              >
                <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0">
                  <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${column.accent}`}>
                    {column.icon}
                    {column.label}
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">{columnTasks.length}</span>
                  </div>
                  <button
                    data-testid={`tasks-column-add-${column.key}`}
                    onClick={() => setNewTaskColumn(column.key)}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {newTaskColumn === column.key && (
                  <div className="mx-2 mb-2 bg-card border border-border rounded-xl p-3 shadow-sm">
                    <input
                      data-testid="tasks-new-title-input"
                      type="text"
                      value={newTaskTitle}
                      onChange={(event) => setNewTaskTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") createTask();
                        if (event.key === "Escape") {
                          setNewTaskColumn(null);
                          setNewTaskTitle("");
                        }
                      }}
                      autoFocus
                      placeholder="Task title..."
                      className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none mb-2"
                    />
                    <div className="flex items-center justify-between">
                      <select
                        data-testid="tasks-new-priority-select"
                        value={newTaskPriority}
                        onChange={(event) => setNewTaskPriority(event.target.value as Task["priority"])}
                        className="text-[11px] bg-muted border border-border rounded-md px-2 py-1 text-foreground focus:outline-none"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                      <div className="flex items-center gap-1.5">
                        <button
                          data-testid="tasks-new-cancel-button"
                          onClick={() => {
                            setNewTaskColumn(null);
                            setNewTaskTitle("");
                          }}
                          className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          data-testid="tasks-new-add-button"
                          onClick={createTask}
                          disabled={!newTaskTitle.trim() || creating}
                          className="text-[11px] font-medium bg-foreground text-primary-foreground px-3 py-1 rounded-md disabled:opacity-40 transition-colors flex items-center gap-1"
                        >
                          {creating && <Loader2 className="w-3 h-3 animate-spin" />}
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                  {columnTasks.map((task) => {
                    const goal = goalForTask(task);
                    const taskBlockers = blockersForTask(task.id).filter((blocker) => blocker.status === "active");
                    const isDragging = draggedTaskId === task.id;
                    return (
                      <div
                        key={task.id}
                        data-testid="task-card"
                        data-task-id={task.id}
                        draggable
                        onDragStart={() => handleDragStart(task.id)}
                        onDragEnd={() => {
                          setDraggedTaskId(null);
                          setDragOverColumn(null);
                        }}
                        onClick={() => {
                          setSelectedTask(task);
                          setEditingTask(null);
                        }}
                        className={`bg-card border border-border rounded-xl p-3 cursor-pointer hover:border-foreground/20 hover:shadow-sm transition-all group ${isDragging ? "opacity-40 scale-95" : ""} ${selectedTask?.id === task.id ? "ring-2 ring-foreground/15 border-foreground/20" : ""}`}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-foreground leading-snug mb-1.5 line-clamp-2">{task.title}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${PRIORITY_CONFIG[task.priority].color}`}>
                                {PRIORITY_CONFIG[task.priority].label}
                              </span>
                              {goal && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center gap-1">
                                  <Target className="w-2.5 h-2.5" />
                                  {goal.title}
                                </span>
                              )}
                              {taskBlockers.length > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-600 border border-red-500/20">
                                  {taskBlockers.length} blocker{taskBlockers.length !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {columnTasks.length === 0 && !newTaskColumn && (
                    <div className="text-center py-8 text-[11px] text-muted-foreground/50">No tasks</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedTask && (
        <div data-testid="task-detail-panel" className="fixed inset-0 z-50 flex justify-end" onClick={(event) => { if (event.target === event.currentTarget) setSelectedTask(null); }}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setSelectedTask(null)} />
          <div className="relative w-full max-w-md bg-card border-l border-border shadow-2xl h-full overflow-y-auto animate-in slide-in-from-right-8 duration-200">
            <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border px-5 py-4 flex items-center justify-between z-10">
              <h2 className="text-[14px] font-semibold text-foreground">Task Details</h2>
              <div className="flex items-center gap-1">
                <button
                  data-testid="task-detail-delete-button"
                  onClick={() => deleteTask(selectedTask.id)}
                  className="text-muted-foreground hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-all"
                  title="Delete task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={() => setSelectedTask(null)} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="px-5 py-5 space-y-5">
              <section>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Title</label>
                {editingTask !== null ? (
                  <input
                    data-testid="task-detail-title-input"
                    type="text"
                    value={editingTask.title ?? selectedTask.title}
                    onChange={(event) => setEditingTask({ ...editingTask, title: event.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors"
                  />
                ) : (
                  <p className="text-[15px] font-medium text-foreground cursor-pointer hover:text-foreground/80 transition-colors" onClick={() => setEditingTask({ title: selectedTask.title, description: selectedTask.description })}>
                    {selectedTask.title}
                  </p>
                )}
              </section>

              <section>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Status</label>
                <div className="flex gap-1.5 flex-wrap">
                  {COLUMNS.map((column) => (
                    <button
                      key={column.key}
                      data-testid={`task-status-${column.key}`}
                      onClick={() => updateTask(selectedTask.id, { status: column.key })}
                      className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${selectedTask.status === column.key ? "bg-foreground text-primary-foreground border-foreground" : "bg-card text-muted-foreground border-border hover:border-foreground/20 hover:text-foreground"}`}
                    >
                      {column.icon}
                      {column.label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Priority</label>
                <div className="flex gap-1.5 flex-wrap">
                  {(["low", "medium", "high", "urgent"] as const).map((priority) => (
                    <button
                      key={priority}
                      data-testid={`task-priority-${priority}`}
                      onClick={() => updateTask(selectedTask.id, { priority })}
                      className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${selectedTask.priority === priority ? PRIORITY_CONFIG[priority].color : "bg-card text-muted-foreground border-border hover:border-foreground/20"}`}
                    >
                      <Flag className="w-3 h-3" />
                      {PRIORITY_CONFIG[priority].label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Description</label>
                {editingTask !== null ? (
                  <textarea
                    data-testid="task-detail-description-input"
                    value={editingTask.description ?? selectedTask.description}
                    onChange={(event) => setEditingTask({ ...editingTask, description: event.target.value })}
                    rows={4}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors resize-none"
                    placeholder="Add a description..."
                  />
                ) : (
                  <p className="text-[13px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors min-h-[2rem]" onClick={() => setEditingTask({ title: selectedTask.title, description: selectedTask.description })}>
                    {selectedTask.description || "Click to add description..."}
                  </p>
                )}
              </section>

              <section>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Goal</label>
                <select
                  data-testid="task-detail-goal-select"
                  value={selectedTask.goalId || ""}
                  onChange={(event) => updateTask(selectedTask.id, { goalId: event.target.value || undefined })}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors"
                >
                  <option value="">No goal</option>
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>{goal.title}</option>
                  ))}
                </select>
              </section>

              <section>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Labels</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedTask.labels.map((label) => (
                    <span key={label} className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border flex items-center gap-1">
                      {label}
                      <button onClick={() => removeLabel(label)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  data-testid="task-detail-label-input"
                  type="text"
                  value={newLabel}
                  onChange={(event) => setNewLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addLabel();
                    }
                  }}
                  placeholder="Add a label and press Enter"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors"
                />
              </section>

              <section className="rounded-xl border border-border p-4 space-y-3">
                <div>
                  <div className="text-[12px] font-semibold text-foreground">Coordination</div>
                  <div className="text-[11px] text-muted-foreground">Owner, handoff target, and latest approval on this task.</div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-lg bg-muted/50 px-3 py-2">
                    <div className="uppercase tracking-wider text-muted-foreground">Owner</div>
                    <div className="mt-1 font-medium text-foreground">{selectedTask.assignedToAgentId || "Unassigned"}</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-3 py-2">
                    <div className="uppercase tracking-wider text-muted-foreground">Handoff</div>
                    <div className="mt-1 font-medium text-foreground">{selectedTask.handoffTo || "None"}</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-3 py-2">
                    <div className="uppercase tracking-wider text-muted-foreground">Approved by</div>
                    <div className="mt-1 font-medium text-foreground">{selectedTask.approvedBy || "Pending"}</div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border p-4 space-y-3" data-testid="task-assignments-section">
                <div>
                  <div className="text-[12px] font-semibold text-foreground">Assignments</div>
                  <div className="text-[11px] text-muted-foreground">Separate ownership from the work item and keep agent accountability explicit.</div>
                </div>
                <div className="space-y-2">
                  {assignmentsForTask(selectedTask.id).map((assignment) => (
                    <div key={assignment.id} data-testid="task-assignment-item" className="rounded-lg bg-muted/50 px-3 py-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[12px] font-medium text-foreground">{assignment.title}</div>
                          <div className="text-[11px] text-muted-foreground">{ASSIGNMENT_LABELS[assignment.status]} · {assignment.assignedToAgentId}</div>
                        </div>
                        <div className="flex gap-1.5">
                          {assignment.status === "proposed" && (
                            <button data-testid="task-assignment-accept-button" onClick={() => updateAssignmentStatus(assignment.id, "accepted")} className="rounded-md bg-foreground text-primary-foreground text-[11px] px-2 py-1">
                              Accept
                            </button>
                          )}
                          {(assignment.status === "proposed" || assignment.status === "accepted") && (
                            <button data-testid="task-assignment-reject-button" onClick={() => updateAssignmentStatus(assignment.id, "rejected")} className="rounded-md border border-border text-[11px] px-2 py-1 text-muted-foreground hover:text-foreground hover:border-foreground/20">
                              Reject
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <input
                  data-testid="task-assignment-title-input"
                  value={newAssignmentTitle}
                  onChange={(event) => setNewAssignmentTitle(event.target.value)}
                  placeholder="Assignment title"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    data-testid="task-assignment-agent-input"
                    value={newAssignmentAgentId}
                    onChange={(event) => setNewAssignmentAgentId(event.target.value)}
                    placeholder="Agent id"
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                  />
                  <select
                    value={newAssignmentStatus}
                    onChange={(event) => setNewAssignmentStatus(event.target.value as Assignment["status"])}
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                  >
                    {Object.entries(ASSIGNMENT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <button data-testid="task-assignment-add-button" onClick={createAssignment} className="w-full rounded-lg border border-border text-[12px] font-medium px-3 py-2 text-muted-foreground hover:text-foreground hover:border-foreground/20" disabled={!newAssignmentTitle.trim() || !newAssignmentAgentId.trim()}>
                  Add assignment
                </button>
              </section>

              <section className="rounded-xl border border-border p-4 space-y-3" data-testid="task-handoffs-section">
                <div>
                  <div className="text-[12px] font-semibold text-foreground">Handoffs</div>
                  <div className="text-[11px] text-muted-foreground">Pass the task with objective, evidence, and an explicit next step.</div>
                </div>
                <div className="space-y-2">
                  {handoffsForTask(selectedTask.id).map((handoff) => (
                    <div key={handoff.id} data-testid="task-handoff-item" className="rounded-lg bg-muted/50 px-3 py-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[12px] font-medium text-foreground">{handoff.title}</div>
                          <div className="text-[11px] text-muted-foreground">{HANDOFF_LABELS[handoff.status]} · {handoff.fromAgentId} → {handoff.toAgentId}</div>
                        </div>
                        <div className="flex gap-1.5">
                          {handoff.status === "proposed" && (
                            <button data-testid="task-handoff-accept-button" onClick={() => updateHandoffStatus(handoff.id, "accepted")} className="rounded-md bg-foreground text-primary-foreground text-[11px] px-2 py-1">
                              Accept
                            </button>
                          )}
                          {(handoff.status === "proposed" || handoff.status === "accepted" || handoff.status === "returned") && (
                            <button data-testid="task-handoff-complete-button" onClick={() => updateHandoffStatus(handoff.id, "completed")} className="rounded-md border border-border text-[11px] px-2 py-1 text-muted-foreground hover:text-foreground hover:border-foreground/20">
                              Complete
                            </button>
                          )}
                        </div>
                      </div>
                      {handoff.nextStep && <div className="text-[11px] text-muted-foreground">Next: {handoff.nextStep}</div>}
                    </div>
                  ))}
                </div>
                <input
                  data-testid="task-handoff-title-input"
                  value={newHandoffTitle}
                  onChange={(event) => setNewHandoffTitle(event.target.value)}
                  placeholder="Handoff title"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                />
                <input
                  data-testid="task-handoff-agent-input"
                  value={newHandoffToAgentId}
                  onChange={(event) => setNewHandoffToAgentId(event.target.value)}
                  placeholder="To agent"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                />
                <button data-testid="task-handoff-add-button" onClick={createHandoff} className="w-full rounded-lg border border-border text-[12px] font-medium px-3 py-2 text-muted-foreground hover:text-foreground hover:border-foreground/20" disabled={!newHandoffTitle.trim() || !newHandoffToAgentId.trim()}>
                  Add handoff
                </button>
              </section>

              <section className="rounded-xl border border-border p-4 space-y-3" data-testid="task-approvals-section">
                <div>
                  <div className="text-[12px] font-semibold text-foreground">Approvals</div>
                  <div className="text-[11px] text-muted-foreground">Gate sensitive actions with policy reasons and evidence.</div>
                </div>
                <div className="space-y-2">
                  {approvalsForTask(selectedTask.id).map((approval) => (
                    <div key={approval.id} data-testid="task-approval-item" className="rounded-lg bg-muted/50 px-3 py-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[12px] font-medium text-foreground">{approval.title}</div>
                          <div className="text-[11px] text-muted-foreground">{APPROVAL_LABELS[approval.status]} · {approval.kind}</div>
                        </div>
                        <div className="flex gap-1.5">
                          {approval.status === "pending" && (
                            <button data-testid="task-approval-approve-button" onClick={() => updateApprovalStatus(approval.id, "approved")} className="rounded-md bg-foreground text-primary-foreground text-[11px] px-2 py-1">
                              Approve
                            </button>
                          )}
                          {approval.status === "pending" && (
                            <button data-testid="task-approval-reject-button" onClick={() => updateApprovalStatus(approval.id, "rejected")} className="rounded-md border border-border text-[11px] px-2 py-1 text-muted-foreground hover:text-foreground hover:border-foreground/20">
                              Reject
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground">{approval.policyReason}</div>
                    </div>
                  ))}
                </div>
                <input
                  data-testid="task-approval-title-input"
                  value={newApprovalTitle}
                  onChange={(event) => setNewApprovalTitle(event.target.value)}
                  placeholder="Approval title"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                />
                <select
                  data-testid="task-approval-kind-select"
                  value={newApprovalKind}
                  onChange={(event) => setNewApprovalKind(event.target.value as Approval["kind"])}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                >
                  {(["policy_gate", "publish", "deploy", "delete", "external_send", "spend", "other"] as const).map((kind) => (
                    <option key={kind} value={kind}>{kind}</option>
                  ))}
                </select>
                <button data-testid="task-approval-add-button" onClick={createApproval} className="w-full rounded-lg border border-border text-[12px] font-medium px-3 py-2 text-muted-foreground hover:text-foreground hover:border-foreground/20" disabled={!newApprovalTitle.trim()}>
                  Add approval
                </button>
              </section>

              <section className="rounded-xl border border-border p-4 space-y-3" data-testid="task-blockers-section">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[12px] font-semibold text-foreground">Blockers</div>
                    <div className="text-[11px] text-muted-foreground">Explicit blocking reasons and dependencies.</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{blockersForTask(selectedTask.id).length}</div>
                </div>
                <div className="space-y-2">
                  {blockersForTask(selectedTask.id).map((blocker) => (
                    <div key={blocker.id} data-testid="task-blocker-item" className="rounded-lg bg-muted/50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[12px] font-medium text-foreground">{blocker.title}</div>
                          <div className="text-[11px] text-muted-foreground">{BLOCKER_LABELS[blocker.kind]}</div>
                        </div>
                        {blocker.status === "active" && (
                          <button data-testid="task-blocker-resolve-button" onClick={() => resolveBlocker(blocker.id)} className="text-[11px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20">
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    data-testid="task-blocker-title-input"
                    value={newBlockerTitle}
                    onChange={(event) => setNewBlockerTitle(event.target.value)}
                    placeholder="New blocker"
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                  />
                  <select
                    data-testid="task-blocker-kind-select"
                    value={newBlockerKind}
                    onChange={(event) => setNewBlockerKind(event.target.value as Blocker["kind"])}
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                  >
                    {Object.entries(BLOCKER_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <button data-testid="task-blocker-add-button" onClick={createBlocker} className="w-full rounded-lg bg-foreground text-primary-foreground text-[12px] font-medium px-3 py-2 disabled:opacity-40" disabled={!newBlockerTitle.trim()}>
                  Add blocker
                </button>
              </section>

              <section className="rounded-xl border border-border p-4 space-y-3" data-testid="task-artifacts-section">
                <div>
                  <div className="text-[12px] font-semibold text-foreground">Evidence</div>
                  <div className="text-[11px] text-muted-foreground">Capture proofs, screenshots, commands, and notes.</div>
                </div>
                <div className="space-y-2">
                  {artifactsForTask(selectedTask.id).map((artifact) => (
                    <div key={artifact.id} data-testid="task-artifact-item" className="rounded-lg bg-muted/50 px-3 py-2">
                      <div className="text-[12px] font-medium text-foreground">{artifact.title}</div>
                      <div className="text-[11px] text-muted-foreground">{ARTIFACT_LABELS[artifact.kind]}{artifact.summary ? ` · ${artifact.summary}` : ""}</div>
                    </div>
                  ))}
                </div>
                <input
                  data-testid="task-artifact-title-input"
                  value={newArtifactTitle}
                  onChange={(event) => setNewArtifactTitle(event.target.value)}
                  placeholder="Artifact title"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                />
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <select
                    data-testid="task-artifact-kind-select"
                    value={newArtifactKind}
                    onChange={(event) => setNewArtifactKind(event.target.value as Artifact["kind"])}
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                  >
                    {Object.entries(ARTIFACT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <input
                    data-testid="task-artifact-summary-input"
                    value={newArtifactSummary}
                    onChange={(event) => setNewArtifactSummary(event.target.value)}
                    placeholder="Short summary"
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                  />
                </div>
                <button data-testid="task-artifact-add-button" onClick={createArtifact} className="w-full rounded-lg border border-border text-[12px] font-medium px-3 py-2 text-muted-foreground hover:text-foreground hover:border-foreground/20" disabled={!newArtifactTitle.trim()}>
                  Add evidence
                </button>
              </section>

              <section className="rounded-xl border border-border p-4 space-y-3" data-testid="task-decisions-section">
                <div>
                  <div className="text-[12px] font-semibold text-foreground">Decisions</div>
                  <div className="text-[11px] text-muted-foreground">Record the choices and their current state.</div>
                </div>
                <div className="space-y-2">
                  {decisionsForTask(selectedTask.id).map((decision) => (
                    <div key={decision.id} data-testid="task-decision-item" className="rounded-lg bg-muted/50 px-3 py-2">
                      <div className="text-[12px] font-medium text-foreground">{decision.title}</div>
                      <div className="text-[11px] text-muted-foreground">{DECISION_LABELS[decision.status]}{decision.summary ? ` · ${decision.summary}` : ""}</div>
                    </div>
                  ))}
                </div>
                <input
                  data-testid="task-decision-title-input"
                  value={newDecisionTitle}
                  onChange={(event) => setNewDecisionTitle(event.target.value)}
                  placeholder="Decision title"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                />
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <select
                    data-testid="task-decision-status-select"
                    value={newDecisionStatus}
                    onChange={(event) => setNewDecisionStatus(event.target.value as Decision["status"])}
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                  >
                    {Object.entries(DECISION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <input
                    data-testid="task-decision-summary-input"
                    value={newDecisionSummary}
                    onChange={(event) => setNewDecisionSummary(event.target.value)}
                    placeholder="Summary"
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                  />
                </div>
                <button data-testid="task-decision-add-button" onClick={createDecision} className="w-full rounded-lg border border-border text-[12px] font-medium px-3 py-2 text-muted-foreground hover:text-foreground hover:border-foreground/20" disabled={!newDecisionTitle.trim()}>
                  Add decision
                </button>
              </section>

              <section className="rounded-xl border border-border p-4 space-y-3" data-testid="task-focus-section">
                <div>
                  <div className="text-[12px] font-semibold text-foreground">Focus session</div>
                  <div className="text-[11px] text-muted-foreground">Track active work and the outcome of the current block.</div>
                </div>
                {activeSessionForTask(selectedTask.id) ? (
                  <div data-testid="task-active-session" className="rounded-lg bg-muted/50 px-3 py-3 space-y-2">
                    <div className="text-[12px] font-medium text-foreground">{activeSessionForTask(selectedTask.id)?.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Started {formatDate(new Date(activeSessionForTask(selectedTask.id)!.startedAt))}
                    </div>
                    <div className="flex gap-2">
                      <button data-testid="task-focus-complete-button" onClick={() => updateWorkSession(activeSessionForTask(selectedTask.id)!.id, "completed", "Moved the task forward")} className="flex-1 rounded-lg bg-foreground text-primary-foreground text-[12px] font-medium px-3 py-2">
                        Complete
                      </button>
                      <button data-testid="task-focus-cancel-button" onClick={() => updateWorkSession(activeSessionForTask(selectedTask.id)!.id, "cancelled")} className="flex-1 rounded-lg border border-border text-[12px] font-medium px-3 py-2 text-muted-foreground hover:text-foreground hover:border-foreground/20">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button data-testid="task-focus-start-button" onClick={startFocusSession} className="w-full rounded-lg bg-foreground text-primary-foreground text-[12px] font-medium px-3 py-2">
                    Start focus session
                  </button>
                )}
              </section>

              {editingTask !== null && (
                <button
                  data-testid="task-detail-save-button"
                  onClick={saveTaskEdits}
                  disabled={saving}
                  className="w-full rounded-lg bg-foreground text-primary-foreground text-[12px] font-medium px-3 py-2 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save changes
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
