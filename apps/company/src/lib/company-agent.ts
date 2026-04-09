/**
 * Company-app agent orchestration.
 *
 * Translates the high-level "hire an agent" and "run an issue" actions into
 * concrete ClawJS calls plus persistence in the company collections.
 */

import {
  buildAgentInstructions,
  buildIssuePrompt,
  getOrCreateIssueSession,
  streamAgentReply,
} from "./company-claw";
import {
  createApproval,
  createIssueComment,
  createRun,
  getAgent,
  getApproval,
  getCompany,
  getIssue,
  listAgents,
  listApprovals,
  listCompanies,
  listGoals,
  listIssueComments,
  listIssues,
  updateAgent,
  updateApproval,
  updateIssue,
  updateRun,
} from "./company-service";
import type {
  Approval,
  CompanyAgent,
  Issue,
  IssueComment,
  Run,
} from "./company-types";
import { LOCAL_BOARD_USER_ID } from "./company-types";

/**
 * Request a hire. If the company does not require board approval, the hire
 * is auto-approved and the agent becomes immediately active.
 */
export async function requestHire(input: {
  companyId: string;
  name: string;
  role: string;
  title: string;
  capabilities?: string;
  reportsTo?: string;
  icon?: string;
  agentId: string;
}): Promise<{ approval: Approval; autoApproved: boolean }> {
  const company = await getCompany(input.companyId);
  if (!company) throw new Error(`Company ${input.companyId} not found`);
  const approval = await createApproval({
    companyId: input.companyId,
    type: "hire_agent",
    requestedByUserId: LOCAL_BOARD_USER_ID,
    payload: {
      agentId: input.agentId,
      name: input.name,
      role: input.role,
      title: input.title,
      capabilities: input.capabilities,
      reportsTo: input.reportsTo,
      icon: input.icon,
    },
  });
  if (!company.requireBoardApprovalForNewAgents) {
    await decideApproval(approval.id, "approved");
    return { approval, autoApproved: true };
  }
  return { approval, autoApproved: false };
}

/**
 * Approve or reject an approval. For `hire_agent` approvals this materializes
 * the AGENTS.md instructions on the agent record and flips its status.
 */
export async function decideApproval(approvalId: string, decision: "approved" | "rejected"): Promise<Approval> {
  const approval = await getApproval(approvalId);
  if (!approval) throw new Error(`Approval ${approvalId} not found`);
  if (approval.status !== "pending") return approval;
  const updated = await updateApproval(approvalId, {
    status: decision,
    decidedAt: new Date().toISOString(),
    decidedByUserId: LOCAL_BOARD_USER_ID,
  });
  if (decision === "approved" && approval.type === "hire_agent") {
    const payload = (approval.payload ?? {}) as Record<string, unknown>;
    const agentId = typeof payload.agentId === "string" ? payload.agentId : null;
    if (!agentId) throw new Error("hire_agent approval missing agentId");
    const agent = await getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    const company = await getCompany(approval.companyId);
    if (!company) throw new Error(`Company ${approval.companyId} not found`);
    const goals = await listGoals(company.id);
    const reportsToAgent = agent.reportsTo ? await getAgent(agent.reportsTo) : null;
    const instructionsMarkdown = buildAgentInstructions({
      company,
      agent,
      reportsToTitle: reportsToAgent?.title,
      goalTitles: goals.map((goal) => goal.title),
    });
    await updateAgent(agent.id, {
      status: "active",
      instructionsMarkdown,
    });
  }
  return updated;
}

export interface RunIssueResult {
  run: Run;
  comment: IssueComment;
  text: string;
}

/**
 * Run an issue with its assigned agent. Streams the agent reply (so the
 * caller can pipe deltas to an SSE response) and persists the final answer
 * as a new comment on the issue.
 */
