/**
 * Shared TypeScript types for the Company app.
 *
 * Mirrors the database service collections defined in
 * database/src/server/db.ts (companies, goals, projects, agents,
 * issues, issue_comments, company_approvals, runs).
 */

import type { DatabaseRecord } from "./database-client";

export type CompanyStatus = "active" | "archived";

export interface Company extends DatabaseRecord {
  name: string;
  issuePrefix: string;
  issueCounter: number;
  status: CompanyStatus;
  description?: string;
  brandColor?: string;
  budgetMonthlyCents?: number;
  spentMonthlyCents?: number;
  requireBoardApprovalForNewAgents?: boolean;
}

export type Organization = Company;

export type GoalLevel = "company" | "team" | "personal";
export type GoalStatus = "active" | "paused" | "done";

export interface Goal extends DatabaseRecord {
  companyId: string;
  portfolioId?: string;
  portfolioItemId?: string;
  title: string;
  level: GoalLevel;
  status: GoalStatus;
  description?: string;
  parentId?: string;
  ownerAgentId?: string;
  metricKey?: string;
  metricLabel?: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  period?: string;
  healthStatus?: HealthStatus;
}

export type ProjectStatus = "draft" | "in_progress" | "paused" | "done" | "archived";
export type ProjectKind = "delivery" | "growth" | "ops" | "research" | "migration" | "other";
export type HealthStatus = "green" | "yellow" | "red" | "unknown";

export interface Project extends DatabaseRecord {
  companyId: string;
  portfolioId?: string;
  portfolioItemId?: string;
  name: string;
  status: ProjectStatus;
  goalId?: string;
  description?: string;
  leadAgentId?: string;
  color?: string;
  kind?: ProjectKind;
  healthStatus?: HealthStatus;
  targetDate?: string;
  startDate?: string;
}

export type PortfolioStatus = "active" | "paused" | "archived";
export type PortfolioPriority = "low" | "medium" | "high" | "urgent";

export interface Portfolio extends DatabaseRecord {
  companyId: string;
  name: string;
  slug: string;
  status: PortfolioStatus;
  description?: string;
  ownerAgentId?: string;
  priority?: PortfolioPriority;
  color?: string;
}

export type PortfolioItemType = "app" | "web" | "saas" | "client" | "brand" | "store" | "service" | "internal" | "other";
export type PortfolioItemStatus = "active" | "paused" | "at_risk" | "archived";
export type LifecycleStage = "idea" | "validating" | "building" | "launched" | "scaling" | "sustaining" | "sunset";

export interface PortfolioItem extends DatabaseRecord {
  companyId: string;
  portfolioId: string;
  name: string;
  slug: string;
  itemType: PortfolioItemType;
  status: PortfolioItemStatus;
  lifecycleStage: LifecycleStage;
  description?: string;
  ownerAgentId?: string;
  healthStatus?: HealthStatus;
  priority?: PortfolioPriority;
  targetDate?: string;
  tags?: string[];
  sourceSystem?: string;
  metadata?: Record<string, unknown>;
}

export type CompanyAgentStatus = "pending_approval" | "active" | "paused" | "fired";
export type CompanyAgentAdapterType = "human" | "clawjs_local";
export type AgentScopeType = "company" | "portfolio" | "portfolio_item" | "project";
export type AutonomyLevel = "observe" | "suggest" | "act_limited" | "act_full";

export interface CompanyAgent extends DatabaseRecord {
  companyId: string;
  name: string;
  role: string;
  title: string;
  status: CompanyAgentStatus;
  adapterType: CompanyAgentAdapterType;
  icon?: string;
  reportsTo?: string;
  capabilities?: string;
  adapterConfig?: Record<string, unknown>;
  instructionsMarkdown?: string;
  clawAppId?: string;
  clawWorkspaceId?: string;
  clawAgentId?: string;
  workspaceDir?: string;
  scopeType?: AgentScopeType;
  scopeId?: string;
  autonomyLevel?: AutonomyLevel;
  approvalPolicy?: Record<string, unknown>;
  watchDomains?: string[];
  boardStatus?: CompanyAgentStatus;
  sourceDomain?: "board" | string;
  ownerKind?: "company" | string;
  ownerId?: string;
  agencyMode?: "manager" | "worker" | string;
  autonomyProfile?: "respond_only" | "suggest" | "act_limited" | "act_full" | string;
}

