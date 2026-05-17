/**
 * Domain service for the Company app.
 *
 * The backing storage still uses the historical `companies` collection, but
 * the business model now treats each record as a general organization with
 * portfolios, portfolio items, releases, operational signals, and feedback.
 */

import {
  createRecord,
  deleteRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "./database-client";
import type {
  Approval,
  Company,
  CompanyAgent,
  FeedbackItem,
  Goal,
  ImportBatch,
  Issue,
  IssueComment,
  MetricSnapshot,
  OperationalCheck,
  OperationalIncident,
  Portfolio,
  PortfolioItem,
  Project,
  Release,
  Run,
} from "./company-types";
import { LOCAL_BOARD_USER_ID } from "./company-types";

const C_COMPANIES = "companies";
const C_PORTFOLIOS = "portfolios";
const C_PORTFOLIO_ITEMS = "portfolio_items";
const C_GOALS = "goals";
const C_PROJECTS = "projects";
const C_AGENTS = "agents";
const C_LEGACY_AGENTS = "company_agents";
const C_ISSUES = "issues";
const C_COMMENTS = "issue_comments";
const C_APPROVALS = "company_approvals";
const C_RUNS = "runs";
const C_RELEASES = "company_releases";
const C_OPERATIONAL_CHECKS = "operational_checks";
const C_OPERATIONAL_INCIDENTS = "operational_incidents";
const C_FEEDBACK_ITEMS = "feedback_items";
const C_METRIC_SNAPSHOTS = "metric_snapshots";
const C_IMPORT_BATCHES = "import_batches";

function slugifyPrefix(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length >= 3) return letters.slice(0, 3);
  if (letters.length > 0) return letters.padEnd(3, "X");
  return "CMP";
}

function slugifyValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `item-${Date.now()}`;
}

async function ensureUniqueIssuePrefix(base: string): Promise<string> {
  const all = await listRecords<Company>(C_COMPANIES);
  const used = new Set(all.map((c) => c.issuePrefix));
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}${Date.now() % 1000}`;
}

async function ensureUniqueSlug<T extends { slug: string }>(
  rows: T[],
  base: string,
): Promise<string> {
  const used = new Set(rows.map((row) => row.slug));
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now() % 1000}`;
}

function compactRecord(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function canonicalAgentStatus(status: CompanyAgent["status"]): "draft" | "active" | "paused" | "archived" {
  if (status === "active") return "active";
  if (status === "paused") return "paused";
  if (status === "fired") return "archived";
  return "draft";
}

function boardAgentStatus(record: Record<string, unknown>): CompanyAgent["status"] {
  const boardStatus = record.boardStatus;
  if (
    boardStatus === "pending_approval" ||
    boardStatus === "active" ||
    boardStatus === "paused" ||
    boardStatus === "fired"
  ) {
    return boardStatus;
  }
  if (record.status === "active") return "active";
  if (record.status === "paused") return "paused";
  if (record.status === "archived") return "fired";
  return "pending_approval";
}

function toCompanyAgent(record: CompanyAgent & Record<string, unknown>): CompanyAgent {
  return {
    ...record,
    status: boardAgentStatus(record),
  };
}

function isMissingLegacyAgentStore(error: unknown): boolean {
  return error instanceof Error && /\b404\b|not_found|not found/i.test(error.message);
}

async function listLegacyCompanyAgents(companyId: string): Promise<CompanyAgent[]> {
  try {
    return await listRecords<CompanyAgent>(C_LEGACY_AGENTS, { filter: { companyId } });
  } catch (error) {
    if (!isMissingLegacyAgentStore(error)) throw error;
    return [];
  }
}

async function getLegacyCompanyAgent(id: string): Promise<CompanyAgent | null> {
  try {
    return await getRecord<CompanyAgent>(C_LEGACY_AGENTS, id);
  } catch (error) {
    if (!isMissingLegacyAgentStore(error)) throw error;
    return null;
  }
}

function canonicalCompanyAgentPayload(
  input: Record<string, unknown> & {
    companyId: string;
    role?: string;
    status: CompanyAgent["status"];
    autonomyLevel?: CompanyAgent["autonomyLevel"];
  },
): Record<string, unknown> {
  const autonomyProfile = input.autonomyLevel === "observe" ? "respond_only" : input.autonomyLevel;
  return compactRecord({
    kind: "agent",
    sourceDomain: "board",
    ownerKind: "company",
    ownerId: input.companyId,
    agencyMode: input.role === "ceo" ? "manager" : "worker",
    ...input,
    status: canonicalAgentStatus(input.status),
    boardStatus: input.status,
    autonomyProfile,
  });
}

async function requireCompany(companyId: string): Promise<Company> {
  const company = await getCompany(companyId);
  if (!company) throw new Error(`Company ${companyId} not found`);
  return company;
}

async function requireProject(projectId: string): Promise<Project> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  return project;
}

