// @ts-nocheck
import type { ClawInstance } from "@clawjs/claw";
import type { WorkspaceClawInstance } from "./workspace-contracts.ts";

export function createWorkspaceInstance(input: {
  claw: ClawInstance;
  DEFAULT_CONTEXT_LIMIT: number;
  [key: string]: any;
}): WorkspaceClawInstance {
  const {
    claw,
    TOOL_DESCRIPTORS,
    contextApi,
    uiApi,
    searchWorkspace,
    rebuildIndexes,
    agendaApi,
    reviewApi,
    productivityApi,
    areasApi,
    listsApi,
    sectionsApi,
    tasksApi,
    goalsApi,
    projectsApi,
    commentsApi,
    attachmentsApi,
    savedViewsApi,
    recurrencesApi,
    cyclesApi,
    epicsApi,
    customFieldsApi,
    fieldValuesApi,
    templatesApi,
    milestonesApi,
    activityApi,
    blockersApi,
    artifactsApi,
    decisionsApi,
    workSessionsApi,
    assignmentsApi,
    handoffsApi,
    approvalsApi,
    capacityApi,
    agentsApi,
    releasesApi,
    incidentsApi,
    feedbackApi,
    checksApi,
    remindersApi,
    deadlinesApi,
    notesApi,
    peopleApi,
    inboxApi,
    eventsApi,
    DEFAULT_CONTEXT_LIMIT,
  } = input;

  const sessions: WorkspaceClawInstance["sessions"] = {
    ...claw.sessions,
    streamAssistantReplyEvents: async function* (input) {
      const workspaceContext = input.workspaceContext ?? "off";
      const baseContextBlocks = input.contextBlocks ?? [];
      const generatedContext = workspaceContext === "off"
        ? null
        : await contextApi.build(workspaceContext === "auto"
          ? { sessionId: input.sessionId, strategy: "auto", limit: DEFAULT_CONTEXT_LIMIT }
          : workspaceContext);
      const { workspaceContext: _ignored, ...baseInput } = input;
      yield* claw.sessions.streamAssistantReplyEvents({
        ...baseInput,
        contextBlocks: [...baseContextBlocks, ...(generatedContext?.blocks ?? [])],
      });
    },
    streamAssistantReply: async function* (input) {
      const workspaceContext = input.workspaceContext ?? "off";
      const baseContextBlocks = input.contextBlocks ?? [];
      const generatedContext = workspaceContext === "off"
        ? null
        : await contextApi.build(workspaceContext === "auto"
          ? { sessionId: input.sessionId, strategy: "auto", limit: DEFAULT_CONTEXT_LIMIT }
          : workspaceContext);
      const { workspaceContext: _ignored, ...baseInput } = input;
      yield* claw.sessions.streamAssistantReply({
        ...baseInput,
        contextBlocks: [...baseContextBlocks, ...(generatedContext?.blocks ?? [])],
      });
    },
  };

  return {
    ...claw,
    workspace: {
      ...claw.workspace,
      tools: {
        describe: () => [...TOOL_DESCRIPTORS],
      },
    },
    sessions,
    areas: areasApi,
    lists: listsApi,
    sections: sectionsApi,
    tasks: tasksApi,
    goals: goalsApi,
    projects: projectsApi,
    comments: commentsApi,
    attachments: attachmentsApi,
    savedViews: savedViewsApi,
    recurrences: recurrencesApi,
    cycles: cyclesApi,
    epics: epicsApi,
    customFields: customFieldsApi,
    fieldValues: fieldValuesApi,
    templates: templatesApi,
    milestones: milestonesApi,
    activity: activityApi,
    blockers: blockersApi,
    artifacts: artifactsApi,
    decisions: decisionsApi,
    workSessions: workSessionsApi,
    assignments: assignmentsApi,
    handoffs: handoffsApi,
    approvals: approvalsApi,
    capacity: capacityApi,
    agents: agentsApi,
    releases: releasesApi,
    incidents: incidentsApi,
    feedback: feedbackApi,
    checks: checksApi,
    reminders: remindersApi,
    deadlines: deadlinesApi,
    notes: notesApi,
    people: peopleApi,
    inbox: inboxApi,
    events: eventsApi,
    search: {
      query: async (input) => searchWorkspace(input),
    },
    context: {
      ...claw.context,
      ...contextApi,
    },
    ui: uiApi,
    workspaceIndex: {
      rebuild: async () => rebuildIndexes(),
    },
    agenda: agendaApi,
    review: reviewApi,
    productivity: productivityApi,
  };

}