export type IssueStatus = "todo" | "in_progress" | "blocked" | "in_review" | "done" | "cancelled";
export type IssuePriority = "low" | "medium" | "high" | "urgent";
export type WorkType = "feature" | "bug" | "ops" | "support" | "research" | "launch" | "maintenance";
export type SourceDomain = "strategy" | "execution" | "operations" | "feedback";
export type ApprovalState = "not_required" | "pending" | "approved" | "rejected";

export interface Issue extends DatabaseRecord {
  companyId: string;
  identifier: string;
  issueNumber: number;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  description?: string;
  projectId?: string;
  portfolioId?: string;
  portfolioItemId?: string;
  goalId?: string;
  parentId?: string;
  assigneeAgentId?: string;
  createdByAgentId?: string;
  createdByUserId?: string;
  executionRunId?: string;
  workType?: WorkType;
  sourceDomain?: SourceDomain;
  releaseId?: string;
  incidentId?: string;
  feedbackItemId?: string;
  autonomous?: boolean;
  approvalState?: ApprovalState;
  dueAt?: string;
}

export interface IssueComment extends DatabaseRecord {
  companyId: string;
  issueId: string;
  body: string;
  authorAgentId?: string;
  authorUserId?: string;
  createdByRunId?: string;
}

export type ApprovalType = "hire_agent" | "fire_agent" | "budget_change" | "policy_change";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Approval extends DatabaseRecord {
  companyId: string;
  type: ApprovalType;
  status: ApprovalStatus;
  payload?: Record<string, unknown>;
  requestedByAgentId?: string;
  requestedByUserId?: string;
  decidedAt?: string;
  decidedByUserId?: string;
  reason?: string;
}

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Run extends DatabaseRecord {
  companyId: string;
  agentId: string;
  status: RunStatus;
  issueId?: string;
  portfolioItemId?: string;
  projectId?: string;
  releaseId?: string;
  incidentId?: string;
  feedbackItemId?: string;
  clawSessionId?: string;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  metrics?: Record<string, unknown>;
  actionType?: string;
}

export type ReleaseStatus = "planned" | "in_progress" | "blocked" | "released" | "cancelled";
export type ReleaseType = "launch" | "update" | "experiment" | "maintenance" | "internal";

