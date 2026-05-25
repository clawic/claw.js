/**
 * Company-app agent orchestration.
 *
 * This module keeps autonomous work auditable: every meaningful action can
 * materialize an issue, a run, a comment, or an approval when policy requires
 * one.
 */

import {
  buildAgentInstructions,
  buildIssuePrompt,
  getOrCreateIssueSession,
  streamAgentReply,
} from "./company-claw";
import {
  createApproval,
  createFeedbackItem,
  createIssue,
  createIssueComment,
  createOperationalIncident,
  createRun,
  getAgent,
  getApproval,
  getCompany,
  getFeedbackItem,
  getIssue,
  getOperationalIncident,
  getRelease,
  listAgents,
  listApprovals,
  listCompanies,
  listGoals,
  listIssueComments,
  listIssues,
  updateAgent,
  updateApproval,
  updateFeedbackItem,
  updateIssue,
  updateOperationalIncident,
  updateRelease,
  updateRun,
} from "./company-service";
import type {
  Approval,
  CompanyAgent,
  FeedbackItem,
  Issue,
  IssueComment,
  OperationalIncident,
  Release,
  Run,
} from "./company-types";
import { LOCAL_BOARD_USER_ID } from "./company-types";

function shouldUseFakeAgentRuntime(): boolean {
  return process.env.CLAW_COMPANY_FAKE_AGENT_RUNS === "1";
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildDeterministicAgentReply(issue: Issue, agent: CompanyAgent): string {
  return [
    `Agent ${agent.title} reviewed ${issue.identifier}.`,
    "",
    "1. Captured the current objective and missing context.",
    "2. Proposed the next concrete execution step.",
    "3. Updated the issue so the board can review the outcome.",
    "",
    "STATUS: in_review",
  ].join("\n");
}

async function listAutonomousAgents(companyId: string): Promise<CompanyAgent[]> {
  const agents = await listAgents(companyId);
  return agents.filter((agent) => (
    agent.status === "active"
    && agent.adapterType !== "human"
    && (agent.autonomyLevel === "act_limited" || agent.autonomyLevel === "act_full")
  ));
}

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
    reason: "New agent hire request",
  });
  if (!company.requireBoardApprovalForNewAgents) {
    await decideApproval(approval.id, "approved");
    return { approval, autoApproved: true };
  }
  return { approval, autoApproved: false };
}

/**
 * Approve or reject an approval. For `hire_agent` approvals this materializes
 * the instructions markdown on the agent record and flips its status.
 */
