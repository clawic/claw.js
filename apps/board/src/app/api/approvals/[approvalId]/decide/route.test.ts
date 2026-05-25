import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Approval } from "@/lib/company-types";

const serviceMocks = vi.hoisted(() => ({
  getApproval: vi.fn(),
  updateApproval: vi.fn(),
  getAgent: vi.fn(),
  getCompany: vi.fn(),
  listGoals: vi.fn(),
  updateAgent: vi.fn(),
}));

vi.mock("@/lib/company-service", () => ({
  createApproval: vi.fn(),
  createFeedbackItem: vi.fn(),
  createIssue: vi.fn(),
  createIssueComment: vi.fn(),
  createOperationalIncident: vi.fn(),
  createRun: vi.fn(),
  getAgent: serviceMocks.getAgent,
  getApproval: serviceMocks.getApproval,
  getCompany: serviceMocks.getCompany,
  getFeedbackItem: vi.fn(),
  getIssue: vi.fn(),
  getOperationalIncident: vi.fn(),
  getRelease: vi.fn(),
  listAgents: vi.fn(),
  listApprovals: vi.fn(),
  listCompanies: vi.fn(),
  listGoals: serviceMocks.listGoals,
  listIssueComments: vi.fn(),
  listIssues: vi.fn(),
  updateAgent: serviceMocks.updateAgent,
  updateApproval: serviceMocks.updateApproval,
  updateFeedbackItem: vi.fn(),
  updateIssue: vi.fn(),
  updateOperationalIncident: vi.fn(),
  updateRelease: vi.fn(),
  updateRun: vi.fn(),
}));

const pendingHireApproval: Approval = {
  id: "approval-missing-agent",
  companyId: "company-1",
  type: "hire_agent",
  status: "pending",
  payload: {},
  requestedByUserId: "board-local-user",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("POST /api/approvals/:approvalId/decide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not persist an approved hire decision before validating the hire payload", async () => {
    serviceMocks.getApproval.mockResolvedValue(pendingHireApproval);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://board.test/api/approvals/approval-missing-agent/decide", {
        method: "POST",
        body: JSON.stringify({ decision: "approved" }),
      }),
      { params: Promise.resolve({ approvalId: "approval-missing-agent" }) },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "hire_agent approval missing agentId" });
    expect(serviceMocks.updateApproval).not.toHaveBeenCalled();
    expect(serviceMocks.updateAgent).not.toHaveBeenCalled();
  });
});