async function requirePortfolioItem(portfolioItemId: string): Promise<PortfolioItem> {
  const item = await getPortfolioItem(portfolioItemId);
  if (!item) throw new Error(`Portfolio item ${portfolioItemId} not found`);
  return item;
}

// ── Companies / organizations ────────────────────────────────────────────

export async function listCompanies(): Promise<Company[]> {
  return listRecords<Company>(C_COMPANIES);
}

export async function getCompany(id: string): Promise<Company | null> {
  return getRecord<Company>(C_COMPANIES, id);
}

export async function createCompany(input: {
  name: string;
  description?: string;
  brandColor?: string;
  requireBoardApprovalForNewAgents?: boolean;
}): Promise<{
  company: Company;
  portfolio: Portfolio;
  portfolioItem: PortfolioItem;
  goal: Goal;
  project: Project;
  ceo: CompanyAgent;
  firstIssue: Issue;
}> {
  const issuePrefix = await ensureUniqueIssuePrefix(slugifyPrefix(input.name));
  const company = await createRecord<Company>(C_COMPANIES, {
    name: input.name.trim(),
    issuePrefix,
    issueCounter: 0,
    status: "active",
    ...(input.description ? { description: input.description.trim() } : {}),
    ...(input.brandColor ? { brandColor: input.brandColor } : {}),
    requireBoardApprovalForNewAgents: input.requireBoardApprovalForNewAgents ?? false,
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
  });

  const ceo = toCompanyAgent(await createRecord<CompanyAgent>(C_AGENTS, canonicalCompanyAgentPayload({
    companyId: company.id,
    name: "Board (you)",
    role: "ceo",
    title: "Chief Executive Officer",
    status: "active",
    adapterType: "human",
    icon: "crown",
    capabilities: "Sets direction, approves sensitive changes, and reviews work across the portfolio.",
    scopeType: "company",
    autonomyLevel: "act_full",
    watchDomains: ["strategy", "execution", "operations", "feedback"],
  })));

  const portfolio = await createPortfolio({
    companyId: company.id,
    name: "Core portfolio",
    description: "Primary portfolio for the organization.",
    ownerAgentId: ceo.id,
    priority: "high",
    color: input.brandColor ?? "#0ea5e9",
  });

  const portfolioItem = await createPortfolioItem({
    companyId: company.id,
    portfolioId: portfolio.id,
    name: `${input.name.trim()} primary initiative`,
    itemType: "other",
    status: "active",
    lifecycleStage: "building",
    description: "Initial portfolio item created during onboarding.",
    ownerAgentId: ceo.id,
    healthStatus: "unknown",
    priority: "high",
    tags: ["onboarding"],
    sourceSystem: "manual",
  });

  const goal = await createGoal({
    companyId: company.id,
    portfolioId: portfolio.id,
    portfolioItemId: portfolioItem.id,
    title: "Bootstrap the organization",
    level: "company",
    status: "active",
    description: "Set the portfolio, define the roadmap, and establish operating rhythms.",
    healthStatus: "yellow",
  });

  const project = await createProject({
    companyId: company.id,
    portfolioId: portfolio.id,
    portfolioItemId: portfolioItem.id,
    name: "Operating setup",
    status: "in_progress",
    goalId: goal.id,
    description: "Initial setup for strategy, execution, and operations.",
    color: "#0ea5e9",
    kind: "delivery",
    healthStatus: "yellow",
    startDate: nowIso(),
  });

  const firstIssue = await createIssue({
    companyId: company.id,
    portfolioId: portfolio.id,
    portfolioItemId: portfolioItem.id,
    projectId: project.id,
    goalId: goal.id,
    title: "Define the initial roadmap and operating model",
    description: [
      "You are the board. Use this organization as the top-level cockpit.",
      "",
      "- Define the first portfolio items and projects",
      "- Add agents for execution, operations, and triage",
      "- Route incoming feedback into work and keep releases visible",
    ].join("\n"),
    priority: "high",
    assigneeAgentId: ceo.id,
    createdByUserId: LOCAL_BOARD_USER_ID,
    workType: "feature",
    sourceDomain: "strategy",
    approvalState: "not_required",
  });

  return { company, portfolio, portfolioItem, goal, project, ceo, firstIssue };
}

