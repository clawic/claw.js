// @ts-nocheck
import fs from "fs";
import path from "path";

import type {
  ActivityEntryRecord,
  AgentRecord,
  BlockerRecord,
  CapacityRecord,
  DecisionRecord,
  DeadlineRecord,
  EventRecord,
  FeedbackRecord,
  GoalRecord,
  IncidentRecord,
  MilestoneRecord,
  OperationalCheckRecord,
  ProductivityApprovalRecord,
  ProjectRecord,
  ReleaseRecord,
  ReminderRecord,
  TaskRecord,
  TemporalItem,
  WorkSessionRecord,
} from "@clawjs/core";
import type {
  ProductivityAgenda,
  ProductivityMyWork,
  ProductivityOperationsAgent,
  ProductivityOperationsCockpit,
  ProductivityReview,
  ProductivityTeamWork,
  ProductivityTimeline,
  ProductivityTimelineCycleItem,
  ProductivityTimelineDeadlineItem,
  ProductivityTimelineDependencyState,
  ProductivityTimelineInput,
  ProductivityTimelineMilestoneItem,
  ProductivityTimelineNow,
  ProductivityTimelineProjectGroup,
  ProductivityTimelineTaskItem,
  WorkspaceClawInstance,
} from "./workspace-contracts.ts";
import { removeUndefined } from "./workspace-utils.ts";

