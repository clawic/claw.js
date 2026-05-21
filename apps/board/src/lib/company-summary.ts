import type {
  AvailableAction,
  CompanyDashboardPayload,
  CompanyDetailPayload,
  CompanySidebarPayload,
  ExecutiveSummary,
  FeedbackQueue,
  Goal,
  GoalProgressSummary,
  HealthByItemSummary,
  OperationalCheck,
  OperationalIncident,
  OperationsBoard,
  Portfolio,
  PortfolioItem,
  PortfolioItemOverview,
  PortfolioListItem,
  Project,
  Release,
  ReleaseBoard,
} from "./company-types";
import type {
  Approval,
  CompanyAgent,
  FeedbackItem,
  MetricSnapshot,
  Issue,
  Run,
} from "./company-types";
import {
  getCompany,
  getPortfolioItem,
  listAgents,
  listApprovals,
  listFeedbackItems,
  listGoals,
  listImportBatches,
  listIssues,
  listMetricSnapshots,
  listOperationalChecks,
  listOperationalIncidents,
  listPortfolioItems,
  listPortfolios,
  listProjects,
  listReleases,
  listRuns,
} from "./company-service";

function sortNewestByTimestamp<T extends { timestamp: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function issueActions(issue: Issue): AvailableAction[] {
  const actions: AvailableAction[] = [];
  if (issue.status !== "done" && issue.status !== "cancelled") {
    actions.push("run_agent");
  }
  if (issue.approvalState === "pending") {
    actions.push("approve");
  }
  return actions;
}

function feedbackActions(item: FeedbackItem): AvailableAction[] {
  const actions: AvailableAction[] = [];
  if (item.status === "new") actions.push("triage", "create_issue");
  if (item.status === "triaged") actions.push("create_issue");
  return actions;
}

function incidentActions(incident: OperationalIncident): AvailableAction[] {
  return incident.status === "resolved" || incident.status === "cancelled"
    ? []
    : ["resolve", "create_issue"];
}

function releaseActions(release: Release): AvailableAction[] {
  return release.status === "released" || release.status === "cancelled"
    ? []
    : ["ship_release", "create_issue"];
}

function metric(label: string, value: number, href: string, tone: "neutral" | "positive" | "warning" | "critical" = "neutral") {
  return { label, value, href, tone };
}

export function buildExecutiveSummary(input: {
  goals: Goal[];
  projects: Project[];
  portfolioItems: PortfolioItem[];
  incidents: OperationalIncident[];
  approvals: Approval[];
  feedbackItems: FeedbackItem[];
  runs: Run[];
  releases: Release[];
  issues: Issue[];
}): ExecutiveSummary {
  const activeGoals = input.goals.filter((goal) => goal.status === "active");
  const projectsInProgress = input.projects.filter((project) => project.status === "in_progress");
  const itemsAtRisk = input.portfolioItems.filter((item) => item.healthStatus === "red" || item.status === "at_risk");
  const openIncidents = input.incidents.filter((incident) => !["resolved", "cancelled"].includes(incident.status));
  const pendingApprovals = input.approvals.filter((approval) => approval.status === "pending");
  const untriagedFeedback = input.feedbackItems.filter((item) => item.status === "new");
  const runningRuns = input.runs.filter((run) => run.status === "queued" || run.status === "running");
  const plannedReleases = input.releases.filter((release) => ["planned", "in_progress", "blocked"].includes(release.status));

  const healthByItem: HealthByItemSummary[] = input.portfolioItems.map((item) => ({
    portfolioItemId: item.id,
    name: item.name,
    itemType: item.itemType,
    healthStatus: item.healthStatus ?? "unknown",
    openIncidents: openIncidents.filter((incident) => incident.portfolioItemId === item.id).length,
    openIssues: input.issues.filter((issue) => issue.portfolioItemId === item.id && !["done", "cancelled"].includes(issue.status)).length,
    availableActions: ["open_incident", "create_issue"],
  }));

  const goalProgress: GoalProgressSummary[] = activeGoals.map((goal) => ({
    goalId: goal.id,
    title: goal.title,
    status: goal.status,
    currentValue: goal.currentValue,
    targetValue: goal.targetValue,
    unit: goal.unit,
    healthStatus: goal.healthStatus,
  }));

  const recentActivity = sortNewestByTimestamp([
    ...input.issues.map((issue) => ({ type: "issue" as const, id: issue.id, title: issue.title, status: issue.status, timestamp: issue.updatedAt, href: `/issues/${issue.id}` })),
    ...input.releases.map((release) => ({ type: "release" as const, id: release.id, title: release.name, status: release.status, timestamp: release.updatedAt, href: "/work" })),
    ...input.incidents.map((incident) => ({ type: "incident" as const, id: incident.id, title: incident.title, status: incident.status, timestamp: incident.updatedAt, href: "/operations" })),
    ...input.feedbackItems.map((item) => ({ type: "feedback" as const, id: item.id, title: item.title, status: item.status, timestamp: item.updatedAt, href: "/feedback" })),
    ...input.runs.map((run) => ({ type: "run" as const, id: run.id, title: run.actionType ?? "Agent run", status: run.status, timestamp: run.updatedAt, href: "/agents" })),
    ...input.approvals.map((approval) => ({ type: "approval" as const, id: approval.id, title: approval.type, status: approval.status, timestamp: approval.updatedAt, href: "/approvals" })),
  ]).slice(0, 12);

  return {
    activeGoals: metric("Active goals", activeGoals.length, "/goals"),
    projectsInProgress: metric("Projects in progress", projectsInProgress.length, "/work"),
    itemsAtRisk: metric("Items at risk", itemsAtRisk.length, "/portfolio", itemsAtRisk.length > 0 ? "warning" : "positive"),
    openIncidents: metric("Open incidents", openIncidents.length, "/operations", openIncidents.length > 0 ? "critical" : "positive"),
    pendingApprovals: metric("Pending approvals", pendingApprovals.length, "/approvals", pendingApprovals.length > 0 ? "warning" : "neutral"),
    untriagedFeedback: metric("Untriaged feedback", untriagedFeedback.length, "/feedback", untriagedFeedback.length > 0 ? "warning" : "neutral"),
    runningRuns: metric("Running runs", runningRuns.length, "/agents"),
    plannedReleases: metric("Planned releases", plannedReleases.length, "/work"),
    healthByItem,
    goalProgress,
    recentActivity,
  };
}

export function buildPortfolioList(input: {
  portfolios: Portfolio[];
  portfolioItems: PortfolioItem[];
  projects: Project[];
}): PortfolioListItem[] {
  return input.portfolios.map((portfolio) => {
    const items = input.portfolioItems.filter((item) => item.portfolioId === portfolio.id);
    const itemIds = new Set(items.map((item) => item.id));
    return {
      portfolio,
      itemCount: items.length,
      activeProjects: input.projects.filter((project) => project.status === "in_progress" && itemIds.has(project.portfolioItemId ?? "")).length,
      atRiskItems: items.filter((item) => item.healthStatus === "red" || item.status === "at_risk").length,
    };
  });
}

export function buildPortfolioItemOverview(input: {
  portfolioItem: PortfolioItem;
  portfolio?: Portfolio | null;
  projects: Project[];
  goals: Goal[];
  releases: Release[];
  incidents: OperationalIncident[];
  checks: OperationalCheck[];
  feedback: FeedbackItem[];
  metrics: MetricSnapshot[];
}): PortfolioItemOverview {
  return {
    portfolioItem: input.portfolioItem,
    portfolio: input.portfolio ?? null,
    projects: input.projects,
    goals: input.goals,
    releases: input.releases,
    incidents: input.incidents,
    checks: input.checks,
    feedback: input.feedback,
    metrics: input.metrics,
    availableActions: ["create_issue", "open_incident", "request_approval"],
  };
}

export function buildOperationsBoard(input: {
  checks: OperationalCheck[];
  incidents: OperationalIncident[];
  portfolioItems: PortfolioItem[];
}): OperationsBoard {
  return {
    openIncidents: input.incidents.filter((incident) => !["resolved", "cancelled"].includes(incident.status)),
    checksByStatus: {
      ok: input.checks.filter((check) => check.status === "ok"),
      degraded: input.checks.filter((check) => check.status === "degraded"),
      failed: input.checks.filter((check) => check.status === "failed"),
      unknown: input.checks.filter((check) => check.status === "unknown"),
    },
    atRiskItems: input.portfolioItems.filter((item) => item.healthStatus === "red" || item.status === "at_risk"),
  };
}

export function buildFeedbackQueue(input: {
  items: FeedbackItem[];
}): FeedbackQueue {
  return {
    items: [...input.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((item) => ({
      ...item,
      availableActions: feedbackActions(item),
    })),
    counts: {
      new: input.items.filter((item) => item.status === "new").length,
      triaged: input.items.filter((item) => item.status === "triaged").length,
      planned: input.items.filter((item) => item.status === "planned").length,
      closed: input.items.filter((item) => item.status === "closed").length,
      ignored: input.items.filter((item) => item.status === "ignored").length,
    },
  };
}

export function buildReleaseBoard(input: {
  items: Release[];
}): ReleaseBoard {
  return {
    items: [...input.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((item) => ({
      ...item,
      availableActions: releaseActions(item),
    })),
    counts: {
      planned: input.items.filter((item) => item.status === "planned").length,
      in_progress: input.items.filter((item) => item.status === "in_progress").length,
      blocked: input.items.filter((item) => item.status === "blocked").length,
      released: input.items.filter((item) => item.status === "released").length,
      cancelled: input.items.filter((item) => item.status === "cancelled").length,
    },
  };
}

export function buildCompanySidebarPayload(input: {
  company: CompanyDetailPayload["company"];
  approvals: Approval[];
  feedbackItems: FeedbackItem[];
}): CompanySidebarPayload {
  return {
    company: {
      id: input.company.id,
      name: input.company.name,
      brandColor: input.company.brandColor,
    },
    pendingApprovalsCount: input.approvals.filter((approval) => approval.status === "pending").length,
    untriagedFeedbackCount: input.feedbackItems.filter((item) => item.status === "new").length,
  };
}

export function buildCompanyDashboardPayload(input: {
  company: CompanyDetailPayload["company"];
  goals: Goal[];
  projects: Project[];
  portfolioItems: PortfolioItem[];
  incidents: OperationalIncident[];
  approvals: Approval[];
  feedbackItems: FeedbackItem[];
  runs: Run[];
  releases: Release[];
  issues: Issue[];
  agents: CompanyAgent[];
}): CompanyDashboardPayload {
  return {
    company: input.company,
    summary: buildExecutiveSummary(input),
    recentIssues: [...input.issues]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8),
    pendingApprovals: input.approvals.filter((approval) => approval.status === "pending"),
    agents: input.agents,
  };
}

export async function buildCompanyDetail(companyId: string): Promise<CompanyDetailPayload> {
  const company = await getCompany(companyId);
  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }
  const [
    portfolios,
    portfolioItems,
    goals,
    projects,
    issues,
    releases,
    operationalChecks,
    operationalIncidents,
    feedbackItems,
    agents,
    approvals,
    runs,
    metrics,
  ] = await Promise.all([
    listPortfolios(companyId),
    listPortfolioItems(companyId),
    listGoals(companyId),
    listProjects(companyId),
    listIssues(companyId),
    listReleases(companyId),
    listOperationalChecks(companyId),
    listOperationalIncidents(companyId),
    listFeedbackItems(companyId),
    listAgents(companyId),
    listApprovals(companyId),
    listRuns(companyId),
    listMetricSnapshots(companyId),
  ]);

  return {
    company,
    portfolios,
    portfolioItems,
    goals,
    projects,
    issues,
    releases,
    operationalChecks,
    operationalIncidents,
    feedbackItems,
    agents,
    approvals,
    runs,
    metrics,
    summary: buildExecutiveSummary({
      goals,
      projects,
      portfolioItems,
      incidents: operationalIncidents,
      approvals,
      feedbackItems,
      runs,
      releases,
      issues,
    }),
  };
}

export async function buildCompanySidebar(companyId: string): Promise<CompanySidebarPayload> {
  const company = await getCompany(companyId);
  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }
  const [approvals, feedbackItems] = await Promise.all([
    listApprovals(companyId),
    listFeedbackItems(companyId),
  ]);
  return buildCompanySidebarPayload({ company, approvals, feedbackItems });
}