export async function updateCompany(id: string, patch: Partial<Company>): Promise<Company> {
  return updateRecord<Company>(C_COMPANIES, id, patch as Record<string, unknown>);
}

// ── Portfolios + portfolio items ────────────────────────────────────────

export async function listPortfolios(companyId: string): Promise<Portfolio[]> {
  return listRecords<Portfolio>(C_PORTFOLIOS, { filter: { companyId } });
}

export async function getPortfolio(id: string): Promise<Portfolio | null> {
  return getRecord<Portfolio>(C_PORTFOLIOS, id);
}

export async function createPortfolio(input: {
  companyId: string;
  name: string;
  description?: string;
  ownerAgentId?: string;
  priority?: Portfolio["priority"];
  color?: string;
  status?: Portfolio["status"];
}): Promise<Portfolio> {
  await requireCompany(input.companyId);
  const existing = await listPortfolios(input.companyId);
  const slug = await ensureUniqueSlug(existing, slugifyValue(input.name));
  return createRecord<Portfolio>(C_PORTFOLIOS, compactRecord({
    companyId: input.companyId,
    name: input.name.trim(),
    slug,
    status: input.status ?? "active",
    description: input.description?.trim(),
    ownerAgentId: input.ownerAgentId,
    priority: input.priority ?? "medium",
    color: input.color,
  }));
}

export async function updatePortfolio(id: string, patch: Partial<Portfolio>): Promise<Portfolio> {
  return updateRecord<Portfolio>(C_PORTFOLIOS, id, patch as Record<string, unknown>);
}

export async function listPortfolioItems(companyId: string): Promise<PortfolioItem[]> {
  return listRecords<PortfolioItem>(C_PORTFOLIO_ITEMS, { filter: { companyId } });
}

export async function getPortfolioItem(id: string): Promise<PortfolioItem | null> {
  return getRecord<PortfolioItem>(C_PORTFOLIO_ITEMS, id);
}

export async function createPortfolioItem(input: {
  companyId: string;
  portfolioId: string;
  name: string;
  itemType: PortfolioItem["itemType"];
  status?: PortfolioItem["status"];
  lifecycleStage?: PortfolioItem["lifecycleStage"];
  description?: string;
  ownerAgentId?: string;
  healthStatus?: PortfolioItem["healthStatus"];
  priority?: PortfolioItem["priority"];
  targetDate?: string;
  tags?: string[];
  sourceSystem?: string;
  metadata?: Record<string, unknown>;
}): Promise<PortfolioItem> {
  await requireCompany(input.companyId);
  const portfolio = await getPortfolio(input.portfolioId);
  if (!portfolio || portfolio.companyId !== input.companyId) {
    throw new Error(`Portfolio ${input.portfolioId} not found for company ${input.companyId}`);
  }
  const existing = await listPortfolioItems(input.companyId);
  const slug = await ensureUniqueSlug(existing, slugifyValue(input.name));
  return createRecord<PortfolioItem>(C_PORTFOLIO_ITEMS, compactRecord({
    companyId: input.companyId,
    portfolioId: input.portfolioId,
    name: input.name.trim(),
    slug,
    itemType: input.itemType,
    status: input.status ?? "active",
    lifecycleStage: input.lifecycleStage ?? "idea",
    description: input.description?.trim(),
    ownerAgentId: input.ownerAgentId,
    healthStatus: input.healthStatus ?? "unknown",
    priority: input.priority ?? "medium",
    targetDate: input.targetDate,
    tags: input.tags,
    sourceSystem: input.sourceSystem ?? "manual",
    metadata: input.metadata,
  }));
}