export function createWorkspaceProductivityFacades(locals: Record<string, any>): {
  agendaApi: WorkspaceClawInstance["agenda"];
  reviewApi: WorkspaceClawInstance["review"];
  productivityApi: WorkspaceClawInstance["productivity"];
} {
  const { nowIso, isOverdue, toTimestamp, timelineOverlaps, minIso, maxIso, temporalToEventRecord, temporalStatusToProductivityStatus, data, workspaceDir, readMeta, writeMeta, rebuildIndexes, PRODUCTIVITY_SCHEMA_VERSION, PRODUCTIVITY_SCHEMA_HASH, areasCollection, listsCollection, sectionsCollection, tasksCollection, goalsCollection, projectsCollection, commentsCollection, attachmentsCollection, savedViewsCollection, recurrencesCollection, cyclesCollection, epicsCollection, customFieldsCollection, fieldValuesCollection, templatesCollection, milestonesCollection, activityCollection, blockersCollection, artifactsCollection, decisionsCollection, workSessionsCollection, assignmentsCollection, handoffsCollection, approvalsCollection, capacityCollection, agentsCollection, releasesCollection, incidentsCollection, feedbackCollection, checksCollection, notesCollection, peopleCollection, inboxThreadsCollection, inboxMessagesCollection, eventsCollection, remindersCollection, deadlinesCollection, indexCollection, embeddingCollection, workSessionsApi, tasksApi, eventsApi, remindersApi, deadlinesApi, inboxApi, blockersApi, decisionsApi, assignmentsApi, handoffsApi, approvalsApi, capacityApi, agentsApi, releasesApi, incidentsApi, feedbackApi, checksApi, projectsApi, milestonesApi, goalsApi, areasApi, activityApi, notesApi, peopleApi, artifactsApi, useTimeService, claw } = locals;
  const agendaApi: WorkspaceClawInstance["agenda"] = {
    list: async (input = {}) => {
      const start = input.start ?? new Date().toISOString();
      const end = input.end ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const tasks = await tasksApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER });
      const milestones = await milestonesApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER });
      const reminders = await remindersApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER });
      const deadlines = await deadlinesApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER });
      const events = await eventsApi.list({ includeArchived: false, upcomingOnly: true, limit: Number.MAX_SAFE_INTEGER });
      const temporalItems = useTimeService ? (await claw.time.list()).items : [];

      const items: ProductivityAgenda["items"] = [
        ...tasks
          .filter((task) => Boolean(task.dueAt) && task.dueAt! <= end && (input.includeCompleted || task.status !== "done"))
          .map((task) => ({
            domain: "tasks" as const,
            id: task.id,
            title: task.title,
            when: task.dueAt as string,
            status: task.status,
            overdue: isOverdue(task.dueAt, start),
            ...(task.areaId ? { areaId: task.areaId } : {}),
            ...(task.projectId ? { projectId: task.projectId } : {}),
            ...(task.goalId ? { goalId: task.goalId } : {}),
            taskId: task.id,
          })),
        ...milestones
          .filter((milestone) => Boolean(milestone.targetDate) && milestone.targetDate! <= end && (input.includeCompleted || milestone.status !== "done"))
          .map((milestone) => ({
            domain: "milestones" as const,
            id: milestone.id,
            title: milestone.title,
            when: milestone.targetDate as string,
            status: milestone.status,
            overdue: isOverdue(milestone.targetDate, start),
            ...(milestone.areaId ? { areaId: milestone.areaId } : {}),
            ...(milestone.projectId ? { projectId: milestone.projectId } : {}),
            ...(milestone.goalId ? { goalId: milestone.goalId } : {}),
            milestoneId: milestone.id,
          })),
        ...reminders
          .filter((reminder) => reminder.triggerAt >= start && reminder.triggerAt <= end && (input.includeCompleted || reminder.status !== "done"))
          .map((reminder) => ({
            domain: "reminders" as const,
            id: reminder.id,
            title: reminder.title,
            when: reminder.triggerAt,
            status: reminder.status,
            overdue: isOverdue(reminder.triggerAt, start),
            ...(reminder.anchorType === "task" && reminder.anchorId ? { taskId: reminder.anchorId } : {}),
          })),
        ...deadlines
          .filter((deadline) => deadline.dueAt >= start && deadline.dueAt <= end && (input.includeCompleted || deadline.status !== "done"))
          .map((deadline) => ({
            domain: "deadlines" as const,
            id: deadline.id,
            title: deadline.title,
            when: deadline.dueAt,
            status: deadline.status,
            overdue: isOverdue(deadline.dueAt, start),
            ...(deadline.anchorType === "project" && deadline.anchorId ? { projectId: deadline.anchorId } : {}),
            ...(deadline.anchorType === "goal" && deadline.anchorId ? { goalId: deadline.anchorId } : {}),
            ...(deadline.anchorType === "task" && deadline.anchorId ? { taskId: deadline.anchorId } : {}),
          })),
        ...events
          .filter((event) => event.startsAt >= start && event.startsAt <= end)
          .map((event) => ({
            domain: "events" as const,
            id: event.id,
            title: event.title,
            when: event.startsAt,
            status: "scheduled",
            overdue: isOverdue(event.startsAt, start),
          })),
        ...temporalItems
          .filter((item) => (item.kind === "routine" || item.kind === "follow_up") && item.nextRunAt && item.nextRunAt >= start && item.nextRunAt <= end)
          .map((item) => ({
            domain: "activity" as const,
            id: item.id,
            title: item.title,
            when: item.nextRunAt as string,
            status: item.status,
            overdue: isOverdue(item.nextRunAt, start),
            ...(item.projectId ? { projectId: item.projectId } : {}),
          })),
      ].sort((left, right) => left.when.localeCompare(right.when));

      const today = start.slice(0, 10);
      return {
        start,
        end,
        generatedAt: nowIso(),
        items,
        summary: {
          overdue: items.filter((item) => item.overdue).length,
          dueToday: items.filter((item) => item.when.startsWith(today)).length,
          upcoming: items.length,
        },
      };
    },
  };

  async function buildReview(cadence: "daily" | "weekly"): Promise<ProductivityReview> {
    const horizon = cadence === "daily" ? 1 : 7;
    const end = new Date(Date.now() + horizon * 24 * 60 * 60 * 1000).toISOString();
    const [blockedTasks, overdueTasks, activeGoals, activeProjects, pendingMilestones, unreadThreads, dueDeadlines, pendingReminders, upcomingEvents, activeBlockers, pendingDecisions, activeWorkSessions] = await Promise.all([
      tasksApi.list({ blocked: true, includeArchived: false, limit: 20 }),
      tasksApi.list({ overdue: true, includeArchived: false, limit: 20 }),
      goalsApi.list({ status: ["active", "paused"], includeArchived: false, limit: 20 }),
      projectsApi.list({ status: ["draft", "in_progress", "paused"], includeArchived: false, limit: 20 }),
      milestonesApi.list({ status: ["planned", "active"], includeArchived: false, limit: 20 }),
      inboxApi.list({ unreadOnly: true, includeArchived: false, limit: 20 }),
      deadlinesApi.list({ before: end, includeArchived: false, limit: 20 }),
      remindersApi.list({ before: end, includeArchived: false, limit: 20 }),
      eventsApi.list({ upcomingOnly: true, includeArchived: false, limit: 20 }),
      blockersApi.list({ status: "active", includeArchived: false, limit: 20 }),
      decisionsApi.list({ status: ["proposed", "accepted"], includeArchived: false, limit: 20 }),
      workSessionsApi.list({ status: "active", includeArchived: false, limit: 20 }),
    ]);

    return {
      cadence,
      generatedAt: nowIso(),
      summary: {
        blockedTasks: blockedTasks.length,
        overdueTasks: overdueTasks.length,
        activeGoals: activeGoals.length,
        activeProjects: activeProjects.length,
        pendingMilestones: pendingMilestones.length,
        unreadThreads: unreadThreads.length,
        dueDeadlines: dueDeadlines.length,
        pendingReminders: pendingReminders.length,
        upcomingEvents: upcomingEvents.length,
        activeBlockers: activeBlockers.length,
        pendingDecisions: pendingDecisions.length,
        activeWorkSessions: activeWorkSessions.length,
      },
      blockedTasks,
      overdueTasks,
      activeGoals,
      activeProjects,
      pendingMilestones,
      unreadThreads,
      dueDeadlines,
      pendingReminders,
      upcomingEvents,
      activeBlockers,
      pendingDecisions,
      activeWorkSessions,
    };
  }

  const reviewApi: WorkspaceClawInstance["review"] = {
    daily: async () => buildReview("daily"),
    weekly: async () => buildReview("weekly"),
  };

  async function buildProductivityTimeline(input: ProductivityTimelineInput): Promise<ProductivityTimeline> {
    const start = input.start;
    const end = input.end;
    if (!start || !end || toTimestamp(start) > toTimestamp(end)) {
      throw new Error("Timeline requires a valid start and end range.");
    }

    const [projects, goals, tasks, milestones, deadlines, cycles] = await Promise.all([
      projectsApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER }),
      goalsApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER }),
      tasksApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER }),
      milestonesApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER }),
      deadlinesApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER }),
      cyclesApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER }),
    ]);
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const goalMap = new Map(goals.map((goal) => [goal.id, goal]));
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    const doneTaskIds = new Set(tasks.filter((task) => task.status === "done").map((task) => task.id));
    const groupMap = new Map<string, ProductivityTimelineProjectGroup>();
    const groupKey = (projectId?: string) => projectId ?? "__unassigned";
    const ensureGroup = (projectId?: string) => {
      const key = groupKey(projectId);
      const existing = groupMap.get(key);
      if (existing) return existing;
      const group: ProductivityTimelineProjectGroup = {
        ...(projectId ? { projectId } : {}),
        title: projectId ? projectMap.get(projectId)?.name ?? projectId : "Unassigned",
        tasks: [],
        milestones: [],
        deadlines: [],
        cycles: [],
      };
      groupMap.set(key, group);
      return group;
    };
    const projectForDeadline = (deadline: DeadlineRecord): string | undefined => {
      if (deadline.anchorType === "project") return deadline.anchorId;
      if (deadline.anchorType === "task" && deadline.anchorId) return taskMap.get(deadline.anchorId)?.projectId;
      if (deadline.anchorType === "goal" && deadline.anchorId) return goalMap.get(deadline.anchorId)?.projectId;
      return undefined;
    };
    const taskTimelineDate = (task: TaskRecord): { value: string; source: ProductivityTimelineTaskItem["startSource"] } | null => {
      if (task.startAt) return { value: task.startAt, source: "startAt" };
      if (task.deferUntil) return { value: task.deferUntil, source: "deferUntil" };
      if (task.dueAt) return { value: task.dueAt, source: "dueAt" };
      if (task.deadlineAt) return { value: task.deadlineAt, source: "deadlineAt" };
      return null;
    };

    const timelineTasks = tasks
      .filter((task) => !input.projectId || task.projectId === input.projectId)
      .filter((task) => input.includeDone || (task.status !== "done" && task.status !== "cancelled"))
      .flatMap((task): ProductivityTimelineTaskItem[] => {
        const startDate = taskTimelineDate(task);
        if (!startDate) return [];
        const endValue = task.dueAt ?? task.deadlineAt ?? startDate.value;
        if (!timelineOverlaps(startDate.value, endValue, start, end)) return [];
        const blockedByIds = task.dependsOnTaskIds.filter((taskId) => !doneTaskIds.has(taskId));
        const dependencyState: ProductivityTimelineDependencyState = {
          ready: blockedByIds.length === 0 && task.status !== "blocked",
          total: task.dependsOnTaskIds.length,
          completed: task.dependsOnTaskIds.length - blockedByIds.length,
          blockedByIds,
        };
        return [{
          kind: "task",
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          ...(task.projectId ? { projectId: task.projectId } : {}),
          ...(task.goalId ? { goalId: task.goalId } : {}),
          ...(task.cycleId ? { cycleId: task.cycleId } : {}),
          ...(task.epicId ? { epicId: task.epicId } : {}),
          start: startDate.value,
          end: endValue,
          startSource: startDate.source,
          endSource: task.dueAt ? "dueAt" : task.deadlineAt ? "deadlineAt" : "start",
          dependencyState,
        }];
      });

    const timelineMilestones = milestones
      .filter((milestone) => Boolean(milestone.targetDate))
      .filter((milestone) => !input.projectId || milestone.projectId === input.projectId)
      .filter((milestone) => input.includeDone || milestone.status !== "done")
      .filter((milestone) => milestone.targetDate! >= start && milestone.targetDate! <= end)
      .map((milestone): ProductivityTimelineMilestoneItem => ({
        kind: "milestone",
        id: milestone.id,
        title: milestone.title,
        status: milestone.status,
        ...(milestone.projectId ? { projectId: milestone.projectId } : {}),
        ...(milestone.goalId ? { goalId: milestone.goalId } : {}),
        date: milestone.targetDate!,
      }));

    const timelineDeadlines = deadlines
      .map((deadline) => ({ deadline, projectId: projectForDeadline(deadline) }))
      .filter(({ projectId }) => !input.projectId || projectId === input.projectId)
      .filter(({ deadline }) => input.includeDone || deadline.status !== "done")
      .filter(({ deadline }) => deadline.dueAt >= start && deadline.dueAt <= end)
      .map(({ deadline, projectId }): ProductivityTimelineDeadlineItem => ({
        kind: "deadline",
        id: deadline.id,
        title: deadline.title,
        status: deadline.status,
        ...(deadline.anchorType ? { anchorType: deadline.anchorType } : {}),
        ...(deadline.anchorId ? { anchorId: deadline.anchorId } : {}),
        ...(projectId ? { projectId } : {}),
        date: deadline.dueAt,
      }));
    const taskDeadlineItems = tasks
      .filter((task) => !input.projectId || task.projectId === input.projectId)
      .filter((task) => input.includeDone || (task.status !== "done" && task.status !== "cancelled"))
      .flatMap((task): ProductivityTimelineDeadlineItem[] => {
        const taskDates = [
          task.dueAt ? { id: `${task.id}:due`, title: `${task.title} due`, date: task.dueAt } : null,
          task.deadlineAt && task.deadlineAt !== task.dueAt ? { id: `${task.id}:deadline`, title: `${task.title} deadline`, date: task.deadlineAt } : null,
        ].filter((item): item is { id: string; title: string; date: string } => Boolean(item));
        return taskDates
          .filter((item) => item.date >= start && item.date <= end)
          .map((item) => ({
            kind: "deadline" as const,
            id: item.id,
            title: item.title,
            status: task.status === "done" ? "done" : "active",
            anchorType: "task" as const,
            anchorId: task.id,
            ...(task.projectId ? { projectId: task.projectId } : {}),
            date: item.date,
          }));
      });
    timelineDeadlines.push(...taskDeadlineItems);

    const timelineCycles = cycles
      .filter((cycle) => Boolean(cycle.startsAt || cycle.endsAt))
      .filter((cycle) => !input.projectId || cycle.projectId === input.projectId)
      .filter((cycle) => input.includeDone || (cycle.status !== "completed" && cycle.status !== "archived"))
      .flatMap((cycle): ProductivityTimelineCycleItem[] => {
        const cycleStart = cycle.startsAt ?? cycle.endsAt!;
        const cycleEnd = cycle.endsAt ?? cycle.startsAt!;
        if (!timelineOverlaps(cycleStart, cycleEnd, start, end)) return [];
        return [{
          kind: "cycle",
          id: cycle.id,
          name: cycle.name,
          status: cycle.status,
          ...(cycle.projectId ? { projectId: cycle.projectId } : {}),
          ...(cycle.goalId ? { goalId: cycle.goalId } : {}),
          start: cycleStart,
          end: cycleEnd,
          ...(cycle.capacityPoints !== undefined ? { capacityPoints: cycle.capacityPoints } : {}),
        }];
      });

    for (const task of timelineTasks) ensureGroup(task.projectId).tasks.push(task);
    for (const milestone of timelineMilestones) ensureGroup(milestone.projectId).milestones.push(milestone);
    for (const deadline of timelineDeadlines) ensureGroup(deadline.projectId).deadlines.push(deadline);
    for (const cycle of timelineCycles) ensureGroup(cycle.projectId).cycles.push(cycle);
    const groups = [...groupMap.values()].map((group) => {
      const starts = [
        ...group.tasks.map((task) => task.start),
        ...group.milestones.map((milestone) => milestone.date),
        ...group.deadlines.map((deadline) => deadline.date),
        ...group.cycles.map((cycle) => cycle.start),
      ];
      const ends = [
        ...group.tasks.map((task) => task.end),
        ...group.milestones.map((milestone) => milestone.date),
        ...group.deadlines.map((deadline) => deadline.date),
        ...group.cycles.map((cycle) => cycle.end),
      ];
      return {
        ...group,
        start: minIso(starts),
        end: maxIso(ends),
        tasks: group.tasks.sort((left, right) => left.start.localeCompare(right.start) || left.title.localeCompare(right.title)),
        milestones: group.milestones.sort((left, right) => left.date.localeCompare(right.date)),
        deadlines: group.deadlines.sort((left, right) => left.date.localeCompare(right.date)),
        cycles: group.cycles.sort((left, right) => left.start.localeCompare(right.start)),
      };
    }).sort((left, right) => (left.start ?? "").localeCompare(right.start ?? "") || left.title.localeCompare(right.title));

    const generatedAt = nowIso();
    const openTimelineTasks = tasks
      .filter((task) => !input.projectId || task.projectId === input.projectId)
      .filter((task) => task.status !== "done" && task.status !== "cancelled")
      .flatMap((task) => {
        const startDate = taskTimelineDate(task)
          ?? (task.status === "in_progress" || task.labels.includes("today") ? { value: generatedAt, source: "startAt" as const } : null);
        if (!startDate) return [];
        const blockedByIds = task.dependsOnTaskIds.filter((taskId) => !doneTaskIds.has(taskId));
        return [{
          kind: "task" as const,
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          ...(task.projectId ? { projectId: task.projectId } : {}),
          ...(task.goalId ? { goalId: task.goalId } : {}),
          ...(task.cycleId ? { cycleId: task.cycleId } : {}),
          ...(task.epicId ? { epicId: task.epicId } : {}),
          start: startDate.value,
          end: task.dueAt ?? task.deadlineAt ?? startDate.value,
          startSource: startDate.source,
          endSource: task.dueAt ? "dueAt" as const : task.deadlineAt ? "deadlineAt" as const : "start" as const,
          dependencyState: {
            ready: blockedByIds.length === 0 && task.status !== "blocked",
            total: task.dependsOnTaskIds.length,
            completed: task.dependsOnTaskIds.length - blockedByIds.length,
            blockedByIds,
          },
        }];
      });
    const readyTasks = openTimelineTasks
      .filter((task) => task.dependencyState.ready)
      .filter((task) => task.status === "in_progress" || task.start <= generatedAt || task.end <= end)
      .sort((left, right) => {
        const leftActive = left.status === "in_progress" ? 0 : 1;
        const rightActive = right.status === "in_progress" ? 0 : 1;
        return leftActive - rightActive || left.end.localeCompare(right.end) || left.start.localeCompare(right.start);
      });
    const blockedTasks = openTimelineTasks
      .filter((task) => !task.dependencyState.ready || task.status === "blocked")
      .sort((left, right) => left.end.localeCompare(right.end) || left.start.localeCompare(right.start));

    return {
      start,
      end,
      generatedAt,
      projects: groups,
      tasks: timelineTasks,
      milestones: timelineMilestones,
      deadlines: timelineDeadlines,
      cycles: timelineCycles,
      now: {
        ...(readyTasks[0] ? { primary: readyTasks[0] } : {}),
        readyTasks: readyTasks.slice(0, 10),
        blockedTasks: blockedTasks.slice(0, 10),
      },
    };
  }

  const productivityApi: WorkspaceClawInstance["productivity"] = {
    timeline: buildProductivityTimeline,
    myWork: async (input = {}) => {
      const limit = input.limit ?? 5;
      const [triageThreads, readyTasks, blockedTasks, activeBlockers, pendingDecisions, activeWorkSessions, recentArtifacts] = await Promise.all([
        inboxApi.list({ unreadOnly: true, includeArchived: false, limit }),
        tasksApi.list({ includeArchived: false, status: ["todo", "in_progress"], limit: Number.MAX_SAFE_INTEGER }),
        tasksApi.list({ includeArchived: false, blocked: true, limit }),
        blockersApi.list({ includeArchived: false, status: "active", limit }),
        decisionsApi.list({ includeArchived: false, status: ["proposed", "accepted"], limit }),
        workSessionsApi.list({ includeArchived: false, status: "active", limit: 1 }),
        artifactsApi.list({ includeArchived: false, limit }),
      ]);
      const activeWorkSession = activeWorkSessions[0] ?? null;
      const focusedTaskIds = new Set(activeWorkSession?.taskIds ?? []);
      const ready = readyTasks
        .filter((task) => task.status !== "blocked" && task.status !== "done" && task.status !== "cancelled")
        .filter((task) => task.blockedByIds.length === 0 && !task.blockedReason)
        .sort((left, right) => {
          const leftFocused = focusedTaskIds.has(left.id) ? 1 : 0;
          const rightFocused = focusedTaskIds.has(right.id) ? 1 : 0;
          return rightFocused - leftFocused || right.updatedAt.localeCompare(left.updatedAt);
        })
        .slice(0, limit);
      return {
        generatedAt: nowIso(),
        summary: {
          triageThreads: triageThreads.length,
          readyTasks: ready.length,
          blockedTasks: blockedTasks.length,
          activeBlockers: activeBlockers.length,
          pendingDecisions: pendingDecisions.length,
          activeWorkSessions: activeWorkSession ? 1 : 0,
          recentArtifacts: recentArtifacts.length,
        },
        triageThreads,
        readyTasks: ready,
        blockedTasks,
        activeBlockers,
        pendingDecisions,
        activeWorkSession,
        recentArtifacts,
      };
    },
    teamWork: async (input = {}) => {
      const limit = input.limit ?? 5;
      const [activeAssignments, pendingHandoffs, pendingApprovals, capacity] = await Promise.all([
        assignmentsApi.list({ includeArchived: false, status: ["proposed", "accepted"], limit }),
        handoffsApi.list({ includeArchived: false, status: ["proposed", "accepted", "returned"], limit }),
        approvalsApi.list({ includeArchived: false, status: "pending", limit }),
        capacityApi.list({ includeArchived: false, limit }),
      ]);
      const overloadedAgents = capacity.filter((snapshot) => snapshot.status === "overloaded").length;
      const agentsAtRisk = capacity.filter((snapshot) => snapshot.status === "limited" || snapshot.status === "overloaded").length;
      return {
        generatedAt: nowIso(),
        summary: {
          activeAssignments: activeAssignments.length,
          pendingHandoffs: pendingHandoffs.length,
          pendingApprovals: pendingApprovals.length,
          overloadedAgents,
          agentsAtRisk,
        },
        activeAssignments,
        pendingHandoffs,
        pendingApprovals,
        capacity,
      };
    },
    operationsCockpit: async (input = {}) => {
      const limit = input.limit ?? 5;
      const [activeGoals, activeProjects, releases, incidents, feedback, checks, agents, capacity, approvals] = await Promise.all([
        goalsApi.list({ includeArchived: false, status: "active", limit: Number.MAX_SAFE_INTEGER }),
        projectsApi.list({ includeArchived: false, status: ["draft", "in_progress", "paused"], limit: Number.MAX_SAFE_INTEGER }),
        releasesApi.list({ includeArchived: false, status: ["planned", "active", "at_risk"], limit }),
        incidentsApi.list({ includeArchived: false, status: ["open", "investigating", "mitigating"], limit }),
        feedbackApi.list({ includeArchived: false, status: ["new", "triaged", "planned"], limit }),
        checksApi.list({ includeArchived: false, status: ["pending", "failing"], limit }),
        agentsApi.list({ includeArchived: false, status: ["active", "limited"], limit }),
        capacityApi.list({ includeArchived: false, limit: Number.MAX_SAFE_INTEGER }),
        approvalsApi.list({ includeArchived: false, status: "pending", limit: Number.MAX_SAFE_INTEGER }),
      ]);
      const openIncidentsAll = await incidentsApi.list({ includeArchived: false, status: ["open", "investigating", "mitigating"], limit: Number.MAX_SAFE_INTEGER });
      const failingChecksAll = await checksApi.list({ includeArchived: false, status: "failing", limit: Number.MAX_SAFE_INTEGER });
      const activeReleasesAll = await releasesApi.list({ includeArchived: false, status: ["planned", "active", "at_risk"], limit: Number.MAX_SAFE_INTEGER });
      const newFeedbackAll = await feedbackApi.list({ includeArchived: false, status: "new", limit: Number.MAX_SAFE_INTEGER });
      const atRiskProjectIds = new Set<string>([
        ...projectsCollection.list().filter((project) => project.healthStatus === "yellow" || project.healthStatus === "red").map((project) => project.id),
        ...openIncidentsAll.map((incident) => incident.projectId).filter(Boolean) as string[],
        ...activeReleasesAll.filter((release) => release.status === "at_risk").map((release) => release.projectId).filter(Boolean) as string[],
      ]);
      const atRiskProjects = activeProjects
        .filter((project) => atRiskProjectIds.has(project.id))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, limit);
      const agentSnapshots: ProductivityOperationsAgent[] = agents.map((agent) => ({
        agent,
        capacity: capacity.find((snapshot) => snapshot.agentId === agent.id) ?? capacity.find((snapshot) => snapshot.agentId === agent.name) ?? null,
        openIncidentIds: openIncidentsAll.filter((incident) => incident.ownerAgentId === agent.id || incident.ownerAgentId === agent.name).map((incident) => incident.id),
        pendingApprovalIds: approvals.filter((approval) => approval.approverAgentId === agent.id || approval.approverAgentId === agent.name || approval.requestedByAgentId === agent.id || approval.requestedByAgentId === agent.name).map((approval) => approval.id),
        activeReleaseIds: activeReleasesAll.filter((release) => release.ownerAgentId === agent.id || release.ownerAgentId === agent.name).map((release) => release.id),
      }));
      return {
        generatedAt: nowIso(),
        summary: {
          activeGoals: activeGoals.length,
          activeProjects: activeProjects.length,
          activeReleases: activeReleasesAll.length,
          atRiskReleases: activeReleasesAll.filter((release) => release.status === "at_risk").length,
          openIncidents: openIncidentsAll.length,
          criticalIncidents: openIncidentsAll.filter((incident) => incident.severity === "sev1" || incident.severity === "sev2").length,
          failingChecks: failingChecksAll.length,
          newFeedback: newFeedbackAll.length,
          activeAgents: agents.length,
          approvalGatedAgents: agents.filter((agent) => agent.policyGate !== "none").length,
        },
        portfolio: {
          activeGoals: activeGoals.slice(0, limit),
          activeProjects: activeProjects.slice(0, limit),
          atRiskProjects,
        },
        releases,
        incidents,
        feedback,
        checks,
        agents: agentSnapshots,
      };
    },
    inspect: async () => {
      const timeItems = useTimeService ? (await claw.time.list()).items : [];
      const executions = useTimeService ? (await claw.time.listExecutions()).executions : [];
      return {
        schemaVersion: Number(readMeta("productivity_schema_version") ?? PRODUCTIVITY_SCHEMA_VERSION),
        schemaHash: PRODUCTIVITY_SCHEMA_HASH,
        dataPath: data.dbPath(),
        collectionCounts: {
          areas: areasCollection.listIds().length,
          lists: listsCollection.listIds().length,
          sections: sectionsCollection.listIds().length,
          tasks: tasksCollection.listIds().length,
          goals: goalsCollection.listIds().length,
          projects: projectsCollection.listIds().length,
          comments: commentsCollection.listIds().length,
          attachments: attachmentsCollection.listIds().length,
          saved_views: savedViewsCollection.listIds().length,
          recurrences: recurrencesCollection.listIds().length,
          cycles: cyclesCollection.listIds().length,
          epics: epicsCollection.listIds().length,
          custom_fields: customFieldsCollection.listIds().length,
          field_values: fieldValuesCollection.listIds().length,
          templates: templatesCollection.listIds().length,
          milestones: milestonesCollection.listIds().length,
          activity: activityCollection.listIds().length,
          blockers: blockersCollection.listIds().length,
          artifacts: artifactsCollection.listIds().length,
          decisions: decisionsCollection.listIds().length,
          work_sessions: workSessionsCollection.listIds().length,
          assignments: assignmentsCollection.listIds().length,
          handoffs: handoffsCollection.listIds().length,
          approvals: approvalsCollection.listIds().length,
          capacity: capacityCollection.listIds().length,
          agents: agentsCollection.listIds().length,
          releases: releasesCollection.listIds().length,
          incidents: incidentsCollection.listIds().length,
          feedback: feedbackCollection.listIds().length,
          checks: checksCollection.listIds().length,
          notes: notesCollection.listIds().length,
          people: peopleCollection.listIds().length,
          inbox_threads: inboxThreadsCollection.listIds().length,
          inbox_messages: inboxMessagesCollection.listIds().length,
          events: eventsCollection.listIds().length,
          reminders: remindersCollection.listIds().length,
          deadlines: deadlinesCollection.listIds().length,
        },
        indexCount: indexCollection.listIds().length,
        embeddingCount: embeddingCollection.listIds().length,
        time: {
          configured: useTimeService,
          itemCount: timeItems.length,
          executionCount: executions.length,
        },
      };
    },
    exportSnapshot: async () => {
      const timeItems = useTimeService ? (await claw.time.list()).items : [];
      return {
        schemaVersion: Number(readMeta("productivity_schema_version") ?? PRODUCTIVITY_SCHEMA_VERSION),
        schemaHash: PRODUCTIVITY_SCHEMA_HASH,
        exportedAt: nowIso(),
        collections: {
          areas: areasCollection.list(),
          lists: listsCollection.list(),
          sections: sectionsCollection.list(),
          tasks: tasksCollection.list(),
          goals: goalsCollection.list(),
          projects: projectsCollection.list(),
          comments: commentsCollection.list(),
          attachments: attachmentsCollection.list(),
          saved_views: savedViewsCollection.list(),
          recurrences: recurrencesCollection.list(),
          cycles: cyclesCollection.list(),
          epics: epicsCollection.list(),
          custom_fields: customFieldsCollection.list(),
          field_values: fieldValuesCollection.list(),
          templates: templatesCollection.list(),
          milestones: milestonesCollection.list(),
          activity: activityCollection.list(),
          blockers: blockersCollection.list(),
          artifacts: artifactsCollection.list(),
          decisions: decisionsCollection.list(),
          work_sessions: workSessionsCollection.list(),
          assignments: assignmentsCollection.list(),
          handoffs: handoffsCollection.list(),
          approvals: approvalsCollection.list(),
          capacity: capacityCollection.list(),
          agents: agentsCollection.list(),
          releases: releasesCollection.list(),
          incidents: incidentsCollection.list(),
          feedback: feedbackCollection.list(),
          checks: checksCollection.list(),
          notes: notesCollection.list(),
          people: peopleCollection.list(),
          inbox_threads: inboxThreadsCollection.list(),
          inbox_messages: inboxMessagesCollection.list(),
          events: eventsCollection.list(),
          reminders: remindersCollection.list(),
          deadlines: deadlinesCollection.list(),
        },
        temporalItems: timeItems,
      };
    },
    importSnapshot: async (input, options = {}) => {
      const snapshot = input as {
        collections?: Record<string, unknown[]>;
        temporalItems?: TemporalItem[];
      };
      const importedCollections: Record<string, number> = {};
      const writableCollections: Array<[string, ReturnType<typeof data.collection>]> = [
        ["areas", areasCollection],
        ["lists", listsCollection],
        ["sections", sectionsCollection],
        ["tasks", tasksCollection],
        ["goals", goalsCollection],
        ["projects", projectsCollection],
        ["comments", commentsCollection],
        ["attachments", attachmentsCollection],
        ["saved_views", savedViewsCollection],
        ["recurrences", recurrencesCollection],
        ["cycles", cyclesCollection],
        ["epics", epicsCollection],
        ["custom_fields", customFieldsCollection],
        ["field_values", fieldValuesCollection],
        ["templates", templatesCollection],
        ["milestones", milestonesCollection],
        ["activity", activityCollection],
        ["blockers", blockersCollection],
        ["artifacts", artifactsCollection],
        ["decisions", decisionsCollection],
        ["work_sessions", workSessionsCollection],
        ["assignments", assignmentsCollection],
        ["handoffs", handoffsCollection],
        ["approvals", approvalsCollection],
        ["capacity", capacityCollection],
        ["agents", agentsCollection],
        ["releases", releasesCollection],
        ["incidents", incidentsCollection],
        ["feedback", feedbackCollection],
        ["checks", checksCollection],
        ["notes", notesCollection],
        ["people", peopleCollection],
        ["inbox_threads", inboxThreadsCollection],
        ["inbox_messages", inboxMessagesCollection],
        ["events", eventsCollection],
        ["reminders", remindersCollection],
        ["deadlines", deadlinesCollection],
      ];

      if (snapshot.collections !== undefined && (!snapshot.collections || typeof snapshot.collections !== "object" || Array.isArray(snapshot.collections))) {
        throw new Error("Invalid productivity snapshot: collections must be an object.");
      }
      if (snapshot.temporalItems !== undefined && !Array.isArray(snapshot.temporalItems)) {
        throw new Error("Invalid productivity snapshot: temporalItems must be an array.");
      }

      const normalizedCollections = new Map<string, Array<{ id: string }>>();
      for (const [name] of writableCollections) {
        const rawRecords = snapshot.collections?.[name] ?? [];
        if (!Array.isArray(rawRecords)) {
          throw new Error(`Invalid productivity snapshot: collections.${name} must be an array.`);
        }
        const records: Array<{ id: string }> = [];
        for (const record of rawRecords) {
          if (!record || typeof record !== "object" || Array.isArray(record) || typeof (record as { id?: unknown }).id !== "string" || !(record as { id: string }).id.trim()) {
            throw new Error(`Invalid productivity snapshot: collections.${name} contains a record without a string id.`);
          }
          records.push({ ...(record as { id: string }) });
        }
        normalizedCollections.set(name, records);
      }

      if (options.replace) {
        for (const collection of [areasCollection, listsCollection, sectionsCollection, tasksCollection, goalsCollection, projectsCollection, commentsCollection, attachmentsCollection, savedViewsCollection, recurrencesCollection, cyclesCollection, epicsCollection, customFieldsCollection, fieldValuesCollection, templatesCollection, milestonesCollection, activityCollection, blockersCollection, artifactsCollection, decisionsCollection, workSessionsCollection, assignmentsCollection, handoffsCollection, approvalsCollection, capacityCollection, agentsCollection, releasesCollection, incidentsCollection, feedbackCollection, checksCollection, notesCollection, peopleCollection, inboxThreadsCollection, inboxMessagesCollection, eventsCollection, remindersCollection, deadlinesCollection, indexCollection, embeddingCollection]) {
          for (const id of collection.listIds()) collection.remove(id);
        }
        if (useTimeService) {
          for (const item of (await claw.time.list()).items) {
            await claw.time.delete(item.id);
          }
        }
      }

      for (const [name, collection] of writableCollections) {
        const records = normalizedCollections.get(name) ?? [];
        for (const record of records) {
          if (record?.id) collection.put(record.id, record);
        }
        importedCollections[name] = records.length;
      }

      let importedTemporalItems = 0;
      if (useTimeService) {
        for (const item of snapshot.temporalItems ?? []) {
          const existing = await claw.time.get(item.id).catch(() => null);
          if (!existing) {
            const created = await claw.time.create({
              id: item.id,
              kind: item.kind,
              title: item.title,
              description: item.description,
              location: item.location,
              startsAt: item.startsAt,
              endsAt: item.endsAt,
              dueAt: item.dueAt,
              participants: item.participants,
              actions: item.actions,
              projections: item.projections,
              ownerId: item.ownerId,
              workspaceId: item.workspaceId,
              projectId: item.projectId,
              agentId: item.agentId,
              sourceProvider: item.sourceProvider,
              anchorType: item.anchorType,
              anchorId: item.anchorId,
              schedule: item.schedule,
            });
            if (item.status !== created.item.status) {
              await claw.time.update(item.id, { status: item.status });
            }
          } else {
            await claw.time.update(item.id, {
              title: item.title,
              description: item.description,
              location: item.location,
              startsAt: item.startsAt,
              endsAt: item.endsAt,
              dueAt: item.dueAt,
              participants: item.participants,
              actions: item.actions,
              projections: item.projections,
              ownerId: item.ownerId,
              workspaceId: item.workspaceId,
              projectId: item.projectId,
              agentId: item.agentId,
              sourceProvider: item.sourceProvider,
              anchorType: item.anchorType,
              anchorId: item.anchorId,
              schedule: item.schedule,
              status: item.status,
            });
          }
          importedTemporalItems += 1;
        }
      }

      await rebuildIndexes();
      writeMeta("productivity_schema_version", String(PRODUCTIVITY_SCHEMA_VERSION));
      return { importedCollections, importedTemporalItems };
    },
    backup: async (targetDir) => {
      const absoluteTarget = path.resolve(workspaceDir, targetDir);
      fs.mkdirSync(absoluteTarget, { recursive: true });
      const dataRoot = path.dirname(data.dbPath());
      const files = fs.readdirSync(dataRoot)
        .filter((entry) => entry.endsWith(".sqlite") || entry.endsWith(".sqlite-wal") || entry.endsWith(".sqlite-shm"))
        .map((entry) => {
          const from = path.join(dataRoot, entry);
          const to = path.join(absoluteTarget, entry);
          fs.copyFileSync(from, to);
          return to;
        });
      return { files };
    },
    repair: async () => {
      let repairedRecords = 0;
      const areaIds = new Set(areasCollection.listIds());
      const taskIds = new Set(tasksCollection.listIds());
      const goalIds = new Set(goalsCollection.listIds());
      const projectIds = new Set(projectsCollection.listIds());
      const milestoneIds = new Set(milestonesCollection.listIds());
      const listIds = new Set(listsCollection.listIds());
      const sectionIds = new Set(sectionsCollection.listIds());
      const commentIds = new Set(commentsCollection.listIds());
      const attachmentIds = new Set(attachmentsCollection.listIds());
      const cycleIds = new Set(cyclesCollection.listIds());
      const epicIds = new Set(epicsCollection.listIds());
      const blockerIds = new Set(blockersCollection.listIds());
      const artifactIds = new Set(artifactsCollection.listIds());
      const decisionIds = new Set(decisionsCollection.listIds());
      const assignmentIds = new Set(assignmentsCollection.listIds());
      const handoffIds = new Set(handoffsCollection.listIds());
      const approvalIds = new Set(approvalsCollection.listIds());
      const personIds = new Set(peopleCollection.listIds());
      const noteIds = new Set(notesCollection.listIds());
      const pushMap = (map: Map<string, string[]>, key: string | undefined, value: string) => {
        if (!key) return;
        const current = map.get(key) ?? [];
        current.push(value);
        map.set(key, current);
      };
      const uniqueExisting = (values: string[], ids: Set<string>, additions?: string[]) => Array.from(new Set([
        ...values.filter((id) => ids.has(id)),
        ...(additions ?? []).filter((id) => ids.has(id)),
      ]));
      const taskBlockerIds = new Map<string, string[]>();
      const taskEvidenceIds = new Map<string, string[]>();
      const taskDecisionIds = new Map<string, string[]>();
      const taskAssignmentIds = new Map<string, string[]>();
      const taskHandoffIds = new Map<string, string[]>();
      const taskApprovalIds = new Map<string, string[]>();
      const projectMilestoneIds = new Map<string, string[]>();
      const handoffApprovalIds = new Map<string, string[]>();
      for (const blocker of blockersCollection.list()) {
        if (blocker.taskId && taskIds.has(blocker.taskId)) pushMap(taskBlockerIds, blocker.taskId, blocker.id);
      }
      for (const artifact of artifactsCollection.list()) {
        if (artifact.taskId && taskIds.has(artifact.taskId)) pushMap(taskEvidenceIds, artifact.taskId, artifact.id);
      }
      for (const decision of decisionsCollection.list()) {
        if (decision.taskId && taskIds.has(decision.taskId)) pushMap(taskDecisionIds, decision.taskId, decision.id);
      }
      for (const assignment of assignmentsCollection.list()) {
        if (assignment.taskId && taskIds.has(assignment.taskId)) pushMap(taskAssignmentIds, assignment.taskId, assignment.id);
      }
      for (const handoff of handoffsCollection.list()) {
        if (handoff.taskId && taskIds.has(handoff.taskId)) pushMap(taskHandoffIds, handoff.taskId, handoff.id);
      }
      for (const approval of approvalsCollection.list()) {
        if (approval.taskId && taskIds.has(approval.taskId)) pushMap(taskApprovalIds, approval.taskId, approval.id);
        if (approval.handoffId && handoffIds.has(approval.handoffId)) pushMap(handoffApprovalIds, approval.handoffId, approval.id);
      }
      for (const milestone of milestonesCollection.list()) {
        if (milestone.projectId && projectIds.has(milestone.projectId)) pushMap(projectMilestoneIds, milestone.projectId, milestone.id);
      }

      for (const task of tasksCollection.list()) {
        const repaired: TaskRecord = {
          ...task,
          ...(task.areaId && !areaIds.has(task.areaId) ? { areaId: undefined } : {}),
          ...(task.listId && !listIds.has(task.listId) ? { listId: undefined } : {}),
          ...(task.sectionId && !sectionIds.has(task.sectionId) ? { sectionId: undefined } : {}),
          ...(task.projectId && !projectIds.has(task.projectId) ? { projectId: undefined } : {}),
          ...(task.goalId && !goalIds.has(task.goalId) ? { goalId: undefined } : {}),
          ...(task.cycleId && !cycleIds.has(task.cycleId) ? { cycleId: undefined } : {}),
          ...(task.epicId && !epicIds.has(task.epicId) ? { epicId: undefined } : {}),
          ...(task.assigneePersonId && !personIds.has(task.assigneePersonId) ? { assigneePersonId: undefined } : {}),
          ...(task.reporterPersonId && !personIds.has(task.reporterPersonId) ? { reporterPersonId: undefined } : {}),
          watcherPersonIds: (task.watcherPersonIds ?? []).filter((id) => personIds.has(id)),
          childTaskIds: (task.childTaskIds ?? []).filter((id) => taskIds.has(id) && id !== task.id),
          dependsOnTaskIds: (task.dependsOnTaskIds ?? []).filter((id) => taskIds.has(id) && id !== task.id),
          commentIds: (task.commentIds ?? []).filter((id) => commentIds.has(id)),
          attachmentIds: (task.attachmentIds ?? []).filter((id) => attachmentIds.has(id)),
          blockedByIds: uniqueExisting(task.blockedByIds ?? [], blockerIds, taskBlockerIds.get(task.id)),
          evidenceIds: uniqueExisting(task.evidenceIds ?? [], artifactIds, taskEvidenceIds.get(task.id)),
          decisionIds: uniqueExisting(task.decisionIds ?? [], decisionIds, taskDecisionIds.get(task.id)),
          assignmentIds: uniqueExisting(task.assignmentIds ?? [], assignmentIds, taskAssignmentIds.get(task.id)),
          handoffIds: uniqueExisting(task.handoffIds ?? [], handoffIds, taskHandoffIds.get(task.id)),
          approvalIds: uniqueExisting(task.approvalIds ?? [], approvalIds, taskApprovalIds.get(task.id)),
        };
        if (JSON.stringify(repaired) !== JSON.stringify(task)) {
          tasksCollection.put(task.id, repaired);
          repairedRecords += 1;
        }
      }
      for (const goal of goalsCollection.list()) {
        const repaired: GoalRecord = {
          ...goal,
          ...(goal.areaId && !areaIds.has(goal.areaId) ? { areaId: undefined } : {}),
          ...(goal.projectId && !projectIds.has(goal.projectId) ? { projectId: undefined } : {}),
          ...(goal.parentGoalId && !goalIds.has(goal.parentGoalId) ? { parentGoalId: undefined, parentId: undefined } : {}),
          ...(goal.ownerPersonId && !personIds.has(goal.ownerPersonId) ? { ownerPersonId: undefined } : {}),
        };
        if (JSON.stringify(repaired) !== JSON.stringify(goal)) {
          goalsCollection.put(goal.id, repaired);
          repairedRecords += 1;
        }
      }
      for (const project of projectsCollection.list()) {
        const repaired: ProjectRecord = {
          ...project,
          ...(project.areaId && !areaIds.has(project.areaId) ? { areaId: undefined } : {}),
          ...(project.goalId && !goalIds.has(project.goalId) ? { goalId: undefined } : {}),
          ...(project.ownerPersonId && !personIds.has(project.ownerPersonId) ? { ownerPersonId: undefined } : {}),
          milestoneIds: uniqueExisting(project.milestoneIds ?? [], milestoneIds, projectMilestoneIds.get(project.id)),
          defaultSectionIds: uniqueExisting(project.defaultSectionIds ?? [], sectionIds),
        };
        if (JSON.stringify(repaired) !== JSON.stringify(project)) {
          projectsCollection.put(project.id, repaired);
          repairedRecords += 1;
        }
      }
      for (const milestone of milestonesCollection.list()) {
        const repaired: MilestoneRecord = {
          ...milestone,
          ...(milestone.areaId && !areaIds.has(milestone.areaId) ? { areaId: undefined } : {}),
          ...(milestone.projectId && !projectIds.has(milestone.projectId) ? { projectId: undefined } : {}),
          ...(milestone.goalId && !goalIds.has(milestone.goalId) ? { goalId: undefined } : {}),
        };
        if (JSON.stringify(repaired) !== JSON.stringify(milestone)) {
          milestonesCollection.put(milestone.id, repaired);
          repairedRecords += 1;
        }
      }
      for (const blocker of blockersCollection.list()) {
        const repaired: BlockerRecord = {
          ...blocker,
          ...(blocker.taskId && !taskIds.has(blocker.taskId) ? { taskId: undefined } : {}),
          ...(blocker.projectId && !projectIds.has(blocker.projectId) ? { projectId: undefined } : {}),
          ...(blocker.goalId && !goalIds.has(blocker.goalId) ? { goalId: undefined } : {}),
          ...(blocker.ownerPersonId && !personIds.has(blocker.ownerPersonId) ? { ownerPersonId: undefined } : {}),
          dependencyTaskIds: blocker.dependencyTaskIds.filter((id) => taskIds.has(id)),
          evidenceIds: blocker.evidenceIds.filter((id) => artifactIds.has(id)),
        };
        if (JSON.stringify(repaired) !== JSON.stringify(blocker)) {
          blockersCollection.put(blocker.id, repaired);
          repairedRecords += 1;
        }
      }
      for (const artifact of artifactsCollection.list()) {
        const repaired: ArtifactRecord = {
          ...artifact,
          ...(artifact.taskId && !taskIds.has(artifact.taskId) ? { taskId: undefined } : {}),
          ...(artifact.projectId && !projectIds.has(artifact.projectId) ? { projectId: undefined } : {}),
          ...(artifact.goalId && !goalIds.has(artifact.goalId) ? { goalId: undefined } : {}),
          ...(artifact.threadId && !inboxThreadsCollection.get(artifact.threadId) ? { threadId: undefined } : {}),
          ...(artifact.decisionId && !decisionIds.has(artifact.decisionId) ? { decisionId: undefined } : {}),
        };
        if (JSON.stringify(repaired) !== JSON.stringify(artifact)) {
          artifactsCollection.put(artifact.id, repaired);
          repairedRecords += 1;
        }
      }
      for (const decision of decisionsCollection.list()) {
        const repaired: DecisionRecord = {
          ...decision,
          ...(decision.taskId && !taskIds.has(decision.taskId) ? { taskId: undefined } : {}),
          ...(decision.projectId && !projectIds.has(decision.projectId) ? { projectId: undefined } : {}),
          ...(decision.goalId && !goalIds.has(decision.goalId) ? { goalId: undefined } : {}),
          ...(decision.ownerPersonId && !personIds.has(decision.ownerPersonId) ? { ownerPersonId: undefined } : {}),
          artifactIds: decision.artifactIds.filter((id) => artifactIds.has(id)),
        };
        if (JSON.stringify(repaired) !== JSON.stringify(decision)) {
          decisionsCollection.put(decision.id, repaired);
          repairedRecords += 1;
        }
      }
      for (const session of workSessionsCollection.list()) {
        const repaired: WorkSessionRecord = {
          ...session,
          taskIds: session.taskIds.filter((id) => taskIds.has(id)),
          blockerIds: session.blockerIds.filter((id) => blockerIds.has(id)),
        };
        if (JSON.stringify(repaired) !== JSON.stringify(session)) {
          workSessionsCollection.put(session.id, repaired);
          repairedRecords += 1;
        }
      }
      for (const assignment of assignmentsCollection.list()) {
        const repaired: AssignmentRecord = {
          ...assignment,
          ...(assignment.taskId && !taskIds.has(assignment.taskId) ? { taskId: undefined } : {}),
          ...(assignment.projectId && !projectIds.has(assignment.projectId) ? { projectId: undefined } : {}),
          ...(assignment.goalId && !goalIds.has(assignment.goalId) ? { goalId: undefined } : {}),
        };
        if (JSON.stringify(repaired) !== JSON.stringify(assignment)) {
          assignmentsCollection.put(assignment.id, repaired);
          repairedRecords += 1;
        }
      }
      for (const handoff of handoffsCollection.list()) {
        const derivedApprovalIds = handoffApprovalIds.get(handoff.id) ?? [];
        const approvalId = handoff.approvalId && approvalIds.has(handoff.approvalId)
          ? handoff.approvalId
          : derivedApprovalIds.length === 1
            ? derivedApprovalIds[0]
            : undefined;
        const repaired: HandoffRecord = {
          ...handoff,
          ...(handoff.taskId && !taskIds.has(handoff.taskId) ? { taskId: undefined } : {}),
          ...(handoff.projectId && !projectIds.has(handoff.projectId) ? { projectId: undefined } : {}),
          ...(handoff.goalId && !goalIds.has(handoff.goalId) ? { goalId: undefined } : {}),
          approvalId,
          artifactIds: handoff.artifactIds.filter((id) => artifactIds.has(id)),
          blockerIds: handoff.blockerIds.filter((id) => blockerIds.has(id)),
        };
        if (JSON.stringify(repaired) !== JSON.stringify(handoff)) {
          handoffsCollection.put(handoff.id, repaired);
          repairedRecords += 1;
        }
      }
      for (const approval of approvalsCollection.list()) {
        const repaired: ProductivityApprovalRecord = {
          ...approval,
          ...(approval.taskId && !taskIds.has(approval.taskId) ? { taskId: undefined } : {}),
          ...(approval.projectId && !projectIds.has(approval.projectId) ? { projectId: undefined } : {}),
          ...(approval.goalId && !goalIds.has(approval.goalId) ? { goalId: undefined } : {}),
          ...(approval.handoffId && !handoffIds.has(approval.handoffId) ? { handoffId: undefined } : {}),
          evidenceIds: approval.evidenceIds.filter((id) => artifactIds.has(id)),
          decisionIds: approval.decisionIds.filter((id) => decisionIds.has(id)),
        };
        if (JSON.stringify(repaired) !== JSON.stringify(approval)) {
          approvalsCollection.put(approval.id, repaired);
          repairedRecords += 1;
        }
      }
      for (const snapshot of capacityCollection.list()) {
        const repaired: CapacityRecord = {
          ...snapshot,
          assignedTaskIds: snapshot.assignedTaskIds.filter((id) => taskIds.has(id)),
          pendingApprovalIds: snapshot.pendingApprovalIds.filter((id) => approvalIds.has(id)),
          pendingHandoffIds: snapshot.pendingHandoffIds.filter((id) => handoffIds.has(id)),
        };
        if (JSON.stringify(repaired) !== JSON.stringify(snapshot)) {
          capacityCollection.put(snapshot.id, repaired);
          repairedRecords += 1;
        }
      }
      for (const thread of inboxThreadsCollection.list()) {
        const repaired: InboxThreadRecord = {
          ...thread,
          linkedTaskIds: thread.linkedTaskIds.filter((id) => taskIds.has(id)),
          linkedNoteIds: thread.linkedNoteIds.filter((id) => noteIds.has(id)),
        };
        if (JSON.stringify(repaired) !== JSON.stringify(thread)) {
          inboxThreadsCollection.put(thread.id, repaired);
          repairedRecords += 1;
        }
      }
      for (const event of eventsCollection.list()) {
        const repaired: EventRecord = {
          ...event,
          attendeePersonIds: event.attendeePersonIds.filter((id) => personIds.has(id)),
          linkedTaskIds: event.linkedTaskIds.filter((id) => taskIds.has(id)),
          linkedNoteIds: event.linkedNoteIds.filter((id) => noteIds.has(id)),
        };
        if (JSON.stringify(repaired) !== JSON.stringify(event)) {
          eventsCollection.put(event.id, repaired);
          repairedRecords += 1;
        }
      }

      let recomputedTemporalItems = 0;
      if (useTimeService) {
        for (const item of (await claw.time.list()).items) {
          await claw.time.update(item.id, {});
          recomputedTemporalItems += 1;
        }
      }
      const rebuilt = await rebuildIndexes();
      writeMeta("productivity_schema_version", String(PRODUCTIVITY_SCHEMA_VERSION));
      return { repairedRecords, reindexed: rebuilt.reindexed, embeddings: rebuilt.embeddings, recomputedTemporalItems };
    },
  };
  return { agendaApi, reviewApi, productivityApi };
}