export async function runIssue(input: {
  issueId: string;
  onDelta?: (delta: string) => void;
}): Promise<RunIssueResult> {
  const issue = await getIssue(input.issueId);
  if (!issue) throw new Error(`Issue ${input.issueId} not found`);
  if (!issue.assigneeAgentId) throw new Error(`Issue ${issue.identifier} has no assignee`);
  const agent = await getAgent(issue.assigneeAgentId);
  if (!agent) throw new Error(`Assignee agent ${issue.assigneeAgentId} not found`);
  if (agent.adapterType === "human") {
    throw new Error(`Cannot run issue ${issue.identifier}: ${agent.title} is a human role`);
  }
  if (agent.status !== "active") {
    throw new Error(`Cannot run issue ${issue.identifier}: ${agent.title} is ${agent.status}`);
  }
  const company = await getCompany(issue.companyId);
  if (!company) throw new Error(`Company ${issue.companyId} not found`);

  const session = await getOrCreateIssueSession({ companyId: company.id, agent, issue });

  const run = await createRun({
    companyId: company.id,
    agentId: agent.id,
    issueId: issue.id,
    clawSessionId: session.sessionId,
  });
  await updateRun(run.id, { status: "running" });
  await updateIssue(issue.id, { status: "in_progress" } as Partial<Issue>);

  try {
    const comments = await listIssueComments(issue.id);
    const userMessage = buildIssuePrompt({ issue, comments, agent });
    const systemPrompt =
      agent.instructionsMarkdown ||
      buildAgentInstructions({
        company,
        agent,
        goalTitles: (await listGoals(company.id)).map((g) => g.title),
      });

    const { text } = await streamAgentReply({
      agent,
      systemPrompt,
      userMessage,
      sessionId: session.sessionId,
      onDelta: input.onDelta,
    });

    const trimmed = text.trim() || "(no response)";
    const statusLine = trimmed.match(/STATUS:\s*(todo|in_progress|blocked|in_review|done|cancelled)/i);
    const newStatus = statusLine ? (statusLine[1].toLowerCase() as Issue["status"]) : "in_review";

    const comment = await createIssueComment({
      companyId: company.id,
      issueId: issue.id,
      body: trimmed,
      authorAgentId: agent.id,
      createdByRunId: run.id,
    });

    await updateIssue(issue.id, { status: newStatus, executionRunId: run.id } as Partial<Issue>);
    const finishedRun = await updateRun(run.id, {
      status: "succeeded",
      finishedAt: new Date().toISOString(),
    });

    return { run: finishedRun, comment, text: trimmed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRun(run.id, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      errorMessage: message,
    });
    await updateIssue(issue.id, { status: "blocked" } as Partial<Issue>);
    throw error;
  }
}

/**
 * Aggregate "my inbox": assigned issues + pending approvals across companies.
 */
export async function getUserInbox(input: {
  companyId?: string;
}): Promise<{
  assignedIssues: Issue[];
  pendingApprovals: Approval[];
  agents: CompanyAgent[];
}> {
  const companies = input.companyId
    ? [await getCompany(input.companyId)].filter((c): c is NonNullable<typeof c> => Boolean(c))
    : await listCompanies();

  const assignedIssues: Issue[] = [];
  const pendingApprovals: Approval[] = [];
  const agents: CompanyAgent[] = [];

  for (const company of companies) {
    const [companyIssues, companyApprovals, companyAgents] = await Promise.all([
      listIssues(company.id),
      listApprovals(company.id),
      listAgents(company.id),
    ]);
    agents.push(...companyAgents);
    const ceo = companyAgents.find((a) => a.role === "ceo");
    for (const issue of companyIssues) {
      if (!ceo || issue.assigneeAgentId === ceo.id || !issue.assigneeAgentId) {
        assignedIssues.push(issue);
      }
    }
    for (const approval of companyApprovals) {
      if (approval.status === "pending") pendingApprovals.push(approval);
    }
  }
  return { assignedIssues, pendingApprovals, agents };
}