export async function buildCompanyDashboard(companyId: string): Promise<CompanyDashboardPayload> {
  const company = await getCompany(companyId);
  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }
  const [
    goals,
    projects,
    portfolioItems,
    issues,
    releases,
    operationalIncidents,
    feedbackItems,
    agents,
    approvals,
    runs,
  ] = await Promise.all([
    listGoals(companyId),
    listProjects(companyId),
    listPortfolioItems(companyId),
    listIssues(companyId),
    listReleases(companyId),
    listOperationalIncidents(companyId),
    listFeedbackItems(companyId),
    listAgents(companyId),
    listApprovals(companyId),
    listRuns(companyId),
  ]);

  return buildCompanyDashboardPayload({
    company,
    goals,
    projects,
    portfolioItems,
    incidents: operationalIncidents,
    approvals,
    feedbackItems,
    runs,
    releases,
    issues,
    agents,
  });
}

export async function buildPortfolioItemOverviewById(itemId: string): Promise<PortfolioItemOverview> {
  const item = await getPortfolioItem(itemId);
  if (!item) throw new Error(`Portfolio item ${itemId} not found`);
  const detail = await buildCompanyDetail(item.companyId);
  return buildPortfolioItemOverview({
    portfolioItem: item,
    portfolio: detail.portfolios.find((portfolio) => portfolio.id === item.portfolioId) ?? null,
    projects: detail.projects.filter((project) => project.portfolioItemId === item.id),
    goals: detail.goals.filter((goal) => goal.portfolioItemId === item.id),
    releases: detail.releases.filter((release) => release.portfolioItemId === item.id),
    incidents: detail.operationalIncidents.filter((incident) => incident.portfolioItemId === item.id),
    checks: detail.operationalChecks.filter((check) => check.portfolioItemId === item.id),
    feedback: detail.feedbackItems.filter((feedback) => feedback.portfolioItemId === item.id),
    metrics: detail.metrics.filter((metric) => metric.portfolioItemId === item.id),
  });
}