export async function updatePortfolioItem(id: string, patch: Partial<PortfolioItem>): Promise<PortfolioItem> {
  return updateRecord<PortfolioItem>(C_PORTFOLIO_ITEMS, id, patch as Record<string, unknown>);
}

// ── Goals + projects ─────────────────────────────────────────────────────

export async function listGoals(companyId: string): Promise<Goal[]> {
  return listRecords<Goal>(C_GOALS, { filter: { companyId } });
}

export async function getGoal(id: string): Promise<Goal | null> {
  return getRecord<Goal>(C_GOALS, id);
}

export async function createGoal(input: {
  companyId: string;
  portfolioId?: string;
  portfolioItemId?: string;
  title: string;
  level: Goal["level"];
  status: Goal["status"];
  description?: string;
  parentId?: string;
  ownerAgentId?: string;
  metricKey?: string;
  metricLabel?: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  period?: string;
  healthStatus?: Goal["healthStatus"];
}): Promise<Goal> {
  await requireCompany(input.companyId);
  return createRecord<Goal>(C_GOALS, compactRecord(input));
}

export async function listProjects(companyId: string): Promise<Project[]> {
  return listRecords<Project>(C_PROJECTS, { filter: { companyId } });
}

export async function getProject(id: string): Promise<Project | null> {
  return getRecord<Project>(C_PROJECTS, id);
}

