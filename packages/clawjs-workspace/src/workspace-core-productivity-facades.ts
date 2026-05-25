// @ts-nocheck
import type { ClawInstance } from "@clawjs/claw";
import type { WorkspaceClawInstance } from "./workspace-contracts.ts";
import {
  nowIso,
  uniqueStrings,
  toId,
  removeUndefined,
  assertRecord,
  defaultSource,
  clampNonNegativeNumber,
  clampConfidence,
  normalizeChecklist,
  normalizeMilestoneIds,
  normalizeRecordIds,
  isArchived,
} from "./workspace-utils.ts";
import { isOverdue } from "./workspace-temporal.ts";

export function createWorkspaceCoreProductivityFacades(input: {
  claw: ClawInstance;
  useTimeService: boolean;
  appendAudit: (event: string, capability: string, detail?: Record<string, unknown>) => void;
  [key: string]: any;
}) {
  const {
    claw,
    useTimeService,
    appendAudit,
    createSimpleApi,
    recordActivity,
    searchWorkspace,
    removeIndex,
    areasCollection,
    listsCollection,
    sectionsCollection,
    tasksCollection,
    goalsCollection,
    projectsCollection,
    commentsCollection,
    attachmentsCollection,
    savedViewsCollection,
    recurrencesCollection,
    cyclesCollection,
    epicsCollection,
    customFieldsCollection,
    fieldValuesCollection,
    templatesCollection,
    milestonesCollection,
    activityCollection,
    blockersCollection,
    artifactsCollection,
    decisionsCollection,
    assignmentsCollection,
    handoffsCollection,
    approvalsCollection,
    remindersCollection,
    syncAreaIndex,
    syncTaskIndex,
    syncReminderIndex,
    syncGoalIndex,
    syncProjectIndex,
    syncMilestoneIndex,
    syncActivityIndex,
    syncBlockerIndex,
    syncArtifactIndex,
    syncDecisionIndex,
  } = input;

  const areasApi: WorkspaceClawInstance["areas"] = {
    list: async (options = {}) => areasCollection.list()
      .filter((area) => !isArchived(area, options.includeArchived))
      .filter((area) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(area.status);
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => areasCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const area: AreaRecord = {
        id: toId("area", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        name: input.name.trim(),
        ...(input.description ? { description: input.description } : {}),
        status: input.status ?? "active",
        ...(input.color ? { color: input.color } : {}),
        ...(input.ownerPersonId ? { ownerPersonId: input.ownerPersonId } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      areasCollection.put(area.id, area);
      await syncAreaIndex(area);
      await recordActivity({
        entityType: "area",
        entityId: area.id,
        kind: "created",
        title: `Area created: ${area.name}`,
        areaId: area.id,
      });
      appendAudit("areas.created", "areas", { areaId: area.id, name: area.name });
      return area;
    },
    update: async (id, input) => {
      const current = assertRecord(areasCollection.get(id), "Area", id);
      const area: AreaRecord = {
        ...current,
        name: input.name?.trim() || current.name,
        status: input.status ?? current.status,
        ...removeUndefined({
          description: input.description,
          color: input.color,
          ownerPersonId: input.ownerPersonId,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      areasCollection.put(id, area);
      await syncAreaIndex(area);
      await recordActivity({
        entityType: "area",
        entityId: id,
        kind: input.archivedAt ? "archived" : "updated",
        title: `Area ${input.archivedAt ? "archived" : "updated"}: ${area.name}`,
        areaId: id,
      });
      appendAudit("areas.updated", "areas", { areaId: id });
      return area;
    },
    archive: async (id) => areasApi.update(id, { status: "archived", archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = areasCollection.get(id);
      if (!existing) return false;
      areasCollection.remove(id);
      removeIndex("areas", id);
      appendAudit("areas.removed", "areas", { areaId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["areas"] }),
  };

  const listsApi: WorkspaceClawInstance["lists"] = createSimpleApi<ListRecord, CreateListInput, UpdateListInput>({
    domain: "lists",
    entityType: "list",
    collection: listsCollection,
    prefix: "list",
    titleField: "title",
    defaults: { kind: "custom", status: "active" },
    archiveStatus: "archived",
  });

  const sectionsApi: WorkspaceClawInstance["sections"] = createSimpleApi<SectionRecord, CreateSectionInput, UpdateSectionInput>({
    domain: "sections",
    entityType: "section",
    collection: sectionsCollection,
    prefix: "section",
    titleField: "title",
    defaults: { status: "active" },
    archiveStatus: "archived",
  });

  const commentsApi: WorkspaceClawInstance["comments"] = createSimpleApi<CommentRecord, CreateCommentInput, UpdateCommentInput>({
    domain: "comments",
    entityType: "comment",
    collection: commentsCollection,
    prefix: "comment",
    titleField: "body",
  });

  const attachmentsApi: WorkspaceClawInstance["attachments"] = createSimpleApi<AttachmentRecord, CreateAttachmentInput, UpdateAttachmentInput>({
    domain: "attachments",
    entityType: "attachment",
    collection: attachmentsCollection,
    prefix: "attachment",
    titleField: "title",
  });

  const savedViewsApi: WorkspaceClawInstance["savedViews"] = createSimpleApi<SavedViewRecord, CreateSavedViewInput, UpdateSavedViewInput>({
    domain: "saved_views",
    entityType: "saved_view",
    collection: savedViewsCollection,
    prefix: "view",
    titleField: "name",
  });

  const recurrencesApi: WorkspaceClawInstance["recurrences"] = createSimpleApi<RecurrenceRecord, CreateRecurrenceInput, UpdateRecurrenceInput>({
    domain: "recurrences",
    entityType: "recurrence",
    collection: recurrencesCollection,
    prefix: "recurrence",
    titleField: "title",
    defaults: { status: "active" },
  });

  const cyclesApi: WorkspaceClawInstance["cycles"] = createSimpleApi<CycleRecord, CreateCycleInput, UpdateCycleInput>({
    domain: "cycles",
    entityType: "cycle",
    collection: cyclesCollection,
    prefix: "cycle",
    titleField: "name",
    defaults: { status: "planned", taskIds: [] },
    arrayFields: ["taskIds"],
    archiveStatus: "archived",
  });

  const epicsApi: WorkspaceClawInstance["epics"] = createSimpleApi<EpicRecord, CreateEpicInput, UpdateEpicInput>({
    domain: "epics",
    entityType: "epic",
    collection: epicsCollection,
    prefix: "epic",
    titleField: "title",
    defaults: { status: "planned", kind: "epic", taskIds: [] },
    arrayFields: ["taskIds"],
    archiveStatus: "archived",
  });

  const customFieldsApi: WorkspaceClawInstance["customFields"] = createSimpleApi<CustomFieldRecord, CreateCustomFieldInput, UpdateCustomFieldInput>({
    domain: "custom_fields",
    entityType: "custom_field",
    collection: customFieldsCollection,
    prefix: "field",
    titleField: "name",
  });

  const fieldValuesApi: WorkspaceClawInstance["fieldValues"] = createSimpleApi<FieldValueRecord, CreateFieldValueInput, UpdateFieldValueInput>({
    domain: "field_values",
    entityType: "field_value",
    collection: fieldValuesCollection,
    prefix: "field-value",
    titleField: "fieldId",
  });

  const templatesApi: WorkspaceClawInstance["templates"] = createSimpleApi<TemplateRecord, CreateTemplateInput, UpdateTemplateInput>({
    domain: "templates",
    entityType: "template",
    collection: templatesCollection,
    prefix: "template",
    titleField: "name",
    defaults: { status: "active" },
    archiveStatus: "archived",
  });

  const tasksApi: WorkspaceClawInstance["tasks"] = {
    list: async (options = {}) => {
      const reminderAnchorIds = options.hasReminder
        ? new Set(
            useTimeService
              ? (await claw.time.list({ kind: "reminder" })).items
                .filter((item) => item.anchorType === "task" && item.anchorId)
                .map((item) => item.anchorId as string)
              : remindersCollection.list()
                .filter((reminder) => reminder.anchorType === "task" && reminder.anchorId)
                .map((reminder) => reminder.anchorId as string),
          )
        : null;
      return tasksCollection.list()
        .filter((task) => !isArchived(task, options.includeArchived))
        .filter((task) => {
          if (!options.status) return true;
          const statuses = Array.isArray(options.status) ? options.status : [options.status];
          return statuses.includes(task.status);
        })
        .filter((task) => !options.assigneePersonId || task.assigneePersonId === options.assigneePersonId)
        .filter((task) => !options.projectId || task.projectId === options.projectId)
        .filter((task) => !options.goalId || task.goalId === options.goalId)
        .filter((task) => !options.areaId || task.areaId === options.areaId)
        .filter((task) => !options.listId || task.listId === options.listId)
        .filter((task) => !options.sectionId || task.sectionId === options.sectionId)
        .filter((task) => !options.cycleId || task.cycleId === options.cycleId)
        .filter((task) => !options.epicId || task.epicId === options.epicId)
        .filter((task) => !options.blocked || task.status === "blocked" || Boolean(task.blockedReason))
        .filter((task) => !options.overdue || isOverdue(task.dueAt))
        .filter((task) => !options.ids || options.ids.includes(task.id))
        .filter((task) => !options.hasReminder || Boolean(reminderAnchorIds?.has(task.id)))
        .sort((left, right) => (right.updatedAt).localeCompare(left.updatedAt))
        .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER);
    },
    get: async (id) => tasksCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const task: TaskRecord = {
        id: toId("task", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        ...(input.description ? { description: input.description } : {}),
        status: input.status ?? "todo",
        ...(input.type ? { type: input.type } : {}),
        priority: input.priority ?? "medium",
        ...(clampNonNegativeNumber(input.rank) !== undefined ? { rank: clampNonNegativeNumber(input.rank) } : {}),
        labels: uniqueStrings(input.labels ?? []),
        ...(input.areaId ? { areaId: input.areaId } : {}),
        ...(input.listId ? { listId: input.listId } : {}),
        ...(input.sectionId ? { sectionId: input.sectionId } : {}),
        ...(input.assigneePersonId ? { assigneePersonId: input.assigneePersonId } : {}),
        ...(input.reporterPersonId ? { reporterPersonId: input.reporterPersonId } : {}),
        watcherPersonIds: uniqueStrings(input.watcherPersonIds ?? []),
        ...(input.startAt ? { startAt: input.startAt } : {}),
        ...(input.deferUntil ? { deferUntil: input.deferUntil } : {}),
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
        ...(input.deadlineAt ? { deadlineAt: input.deadlineAt } : {}),
        ...(input.snoozedUntil ? { snoozedUntil: input.snoozedUntil } : {}),
        ...(input.recurrenceRule ? { recurrenceRule: input.recurrenceRule } : {}),
        ...(clampNonNegativeNumber(input.estimateMinutes) !== undefined ? { estimateMinutes: clampNonNegativeNumber(input.estimateMinutes) } : {}),
        ...(clampNonNegativeNumber(input.actualMinutes) !== undefined ? { actualMinutes: clampNonNegativeNumber(input.actualMinutes) } : {}),
        ...(clampNonNegativeNumber(input.storyPoints) !== undefined ? { storyPoints: clampNonNegativeNumber(input.storyPoints) } : {}),
        ...(input.blockedReason ? { blockedReason: input.blockedReason } : {}),
        ...(input.waitingOn ? { waitingOn: input.waitingOn } : {}),
        ...(input.startedAt ? { startedAt: input.startedAt } : {}),
        ...(input.completedAt ? { completedAt: input.completedAt } : {}),
        ...(input.cancelledAt ? { cancelledAt: input.cancelledAt } : {}),
        ...(input.scheduledEventId ? { scheduledEventId: input.scheduledEventId } : {}),
        ...(input.eventId ? { eventId: input.eventId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.cycleId ? { cycleId: input.cycleId } : {}),
        ...(input.epicId ? { epicId: input.epicId } : {}),
        ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}),
        childTaskIds: uniqueStrings(input.childTaskIds ?? []),
        dependsOnTaskIds: uniqueStrings(input.dependsOnTaskIds ?? []),
        commentIds: uniqueStrings(input.commentIds ?? []),
        attachmentIds: uniqueStrings(input.attachmentIds ?? []),
        ...(input.createdBy ? { createdBy: input.createdBy } : {}),
        ...(input.updatedBy ? { updatedBy: input.updatedBy } : {}),
        ...(input.assignedToAgentId ? { assignedToAgentId: input.assignedToAgentId } : {}),
        ...(input.assignedBy ? { assignedBy: input.assignedBy } : {}),
        ...(input.delegatedBy ? { delegatedBy: input.delegatedBy } : {}),
        ...(input.reviewerAgentId ? { reviewerAgentId: input.reviewerAgentId } : {}),
        blockedByIds: uniqueStrings(input.blockedByIds ?? []),
        evidenceIds: uniqueStrings(input.evidenceIds ?? []),
        decisionIds: uniqueStrings(input.decisionIds ?? []),
        assignmentIds: uniqueStrings(input.assignmentIds ?? []),
        handoffIds: uniqueStrings(input.handoffIds ?? []),
        approvalIds: uniqueStrings(input.approvalIds ?? []),
        ...(input.sourceItemId ? { sourceItemId: input.sourceItemId } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.handoffTo ? { handoffTo: input.handoffTo } : {}),
        ...(input.approvedBy ? { approvedBy: input.approvedBy } : {}),
        ...(input.companyId ? { companyId: input.companyId } : {}),
        ...(input.portfolioId ? { portfolioId: input.portfolioId } : {}),
        ...(input.portfolioItemId ? { portfolioItemId: input.portfolioItemId } : {}),
        checklist: normalizeChecklist(input.checklist),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      if (task.status === "in_progress" && !task.startedAt) task.startedAt = timestamp;
      if (task.status === "done" && !task.completedAt) task.completedAt = timestamp;
      tasksCollection.put(task.id, task);
      await syncTaskIndex(task);
      await recordActivity({
        entityType: "task",
        entityId: task.id,
        kind: "created",
        title: `Task created: ${task.title}`,
        areaId: task.areaId,
        projectId: task.projectId,
        goalId: task.goalId,
        taskId: task.id,
      });
      appendAudit("tasks.created", "tasks", { taskId: task.id, title: task.title });
      return task;
    },
    update: async (id, input) => {
      const current = assertRecord(tasksCollection.get(id), "Task", id);
      const task: TaskRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        type: input.type ?? current.type,
        priority: input.priority ?? current.priority,
        ...removeUndefined({
          description: input.description,
          rank: clampNonNegativeNumber(input.rank),
          areaId: input.areaId,
          listId: input.listId,
          sectionId: input.sectionId,
          assigneePersonId: input.assigneePersonId,
          reporterPersonId: input.reporterPersonId,
          startAt: input.startAt,
          deferUntil: input.deferUntil,
          dueAt: input.dueAt,
          deadlineAt: input.deadlineAt,
          snoozedUntil: input.snoozedUntil,
          recurrenceRule: input.recurrenceRule,
          estimateMinutes: clampNonNegativeNumber(input.estimateMinutes),
          actualMinutes: clampNonNegativeNumber(input.actualMinutes),
          storyPoints: clampNonNegativeNumber(input.storyPoints),
          blockedReason: input.blockedReason,
          waitingOn: input.waitingOn,
          startedAt: input.startedAt,
          completedAt: input.completedAt,
          cancelledAt: input.cancelledAt,
          scheduledEventId: input.scheduledEventId,
          eventId: input.eventId,
          projectId: input.projectId,
          goalId: input.goalId,
          cycleId: input.cycleId,
          epicId: input.epicId,
          parentTaskId: input.parentTaskId,
          createdBy: input.createdBy,
          updatedBy: input.updatedBy,
          assignedToAgentId: input.assignedToAgentId,
          assignedBy: input.assignedBy,
          delegatedBy: input.delegatedBy,
          reviewerAgentId: input.reviewerAgentId,
          sourceItemId: input.sourceItemId,
          confidence: clampConfidence(input.confidence),
          handoffTo: input.handoffTo,
          approvedBy: input.approvedBy,
          companyId: input.companyId,
          portfolioId: input.portfolioId,
          portfolioItemId: input.portfolioItemId,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        labels: input.labels ? uniqueStrings(input.labels) : current.labels,
        watcherPersonIds: input.watcherPersonIds ? uniqueStrings(input.watcherPersonIds) : current.watcherPersonIds,
        childTaskIds: input.childTaskIds ? uniqueStrings(input.childTaskIds) : current.childTaskIds,
        dependsOnTaskIds: input.dependsOnTaskIds ? uniqueStrings(input.dependsOnTaskIds) : current.dependsOnTaskIds,
        commentIds: input.commentIds ? uniqueStrings(input.commentIds) : current.commentIds,
        attachmentIds: input.attachmentIds ? uniqueStrings(input.attachmentIds) : current.attachmentIds,
        blockedByIds: input.blockedByIds ? uniqueStrings(input.blockedByIds) : current.blockedByIds,
        evidenceIds: input.evidenceIds ? uniqueStrings(input.evidenceIds) : current.evidenceIds,
        decisionIds: input.decisionIds ? uniqueStrings(input.decisionIds) : current.decisionIds,
        assignmentIds: input.assignmentIds ? uniqueStrings(input.assignmentIds) : current.assignmentIds,
        handoffIds: input.handoffIds ? uniqueStrings(input.handoffIds) : current.handoffIds,
        approvalIds: input.approvalIds ? uniqueStrings(input.approvalIds) : current.approvalIds,
        checklist: input.checklist ? normalizeChecklist(input.checklist) : current.checklist,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      if (task.status === "in_progress" && !task.startedAt) task.startedAt = nowIso();
      tasksCollection.put(id, task);
      if (current.status !== "done" && task.status === "done" && useTimeService) {
        await claw.time.signalAnchor({ anchorId: id, signal: "task_completed" });
      }
      if (current.status !== "done" && task.status === "done" && !useTimeService) {
        for (const reminder of remindersCollection.list()) {
          if (reminder.anchorType !== "task" || reminder.anchorId !== id || reminder.status === "done" || reminder.status === "cancelled") continue;
          const cancelledReminder = {
            ...reminder,
            status: "cancelled",
            updatedAt: nowIso(),
          };
          remindersCollection.put(reminder.id, cancelledReminder);
          await syncReminderIndex(cancelledReminder);
        }
      }
      if (current.status !== "done" && task.status === "done" && !task.completedAt) {
        task.completedAt = nowIso();
        tasksCollection.put(id, task);
      }
      await syncTaskIndex(task);
      await recordActivity({
        entityType: "task",
        entityId: id,
        kind: task.status === "done" && current.status !== "done" ? "completed" : input.archivedAt ? "archived" : "updated",
        title: `Task ${task.status === "done" && current.status !== "done" ? "completed" : input.archivedAt ? "archived" : "updated"}: ${task.title}`,
        areaId: task.areaId,
        projectId: task.projectId,
        goalId: task.goalId,
        taskId: task.id,
      });
      appendAudit("tasks.updated", "tasks", { taskId: id });
      return task;
    },
    complete: async (id) => tasksApi.update(id, { status: "done" }),
    archive: async (id) => tasksApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = tasksCollection.get(id);
      if (!existing) return false;
      tasksCollection.remove(id);
      removeIndex("tasks", id);
      appendAudit("tasks.removed", "tasks", { taskId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["tasks"] }),
  };

  const goalsApi: WorkspaceClawInstance["goals"] = {
    list: async (options = {}) => goalsCollection.list()
      .filter((goal) => !isArchived(goal, options.includeArchived))
      .filter((goal) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(goal.status);
      })
      .filter((goal) => !options.areaId || goal.areaId === options.areaId)
      .filter((goal) => !options.projectId || goal.projectId === options.projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => goalsCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const parentGoalId = input.parentGoalId ?? input.parentId;
      const goal: GoalRecord = {
        id: toId("goal", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        ...(input.description ? { description: input.description } : {}),
        status: input.status ?? "active",
        ...(input.level ? { level: input.level } : {}),
        ...(input.areaId ? { areaId: input.areaId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(parentGoalId ? { parentId: parentGoalId, parentGoalId } : {}),
        ...(input.ownerPersonId ? { ownerPersonId: input.ownerPersonId } : {}),
        ...(input.ownerAgentId ? { ownerAgentId: input.ownerAgentId } : {}),
        ...(input.companyId ? { companyId: input.companyId } : {}),
        ...(input.portfolioId ? { portfolioId: input.portfolioId } : {}),
        ...(input.portfolioItemId ? { portfolioItemId: input.portfolioItemId } : {}),
        ...(input.metricKey ? { metricKey: input.metricKey } : {}),
        ...(input.metricLabel ? { metricLabel: input.metricLabel } : {}),
        ...(input.targetValue !== undefined ? { targetValue: input.targetValue } : {}),
        ...(input.currentValue !== undefined ? { currentValue: input.currentValue } : {}),
        ...(input.unit ? { unit: input.unit } : {}),
        ...(input.period ? { period: input.period } : {}),
        ...(input.timeframeStart ? { timeframeStart: input.timeframeStart } : {}),
        ...(input.timeframeEnd ? { timeframeEnd: input.timeframeEnd } : {}),
        ...(input.reviewCadence ? { reviewCadence: input.reviewCadence } : {}),
        ...(input.metricDirection ? { metricDirection: input.metricDirection } : {}),
        ...(input.healthStatus ? { healthStatus: input.healthStatus } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      goalsCollection.put(goal.id, goal);
      await syncGoalIndex(goal);
      await recordActivity({
        entityType: "goal",
        entityId: goal.id,
        kind: "created",
        title: `Goal created: ${goal.title}`,
        areaId: goal.areaId,
        projectId: goal.projectId,
        goalId: goal.id,
      });
      appendAudit("goals.created", "goals", { goalId: goal.id, title: goal.title });
      return goal;
    },
    update: async (id, input) => {
      const current = assertRecord(goalsCollection.get(id), "Goal", id);
      const parentGoalId = input.parentGoalId ?? input.parentId;
      const goal: GoalRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        ...removeUndefined({
          description: input.description,
          level: input.level,
          areaId: input.areaId,
          projectId: input.projectId,
          parentId: parentGoalId,
          parentGoalId,
          ownerPersonId: input.ownerPersonId,
          ownerAgentId: input.ownerAgentId,
          companyId: input.companyId,
          portfolioId: input.portfolioId,
          portfolioItemId: input.portfolioItemId,
          metricKey: input.metricKey,
          metricLabel: input.metricLabel,
          targetValue: input.targetValue,
          currentValue: input.currentValue,
          unit: input.unit,
          period: input.period,
          timeframeStart: input.timeframeStart,
          timeframeEnd: input.timeframeEnd,
          reviewCadence: input.reviewCadence,
          metricDirection: input.metricDirection,
          healthStatus: input.healthStatus,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      goalsCollection.put(id, goal);
      await syncGoalIndex(goal);
      await recordActivity({
        entityType: "goal",
        entityId: id,
        kind: input.archivedAt ? "archived" : "updated",
        title: `Goal ${input.archivedAt ? "archived" : "updated"}: ${goal.title}`,
        areaId: goal.areaId,
        projectId: goal.projectId,
        goalId: goal.id,
      });
      appendAudit("goals.updated", "goals", { goalId: id });
      return goal;
    },
    archive: async (id) => goalsApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = goalsCollection.get(id);
      if (!existing) return false;
      goalsCollection.remove(id);
      removeIndex("goals", id);
      appendAudit("goals.removed", "goals", { goalId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["goals"] }),
  };

  function isReadableProjectRecord(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return typeof record.id === "string" && record.id.trim().length > 0
      && typeof record.name === "string" && record.name.trim().length > 0
      && typeof record.status === "string" && record.status.trim().length > 0
      && typeof record.createdAt === "string" && record.createdAt.trim().length > 0
      && typeof record.updatedAt === "string" && record.updatedAt.trim().length > 0;
  }

  function readableProjectRecord(value: unknown): ProjectRecord | null {
    return isReadableProjectRecord(value) ? value as ProjectRecord : null;
  }

  function listReadableProjectRecords(): ProjectRecord[] {
    return projectsCollection.list().flatMap((project) => {
      const readable = readableProjectRecord(project);
      return readable ? [readable] : [];
    });
  }

  const projectsApi: WorkspaceClawInstance["projects"] = {
    list: async (options = {}) => listReadableProjectRecords()
      .filter((project) => !isArchived(project, options.includeArchived))
      .filter((project) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(project.status);
      })
      .filter((project) => !options.areaId || project.areaId === options.areaId)
      .filter((project) => !options.goalId || project.goalId === options.goalId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => readableProjectRecord(projectsCollection.get(id)),
    create: async (input) => {
      const timestamp = nowIso();
      const project: ProjectRecord = {
        id: toId("project", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        name: input.name.trim(),
        ...(input.description ? { description: input.description } : {}),
        status: input.status ?? "draft",
        ...(input.areaId ? { areaId: input.areaId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.ownerPersonId ? { ownerPersonId: input.ownerPersonId } : {}),
        ...(input.leadAgentId ? { leadAgentId: input.leadAgentId } : {}),
        ...(input.companyId ? { companyId: input.companyId } : {}),
        ...(input.portfolioId ? { portfolioId: input.portfolioId } : {}),
        ...(input.portfolioItemId ? { portfolioItemId: input.portfolioItemId } : {}),
        ...(input.color ? { color: input.color } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(clampNonNegativeNumber(input.rank) !== undefined ? { rank: clampNonNegativeNumber(input.rank) } : {}),
        ...(input.statusCategory ? { statusCategory: input.statusCategory } : {}),
        ...(input.healthStatus ? { healthStatus: input.healthStatus } : {}),
        ...(input.startAt ? { startAt: input.startAt } : {}),
        ...(input.startDate ? { startDate: input.startDate } : {}),
        ...(input.targetDate ? { targetDate: input.targetDate } : {}),
        ...(input.deadlineAt ? { deadlineAt: input.deadlineAt } : {}),
        milestoneIds: normalizeMilestoneIds(input.milestoneIds ?? []),
        defaultSectionIds: uniqueStrings(input.defaultSectionIds ?? []),
        ...(input.templateId ? { templateId: input.templateId } : {}),
        ...(input.reviewAt ? { reviewAt: input.reviewAt } : {}),
        ...(input.reviewCadence ? { reviewCadence: input.reviewCadence } : {}),
        ...(input.archiveReason ? { archiveReason: input.archiveReason } : {}),
        ...(input.completedAt ? { completedAt: input.completedAt } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      if (project.status === "done" && !project.completedAt) project.completedAt = timestamp;
      projectsCollection.put(project.id, project);
      await syncProjectIndex(project);
      await recordActivity({
        entityType: "project",
        entityId: project.id,
        kind: "created",
        title: `Project created: ${project.name}`,
        areaId: project.areaId,
        projectId: project.id,
        goalId: project.goalId,
      });
      appendAudit("projects.created", "projects", { projectId: project.id, name: project.name });
      return project;
    },
    update: async (id, input) => {
      const current = assertRecord(readableProjectRecord(projectsCollection.get(id)), "Project", id);
      const project: ProjectRecord = {
        ...current,
        name: input.name?.trim() || current.name,
        status: input.status ?? current.status,
        ...removeUndefined({
          description: input.description,
          areaId: input.areaId,
          goalId: input.goalId,
          ownerPersonId: input.ownerPersonId,
          leadAgentId: input.leadAgentId,
          companyId: input.companyId,
          portfolioId: input.portfolioId,
          portfolioItemId: input.portfolioItemId,
          color: input.color,
          kind: input.kind,
          rank: clampNonNegativeNumber(input.rank),
          statusCategory: input.statusCategory,
          healthStatus: input.healthStatus,
          startAt: input.startAt,
          startDate: input.startDate,
          targetDate: input.targetDate,
          deadlineAt: input.deadlineAt,
          templateId: input.templateId,
          reviewAt: input.reviewAt,
          reviewCadence: input.reviewCadence,
          archiveReason: input.archiveReason,
          completedAt: input.completedAt,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        milestoneIds: input.milestoneIds ? normalizeMilestoneIds(input.milestoneIds) : current.milestoneIds,
        defaultSectionIds: input.defaultSectionIds ? uniqueStrings(input.defaultSectionIds) : current.defaultSectionIds,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      if (project.status === "done" && !project.completedAt) project.completedAt = nowIso();
      projectsCollection.put(id, project);
      await syncProjectIndex(project);
      await recordActivity({
        entityType: "project",
        entityId: id,
        kind: input.archivedAt ? "archived" : "updated",
        title: `Project ${input.archivedAt ? "archived" : "updated"}: ${project.name}`,
        areaId: project.areaId,
        projectId: project.id,
        goalId: project.goalId,
      });
      appendAudit("projects.updated", "projects", { projectId: id });
      return project;
    },
    archive: async (id) => projectsApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = readableProjectRecord(projectsCollection.get(id));
      if (!existing) return false;
      projectsCollection.remove(id);
      removeIndex("projects", id);
      appendAudit("projects.removed", "projects", { projectId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["projects"] }),
  };

  const milestonesApi: WorkspaceClawInstance["milestones"] = {
    list: async (options = {}) => milestonesCollection.list()
      .filter((milestone) => !isArchived(milestone, options.includeArchived))
      .filter((milestone) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(milestone.status);
      })
      .filter((milestone) => !options.areaId || milestone.areaId === options.areaId)
      .filter((milestone) => !options.projectId || milestone.projectId === options.projectId)
      .filter((milestone) => !options.goalId || milestone.goalId === options.goalId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => milestonesCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const milestone: MilestoneRecord = {
        id: toId("milestone", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        ...(input.description ? { description: input.description } : {}),
        status: input.status ?? "planned",
        ...(input.areaId ? { areaId: input.areaId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.targetDate ? { targetDate: input.targetDate } : {}),
        ...(input.completedAt ? { completedAt: input.completedAt } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      if (milestone.status === "done" && !milestone.completedAt) milestone.completedAt = timestamp;
      milestonesCollection.put(milestone.id, milestone);
      await syncMilestoneIndex(milestone);
      await recordActivity({
        entityType: "milestone",
        entityId: milestone.id,
        kind: "created",
        title: `Milestone created: ${milestone.title}`,
        areaId: milestone.areaId,
        projectId: milestone.projectId,
        goalId: milestone.goalId,
        milestoneId: milestone.id,
      });
      appendAudit("milestones.created", "milestones", { milestoneId: milestone.id, title: milestone.title });
      return milestone;
    },
    update: async (id, input) => {
      const current = assertRecord(milestonesCollection.get(id), "Milestone", id);
      const milestone: MilestoneRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        ...removeUndefined({
          description: input.description,
          areaId: input.areaId,
          projectId: input.projectId,
          goalId: input.goalId,
          targetDate: input.targetDate,
          completedAt: input.completedAt,
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      if (milestone.status === "done" && !milestone.completedAt) milestone.completedAt = nowIso();
      milestonesCollection.put(id, milestone);
      await syncMilestoneIndex(milestone);
      await recordActivity({
        entityType: "milestone",
        entityId: id,
        kind: input.archivedAt ? "archived" : milestone.status === "done" && current.status !== "done" ? "completed" : "updated",
        title: `Milestone ${input.archivedAt ? "archived" : milestone.status === "done" && current.status !== "done" ? "completed" : "updated"}: ${milestone.title}`,
        areaId: milestone.areaId,
        projectId: milestone.projectId,
        goalId: milestone.goalId,
        milestoneId: milestone.id,
      });
      appendAudit("milestones.updated", "milestones", { milestoneId: id });
      return milestone;
    },
    archive: async (id) => milestonesApi.update(id, { status: "archived", archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = milestonesCollection.get(id);
      if (!existing) return false;
      milestonesCollection.remove(id);
      removeIndex("milestones", id);
      appendAudit("milestones.removed", "milestones", { milestoneId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["milestones"] }),
  };

  const activityApi: WorkspaceClawInstance["activity"] = {
    list: async (options = {}) => activityCollection.list()
      .filter((entry) => !options.entityType || entry.entityType === options.entityType)
      .filter((entry) => !options.entityId || entry.entityId === options.entityId)
      .filter((entry) => !options.projectId || entry.projectId === options.projectId)
      .filter((entry) => !options.taskId || entry.taskId === options.taskId)
      .filter((entry) => !options.threadId || entry.threadId === options.threadId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => activityCollection.get(id),
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["activity"] }),
  };

  async function syncLinkedTask(taskId: string, input: Partial<TaskRecord>): Promise<void> {
    const current = tasksCollection.get(taskId);
    if (!current) return;
    const next: TaskRecord = {
      ...current,
      ...input,
      updatedAt: nowIso(),
    };
    tasksCollection.put(taskId, next);
    await syncTaskIndex(next);
  }

  async function reconcileTaskBlockState(taskId: string): Promise<void> {
    const task = tasksCollection.get(taskId);
    if (!task) return;
    const activeBlockers = (task.blockedByIds ?? [])
      .map((blockerId) => blockersCollection.get(blockerId))
      .filter((blocker): blocker is BlockerRecord => Boolean(blocker && blocker.status === "active" && !blocker.archivedAt));
    if (activeBlockers.length > 0) {
      await syncLinkedTask(taskId, {
        blockedByIds: activeBlockers.map((blocker) => blocker.id),
        status: task.status === "done" || task.status === "cancelled" ? task.status : "blocked",
        blockedReason: task.blockedReason ?? activeBlockers[0]?.title,
      });
      return;
    }
    await syncLinkedTask(taskId, {
      blockedByIds: [],
      status: task.status === "blocked" ? "todo" : task.status,
      blockedReason: undefined,
    });
  }

  async function reconcileTaskAssignmentState(taskId: string): Promise<void> {
    const task = tasksCollection.get(taskId);
    if (!task) return;
    const linkedAssignments = assignmentsCollection.list()
      .filter((assignment) => assignment.taskId === taskId && !assignment.archivedAt)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const activeAssignments = linkedAssignments.filter((assignment) => assignment.status !== "released" && assignment.status !== "completed");
    const primaryAssignment = activeAssignments.find((assignment) => assignment.status === "accepted")
      ?? activeAssignments.find((assignment) => assignment.status === "proposed")
      ?? null;
    await syncLinkedTask(taskId, {
      assignmentIds: linkedAssignments.map((assignment) => assignment.id),
      assignedToAgentId: primaryAssignment?.assignedToAgentId,
      assignedBy: primaryAssignment?.assignedBy,
      delegatedBy: primaryAssignment?.delegatedBy,
      reviewerAgentId: primaryAssignment?.reviewerAgentId,
    });
  }

  async function reconcileTaskHandoffState(taskId: string): Promise<void> {
    const task = tasksCollection.get(taskId);
    if (!task) return;
    const linkedHandoffs = handoffsCollection.list()
      .filter((handoff) => handoff.taskId === taskId && !handoff.archivedAt)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const activeHandoff = linkedHandoffs.find((handoff) => handoff.status === "proposed" || handoff.status === "accepted" || handoff.status === "returned") ?? null;
    await syncLinkedTask(taskId, {
      handoffIds: linkedHandoffs.map((handoff) => handoff.id),
      handoffTo: activeHandoff?.toAgentId,
    });
  }

  async function reconcileTaskApprovalState(taskId: string): Promise<void> {
    const task = tasksCollection.get(taskId);
    if (!task) return;
    const linkedApprovals = approvalsCollection.list()
      .filter((approval) => approval.taskId === taskId && !approval.archivedAt)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const latestApproved = linkedApprovals.find((approval) => approval.status === "approved") ?? null;
    await syncLinkedTask(taskId, {
      approvalIds: linkedApprovals.map((approval) => approval.id),
      approvedBy: latestApproved?.approvedBy ?? latestApproved?.approverAgentId,
    });
  }

  function buildDerivedCapacitySnapshot(input: {
    agentId: string;
    stored?: CapacityRecord;
    assignments: AssignmentRecord[];
    handoffs: HandoffRecord[];
    approvals: ProductivityApprovalRecord[];
    tasks: TaskRecord[];
  }): CapacityRecord {
    const timestamp = nowIso();
    const assignedTaskIds = uniqueStrings(input.assignments.map((assignment) => assignment.taskId).filter(Boolean));
    const pendingApprovalIds = input.approvals
      .filter((approval) => approval.status === "pending")
      .map((approval) => approval.id);
    const pendingHandoffIds = input.handoffs
      .filter((handoff) => handoff.status === "proposed" || handoff.status === "accepted" || handoff.status === "returned")
      .map((handoff) => handoff.id);
    const relatedTasks = input.tasks.filter((task) => assignedTaskIds.includes(task.id));
    const currentWip = relatedTasks.filter((task) => task.status !== "done" && task.status !== "cancelled").length;
    const blockedCount = relatedTasks.filter((task) => task.status === "blocked" || task.blockedByIds.length > 0).length;
    const overdueCount = relatedTasks.filter((task) => isOverdue(task.dueAt) && task.status !== "done" && task.status !== "cancelled").length;
    const maxWip = input.stored?.maxWip ?? 3;
    const queueDepth = currentWip + pendingHandoffIds.length + pendingApprovalIds.length;
    const utilizationRaw = maxWip > 0 ? currentWip / maxWip : 0;
    const utilization = Math.max(0, Math.min(1, utilizationRaw));
    const status: CapacityRecord["status"] = input.stored?.status === "offline"
      ? "offline"
      : utilizationRaw > 1 || blockedCount >= Math.max(2, maxWip)
        ? "overloaded"
        : utilizationRaw >= 0.75 || pendingApprovalIds.length > 0
          ? "limited"
          : "active";
    const availability: CapacityRecord["availability"] = input.stored?.availability
      ?? (status === "overloaded" ? "busy" : "available");
    return {
      id: input.stored?.id ?? `capacity-${input.agentId}`,
      createdAt: input.stored?.createdAt ?? timestamp,
      updatedAt: timestamp,
      source: input.stored?.source ?? { kind: "derived" },
      title: input.stored?.title ?? input.agentId,
      status,
      agentId: input.agentId,
      ...(input.stored?.teamId ? { teamId: input.stored.teamId } : {}),
      ...(input.stored?.role ? { role: input.stored.role } : {}),
      availability,
      ...(maxWip ? { maxWip } : {}),
      currentWip,
      queueDepth,
      blockedCount,
      overdueCount,
      ...(input.stored?.responseLatencyMinutes !== undefined ? { responseLatencyMinutes: input.stored.responseLatencyMinutes } : {}),
      utilization,
      assignedTaskIds,
      pendingApprovalIds,
      pendingHandoffIds,
      snapshotAt: input.stored?.snapshotAt ?? timestamp,
      ...(input.stored?.confidence !== undefined ? { confidence: input.stored.confidence } : {}),
      ...(input.stored?.links ? { links: input.stored.links } : {}),
      ...(input.stored?.metadata ? { metadata: input.stored.metadata } : {}),
      ...(input.stored?.archivedAt ? { archivedAt: input.stored.archivedAt } : {}),
    };
  }

  const blockersApi: WorkspaceClawInstance["blockers"] = {
    list: async (options = {}) => blockersCollection.list()
      .filter((blocker) => !isArchived(blocker, options.includeArchived))
      .filter((blocker) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(blocker.status);
      })
      .filter((blocker) => {
        if (!options.kind) return true;
        const kinds = Array.isArray(options.kind) ? options.kind : [options.kind];
        return kinds.includes(blocker.kind);
      })
      .filter((blocker) => !options.taskId || blocker.taskId === options.taskId)
      .filter((blocker) => !options.projectId || blocker.projectId === options.projectId)
      .filter((blocker) => !options.goalId || blocker.goalId === options.goalId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => blockersCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const blocker: BlockerRecord = {
        id: toId("blocker", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        kind: input.kind,
        status: input.status ?? "active",
        ...(input.description ? { description: input.description } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.ownerPersonId ? { ownerPersonId: input.ownerPersonId } : {}),
        ...(input.ownerAgentId ? { ownerAgentId: input.ownerAgentId } : {}),
        dependencyTaskIds: normalizeRecordIds(input.dependencyTaskIds ?? []),
        evidenceIds: normalizeRecordIds(input.evidenceIds ?? []),
        ...(input.resolvedAt ? { resolvedAt: input.resolvedAt } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      blockersCollection.put(blocker.id, blocker);
      await syncBlockerIndex(blocker);
      if (blocker.taskId) {
        const currentTask = tasksCollection.get(blocker.taskId);
        if (currentTask) {
          await syncLinkedTask(blocker.taskId, {
            blockedByIds: uniqueStrings([...(currentTask.blockedByIds ?? []), blocker.id]),
            status: currentTask.status === "done" || currentTask.status === "cancelled" ? currentTask.status : "blocked",
            blockedReason: currentTask.blockedReason ?? blocker.title,
          });
        }
      }
      await recordActivity({
        entityType: "blocker",
        entityId: blocker.id,
        kind: "created",
        title: `Blocker created: ${blocker.title}`,
        projectId: blocker.projectId,
        goalId: blocker.goalId,
        taskId: blocker.taskId,
      });
      appendAudit("blockers.created", "blockers", { blockerId: blocker.id, title: blocker.title });
      return blocker;
    },
    update: async (id, input) => {
      const current = assertRecord(blockersCollection.get(id), "Blocker", id);
      const blocker: BlockerRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        kind: input.kind ?? current.kind,
        status: input.status ?? current.status,
        ...removeUndefined({
          description: input.description,
          taskId: input.taskId,
          projectId: input.projectId,
          goalId: input.goalId,
          ownerPersonId: input.ownerPersonId,
          ownerAgentId: input.ownerAgentId,
          resolvedAt: input.resolvedAt,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        dependencyTaskIds: input.dependencyTaskIds ? normalizeRecordIds(input.dependencyTaskIds) : current.dependencyTaskIds,
        evidenceIds: input.evidenceIds ? normalizeRecordIds(input.evidenceIds) : current.evidenceIds,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      if (blocker.status === "resolved" && !blocker.resolvedAt) blocker.resolvedAt = nowIso();
      blockersCollection.put(id, blocker);
      await syncBlockerIndex(blocker);
      if (current.taskId && current.taskId !== blocker.taskId) {
        const previousTask = tasksCollection.get(current.taskId);
        if (previousTask) {
          await syncLinkedTask(current.taskId, {
            blockedByIds: previousTask.blockedByIds.filter((blockerId) => blockerId !== id),
          });
          await reconcileTaskBlockState(current.taskId);
        }
      }
      if (blocker.taskId) {
        const currentTask = tasksCollection.get(blocker.taskId);
        if (currentTask) {
          await syncLinkedTask(blocker.taskId, {
            blockedByIds: uniqueStrings([...(currentTask.blockedByIds ?? []), blocker.id]),
            status: blocker.status === "active" && currentTask.status !== "done" && currentTask.status !== "cancelled"
              ? "blocked"
              : currentTask.status,
            blockedReason: blocker.status === "active"
              ? (currentTask.blockedReason ?? blocker.title)
              : currentTask.blockedReason,
          });
          if (blocker.status !== "active") {
            await reconcileTaskBlockState(blocker.taskId);
          }
        }
      }
      await recordActivity({
        entityType: "blocker",
        entityId: id,
        kind: input.archivedAt ? "archived" : blocker.status === "resolved" && current.status !== "resolved" ? "completed" : "updated",
        title: `Blocker ${input.archivedAt ? "archived" : blocker.status === "resolved" && current.status !== "resolved" ? "resolved" : "updated"}: ${blocker.title}`,
        projectId: blocker.projectId,
        goalId: blocker.goalId,
        taskId: blocker.taskId,
      });
      appendAudit("blockers.updated", "blockers", { blockerId: id });
      return blocker;
    },
    archive: async (id) => blockersApi.update(id, { archivedAt: nowIso(), status: "cancelled" }),
    remove: async (id) => {
      const existing = blockersCollection.get(id);
      if (!existing) return false;
      blockersCollection.remove(id);
      removeIndex("blockers", id);
      if (existing.taskId) {
        const currentTask = tasksCollection.get(existing.taskId);
        if (currentTask) {
          await syncLinkedTask(existing.taskId, {
            blockedByIds: currentTask.blockedByIds.filter((blockerId) => blockerId !== id),
          });
          await reconcileTaskBlockState(existing.taskId);
        }
      }
      appendAudit("blockers.removed", "blockers", { blockerId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["blockers"] }),
  };

  const artifactsApi: WorkspaceClawInstance["artifacts"] = {
    list: async (options = {}) => artifactsCollection.list()
      .filter((artifact) => !isArchived(artifact, options.includeArchived))
      .filter((artifact) => {
        if (!options.kind) return true;
        const kinds = Array.isArray(options.kind) ? options.kind : [options.kind];
        return kinds.includes(artifact.kind);
      })
      .filter((artifact) => !options.taskId || artifact.taskId === options.taskId)
      .filter((artifact) => !options.projectId || artifact.projectId === options.projectId)
      .filter((artifact) => !options.goalId || artifact.goalId === options.goalId)
      .filter((artifact) => !options.threadId || artifact.threadId === options.threadId)
      .filter((artifact) => !options.decisionId || artifact.decisionId === options.decisionId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => artifactsCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const artifact: ArtifactRecord = {
        id: toId("artifact", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        kind: input.kind,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.threadId ? { threadId: input.threadId } : {}),
        ...(input.decisionId ? { decisionId: input.decisionId } : {}),
        ...(input.uri ? { uri: input.uri } : {}),
        ...(input.summary ? { summary: input.summary } : {}),
        ...(input.content ? { content: input.content } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      artifactsCollection.put(artifact.id, artifact);
      await syncArtifactIndex(artifact);
      if (artifact.taskId) {
        const currentTask = tasksCollection.get(artifact.taskId);
        if (currentTask) {
          await syncLinkedTask(artifact.taskId, {
            evidenceIds: uniqueStrings([...(currentTask.evidenceIds ?? []), artifact.id]),
          });
        }
      }
      await recordActivity({
        entityType: "artifact",
        entityId: artifact.id,
        kind: "created",
        title: `Artifact captured: ${artifact.title}`,
        projectId: artifact.projectId,
        goalId: artifact.goalId,
        taskId: artifact.taskId,
        threadId: artifact.threadId,
      });
      appendAudit("artifacts.created", "artifacts", { artifactId: artifact.id, title: artifact.title });
      return artifact;
    },
    update: async (id, input) => {
      const current = assertRecord(artifactsCollection.get(id), "Artifact", id);
      const artifact: ArtifactRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        kind: input.kind ?? current.kind,
        ...removeUndefined({
          taskId: input.taskId,
          projectId: input.projectId,
          goalId: input.goalId,
          threadId: input.threadId,
          decisionId: input.decisionId,
          uri: input.uri,
          summary: input.summary,
          content: input.content,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      artifactsCollection.put(id, artifact);
      await syncArtifactIndex(artifact);
      await recordActivity({
        entityType: "artifact",
        entityId: id,
        kind: input.archivedAt ? "archived" : "updated",
        title: `Artifact ${input.archivedAt ? "archived" : "updated"}: ${artifact.title}`,
        projectId: artifact.projectId,
        goalId: artifact.goalId,
        taskId: artifact.taskId,
        threadId: artifact.threadId,
      });
      appendAudit("artifacts.updated", "artifacts", { artifactId: id });
      return artifact;
    },
    archive: async (id) => artifactsApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = artifactsCollection.get(id);
      if (!existing) return false;
      artifactsCollection.remove(id);
      removeIndex("artifacts", id);
      if (existing.taskId) {
        const currentTask = tasksCollection.get(existing.taskId);
        if (currentTask) {
          await syncLinkedTask(existing.taskId, {
            evidenceIds: currentTask.evidenceIds.filter((artifactId) => artifactId !== id),
          });
        }
      }
      appendAudit("artifacts.removed", "artifacts", { artifactId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["artifacts"] }),
  };

  const decisionsApi: WorkspaceClawInstance["decisions"] = {
    list: async (options = {}) => decisionsCollection.list()
      .filter((decision) => !isArchived(decision, options.includeArchived))
      .filter((decision) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(decision.status);
      })
      .filter((decision) => !options.taskId || decision.taskId === options.taskId)
      .filter((decision) => !options.projectId || decision.projectId === options.projectId)
      .filter((decision) => !options.goalId || decision.goalId === options.goalId)
      .filter((decision) => !options.ownerPersonId || decision.ownerPersonId === options.ownerPersonId)
      .filter((decision) => !options.ownerAgentId || decision.ownerAgentId === options.ownerAgentId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => decisionsCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const decision: DecisionRecord = {
        id: toId("decision", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        status: input.status ?? "proposed",
        ...(input.summary ? { summary: input.summary } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.ownerPersonId ? { ownerPersonId: input.ownerPersonId } : {}),
        ...(input.ownerAgentId ? { ownerAgentId: input.ownerAgentId } : {}),
        ...(input.outcome ? { outcome: input.outcome } : {}),
        ...(input.rationale ? { rationale: input.rationale } : {}),
        alternatives: uniqueStrings(input.alternatives ?? []),
        artifactIds: normalizeRecordIds(input.artifactIds ?? []),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      decisionsCollection.put(decision.id, decision);
      await syncDecisionIndex(decision);
      if (decision.taskId) {
        const currentTask = tasksCollection.get(decision.taskId);
        if (currentTask) {
          await syncLinkedTask(decision.taskId, {
            decisionIds: uniqueStrings([...(currentTask.decisionIds ?? []), decision.id]),
          });
        }
      }
      await recordActivity({
        entityType: "decision",
        entityId: decision.id,
        kind: "created",
        title: `Decision recorded: ${decision.title}`,
        projectId: decision.projectId,
        goalId: decision.goalId,
        taskId: decision.taskId,
      });
      appendAudit("decisions.created", "decisions", { decisionId: decision.id, title: decision.title });
      return decision;
    },
    update: async (id, input) => {
      const current = assertRecord(decisionsCollection.get(id), "Decision", id);
      const decision: DecisionRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        ...removeUndefined({
          summary: input.summary,
          taskId: input.taskId,
          projectId: input.projectId,
          goalId: input.goalId,
          ownerPersonId: input.ownerPersonId,
          ownerAgentId: input.ownerAgentId,
          outcome: input.outcome,
          rationale: input.rationale,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        alternatives: input.alternatives ? uniqueStrings(input.alternatives) : current.alternatives,
        artifactIds: input.artifactIds ? normalizeRecordIds(input.artifactIds) : current.artifactIds,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      decisionsCollection.put(id, decision);
      await syncDecisionIndex(decision);
      await recordActivity({
        entityType: "decision",
        entityId: id,
        kind: input.archivedAt ? "archived" : "updated",
        title: `Decision ${input.archivedAt ? "archived" : "updated"}: ${decision.title}`,
        projectId: decision.projectId,
        goalId: decision.goalId,
        taskId: decision.taskId,
      });
      appendAudit("decisions.updated", "decisions", { decisionId: id });
      return decision;
    },
    archive: async (id) => decisionsApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = decisionsCollection.get(id);
      if (!existing) return false;
      decisionsCollection.remove(id);
      removeIndex("decisions", id);
      if (existing.taskId) {
        const currentTask = tasksCollection.get(existing.taskId);
        if (currentTask) {
          await syncLinkedTask(existing.taskId, {
            decisionIds: currentTask.decisionIds.filter((decisionId) => decisionId !== id),
          });
        }
      }
      appendAudit("decisions.removed", "decisions", { decisionId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["decisions"] }),
  };

  return {
    areasApi,
    listsApi,
    sectionsApi,
    commentsApi,
    attachmentsApi,
    savedViewsApi,
    recurrencesApi,
    cyclesApi,
    epicsApi,
    customFieldsApi,
    fieldValuesApi,
    templatesApi,
    tasksApi,
    goalsApi,
    projectsApi,
    milestonesApi,
    activityApi,
    blockersApi,
    artifactsApi,
    decisionsApi,
    syncLinkedTask,
    reconcileTaskBlockState,
    reconcileTaskAssignmentState,
    reconcileTaskHandoffState,
    reconcileTaskApprovalState,
  };
}
