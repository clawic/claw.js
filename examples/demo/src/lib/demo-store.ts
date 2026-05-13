/**
 * Simple JSON file-based persistence for demo features.
 * Each collection is stored as a separate JSON file in the workspace data directory.
 */
import fs from "fs";
import path from "path";
import os from "os";

export function resolveDemoDataDir(): string {
  const configured = process.env.CLAW_DEMO_DATA_DIR?.trim();
  if (!configured) {
    return path.join(os.homedir(), ".clawjs-demo", "data");
  }
  if (configured === "~") {
    return os.homedir();
  }
  if (configured.startsWith("~/")) {
    return path.join(os.homedir(), configured.slice(2));
  }
  return configured;
}

function ensureDir() {
  const dataDir = resolveDemoDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function filePath(collection: string): string {
  return path.join(resolveDemoDataDir(), `${collection}.json`);
}

export function readCollection<T>(collection: string): T[] {
  ensureDir();
  const fp = filePath(collection);
  if (!fs.existsSync(fp)) return [];
  try {
    const raw = fs.readFileSync(fp, "utf-8");
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

export function writeCollection<T>(collection: string, data: T[]): void {
  ensureDir();
  fs.writeFileSync(filePath(collection), JSON.stringify(data, null, 2), "utf-8");
}

export function readDocument<T>(collection: string): T | null {
  ensureDir();
  const fp = filePath(collection);
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = fs.readFileSync(fp, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeDocument<T>(collection: string, data: T): void {
  ensureDir();
  fs.writeFileSync(filePath(collection), JSON.stringify(data, null, 2), "utf-8");
}

// ── Task types ──
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
  progress: number; // 0-100
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
  projectId?: string;
  goalId?: string;
  assignedToAgentId: string;
  assignedBy?: string;
  delegatedBy?: string;
  reviewerAgentId?: string;
  rationale?: string;
  rejectionReason?: string;
  acceptedAt?: number;
  rejectedAt?: number;
  completedAt?: number;
  dueAt?: number;
  priority?: Task["priority"];
  createdAt: number;
  updatedAt: number;
}

export interface Handoff {
  id: string;
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
  acceptedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Approval {
  id: string;
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
  approvedAt?: number;
  rejectedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CapacitySnapshot {
  id: string;
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
  snapshotAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AgentRecord {
  id: string;
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
  createdAt: number;
  updatedAt: number;
}

export interface ReleaseRecord {
  id: string;
  title: string;
  status: "planned" | "active" | "at_risk" | "released" | "cancelled";
  projectId?: string;
  goalId?: string;
  ownerAgentId?: string;
  targetDate?: number;
  shippedAt?: number;
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
  projectId?: string;
  goalId?: string;
  taskId?: string;
  releaseId?: string;
  ownerAgentId?: string;
  summary?: string;
  customerImpact?: string;
  blockerIds: string[];
  feedbackIds: string[];
  startedAt?: number;
  resolvedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface FeedbackRecord {
  id: string;
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
  createdAt: number;
  updatedAt: number;
}

export interface OperationalCheckRecord {
  id: string;
  title: string;
  status: "pending" | "passing" | "failing" | "snoozed";
  kind: "release_readiness" | "incident_followup" | "sla" | "quality" | "compliance" | "ops";
  projectId?: string;
  goalId?: string;
  releaseId?: string;
  incidentId?: string;
  ownerAgentId?: string;
  cadence?: "hourly" | "daily" | "weekly" | "monthly";
  lastRunAt?: number;
  nextRunAt?: number;
  resultSummary?: string;
  playbook?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OperationsCockpitAgent {
  agent: AgentRecord;
  capacity: CapacitySnapshot | null;
  openIncidentIds: string[];
  pendingApprovalIds: string[];
  activeReleaseIds: string[];
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
  agents: OperationsCockpitAgent[];
}

// ── Routine types ──
export interface Routine {
  id: string;
  label: string;
  description: string;
  schedule: string; // cron expression
  channel: string; // "chat" | "whatsapp" | "telegram" | "email"
  prompt: string;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  createdAt: number;
  updatedAt: number;
}

export interface RoutineExecution {
  id: string;
  routineId: string;
  status: "success" | "failure" | "running";
  startedAt: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

// ── Activity types ──
export interface ActivityEvent {
  id: string;
  event: string;
  capability: string;
  detail: string;
  timestamp: number;
  status: "success" | "failure" | "pending";
  metadata?: Record<string, unknown>;
}

// ── Calendar types ──
export interface CalendarEventRecord {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: number;
  endsAt: number | null;
  attendeePersonIds: string[];
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  reminders: unknown[];
  createdAt: number;
  updatedAt: number;
}

// ── Note types ──
export interface Note {
  id: string;
  title: string;
  content: string;
  folder: string;
  tags: string[];
  linkedTaskIds: string[];
  linkedSessionIds: string[];
  createdAt: number;
  updatedAt: number;
}

// ── Persona types ──
export interface Persona {
  id: string;
  name: string;
  avatar: string; // emoji or initials
  role: string;
  systemPrompt: string;
  skills: string[];
  channels: string[];
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

// ── Usage types ──
export interface UsageRecord {
  id: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  estimatedCost: number;
  sessionId?: string;
  taskId?: string;
  timestamp: number;
}

export interface BudgetConfig {
  monthlyLimit: number;
  warningThreshold: number; // percentage 0-100
  enabled: boolean;
}

// ── Memory types ──
export interface MemoryEntry {
  id: string;
  kind: "file" | "store" | "index" | "session" | "knowledge";
  title: string;
  content: string;
  source: string;
  sessionId?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

// ── Plugin types ──
export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  status: "active" | "inactive" | "error";
  config: Record<string, unknown>;
  installedAt: number;
  lastActivity?: number;
}

// ── Health types ──
export interface CapabilityHealth {
  name: string;
  status: "ready" | "degraded" | "error" | "unknown";
  lastChecked: number;
  details?: string;
  actions?: string[];
}

// ── Inbox types ──
export interface InboxMessage {
  id: string;
  channel: string;
  from: string;
  subject?: string;
  preview: string;
  content: string;
  read: boolean;
  timestamp: number;
  threadId?: string;
}

// ── Helper to generate IDs ──
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