export async function buildOperationsBoardByCompany(companyId: string): Promise<OperationsBoard> {
  const detail = await buildCompanyDetail(companyId);
  return buildOperationsBoard({
    checks: detail.operationalChecks,
    incidents: detail.operationalIncidents,
    portfolioItems: detail.portfolioItems,
  });
}

export async function buildFeedbackQueueByCompany(companyId: string): Promise<FeedbackQueue> {
  return buildFeedbackQueue({
    items: await listFeedbackItems(companyId),
  });
}

export async function buildReleaseBoardByCompany(companyId: string): Promise<ReleaseBoard> {
  return buildReleaseBoard({
    items: await listReleases(companyId),
  });
}

export async function buildPortfolioListByCompany(companyId: string): Promise<PortfolioListItem[]> {
  const [portfolios, portfolioItems, projects] = await Promise.all([
    listPortfolios(companyId),
    listPortfolioItems(companyId),
    listProjects(companyId),
  ]);
  return buildPortfolioList({ portfolios, portfolioItems, projects });
}

export async function buildBackendFixtures(companyId: string): Promise<Record<string, unknown>> {
  const detail = await buildCompanyDetail(companyId);
  const firstItem = detail.portfolioItems[0];
  const [portfolioList, operations, feedbackQueue, releaseBoard, importBatches] = await Promise.all([
    buildPortfolioListByCompany(companyId),
    buildOperationsBoardByCompany(companyId),
    buildFeedbackQueueByCompany(companyId),
    buildReleaseBoardByCompany(companyId),
    listImportBatches(companyId),
  ]);

  return {
    detail,
    portfolioList,
    operations,
    feedbackQueue,
    releaseBoard,
    portfolioItemOverview: firstItem ? await buildPortfolioItemOverviewById(firstItem.id) : null,
    importBatches,
  };
}

export function getRecordActions(input: {
  issue?: Issue;
  feedback?: FeedbackItem;
  incident?: OperationalIncident;
  release?: Release;
}): AvailableAction[] {
  if (input.issue) return issueActions(input.issue);
  if (input.feedback) return feedbackActions(input.feedback);
  if (input.incident) return incidentActions(input.incident);
  if (input.release) return releaseActions(input.release);
  return [];
}