export async function decideApproval(approvalId: string, decision: "approved" | "rejected"): Promise<Approval> {
  const approval = await getApproval(approvalId);
  if (!approval) throw new Error(`Approval ${approvalId} not found`);
  if (approval.status !== "pending") return approval;
  let approvedHireAgentUpdate: { agentId: string; instructionsMarkdown: string } | null = null;
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
    approvedHireAgentUpdate = { agentId: agent.id, instructionsMarkdown };
  }
  const updated = await updateApproval(approvalId, {
    status: decision,
    decidedAt: new Date().toISOString(),
    decidedByUserId: LOCAL_BOARD_USER_ID,
  });
  if (approvedHireAgentUpdate) {
    await updateAgent(approvedHireAgentUpdate.agentId, {
      status: "active",
      instructionsMarkdown: approvedHireAgentUpdate.instructionsMarkdown,
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
 * Run an issue with its assigned agent. The E2E suite can force a local fake
 * path via `CLAW_COMPANY_FAKE_AGENT_RUNS=1` to keep the flow hermetic.
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

  const run = await createRun({
    companyId: company.id,
    agentId: agent.id,
    issueId: issue.id,
    portfolioItemId: issue.portfolioItemId,
    projectId: issue.projectId,
    releaseId: issue.releaseId,
    incidentId: issue.incidentId,
    feedbackItemId: issue.feedbackItemId,
    actionType: "issue_execution",
  });
  await updateRun(run.id, { status: "running" });
  await updateIssue(issue.id, { status: "in_progress" } as Partial<Issue>);

  try {
    let trimmed = "";
    if (shouldUseFakeAgentRuntime()) {
      trimmed = buildDeterministicAgentReply(issue, agent);
      input.onDelta?.(trimmed);
    } else {
      const session = await getOrCreateIssueSession({ companyId: company.id, agent, issue });
      await updateRun(run.id, { clawSessionId: session.sessionId });
      const comments = await listIssueComments(issue.id);
      const userMessage = buildIssuePrompt({ issue, comments, agent });
      const systemPrompt =
        agent.instructionsMarkdown ||
        buildAgentInstructions({
          company,
          agent,
          goalTitles: (await listGoals(company.id)).map((g) => g.title),
        });
      const streamed = await streamAgentReply({
        agent,
        systemPrompt,
        userMessage,
        sessionId: session.sessionId,
        onDelta: input.onDelta,
      });
      trimmed = streamed.text.trim() || "(no response)";
    }

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

export async function triageFeedback(input: {
  feedbackId: string;
  actorAgentId?: string;
  createIssueFromFeedback?: boolean;
}): Promise<{
  feedback: FeedbackItem;
  issue: Issue | null;
  run: Run | null;
  comment: IssueComment | null;
}> {
  const feedback = await getFeedbackItem(input.feedbackId);
  if (!feedback) throw new Error(`Feedback ${input.feedbackId} not found`);
  const company = await getCompany(feedback.companyId);
  if (!company) throw new Error(`Company ${feedback.companyId} not found`);

  const autonomousAgents = await listAutonomousAgents(company.id);
  const actorAgent = input.actorAgentId
    ? await getAgent(input.actorAgentId)
    : autonomousAgents[0] ?? null;

  const issue = input.createIssueFromFeedback !== false
    ? await createIssue({
      companyId: company.id,
      portfolioItemId: feedback.portfolioItemId,
      projectId: feedback.projectId,
      title: `Follow up feedback: ${feedback.title}`,
      description: feedback.body,
      priority: feedback.priority,
      assigneeAgentId: actorAgent?.id,
      createdByUserId: LOCAL_BOARD_USER_ID,
      workType: "support",
      sourceDomain: "feedback",
      feedbackItemId: feedback.id,
      autonomous: Boolean(actorAgent),
      approvalState: "not_required",
    })
    : null;

  const updatedFeedback = await updateFeedbackItem(feedback.id, {
    status: issue ? "triaged" : "planned",
    linkedIssueId: issue?.id ?? feedback.linkedIssueId,
    ownerAgentId: actorAgent?.id ?? feedback.ownerAgentId,
  });

  if (!actorAgent || !issue) {
    return { feedback: updatedFeedback, issue, run: null, comment: null };
  }

  const run = await createRun({
    companyId: company.id,
    agentId: actorAgent.id,
    issueId: issue.id,
    portfolioItemId: issue.portfolioItemId,
    projectId: issue.projectId,
    feedbackItemId: feedback.id,
    actionType: "feedback_triage",
  });
  const comment = await createIssueComment({
    companyId: company.id,
    issueId: issue.id,
    body: [
      `Feedback triaged from ${feedback.sourceType}.`,
      "",
      `Customer signal: ${feedback.title}`,
      feedback.customerName ? `Customer: ${feedback.customerName}` : "",
      "Recommended next step: review the issue and decide implementation priority.",
    ].filter(Boolean).join("\n"),
    authorAgentId: actorAgent.id,
    createdByRunId: run.id,
  });
  const finishedRun = await updateRun(run.id, {
    status: "succeeded",
    startedAt: nowIso(),
    finishedAt: nowIso(),
  });
  return { feedback: updatedFeedback, issue, run: finishedRun, comment };
}

export async function resolveIncident(input: {
  incidentId: string;
  resolution: string;
  force?: boolean;
}): Promise<{
  incident: OperationalIncident;
  approval: Approval | null;
}> {
  const incident = await getOperationalIncident(input.incidentId);
  if (!incident) throw new Error(`Incident ${input.incidentId} not found`);

  if (incident.severity === "sev1" && !input.force) {
    const approval = await createApproval({
      companyId: incident.companyId,
      type: "policy_change",
      requestedByUserId: LOCAL_BOARD_USER_ID,
      reason: `Resolution requested for critical incident ${incident.title}`,
      payload: {
        incidentId: incident.id,
        action: "resolve_incident",
        resolution: input.resolution,
      },
    });
    return { incident, approval };
  }

  const updated = await updateOperationalIncident(incident.id, {
    status: "resolved",
    resolvedAt: new Date().toISOString(),
    resolution: input.resolution,
  });
  if (incident.linkedIssueId) {
    await updateIssue(incident.linkedIssueId, { status: "done" });
  }
  return { incident: updated, approval: null };
}

export async function shipRelease(releaseId: string): Promise<Release> {
  const release = await getRelease(releaseId);
  if (!release) throw new Error(`Release ${releaseId} not found`);
  return updateRelease(release.id, {
    status: "released",
    releasedAt: new Date().toISOString(),
  });
}

/**
 * Aggregate "my inbox": assigned issues + pending approvals across companies.
 */
export async function getUserInbox(input: {
  companyId?: string;
}): Promise<{
  assignedIssues: Array<Issue & { availableActions: string[] }>;
  pendingApprovals: Approval[];
  agents: CompanyAgent[];
}> {
  const companies = input.companyId
    ? [await getCompany(input.companyId)].filter((c): c is NonNullable<typeof c> => Boolean(c))
    : await listCompanies();

  const assignedIssues: Array<Issue & { availableActions: string[] }> = [];
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
        assignedIssues.push({
          ...issue,
          availableActions: issue.approvalState === "pending" ? ["approve"] : ["run_agent"],
        });
      }
    }
    for (const approval of companyApprovals) {
      if (approval.status === "pending") pendingApprovals.push(approval);
    }
  }
  return { assignedIssues, pendingApprovals, agents };
}

export async function seedAutonomousFeedback(input: {
  companyId: string;
  title: string;
  body: string;
  portfolioItemId?: string;
  sourceType?: FeedbackItem["sourceType"];
}): Promise<FeedbackItem> {
  return createFeedbackItem({
    companyId: input.companyId,
    title: input.title,
    body: input.body,
    portfolioItemId: input.portfolioItemId,
    sourceType: input.sourceType ?? "internal",
    status: "new",
    priority: "medium",
    receivedAt: nowIso(),
  });
}
