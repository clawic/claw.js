/**
 * Domain service for the Company app.
 *
 * Wraps the database client with company-specific business logic such as
 * generating issue identifiers (`PFX-1`), seeding the initial company state
 * on creation, and reading aggregates needed by the inbox views.
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
  Goal,
  Issue,
  IssueComment,
  Project,
  Run,
} from "./company-types";
import { LOCAL_BOARD_USER_ID } from "./company-types";

const C_COMPANIES = "companies";
const C_GOALS = "goals";
const C_PROJECTS = "projects";
const C_AGENTS = "company_agents";
const C_ISSUES = "issues";
const C_COMMENTS = "issue_comments";
const C_APPROVALS = "approvals";
const C_RUNS = "runs";

function slugifyPrefix(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length >= 3) return letters.slice(0, 3);
  if (letters.length > 0) return letters.padEnd(3, "X");
  return "CMP";
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

// ── Companies ────────────────────────────────────────────────────────────

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
}): Promise<{ company: Company; goal: Goal; project: Project; ceo: CompanyAgent; firstIssue: Issue }> {
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

  const goal = await createRecord<Goal>(C_GOALS, {
    companyId: company.id,
    title: "Bootstrap the company",
    level: "company",
    status: "active",
    description: "Hire the founding team and start delivering on the vision.",
  });

  const project = await createRecord<Project>(C_PROJECTS, {
    companyId: company.id,
    name: "Onboarding",
    status: "in_progress",
    goalId: goal.id,
    description: "Initial setup and first hires.",
    color: "#6366f1",
  });

  const ceo = await createRecord<CompanyAgent>(C_AGENTS, {
    companyId: company.id,
    name: "Board (you)",
    role: "ceo",
    title: "Chief Executive Officer",
    status: "active",
    adapterType: "human",
    icon: "crown",
    capabilities: "Sets the direction for the company. Reviews approvals, hires the team, runs the board.",
  });

  const firstIssue = await createIssue({
    companyId: company.id,
    projectId: project.id,
    goalId: goal.id,
    title: "Hire your first engineer and set the roadmap",
    description: [
      "You are the CEO. You set the direction for the company.",
      "",
      "- Hire a founding engineer (open the Agents tab and click \"Hire\")",
      "- Define the initial roadmap as issues",
      "- Delegate work and review the comments your team posts back",
    ].join("\n"),
    priority: "high",
    assigneeAgentId: ceo.id,
    createdByUserId: LOCAL_BOARD_USER_ID,
  });

  return { company, goal, project, ceo, firstIssue };
}

export async function updateCompany(id: string, patch: Partial<Company>): Promise<Company> {
  return updateRecord<Company>(C_COMPANIES, id, patch);
}

// ── Goals + Projects ─────────────────────────────────────────────────────

export async function listGoals(companyId: string): Promise<Goal[]> {
  return listRecords<Goal>(C_GOALS, { filter: { companyId } });
}

export async function createGoal(input: Omit<Goal, "id" | "createdAt" | "updatedAt">): Promise<Goal> {
  return createRecord<Goal>(C_GOALS, input as unknown as Record<string, unknown>);
}

export async function listProjects(companyId: string): Promise<Project[]> {
  return listRecords<Project>(C_PROJECTS, { filter: { companyId } });
}

export async function createProject(input: Omit<Project, "id" | "createdAt" | "updatedAt">): Promise<Project> {
  return createRecord<Project>(C_PROJECTS, input as unknown as Record<string, unknown>);
}

// ── Agents (employees) ───────────────────────────────────────────────────

export async function listAgents(companyId: string): Promise<CompanyAgent[]> {
  return listRecords<CompanyAgent>(C_AGENTS, { filter: { companyId } });
}

export async function getAgent(id: string): Promise<CompanyAgent | null> {
  return getRecord<CompanyAgent>(C_AGENTS, id);
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
}): Promise<CompanyAgent> {
  return createRecord<CompanyAgent>(C_AGENTS, {
    companyId: input.companyId,
    name: input.name.trim(),
    role: input.role.trim().toLowerCase(),
    title: input.title.trim(),
    status: "pending_approval",
    adapterType: "clawjs_local",
    ...(input.icon ? { icon: input.icon } : {}),
    ...(input.reportsTo ? { reportsTo: input.reportsTo } : {}),
    ...(input.capabilities ? { capabilities: input.capabilities } : {}),
    ...(input.adapterConfig ? { adapterConfig: input.adapterConfig } : {}),
  });
}

export async function updateAgent(id: string, patch: Partial<CompanyAgent>): Promise<CompanyAgent> {
  return updateRecord<CompanyAgent>(C_AGENTS, id, patch as Record<string, unknown>);
}

// ── Issues + Comments ────────────────────────────────────────────────────

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
  goalId?: string;
  parentId?: string;
  assigneeAgentId?: string;
  createdByAgentId?: string;
  createdByUserId?: string;
}): Promise<Issue> {
  // Best-effort atomic increment of the company's issue counter.
  const company = await getCompany(input.companyId);
  if (!company) throw new Error(`Company ${input.companyId} not found`);
  const nextNumber = (company.issueCounter ?? 0) + 1;
  await updateCompany(company.id, { issueCounter: nextNumber } as Partial<Company>);
  const identifier = `${company.issuePrefix}-${nextNumber}`;
  const payload: Record<string, unknown> = {
    companyId: input.companyId,
    identifier,
    issueNumber: nextNumber,
    title: input.title.trim(),
    status: input.status ?? "todo",
    priority: input.priority ?? "medium",
  };
  if (input.description) payload.description = input.description;
  if (input.projectId) payload.projectId = input.projectId;
  if (input.goalId) payload.goalId = input.goalId;
  if (input.parentId) payload.parentId = input.parentId;
  if (input.assigneeAgentId) payload.assigneeAgentId = input.assigneeAgentId;
  if (input.createdByAgentId) payload.createdByAgentId = input.createdByAgentId;
  if (input.createdByUserId) payload.createdByUserId = input.createdByUserId;
  return createRecord<Issue>(C_ISSUES, payload);
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
  return createRecord<IssueComment>(C_COMMENTS, {
    companyId: input.companyId,
    issueId: input.issueId,
    body: input.body,
    ...(input.authorAgentId ? { authorAgentId: input.authorAgentId } : {}),
    ...(input.authorUserId ? { authorUserId: input.authorUserId } : {}),
    ...(input.createdByRunId ? { createdByRunId: input.createdByRunId } : {}),
  });
}

// ── Approvals ─────────────────────────────────────────────────────────────

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
}): Promise<Approval> {
  return createRecord<Approval>(C_APPROVALS, {
    companyId: input.companyId,
    type: input.type,
    status: "pending",
    ...(input.payload ? { payload: input.payload } : {}),
    ...(input.requestedByUserId ? { requestedByUserId: input.requestedByUserId } : {}),
    ...(input.requestedByAgentId ? { requestedByAgentId: input.requestedByAgentId } : {}),
  });
}

export async function updateApproval(id: string, patch: Partial<Approval>): Promise<Approval> {
  return updateRecord<Approval>(C_APPROVALS, id, patch as Record<string, unknown>);
}

// ── Runs ──────────────────────────────────────────────────────────────────

export async function listRuns(companyId: string): Promise<Run[]> {
  return listRecords<Run>(C_RUNS, { filter: { companyId } });
}

export async function createRun(input: {
  companyId: string;
  agentId: string;
  issueId?: string;
  clawSessionId?: string;
}): Promise<Run> {
  return createRecord<Run>(C_RUNS, {
    companyId: input.companyId,
    agentId: input.agentId,
    status: "queued",
    startedAt: new Date().toISOString(),
    ...(input.issueId ? { issueId: input.issueId } : {}),
    ...(input.clawSessionId ? { clawSessionId: input.clawSessionId } : {}),
  });
}

export async function updateRun(id: string, patch: Partial<Run>): Promise<Run> {
  return updateRecord<Run>(C_RUNS, id, patch as Record<string, unknown>);
}

// ── Misc helpers ──────────────────────────────────────────────────────────

export async function deleteCompany(companyId: string): Promise<void> {
  const cascade: Array<[string]> = [
    [C_RUNS],
    [C_APPROVALS],
    [C_COMMENTS],
    [C_ISSUES],
    [C_AGENTS],
    [C_PROJECTS],
    [C_GOALS],
  ];
  for (const [collection] of cascade) {
    const items = await listRecords(collection, { filter: { companyId } });
    for (const item of items) {
      await deleteRecord(collection, item.id);
    }
  }
  await deleteRecord(C_COMPANIES, companyId);
}