export async function createProject(input: {
  companyId: string;
  portfolioId?: string;
  portfolioItemId?: string;
  name: string;
  status: Project["status"];
  goalId?: string;
  description?: string;
  leadAgentId?: string;
  color?: string;
  kind?: Project["kind"];
  healthStatus?: Project["healthStatus"];
  targetDate?: string;
  startDate?: string;
}): Promise<Project> {
  await requireCompany(input.companyId);
  return createRecord<Project>(C_PROJECTS, compactRecord(input));
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<Project> {
  return updateRecord<Project>(C_PROJECTS, id, patch as Record<string, unknown>);
}

// ── Agents ───────────────────────────────────────────────────────────────

export async function listAgents(companyId: string): Promise<CompanyAgent[]> {
  const canonical = (await listRecords<CompanyAgent>(C_AGENTS, { filter: { companyId } })).map(toCompanyAgent);
  const seen = new Set(canonical.map((agent) => agent.id));
  const legacy = (await listLegacyCompanyAgents(companyId)).filter((agent) => !seen.has(agent.id));
  return [...canonical, ...legacy];
}

export async function getAgent(id: string): Promise<CompanyAgent | null> {
  const canonical = await getRecord<CompanyAgent>(C_AGENTS, id);
  if (canonical) return toCompanyAgent(canonical);
  return getLegacyCompanyAgent(id);
}

export async function createAgent(input: {
  companyId: string;
  name: string;
  role: string;
  title: string;
  capabilities?: string;
  reportsTo?: string;
  icon?: string;
  adapterConfig?: Record<string, unknown>;
  scopeType?: CompanyAgent["scopeType"];
  scopeId?: string;
  autonomyLevel?: CompanyAgent["autonomyLevel"];
  approvalPolicy?: Record<string, unknown>;
  watchDomains?: string[];
}): Promise<CompanyAgent> {
  await requireCompany(input.companyId);
  return toCompanyAgent(await createRecord<CompanyAgent>(C_AGENTS, canonicalCompanyAgentPayload({
    companyId: input.companyId,
    name: input.name.trim(),
    role: input.role.trim().toLowerCase(),
    title: input.title.trim(),
    status: "pending_approval",
    adapterType: "clawjs_local",
    icon: input.icon,
    reportsTo: input.reportsTo,
    capabilities: input.capabilities,
    adapterConfig: input.adapterConfig,
    scopeType: input.scopeType ?? "company",
    scopeId: input.scopeId,
    autonomyLevel: input.autonomyLevel ?? "suggest",
    approvalPolicy: input.approvalPolicy,
    watchDomains: input.watchDomains,
  })));
}

export async function updateAgent(id: string, patch: Partial<CompanyAgent>): Promise<CompanyAgent> {
  const current = await getRecord<CompanyAgent>(C_AGENTS, id);
  if (!current) {
    return toCompanyAgent(await updateRecord<CompanyAgent>(C_LEGACY_AGENTS, id, patch as Record<string, unknown>));
  }
  const canonicalPatch = {
    ...patch,
    ...(patch.status ? { status: canonicalAgentStatus(patch.status), boardStatus: patch.status } : {}),
    ...(patch.autonomyLevel ? { autonomyProfile: patch.autonomyLevel === "observe" ? "respond_only" : patch.autonomyLevel } : {}),
  };
  return toCompanyAgent(await updateRecord<CompanyAgent>(C_AGENTS, id, canonicalPatch as Record<string, unknown>));
}

// ── Issues + comments ────────────────────────────────────────────────────

export async function listIssues(companyId: string): Promise<Issue[]> {
  return listRecords<Issue>(C_ISSUES, { filter: { companyId } });
}

export async function getIssue(id: string): Promise<Issue | null> {
  return getRecord<Issue>(C_ISSUES, id);
}

export async function createIssue(input: {
  companyId: string;
  title: string;
  description?: string;
  priority?: Issue["priority"];
  status?: Issue["status"];
  projectId?: string;
  portfolioId?: string;
  portfolioItemId?: string;
  goalId?: string;
  parentId?: string;
  assigneeAgentId?: string;
  createdByAgentId?: string;
  createdByUserId?: string;
  workType?: Issue["workType"];
  sourceDomain?: Issue["sourceDomain"];
  releaseId?: string;
  incidentId?: string;
  feedbackItemId?: string;
  autonomous?: boolean;
  approvalState?: Issue["approvalState"];
  dueAt?: string;
}): Promise<Issue> {
  const company = await requireCompany(input.companyId);
  const project = input.projectId ? await requireProject(input.projectId) : null;
  const portfolioItem = input.portfolioItemId ? await requirePortfolioItem(input.portfolioItemId) : null;

  if (project && project.companyId !== company.id) {
    throw new Error(`Project ${project.id} does not belong to company ${company.id}`);
  }
  if (portfolioItem && portfolioItem.companyId !== company.id) {
    throw new Error(`Portfolio item ${portfolioItem.id} does not belong to company ${company.id}`);
  }

  const nextNumber = (company.issueCounter ?? 0) + 1;
  await updateCompany(company.id, { issueCounter: nextNumber } as Partial<Company>);
  const identifier = `${company.issuePrefix}-${nextNumber}`;
  return createRecord<Issue>(C_ISSUES, compactRecord({
    companyId: input.companyId,
    identifier,
    issueNumber: nextNumber,
    title: input.title.trim(),
    status: input.status ?? "todo",
    priority: input.priority ?? "medium",
    description: input.description,
    projectId: input.projectId,
    portfolioId: input.portfolioId ?? project?.portfolioId ?? portfolioItem?.portfolioId,
    portfolioItemId: input.portfolioItemId ?? project?.portfolioItemId,
    goalId: input.goalId,
    parentId: input.parentId,
    assigneeAgentId: input.assigneeAgentId,
    createdByAgentId: input.createdByAgentId,
    createdByUserId: input.createdByUserId,
    workType: input.workType ?? "feature",
    sourceDomain: input.sourceDomain ?? "execution",
    releaseId: input.releaseId,
    incidentId: input.incidentId,
    feedbackItemId: input.feedbackItemId,
    autonomous: input.autonomous ?? false,
    approvalState: input.approvalState ?? "not_required",
    dueAt: input.dueAt,
  }));
}

export async function updateIssue(id: string, patch: Partial<Issue>): Promise<Issue> {
  return updateRecord<Issue>(C_ISSUES, id, patch as Record<string, unknown>);
}

export async function listIssueComments(issueId: string): Promise<IssueComment[]> {
  const comments = await listRecords<IssueComment>(C_COMMENTS, { filter: { issueId } });
  return [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createIssueComment(input: {
  companyId: string;
  issueId: string;
  body: string;
  authorAgentId?: string;
  authorUserId?: string;
  createdByRunId?: string;
}): Promise<IssueComment> {
  return createRecord<IssueComment>(C_COMMENTS, compactRecord({
    companyId: input.companyId,
    issueId: input.issueId,
    body: input.body,
    authorAgentId: input.authorAgentId,
    authorUserId: input.authorUserId,
    createdByRunId: input.createdByRunId,
  }));
}

// ── Approvals ────────────────────────────────────────────────────────────

export async function listApprovals(companyId: string): Promise<Approval[]> {
  return listRecords<Approval>(C_APPROVALS, { filter: { companyId } });
}

export async function getApproval(id: string): Promise<Approval | null> {
  return getRecord<Approval>(C_APPROVALS, id);
}

export async function createApproval(input: {
  companyId: string;
  type: Approval["type"];
  payload?: Record<string, unknown>;
  requestedByUserId?: string;
  requestedByAgentId?: string;
  reason?: string;
}): Promise<Approval> {
  return createRecord<Approval>(C_APPROVALS, compactRecord({
    companyId: input.companyId,
    type: input.type,
    status: "pending",
    payload: input.payload,
    requestedByUserId: input.requestedByUserId,
    requestedByAgentId: input.requestedByAgentId,
    reason: input.reason,
  }));
}

export async function updateApproval(id: string, patch: Partial<Approval>): Promise<Approval> {
  return updateRecord<Approval>(C_APPROVALS, id, patch as Record<string, unknown>);
}

// ── Runs ─────────────────────────────────────────────────────────────────

export async function listRuns(companyId: string): Promise<Run[]> {
  return listRecords<Run>(C_RUNS, { filter: { companyId } });
}

export async function createRun(input: {
  companyId: string;
  agentId: string;
  issueId?: string;
  portfolioItemId?: string;
  projectId?: string;
  releaseId?: string;
  incidentId?: string;
  feedbackItemId?: string;
  clawSessionId?: string;
  actionType?: string;
}): Promise<Run> {
  return createRecord<Run>(C_RUNS, compactRecord({
    companyId: input.companyId,
    agentId: input.agentId,
    status: "queued",
    startedAt: nowIso(),
    issueId: input.issueId,
    portfolioItemId: input.portfolioItemId,
    projectId: input.projectId,
    releaseId: input.releaseId,
    incidentId: input.incidentId,
    feedbackItemId: input.feedbackItemId,
    clawSessionId: input.clawSessionId,
    actionType: input.actionType,
  }));
}

export async function updateRun(id: string, patch: Partial<Run>): Promise<Run> {
  return updateRecord<Run>(C_RUNS, id, patch as Record<string, unknown>);
}

// ── Releases ─────────────────────────────────────────────────────────────

export async function listReleases(companyId: string): Promise<Release[]> {
  return listRecords<Release>(C_RELEASES, { filter: { companyId } });
}

export async function getRelease(id: string): Promise<Release | null> {
  return getRecord<Release>(C_RELEASES, id);
}

export async function createRelease(input: {
  companyId: string;
  portfolioItemId?: string;
  projectId?: string;
  name: string;
  status?: Release["status"];
  releaseType: Release["releaseType"];
  plannedAt?: string;
  summary?: string;
  ownerAgentId?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}): Promise<Release> {
  await requireCompany(input.companyId);
  if (!input.portfolioItemId && !input.projectId) {
    throw new Error("A release must target a portfolio item or a project.");
  }
  const project = input.projectId ? await requireProject(input.projectId) : null;
  const portfolioItem = input.portfolioItemId ? await requirePortfolioItem(input.portfolioItemId) : null;
  if (project && project.companyId !== input.companyId) throw new Error(`Project ${project.id} does not belong to company ${input.companyId}`);
  if (portfolioItem && portfolioItem.companyId !== input.companyId) throw new Error(`Portfolio item ${portfolioItem.id} does not belong to company ${input.companyId}`);
  if (project && portfolioItem && project.portfolioItemId && project.portfolioItemId !== portfolioItem.id) {
    throw new Error("Project and portfolio item do not belong to the same release scope.");
  }
  return createRecord<Release>(C_RELEASES, compactRecord({
    companyId: input.companyId,
    portfolioItemId: input.portfolioItemId ?? project?.portfolioItemId,
    projectId: input.projectId,
    name: input.name.trim(),
    status: input.status ?? "planned",
    releaseType: input.releaseType,
    plannedAt: input.plannedAt,
    summary: input.summary,
    ownerAgentId: input.ownerAgentId,
    notes: input.notes,
    metadata: input.metadata,
  }));
}

export async function updateRelease(id: string, patch: Partial<Release>): Promise<Release> {
  return updateRecord<Release>(C_RELEASES, id, patch as Record<string, unknown>);
}

// ── Operations ───────────────────────────────────────────────────────────

export async function listOperationalChecks(companyId: string): Promise<OperationalCheck[]> {
  return listRecords<OperationalCheck>(C_OPERATIONAL_CHECKS, { filter: { companyId } });
}

export async function getOperationalCheck(id: string): Promise<OperationalCheck | null> {
  return getRecord<OperationalCheck>(C_OPERATIONAL_CHECKS, id);
}

export async function createOperationalCheck(input: {
  companyId: string;
  portfolioItemId?: string;
  projectId?: string;
  name: string;
  domain: OperationalCheck["domain"];
  status: OperationalCheck["status"];
  severity: OperationalCheck["severity"];
  sourceType: OperationalCheck["sourceType"];
  lastObservedAt?: string;
  detail?: string;
  metricValue?: number;
  metricUnit?: string;
  ownerAgentId?: string;
  metadata?: Record<string, unknown>;
}): Promise<OperationalCheck> {
  await requireCompany(input.companyId);
  return createRecord<OperationalCheck>(C_OPERATIONAL_CHECKS, compactRecord(input));
}

export async function updateOperationalCheck(id: string, patch: Partial<OperationalCheck>): Promise<OperationalCheck> {
  return updateRecord<OperationalCheck>(C_OPERATIONAL_CHECKS, id, patch as Record<string, unknown>);
}

export async function listOperationalIncidents(companyId: string): Promise<OperationalIncident[]> {
  return listRecords<OperationalIncident>(C_OPERATIONAL_INCIDENTS, { filter: { companyId } });
}

export async function getOperationalIncident(id: string): Promise<OperationalIncident | null> {
  return getRecord<OperationalIncident>(C_OPERATIONAL_INCIDENTS, id);
}

export async function createOperationalIncident(input: {
  companyId: string;
  portfolioItemId?: string;
  projectId?: string;
  checkId?: string;
  title: string;
  status?: OperationalIncident["status"];
  severity: OperationalIncident["severity"];
  startedAt?: string;
  ownerAgentId?: string;
  summary?: string;
  resolution?: string;
  linkedIssueId?: string;
  metadata?: Record<string, unknown>;
}): Promise<OperationalIncident> {
  await requireCompany(input.companyId);
  return createRecord<OperationalIncident>(C_OPERATIONAL_INCIDENTS, compactRecord({
    companyId: input.companyId,
    portfolioItemId: input.portfolioItemId,
    projectId: input.projectId,
    checkId: input.checkId,
    title: input.title.trim(),
    status: input.status ?? "open",
    severity: input.severity,
    startedAt: input.startedAt ?? nowIso(),
    ownerAgentId: input.ownerAgentId,
    summary: input.summary,
    resolution: input.resolution,
    linkedIssueId: input.linkedIssueId,
    metadata: input.metadata,
  }));
}

export async function updateOperationalIncident(id: string, patch: Partial<OperationalIncident>): Promise<OperationalIncident> {
  return updateRecord<OperationalIncident>(C_OPERATIONAL_INCIDENTS, id, patch as Record<string, unknown>);
}

// ── Feedback ─────────────────────────────────────────────────────────────

export async function listFeedbackItems(companyId: string): Promise<FeedbackItem[]> {
  return listRecords<FeedbackItem>(C_FEEDBACK_ITEMS, { filter: { companyId } });
}

export async function getFeedbackItem(id: string): Promise<FeedbackItem | null> {
  return getRecord<FeedbackItem>(C_FEEDBACK_ITEMS, id);
}

export async function createFeedbackItem(input: {
  companyId: string;
  portfolioItemId?: string;
  projectId?: string;
  title: string;
  body: string;
  status?: FeedbackItem["status"];
  priority?: FeedbackItem["priority"];
  sourceType: FeedbackItem["sourceType"];
  sourceLabel?: string;
  customerName?: string;
  customerSegment?: string;
  sentiment?: FeedbackItem["sentiment"];
  receivedAt?: string;
  ownerAgentId?: string;
  linkedIssueId?: string;
  metadata?: Record<string, unknown>;
}): Promise<FeedbackItem> {
  await requireCompany(input.companyId);
  return createRecord<FeedbackItem>(C_FEEDBACK_ITEMS, compactRecord({
    companyId: input.companyId,
    portfolioItemId: input.portfolioItemId,
    projectId: input.projectId,
    title: input.title.trim(),
    body: input.body.trim(),
    status: input.status ?? "new",
    priority: input.priority ?? "medium",
    sourceType: input.sourceType,
    sourceLabel: input.sourceLabel,
    customerName: input.customerName,
    customerSegment: input.customerSegment,
    sentiment: input.sentiment,
    receivedAt: input.receivedAt ?? nowIso(),
    ownerAgentId: input.ownerAgentId,
    linkedIssueId: input.linkedIssueId,
    metadata: input.metadata,
  }));
}

export async function updateFeedbackItem(id: string, patch: Partial<FeedbackItem>): Promise<FeedbackItem> {
  return updateRecord<FeedbackItem>(C_FEEDBACK_ITEMS, id, patch as Record<string, unknown>);
}

// ── Metrics + imports ────────────────────────────────────────────────────

export async function listMetricSnapshots(companyId: string): Promise<MetricSnapshot[]> {
  return listRecords<MetricSnapshot>(C_METRIC_SNAPSHOTS, { filter: { companyId } });
}

export async function createMetricSnapshot(input: {
  companyId: string;
  portfolioId?: string;
  portfolioItemId?: string;
  projectId?: string;
  metricKey: string;
  metricLabel: string;
  value: number;
  unit?: string;
  direction: MetricSnapshot["direction"];
  capturedAt: string;
  sourceType: MetricSnapshot["sourceType"];
  period?: string;
  metadata?: Record<string, unknown>;
}): Promise<MetricSnapshot> {
  await requireCompany(input.companyId);
  return createRecord<MetricSnapshot>(C_METRIC_SNAPSHOTS, compactRecord(input));
}

export async function listImportBatches(companyId: string): Promise<ImportBatch[]> {
  return listRecords<ImportBatch>(C_IMPORT_BATCHES, { filter: { companyId } });
}

export async function createImportBatch(input: {
  companyId: string;
  type: ImportBatch["type"];
  status?: ImportBatch["status"];
  sourceLabel?: string;
  startedAt?: string;
  finishedAt?: string;
  createdByUserId?: string;
  summary?: string;
  counts?: Record<string, number>;
  metadata?: Record<string, unknown>;
}): Promise<ImportBatch> {
  await requireCompany(input.companyId);
  return createRecord<ImportBatch>(C_IMPORT_BATCHES, compactRecord({
    companyId: input.companyId,
    type: input.type,
    status: input.status ?? "running",
    sourceLabel: input.sourceLabel,
    startedAt: input.startedAt ?? nowIso(),
    finishedAt: input.finishedAt,
    createdByUserId: input.createdByUserId,
    summary: input.summary,
    counts: input.counts,
    metadata: input.metadata,
  }));
}

export async function updateImportBatch(id: string, patch: Partial<ImportBatch>): Promise<ImportBatch> {
  return updateRecord<ImportBatch>(C_IMPORT_BATCHES, id, patch as Record<string, unknown>);
}

// ── Misc helpers ─────────────────────────────────────────────────────────

export async function deleteCompany(companyId: string): Promise<void> {
  const cascade: string[] = [
    C_IMPORT_BATCHES,
    C_METRIC_SNAPSHOTS,
    C_FEEDBACK_ITEMS,
    C_OPERATIONAL_INCIDENTS,
    C_OPERATIONAL_CHECKS,
    C_RELEASES,
    C_RUNS,
    C_APPROVALS,
    C_COMMENTS,
    C_ISSUES,
    C_AGENTS,
    C_PROJECTS,
    C_GOALS,
    C_PORTFOLIO_ITEMS,
    C_PORTFOLIOS,
  ];
  for (const collection of cascade) {
    const items = await listRecords(collection, { filter: { companyId } });
    for (const item of items) {
      await deleteRecord(collection, item.id);
    }
  }
  for (const item of await listLegacyCompanyAgents(companyId)) {
    await deleteRecord(C_LEGACY_AGENTS, item.id);
  }
  await deleteRecord(C_COMPANIES, companyId);
}
