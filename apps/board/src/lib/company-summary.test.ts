import { describe, expect, it } from "vitest";
import {
  buildCompanyDashboardPayload,
  buildCompanySidebarPayload,
} from "./company-summary";
import type {
  Approval,
  Company,
  CompanyAgent,
  FeedbackItem,
  Goal,
  Issue,
  OperationalIncident,
  PortfolioItem,
  Project,
  Release,
  Run,
} from "./company-types";

const baseRecord = {
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function company(): Company {
  return {
    ...baseRecord,
    id: "company-1",
    name: "Acme",
    issuePrefix: "ACM",
    issueCounter: 2,
    status: "active",
    brandColor: "#0ea5e9",
  };
}

function approval(id: string, status: Approval["status"]): Approval {
  return {
    ...baseRecord,
    id,
    companyId: "company-1",
    type: "hire_agent",
    status,
  };
}

function feedback(id: string, status: FeedbackItem["status"]): FeedbackItem {
  return {
    ...baseRecord,
    id,
    companyId: "company-1",
    title: id,
    body: "Feedback",
    status,
    priority: "medium",
    sourceType: "support",
    receivedAt: baseRecord.createdAt,
  };
}

function issue(id: string, updatedAt: string): Issue {
  return {
    ...baseRecord,
    id,
    updatedAt,
    companyId: "company-1",
    identifier: id.toUpperCase(),
    issueNumber: Number(id.replace(/\D/g, "")),
    title: id,
    status: "todo",
    priority: "medium",
  };
}

describe("company summary payload builders", () => {
  it("builds the sidebar payload without returning full company detail collections", () => {
    const payload = buildCompanySidebarPayload({
      company: company(),
      approvals: [approval("approval-1", "pending"), approval("approval-2", "approved")],
      feedbackItems: [feedback("feedback-1", "new"), feedback("feedback-2", "triaged")],
    });

    expect(payload).toEqual({
      company: {
        id: "company-1",
        name: "Acme",
        brandColor: "#0ea5e9",
      },
      pendingApprovalsCount: 1,
      untriagedFeedbackCount: 1,
    });
  });

  it("builds a dashboard payload with recent issues and pending approvals only", () => {
    const issues = Array.from({ length: 10 }, (_, index) =>
      issue(`issue-${index + 1}`, `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const payload = buildCompanyDashboardPayload({
      company: company(),
      goals: [{ ...baseRecord, id: "goal-1", companyId: "company-1", title: "Goal", level: "company", status: "active" }] as Goal[],
      projects: [{ ...baseRecord, id: "project-1", companyId: "company-1", name: "Project", status: "in_progress" }] as Project[],
      portfolioItems: [{ ...baseRecord, id: "item-1", companyId: "company-1", portfolioId: "portfolio-1", name: "Item", slug: "item", itemType: "app", status: "active", lifecycleStage: "building", healthStatus: "red" }] as PortfolioItem[],
      incidents: [{ ...baseRecord, id: "incident-1", companyId: "company-1", title: "Incident", status: "open", severity: "sev2", startedAt: baseRecord.createdAt }] as OperationalIncident[],
      approvals: [approval("approval-1", "pending"), approval("approval-2", "approved")],
      feedbackItems: [feedback("feedback-1", "new")],
      runs: [{ ...baseRecord, id: "run-1", companyId: "company-1", agentId: "agent-1", status: "running" }] as Run[],
      releases: [{ ...baseRecord, id: "release-1", companyId: "company-1", name: "Release", status: "planned", releaseType: "launch" }] as Release[],
      issues,
      agents: [{ ...baseRecord, id: "agent-1", companyId: "company-1", name: "Agent", role: "cto", title: "CTO", status: "active", adapterType: "clawjs_local" }] as CompanyAgent[],
    });

    expect(payload.recentIssues).toHaveLength(8);
    expect(payload.recentIssues[0]?.id).toBe("issue-10");
    expect(payload.pendingApprovals.map((row) => row.id)).toEqual(["approval-1"]);
    expect(payload.summary.openIncidents.value).toBe(1);
    expect(payload.summary.pendingApprovals.value).toBe(1);
    expect(payload.summary.untriagedFeedback.value).toBe(1);
  });
});
