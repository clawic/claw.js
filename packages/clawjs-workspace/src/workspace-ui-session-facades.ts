import type { WorkspaceClawInstance } from "./workspace-contracts.ts";

export function createWorkspaceUiSessionFacades(locals: Record<string, any>): {
  contextApi: Pick<WorkspaceClawInstance["context"], "build" | "tools">;
  uiApi: WorkspaceClawInstance["ui"];
} {
  const { buildContext, TOOL_DESCRIPTORS, SURFACES, nowIso, inboxApi, tasksApi, blockersApi, decisionsApi, assignmentsApi, handoffsApi, approvalsApi, capacityApi, agentsApi, releasesApi, incidentsApi, feedbackApi, checksApi, eventsApi, claw, DEFAULT_CONTEXT_LIMIT } = locals;
  const contextApi: Pick<WorkspaceClawInstance["context"], "build" | "tools"> = {
    build: async (input = {}) => buildContext(input),
    tools: () => [...TOOL_DESCRIPTORS],
  };

  const uiApi: WorkspaceClawInstance["ui"] = {
    surfaces: () => [...SURFACES],
    badges: async () => {
      const today = nowIso().slice(0, 10);
      const upcomingThreshold = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      return [
        {
          id: "inbox_unread",
          value: (await inboxApi.list({ unreadOnly: true })).length,
          label: "Unread inbox",
        },
        {
          id: "tasks_due_today",
          value: (await tasksApi.list()).filter((task) => task.dueAt?.startsWith(today)).length,
          label: "Tasks due today",
        },
        {
          id: "blockers_active",
          value: (await blockersApi.list({ status: "active", includeArchived: false })).length,
          label: "Active blockers",
        },
        {
          id: "decisions_pending",
          value: (await decisionsApi.list({ status: ["proposed", "accepted"], includeArchived: false })).length,
          label: "Pending decisions",
        },
        {
          id: "assignments_active",
          value: (await assignmentsApi.list({ status: ["proposed", "accepted"], includeArchived: false })).length,
          label: "Active assignments",
        },
        {
          id: "handoffs_pending",
          value: (await handoffsApi.list({ status: ["proposed", "accepted", "returned"], includeArchived: false })).length,
          label: "Pending handoffs",
        },
        {
          id: "approvals_pending",
          value: (await approvalsApi.list({ status: "pending", includeArchived: false })).length,
          label: "Pending approvals",
        },
        {
          id: "capacity_overloaded",
          value: (await capacityApi.list({ status: "overloaded", includeArchived: false })).length,
          label: "Overloaded agents",
        },
        {
          id: "agents_gated",
          value: (await agentsApi.list({ includeArchived: false })).filter((agent) => agent.policyGate !== "none").length,
          label: "Approval-gated agents",
        },
        {
          id: "releases_at_risk",
          value: (await releasesApi.list({ status: "at_risk", includeArchived: false })).length,
          label: "At-risk releases",
        },
        {
          id: "incidents_open",
          value: (await incidentsApi.list({ status: ["open", "investigating", "mitigating"], includeArchived: false })).length,
          label: "Open incidents",
        },
        {
          id: "feedback_new",
          value: (await feedbackApi.list({ status: "new", includeArchived: false })).length,
          label: "New feedback",
        },
        {
          id: "checks_failing",
          value: (await checksApi.list({ status: "failing", includeArchived: false })).length,
          label: "Failing checks",
        },
        {
          id: "events_upcoming",
          value: (await eventsApi.list({ upcomingOnly: true })).filter((event) => event.startsAt <= upcomingThreshold).length,
          label: "Upcoming events",
        },
      ];
    },
  };
  return { contextApi, uiApi };
}
