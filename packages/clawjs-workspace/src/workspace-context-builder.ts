// @ts-nocheck
import type { ClawInstance } from "@clawjs/claw";
import type { WorkspaceContextRequest, WorkspaceContextBundle } from "@clawjs/core";
import { nowIso, uniqueStrings } from "./workspace-utils.ts";
import { summarizeSnippet } from "./workspace-search-text.ts";

export function createWorkspaceContextBuilder(input: {
  claw: ClawInstance;
  appendAudit: (event: string, capability: string, detail?: Record<string, unknown>) => void;
  DEFAULT_CONTEXT_LIMIT: number;
  [key: string]: any;
}) {
  const {
    claw,
    appendAudit,
    DEFAULT_CONTEXT_LIMIT,
    inboxThreadsCollection,
    searchWorkspace,
    areasApi,
    tasksApi,
    goalsApi,
    projectsApi,
    milestonesApi,
    blockersApi,
    artifactsApi,
    decisionsApi,
    workSessionsApi,
    assignmentsApi,
    handoffsApi,
    approvalsApi,
    capacityApi,
    remindersApi,
    deadlinesApi,
    notesApi,
    inboxApi,
    eventsApi,
    peopleApi,
  } = input;

  async function buildContext(input: WorkspaceContextRequest = {}): Promise<WorkspaceContextBundle> {
    const queryText = input.query?.trim()
      || (input.threadId ? (inboxThreadsCollection.get(input.threadId)?.preview ?? "") : "")
      || (input.sessionId ? claw.sessions.getSession(input.sessionId)?.messages.at(-1)?.content ?? "" : "");
    const request: WorkspaceContextRequest = {
      strategy: "auto",
      limit: DEFAULT_CONTEXT_LIMIT,
      ...input,
      ...(queryText ? { query: queryText } : {}),
    };

    const results = queryText
      ? await searchWorkspace({
          query: queryText,
          domains: request.domains,
          strategy: request.strategy ?? "auto",
          limit: request.limit ?? DEFAULT_CONTEXT_LIMIT,
        })
      : [];

    const areaRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "areas").map((result) => areasApi.get(result.id)))
      : await areasApi.list({ limit: 2, status: ["active", "paused"] });
    const taskRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "tasks").map((result) => tasksApi.get(result.id)))
      : await tasksApi.list({ limit: 3, status: ["todo", "in_progress", "blocked"] });
    const goalRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "goals").map((result) => goalsApi.get(result.id)))
      : await goalsApi.list({ limit: 2, status: ["active", "paused"] });
    const projectRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "projects").map((result) => projectsApi.get(result.id)))
      : await projectsApi.list({ limit: 2, status: ["draft", "in_progress", "paused"] });
    const milestoneRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "milestones").map((result) => milestonesApi.get(result.id)))
      : await milestonesApi.list({ limit: 2, status: ["planned", "active"] });
    const blockerRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "blockers").map((result) => blockersApi.get(result.id)))
      : await blockersApi.list({ limit: 2, status: "active" });
    const artifactRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "artifacts").map((result) => artifactsApi.get(result.id)))
      : await artifactsApi.list({ limit: 2 });
    const decisionRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "decisions").map((result) => decisionsApi.get(result.id)))
      : await decisionsApi.list({ limit: 2, status: ["proposed", "accepted"] });
    const workSessionRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "work_sessions").map((result) => workSessionsApi.get(result.id)))
      : await workSessionsApi.list({ limit: 1, status: "active" });
    const assignmentRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "assignments").map((result) => assignmentsApi.get(result.id)))
      : await assignmentsApi.list({ limit: 3, status: ["proposed", "accepted"] });
    const handoffRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "handoffs").map((result) => handoffsApi.get(result.id)))
      : await handoffsApi.list({ limit: 3, status: ["proposed", "accepted", "returned"] });
    const approvalRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "approvals").map((result) => approvalsApi.get(result.id)))
      : await approvalsApi.list({ limit: 3, status: "pending" });
    const capacityRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "capacity").map((result) => capacityApi.get(result.id)))
      : await capacityApi.list({ limit: 3 });
    const reminderRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "reminders").map((result) => remindersApi.get(result.id)))
      : await remindersApi.list({ limit: 2, status: ["active", "paused"] });
    const deadlineRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "deadlines").map((result) => deadlinesApi.get(result.id)))
      : await deadlinesApi.list({ limit: 2, status: ["active", "paused"] });

    const noteRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "notes").map((result) => notesApi.get(result.id)))
      : (await notesApi.list({ limit: 2 })).slice(0, 2);

    const inboxThreads = queryText
      ? await Promise.all(results.filter((result) => result.domain === "inbox").map((result) => inboxApi.getThread(result.id)))
      : await inboxApi.list({ unreadOnly: true, limit: 3 });

    const eventRecords = queryText
      ? await Promise.all(results.filter((result) => result.domain === "events").map((result) => eventsApi.get(result.id)))
      : await eventsApi.list({ upcomingOnly: true, limit: 3 });

    const linkedPeopleIds = uniqueStrings([
      ...areaRecords.flatMap((area) => area ? [area.ownerPersonId] : []),
      ...taskRecords.flatMap((task) => task ? [task.assigneePersonId, ...task.watcherPersonIds] : []),
      ...goalRecords.flatMap((goal) => goal ? [goal.ownerPersonId] : []),
      ...projectRecords.flatMap((project) => project ? [project.ownerPersonId] : []),
      ...blockerRecords.flatMap((blocker) => blocker ? [blocker.ownerPersonId] : []),
      ...decisionRecords.flatMap((decision) => decision ? [decision.ownerPersonId] : []),
      ...inboxThreads.flatMap((thread) => thread?.participantPersonIds ?? []),
      ...eventRecords.flatMap((event) => event?.attendeePersonIds ?? []),
    ]);
    const peopleRecords = await Promise.all(linkedPeopleIds.map((id) => peopleApi.get(id)));

    const blocks: PromptContextBlock[] = [];
    const filteredAreas = areaRecords.filter((area): area is AreaRecord => Boolean(area)).filter((area) => request.includeDoneTasks || area.status !== "archived");
    const filteredTasks = taskRecords.filter((task): task is TaskRecord => Boolean(task)).filter((task) => request.includeDoneTasks || task.status !== "done");
    const filteredGoals = goalRecords.filter((goal): goal is GoalRecord => Boolean(goal)).filter((goal) => request.includeDoneTasks || goal.status !== "done");
    const filteredProjects = projectRecords.filter((project): project is ProjectRecord => Boolean(project)).filter((project) => request.includeDoneTasks || project.status !== "done");
    const filteredMilestones = milestoneRecords.filter((milestone): milestone is MilestoneRecord => Boolean(milestone)).filter((milestone) => request.includeDoneTasks || milestone.status !== "done");
    const filteredBlockers = blockerRecords.filter((blocker): blocker is BlockerRecord => Boolean(blocker)).filter((blocker) => request.includeDoneTasks || blocker.status === "active");
    const filteredArtifacts = artifactRecords.filter((artifact): artifact is ArtifactRecord => Boolean(artifact));
    const filteredDecisions = decisionRecords.filter((decision): decision is DecisionRecord => Boolean(decision)).filter((decision) => request.includeDoneTasks || decision.status !== "rejected");
    const filteredWorkSessions = workSessionRecords.filter((session): session is WorkSessionRecord => Boolean(session)).filter((session) => request.includeDoneTasks || session.status === "active");
    const filteredAssignments = assignmentRecords.filter((assignment): assignment is AssignmentRecord => Boolean(assignment)).filter((assignment) => request.includeDoneTasks || assignment.status !== "completed");
    const filteredHandoffs = handoffRecords.filter((handoff): handoff is HandoffRecord => Boolean(handoff)).filter((handoff) => request.includeDoneTasks || handoff.status !== "completed");
    const filteredApprovals = approvalRecords.filter((approval): approval is ProductivityApprovalRecord => Boolean(approval)).filter((approval) => request.includeDoneTasks || approval.status === "pending");
    const filteredCapacity = capacityRecords.filter((snapshot): snapshot is CapacityRecord => Boolean(snapshot));
    const filteredReminders = reminderRecords.filter((reminder): reminder is ReminderRecord => Boolean(reminder)).filter((reminder) => request.includeDoneTasks || reminder.status !== "done");
    const filteredDeadlines = deadlineRecords.filter((deadline): deadline is DeadlineRecord => Boolean(deadline)).filter((deadline) => request.includeDoneTasks || deadline.status !== "done");
    const filteredNotes = noteRecords.filter((note): note is NoteRecord => Boolean(note));
    const filteredThreads = inboxThreads.filter((thread): thread is InboxThreadRecord => Boolean(thread));
    const filteredEvents = eventRecords.filter((event): event is EventRecord => Boolean(event));
    const filteredPeople = peopleRecords.filter((person): person is PersonRecord => Boolean(person));

    if (filteredAreas.length > 0) {
      blocks.push({
        id: "workspace-areas",
        title: "Relevant areas",
        content: filteredAreas.map((area) => `- [${area.status}] ${area.name}`).join("\n"),
      });
    }
    if (filteredTasks.length > 0) {
      blocks.push({
        id: "workspace-tasks",
        title: "Relevant tasks",
        content: filteredTasks.map((task) => `- [${task.status}] ${task.title}${task.dueAt ? ` (due ${task.dueAt})` : ""}`).join("\n"),
      });
    }
    if (filteredGoals.length > 0) {
      blocks.push({
        id: "workspace-goals",
        title: "Relevant goals",
        content: filteredGoals.map((goal) => `- [${goal.status}] ${goal.title}`).join("\n"),
      });
    }
    if (filteredProjects.length > 0) {
      blocks.push({
        id: "workspace-projects",
        title: "Relevant projects",
        content: filteredProjects.map((project) => `- [${project.status}] ${project.name}`).join("\n"),
      });
    }
    if (filteredMilestones.length > 0) {
      blocks.push({
        id: "workspace-milestones",
        title: "Relevant milestones",
        content: filteredMilestones.map((milestone) => `- [${milestone.status}] ${milestone.title}${milestone.targetDate ? ` (${milestone.targetDate})` : ""}`).join("\n"),
      });
    }
    if (filteredBlockers.length > 0) {
      blocks.push({
        id: "workspace-blockers",
        title: "Active blockers",
        content: filteredBlockers.map((blocker) => `- [${blocker.kind}] ${blocker.title}`).join("\n"),
      });
    }
    if (filteredDecisions.length > 0) {
      blocks.push({
        id: "workspace-decisions",
        title: "Recent decisions",
        content: filteredDecisions.map((decision) => `- [${decision.status}] ${decision.title}`).join("\n"),
      });
    }
    if (filteredWorkSessions.length > 0) {
      blocks.push({
        id: "workspace-work-sessions",
        title: "Active focus sessions",
        content: filteredWorkSessions.map((session) => `- [${session.status}] ${session.title}${session.objective ? `: ${session.objective}` : ""}`).join("\n"),
      });
    }
    if (filteredAssignments.length > 0) {
      blocks.push({
        id: "workspace-assignments",
        title: "Assignments",
        content: filteredAssignments.map((assignment) => `- [${assignment.status}] ${assignment.title} -> ${assignment.assignedToAgentId}`).join("\n"),
      });
    }
    if (filteredHandoffs.length > 0) {
      blocks.push({
        id: "workspace-handoffs",
        title: "Active handoffs",
        content: filteredHandoffs.map((handoff) => `- [${handoff.status}] ${handoff.title} (${handoff.fromAgentId} -> ${handoff.toAgentId})`).join("\n"),
      });
    }
    if (filteredApprovals.length > 0) {
      blocks.push({
        id: "workspace-approvals",
        title: "Pending approvals",
        content: filteredApprovals.map((approval) => `- [${approval.status}] ${approval.title} (${approval.kind})`).join("\n"),
      });
    }
    if (filteredCapacity.length > 0) {
      blocks.push({
        id: "workspace-capacity",
        title: "Team capacity",
        content: filteredCapacity.map((snapshot) => `- [${snapshot.status}] ${snapshot.title} wip=${snapshot.currentWip}/${snapshot.maxWip ?? "?"} queue=${snapshot.queueDepth}`).join("\n"),
      });
    }
    if (filteredReminders.length > 0) {
      blocks.push({
        id: "workspace-reminders",
        title: "Active reminders",
        content: filteredReminders.map((reminder) => `- [${reminder.status}] ${reminder.title} at ${reminder.triggerAt}`).join("\n"),
      });
    }
    if (filteredDeadlines.length > 0) {
      blocks.push({
        id: "workspace-deadlines",
        title: "Active deadlines",
        content: filteredDeadlines.map((deadline) => `- [${deadline.status}] ${deadline.title} due ${deadline.dueAt}`).join("\n"),
      });
    }
    if (filteredNotes.length > 0) {
      blocks.push({
        id: "workspace-notes",
        title: "Relevant notes",
        content: filteredNotes.map((note) => `- ${note.title}: ${summarizeSnippet(note.searchText, 160)}`).join("\n"),
      });
    }
    if (filteredThreads.length > 0) {
      blocks.push({
        id: "workspace-inbox",
        title: "Inbox context",
        content: filteredThreads.map((thread) => `- [${thread.status}] ${thread.subject || thread.id}: ${thread.preview || ""}`).join("\n"),
      });
    }
    if (filteredEvents.length > 0) {
      blocks.push({
        id: "workspace-events",
        title: "Upcoming events",
        content: filteredEvents.map((event) => `- ${event.title} at ${event.startsAt}${event.location ? ` (${event.location})` : ""}`).join("\n"),
      });
    }
    if (filteredArtifacts.length > 0) {
      blocks.push({
        id: "workspace-artifacts",
        title: "Recent evidence",
        content: filteredArtifacts.map((artifact) => `- [${artifact.kind}] ${artifact.title}${artifact.summary ? `: ${artifact.summary}` : ""}`).join("\n"),
      });
    }
    if (filteredPeople.length > 0) {
      blocks.push({
        id: "workspace-people",
        title: "Linked people",
        content: filteredPeople.map((person) => `- ${person.displayName}${person.role ? `, ${person.role}` : ""}`).join("\n"),
      });
    }

    appendAudit("workspace.context.built", "workspace_context", {
      query: queryText || "",
      blockCount: blocks.length,
      resultCount: results.length,
    });

    return {
      request,
      generatedAt: nowIso(),
      blocks,
      results,
    };
  }

  return buildContext;
}