export interface Release extends DatabaseRecord {
  companyId: string;
  portfolioItemId?: string;
  projectId?: string;
  name: string;
  status: ReleaseStatus;
  releaseType: ReleaseType;
  plannedAt?: string;
  releasedAt?: string;
  summary?: string;
  ownerAgentId?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export type OperationalDomain = "availability" | "quality" | "delivery" | "compliance" | "support" | "growth" | "custom";
export type OperationalCheckStatus = "ok" | "degraded" | "failed" | "unknown";
export type OperationalSeverity = "info" | "warning" | "critical";
export type OperationalSourceType = "manual" | "import" | "monitor" | "derived";

export interface OperationalCheck extends DatabaseRecord {
  companyId: string;
  portfolioItemId?: string;
  projectId?: string;
  name: string;
  domain: OperationalDomain;
  status: OperationalCheckStatus;
  severity: OperationalSeverity;
  sourceType: OperationalSourceType;
  lastObservedAt?: string;
  detail?: string;
  metricValue?: number;
  metricUnit?: string;
  ownerAgentId?: string;
  metadata?: Record<string, unknown>;
}

export type IncidentStatus = "open" | "investigating" | "mitigated" | "resolved" | "cancelled";
export type IncidentSeverity = "sev1" | "sev2" | "sev3" | "sev4";

export interface OperationalIncident extends DatabaseRecord {
  companyId: string;
  portfolioItemId?: string;
  projectId?: string;
  checkId?: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  startedAt: string;
  resolvedAt?: string;
  ownerAgentId?: string;
  summary?: string;
  resolution?: string;
  linkedIssueId?: string;
  metadata?: Record<string, unknown>;
}

export type FeedbackStatus = "new" | "triaged" | "planned" | "closed" | "ignored";
export type FeedbackSourceType = "review" | "support" | "interview" | "sales" | "ops" | "internal" | "import" | "other";
export type FeedbackSentiment = "positive" | "neutral" | "negative" | "mixed";

export interface FeedbackItem extends DatabaseRecord {
  companyId: string;
  portfolioItemId?: string;
  projectId?: string;
  title: string;
  body: string;
  status: FeedbackStatus;
  priority: IssuePriority;
  sourceType: FeedbackSourceType;
  sourceLabel?: string;
  customerName?: string;
  customerSegment?: string;
  sentiment?: FeedbackSentiment;
  receivedAt: string;
  ownerAgentId?: string;
  linkedIssueId?: string;
  metadata?: Record<string, unknown>;
}

export type MetricDirection = "up_good" | "down_good" | "neutral";
export type MetricSourceType = "manual" | "import" | "derived";

export interface MetricSnapshot extends DatabaseRecord {
  companyId: string;
  portfolioId?: string;
  portfolioItemId?: string;
  projectId?: string;
  metricKey: string;
  metricLabel: string;
  value: number;
  unit?: string;
  direction: MetricDirection;
  capturedAt: string;
  sourceType: MetricSourceType;
  period?: string;
  metadata?: Record<string, unknown>;
}

export type ImportBatchType = "feedback" | "metrics" | "checks" | "incidents" | "mixed";
export type ImportBatchStatus = "running" | "completed" | "failed" | "cancelled";

export interface ImportBatch extends DatabaseRecord {
  companyId: string;
  type: ImportBatchType;
  status: ImportBatchStatus;
  sourceLabel?: string;
  startedAt: string;
  finishedAt?: string;
  createdByUserId?: string;
  summary?: string;
  counts?: Record<string, number>;
  metadata?: Record<string, unknown>;
}

export type AvailableAction =
  | "triage"
  | "create_issue"
  | "resolve"
  | "approve"
  | "run_agent"
  | "ship_release"
  | "open_incident"
  | "request_approval"
  | "recompute_summary";

export interface SummaryMetric {
  label: string;
  value: number;
  tone?: "neutral" | "positive" | "warning" | "critical";
  href?: string;
}

export interface HealthByItemSummary {
  portfolioItemId: string;
  name: string;
  itemType: PortfolioItemType;
  healthStatus: HealthStatus;
  openIncidents: number;
  openIssues: number;
  availableActions: AvailableAction[];
}

export interface GoalProgressSummary {
  goalId: string;
  title: string;
  status: GoalStatus;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  healthStatus?: HealthStatus;
}

export interface RecentActivityItem {
  type: "issue" | "release" | "incident" | "feedback" | "run" | "approval";
  id: string;
  title: string;
  status: string;
  timestamp: string;
  href?: string;
}

export interface ExecutiveSummary {
  activeGoals: SummaryMetric;
  projectsInProgress: SummaryMetric;
  itemsAtRisk: SummaryMetric;
  openIncidents: SummaryMetric;
  pendingApprovals: SummaryMetric;
  untriagedFeedback: SummaryMetric;
  runningRuns: SummaryMetric;
  plannedReleases: SummaryMetric;
  healthByItem: HealthByItemSummary[];
  goalProgress: GoalProgressSummary[];
  recentActivity: RecentActivityItem[];
}

export interface PortfolioListItem {
  portfolio: Portfolio;
  itemCount: number;
  activeProjects: number;
  atRiskItems: number;
}

export interface PortfolioItemOverview {
  portfolioItem: PortfolioItem;
  portfolio?: Portfolio | null;
  projects: Project[];
  goals: Goal[];
  releases: Release[];
  incidents: OperationalIncident[];
  checks: OperationalCheck[];
  feedback: FeedbackItem[];
  metrics: MetricSnapshot[];
  availableActions: AvailableAction[];
}

export interface OperationsBoard {
  openIncidents: OperationalIncident[];
  checksByStatus: Record<OperationalCheckStatus, OperationalCheck[]>;
  atRiskItems: PortfolioItem[];
}

export interface FeedbackQueue {
  items: Array<FeedbackItem & { availableActions: AvailableAction[] }>;
  counts: Record<FeedbackStatus, number>;
}

export interface ReleaseBoard {
  items: Array<Release & { availableActions: AvailableAction[] }>;
  counts: Record<ReleaseStatus, number>;
}

export interface CompanyDetailPayload {
  company: Company;
  portfolios: Portfolio[];
  portfolioItems: PortfolioItem[];
  goals: Goal[];
  projects: Project[];
  issues: Issue[];
  releases: Release[];
  operationalChecks: OperationalCheck[];
  operationalIncidents: OperationalIncident[];
  feedbackItems: FeedbackItem[];
  agents: CompanyAgent[];
  approvals: Approval[];
  runs: Run[];
  metrics: MetricSnapshot[];
  summary: ExecutiveSummary;
}

export const LOCAL_BOARD_USER_ID = "local-board";
