// @ts-nocheck
import type { ClawInstance } from "@clawjs/claw";
import type { ActivityEntryRecord, WorkspaceToolDescriptor } from "@clawjs/core";

import {
  nowIso,
  uniqueStrings,
  scoreKeyword,
  cosineSimilarity,
  toCollectionId,
  toSearchResult,
  defaultSource,
  assertRecord,
  isArchived,
  toId,
} from "./workspace-utils.ts";
import { temporalToDeadlineRecord, temporalToEventRecord, temporalToReminderRecord, productivityStatusToTemporalStatus } from "./workspace-temporal.ts";
import {
  summarizeSnippet,
  areaSearchText,
  taskSearchText,
  goalSearchText,
  projectSearchText,
  milestoneSearchText,
  activitySearchText,
  blockerSearchText,
  artifactSearchText,
  decisionSearchText,
  workSessionSearchText,
  assignmentSearchText,
  handoffSearchText,
  approvalSearchText,
  capacitySearchText,
  agentSearchText,
  releaseSearchText,
  incidentSearchText,
  feedbackSearchText,
  checkSearchText,
  reminderSearchText,
  deadlineSearchText,
  noteSearchText,
  personSearchText,
  eventSearchText,
  simpleRecordTitle,
  simpleRecordSearchText,
} from "./workspace-search-text.ts";

export function createWorkspaceIndexing(input: {
  claw: ClawInstance;
  options: any;
  useTimeService: boolean;
  appendAudit: (event: string, capability: WorkspaceToolDescriptor["domain"] | "workspace_search" | "workspace_context", detail?: Record<string, unknown>) => void;
  readMeta: (key: string) => string | null;
  writeMeta: (key: string, value: string) => void;
  PRODUCTIVITY_SCHEMA_VERSION: number;
  PRODUCTIVITY_SCHEMA_HASH: string;
  [key: string]: any;
}) {
  const {
    claw,
    options,
    useTimeService,
    appendAudit,
    readMeta,
    writeMeta,
    PRODUCTIVITY_SCHEMA_VERSION,
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
    workSessionsCollection,
    assignmentsCollection,
    handoffsCollection,
    approvalsCollection,
    capacityCollection,
    agentsCollection,
    releasesCollection,
    incidentsCollection,
    feedbackCollection,
    checksCollection,
    remindersCollection,
    deadlinesCollection,
    notesCollection,
    peopleCollection,
    inboxThreadsCollection,
    inboxMessagesCollection,
    eventsCollection,
    workspaceMetaCollection,
    indexCollection,
    embeddingCollection,
  } = input;

  async function recordActivity(entry: Omit<ActivityEntryRecord, "id" | "createdAt" | "updatedAt" | "source"> & {
    source?: WorkspaceEntitySource;
  }): Promise<ActivityEntryRecord> {
    const timestamp = nowIso();
    const activity: ActivityEntryRecord = {
      id: toId("activity"),
      createdAt: timestamp,
      updatedAt: timestamp,
      source: defaultSource(entry.source ?? { kind: "derived" }),
      entityType: entry.entityType,
      entityId: entry.entityId,
      kind: entry.kind,
      title: entry.title,
      ...(entry.content ? { content: entry.content } : {}),
      ...(entry.areaId ? { areaId: entry.areaId } : {}),
      ...(entry.projectId ? { projectId: entry.projectId } : {}),
      ...(entry.goalId ? { goalId: entry.goalId } : {}),
      ...(entry.milestoneId ? { milestoneId: entry.milestoneId } : {}),
      ...(entry.taskId ? { taskId: entry.taskId } : {}),
      ...(entry.threadId ? { threadId: entry.threadId } : {}),
      ...(entry.actor ? { actor: entry.actor } : {}),
      ...(entry.links ? { links: entry.links } : {}),
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
    };
    activityCollection.put(activity.id, activity);
    await syncActivityIndex(activity);
    return activity;
  }

  async function maybeWriteEmbedding(
    domain: Extract<WorkspaceDomain, "notes" | "inbox">,
    sourceId: string,
    entityId: string,
    searchText: string,
  ): Promise<boolean> {
    const config = options.semanticSearch;
    const embeddingId = toCollectionId(domain, sourceId);
    if (!config?.embed) {
      embeddingCollection.remove(embeddingId);
      return false;
    }
    if (searchText.trim().length < (config.minTextLength ?? 80)) {
      embeddingCollection.remove(embeddingId);
      return false;
    }
    const vector = await config.embed(searchText);
    embeddingCollection.put(embeddingId, {
      id: embeddingId,
      domain,
      sourceId,
      entityId,
      searchText,
      vector,
      updatedAt: nowIso(),
    });
    return true;
  }

  function removeEmbedding(domain: Extract<WorkspaceDomain, "notes" | "inbox">, sourceId: string): void {
    embeddingCollection.remove(toCollectionId(domain, sourceId));
  }

  function putIndex(entry: WorkspaceIndexRecord): void {
    indexCollection.put(toCollectionId(entry.domain, entry.entityId), entry);
  }

  function removeIndex(domain: WorkspaceDomain, entityId: string): void {
    indexCollection.remove(toCollectionId(domain, entityId));
  }

  async function syncSimpleIndex(domain: WorkspaceDomain, record: WorkspaceRecordBase): Promise<void> {
    const searchable = record as WorkspaceRecordBase & Record<string, unknown>;
    const title = simpleRecordTitle(searchable);
    putIndex({
      id: toCollectionId(domain, record.id),
      domain,
      entityId: record.id,
      title,
      searchText: simpleRecordSearchText(searchable),
      snippet: summarizeSnippet(String(searchable.description ?? searchable.body ?? searchable.query ?? title)),
      updatedAt: record.updatedAt,
      ...(record.archivedAt ? { archivedAt: record.archivedAt } : {}),
      ...(record.links ? { links: record.links } : {}),
    });
  }

  function createSimpleApi<TRecord extends WorkspaceRecordBase & Record<string, any>, TCreate extends Record<string, any>, TUpdate extends Record<string, any>>(config: {
    domain: WorkspaceDomain;
    entityType: ActivityEntryRecord["entityType"];
    collection: ReturnType<typeof data.collection<TRecord>>;
    prefix: string;
    titleField: "title" | "name" | "body" | "fieldId";
    defaults?: Record<string, unknown>;
    arrayFields?: string[];
    archiveStatus?: string;
  }): WorkspaceCollectionApi<TRecord, TCreate, TUpdate> {
    const normalizeArrayFields = (record: TRecord): TRecord => {
      const mutable = record as Record<string, unknown>;
      for (const field of config.arrayFields ?? []) {
        if (Array.isArray(mutable[field])) mutable[field] = uniqueStrings(mutable[field]);
        else mutable[field] = [];
      }
      return record;
    };
    return {
      list: async (options = {}) => config.collection.list()
        .filter((record) => !isArchived(record, options.includeArchived))
        .filter((record) => {
          if (!options.status) return true;
          const statuses = Array.isArray(options.status) ? options.status : [options.status];
          return statuses.includes(String(record.status));
        })
        .filter((record) => {
          if (!options.kind) return true;
          const kinds = Array.isArray(options.kind) ? options.kind : [options.kind];
          return kinds.includes(String(record.kind));
        })
        .filter((record) => !options.entityType || record.entityType === options.entityType)
        .filter((record) => !options.entityId || record.entityId === options.entityId)
        .filter((record) => !options.projectId || record.projectId === options.projectId)
        .filter((record) => !options.goalId || record.goalId === options.goalId)
        .filter((record) => !options.areaId || record.areaId === options.areaId)
        .filter((record) => !options.listId || record.listId === options.listId)
        .filter((record) => !options.anchorId || record.anchorId === options.anchorId)
        .sort((left, right) => {
          if (typeof left.rank === "number" && typeof right.rank === "number" && left.rank !== right.rank) return left.rank - right.rank;
          return right.updatedAt.localeCompare(left.updatedAt);
        })
        .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
      get: async (id) => config.collection.get(id),
      create: async (input) => {
        const timestamp = nowIso();
        const { id, source, links, metadata, ...rest } = input;
        const rawTitle = rest[config.titleField];
        const record = normalizeArrayFields({
          id: toId(config.prefix, typeof id === "string" ? id : undefined),
          createdAt: timestamp,
          updatedAt: timestamp,
          source: defaultSource(source),
          ...config.defaults,
          ...removeUndefined(rest),
          ...(typeof rawTitle === "string" ? { [config.titleField]: rawTitle.trim() } : {}),
          ...(links ? { links } : {}),
          ...(metadata ? { metadata } : {}),
        } as TRecord);
        config.collection.put(record.id, record);
        await syncSimpleIndex(config.domain, record);
        await recordActivity({
          entityType: config.entityType,
          entityId: record.id,
          kind: "created",
          title: `${config.domain} created: ${simpleRecordTitle(record)}`,
          projectId: typeof record.projectId === "string" ? record.projectId : undefined,
          goalId: typeof record.goalId === "string" ? record.goalId : undefined,
          taskId: typeof record.taskId === "string" ? record.taskId : undefined,
        });
        appendAudit(`${config.domain}.created`, config.domain, { id: record.id });
        return record;
      },
      update: async (id, input) => {
        const current = assertRecord(config.collection.get(id), String(config.domain), id);
        const { source: _source, links, metadata, ...rest } = input;
        const rawTitle = rest[config.titleField];
        const record = normalizeArrayFields({
          ...current,
          ...removeUndefined({
            ...rest,
            archivedAt: rest.archivedAt === null ? undefined : rest.archivedAt,
          }),
          ...(typeof rawTitle === "string" ? { [config.titleField]: rawTitle.trim() } : {}),
          links: links ?? current.links,
          metadata: metadata ?? current.metadata,
          updatedAt: nowIso(),
        } as TRecord);
        config.collection.put(id, record);
        await syncSimpleIndex(config.domain, record);
        await recordActivity({
          entityType: config.entityType,
          entityId: id,
          kind: rest.archivedAt ? "archived" : "updated",
          title: `${config.domain} ${rest.archivedAt ? "archived" : "updated"}: ${simpleRecordTitle(record)}`,
          projectId: typeof record.projectId === "string" ? record.projectId : undefined,
          goalId: typeof record.goalId === "string" ? record.goalId : undefined,
          taskId: typeof record.taskId === "string" ? record.taskId : undefined,
        });
        appendAudit(`${config.domain}.updated`, config.domain, { id });
        return record;
      },
      archive: async (id) => {
        const current = assertRecord(config.collection.get(id), String(config.domain), id);
        const record = normalizeArrayFields({
          ...current,
          ...(typeof current.status === "string" && config.archiveStatus ? { status: config.archiveStatus } : {}),
          archivedAt: nowIso(),
          updatedAt: nowIso(),
        } as TRecord);
        config.collection.put(id, record);
        await syncSimpleIndex(config.domain, record);
        await recordActivity({
          entityType: config.entityType,
          entityId: id,
          kind: "archived",
          title: `${config.domain} archived: ${simpleRecordTitle(record)}`,
          projectId: typeof record.projectId === "string" ? record.projectId : undefined,
          goalId: typeof record.goalId === "string" ? record.goalId : undefined,
          taskId: typeof record.taskId === "string" ? record.taskId : undefined,
        });
        appendAudit(`${config.domain}.updated`, config.domain, { id });
        return record;
      },
      remove: async (id) => {
        const existing = config.collection.get(id);
        if (!existing) return false;
        config.collection.remove(id);
        removeIndex(config.domain, id);
        appendAudit(`${config.domain}.removed`, config.domain, { id });
        return true;
      },
      search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: [config.domain] }),
    };
  }

  function readInboxMessagesForThread(threadId: string): InboxMessageRecord[] {
    return inboxMessagesCollection.entries()
      .map((entry) => entry.value)
      .filter((message) => message.threadId === threadId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async function syncAreaIndex(area: AreaRecord): Promise<void> {
    putIndex({
      id: toCollectionId("areas", area.id),
      domain: "areas",
      entityId: area.id,
      title: area.name,
      searchText: areaSearchText(area),
      snippet: summarizeSnippet(area.description || area.name),
      updatedAt: area.updatedAt,
      ...(area.archivedAt ? { archivedAt: area.archivedAt } : {}),
      ...(area.links ? { links: area.links } : {}),
    });
  }

  async function syncTaskIndex(task: TaskRecord): Promise<void> {
    putIndex({
      id: toCollectionId("tasks", task.id),
      domain: "tasks",
      entityId: task.id,
      title: task.title,
      searchText: taskSearchText(task),
      snippet: summarizeSnippet(task.description || task.title),
      updatedAt: task.updatedAt,
      ...(task.archivedAt ? { archivedAt: task.archivedAt } : {}),
      ...(task.links ? { links: task.links } : {}),
    });
  }

  async function syncGoalIndex(goal: GoalRecord): Promise<void> {
    putIndex({
      id: toCollectionId("goals", goal.id),
      domain: "goals",
      entityId: goal.id,
      title: goal.title,
      searchText: goalSearchText(goal),
      snippet: summarizeSnippet(goal.description || goal.title),
      updatedAt: goal.updatedAt,
      ...(goal.archivedAt ? { archivedAt: goal.archivedAt } : {}),
      ...(goal.links ? { links: goal.links } : {}),
    });
  }

  async function syncProjectIndex(project: ProjectRecord): Promise<void> {
    putIndex({
      id: toCollectionId("projects", project.id),
      domain: "projects",
      entityId: project.id,
      title: project.name,
      searchText: projectSearchText(project),
      snippet: summarizeSnippet(project.description || project.name),
      updatedAt: project.updatedAt,
      ...(project.archivedAt ? { archivedAt: project.archivedAt } : {}),
      ...(project.links ? { links: project.links } : {}),
    });
  }

  async function syncMilestoneIndex(milestone: MilestoneRecord): Promise<void> {
    putIndex({
      id: toCollectionId("milestones", milestone.id),
      domain: "milestones",
      entityId: milestone.id,
      title: milestone.title,
      searchText: milestoneSearchText(milestone),
      snippet: summarizeSnippet(milestone.description || milestone.title),
      updatedAt: milestone.updatedAt,
      ...(milestone.archivedAt ? { archivedAt: milestone.archivedAt } : {}),
      ...(milestone.links ? { links: milestone.links } : {}),
    });
  }

  async function syncActivityIndex(activity: ActivityEntryRecord): Promise<void> {
    putIndex({
      id: toCollectionId("activity", activity.id),
      domain: "activity",
      entityId: activity.id,
      title: activity.title,
      searchText: activitySearchText(activity),
      snippet: summarizeSnippet(activity.content || activity.title),
      updatedAt: activity.updatedAt,
      ...(activity.archivedAt ? { archivedAt: activity.archivedAt } : {}),
      ...(activity.links ? { links: activity.links } : {}),
    });
  }

  async function syncBlockerIndex(blocker: BlockerRecord): Promise<void> {
    putIndex({
      id: toCollectionId("blockers", blocker.id),
      domain: "blockers",
      entityId: blocker.id,
      title: blocker.title,
      searchText: blockerSearchText(blocker),
      snippet: summarizeSnippet(blocker.description || blocker.title),
      updatedAt: blocker.updatedAt,
      ...(blocker.archivedAt ? { archivedAt: blocker.archivedAt } : {}),
      ...(blocker.links ? { links: blocker.links } : {}),
    });
  }

  async function syncArtifactIndex(artifact: ArtifactRecord): Promise<void> {
    putIndex({
      id: toCollectionId("artifacts", artifact.id),
      domain: "artifacts",
      entityId: artifact.id,
      title: artifact.title,
      searchText: artifactSearchText(artifact),
      snippet: summarizeSnippet(artifact.summary || artifact.content || artifact.uri || artifact.title),
      updatedAt: artifact.updatedAt,
      ...(artifact.archivedAt ? { archivedAt: artifact.archivedAt } : {}),
      ...(artifact.links ? { links: artifact.links } : {}),
    });
  }

  async function syncDecisionIndex(decision: DecisionRecord): Promise<void> {
    putIndex({
      id: toCollectionId("decisions", decision.id),
      domain: "decisions",
      entityId: decision.id,
      title: decision.title,
      searchText: decisionSearchText(decision),
      snippet: summarizeSnippet(decision.summary || decision.outcome || decision.title),
      updatedAt: decision.updatedAt,
      ...(decision.archivedAt ? { archivedAt: decision.archivedAt } : {}),
      ...(decision.links ? { links: decision.links } : {}),
    });
  }

  async function syncWorkSessionIndex(session: WorkSessionRecord): Promise<void> {
    putIndex({
      id: toCollectionId("work_sessions", session.id),
      domain: "work_sessions",
      entityId: session.id,
      title: session.title,
      searchText: workSessionSearchText(session),
      snippet: summarizeSnippet(session.objective || session.outcome || session.title),
      updatedAt: session.updatedAt,
      ...(session.archivedAt ? { archivedAt: session.archivedAt } : {}),
      ...(session.links ? { links: session.links } : {}),
    });
  }

  async function syncAssignmentIndex(assignment: AssignmentRecord): Promise<void> {
    putIndex({
      id: toCollectionId("assignments", assignment.id),
      domain: "assignments",
      entityId: assignment.id,
      title: assignment.title,
      searchText: assignmentSearchText(assignment),
      snippet: summarizeSnippet(assignment.rationale || assignment.rejectionReason || assignment.title),
      updatedAt: assignment.updatedAt,
      ...(assignment.archivedAt ? { archivedAt: assignment.archivedAt } : {}),
      ...(assignment.links ? { links: assignment.links } : {}),
    });
  }

  async function syncHandoffIndex(handoff: HandoffRecord): Promise<void> {
    putIndex({
      id: toCollectionId("handoffs", handoff.id),
      domain: "handoffs",
      entityId: handoff.id,
      title: handoff.title,
      searchText: handoffSearchText(handoff),
      snippet: summarizeSnippet(handoff.objective || handoff.nextStep || handoff.contextSummary || handoff.title),
      updatedAt: handoff.updatedAt,
      ...(handoff.archivedAt ? { archivedAt: handoff.archivedAt } : {}),
      ...(handoff.links ? { links: handoff.links } : {}),
    });
  }

  async function syncApprovalIndex(approval: ProductivityApprovalRecord): Promise<void> {
    putIndex({
      id: toCollectionId("approvals", approval.id),
      domain: "approvals",
      entityId: approval.id,
      title: approval.title,
      searchText: approvalSearchText(approval),
      snippet: summarizeSnippet(approval.policyReason || approval.outcome || approval.title),
      updatedAt: approval.updatedAt,
      ...(approval.archivedAt ? { archivedAt: approval.archivedAt } : {}),
      ...(approval.links ? { links: approval.links } : {}),
    });
  }

  async function syncCapacityIndex(capacity: CapacityRecord): Promise<void> {
    putIndex({
      id: toCollectionId("capacity", capacity.id),
      domain: "capacity",
      entityId: capacity.id,
      title: capacity.title,
      searchText: capacitySearchText(capacity),
      snippet: summarizeSnippet(`${capacity.status} ${capacity.availability} wip=${capacity.currentWip} queue=${capacity.queueDepth}`),
      updatedAt: capacity.updatedAt,
      ...(capacity.archivedAt ? { archivedAt: capacity.archivedAt } : {}),
      ...(capacity.links ? { links: capacity.links } : {}),
    });
  }

  async function syncAgentIndex(agent: AgentRecord): Promise<void> {
    putIndex({
      id: toCollectionId("agents", agent.id),
      domain: "agents",
      entityId: agent.id,
      title: agent.name,
      searchText: agentSearchText(agent),
      snippet: summarizeSnippet(agent.currentFocus || `${agent.role} ${agent.autonomyLevel}`),
      updatedAt: agent.updatedAt,
      ...(agent.archivedAt ? { archivedAt: agent.archivedAt } : {}),
      ...(agent.links ? { links: agent.links } : {}),
    });
  }

  async function syncReleaseIndex(release: ReleaseRecord): Promise<void> {
    putIndex({
      id: toCollectionId("releases", release.id),
      domain: "releases",
      entityId: release.id,
      title: release.title,
      searchText: releaseSearchText(release),
      snippet: summarizeSnippet(release.riskSummary || release.title),
      updatedAt: release.updatedAt,
      ...(release.archivedAt ? { archivedAt: release.archivedAt } : {}),
      ...(release.links ? { links: release.links } : {}),
    });
  }

  async function syncIncidentIndex(incident: IncidentRecord): Promise<void> {
    putIndex({
      id: toCollectionId("incidents", incident.id),
      domain: "incidents",
      entityId: incident.id,
      title: incident.title,
      searchText: incidentSearchText(incident),
      snippet: summarizeSnippet(incident.summary || incident.customerImpact || incident.title),
      updatedAt: incident.updatedAt,
      ...(incident.archivedAt ? { archivedAt: incident.archivedAt } : {}),
      ...(incident.links ? { links: incident.links } : {}),
    });
  }

  async function syncFeedbackIndex(feedback: FeedbackRecord): Promise<void> {
    putIndex({
      id: toCollectionId("feedback", feedback.id),
      domain: "feedback",
      entityId: feedback.id,
      title: feedback.title,
      searchText: feedbackSearchText(feedback),
      snippet: summarizeSnippet(feedback.summary || feedback.title),
      updatedAt: feedback.updatedAt,
      ...(feedback.archivedAt ? { archivedAt: feedback.archivedAt } : {}),
      ...(feedback.links ? { links: feedback.links } : {}),
    });
  }

  async function syncCheckIndex(check: OperationalCheckRecord): Promise<void> {
    putIndex({
      id: toCollectionId("checks", check.id),
      domain: "checks",
      entityId: check.id,
      title: check.title,
      searchText: checkSearchText(check),
      snippet: summarizeSnippet(check.resultSummary || check.playbook || check.title),
      updatedAt: check.updatedAt,
      ...(check.archivedAt ? { archivedAt: check.archivedAt } : {}),
      ...(check.links ? { links: check.links } : {}),
    });
  }

  async function syncReminderIndex(reminder: ReminderRecord): Promise<void> {
    putIndex({
      id: toCollectionId("reminders", reminder.id),
      domain: "reminders",
      entityId: reminder.id,
      title: reminder.title,
      searchText: reminderSearchText(reminder),
      snippet: summarizeSnippet(reminder.description || reminder.title),
      updatedAt: reminder.updatedAt,
      ...(reminder.archivedAt ? { archivedAt: reminder.archivedAt } : {}),
      ...(reminder.links ? { links: reminder.links } : {}),
    });
  }

  async function syncDeadlineIndex(deadline: DeadlineRecord): Promise<void> {
    putIndex({
      id: toCollectionId("deadlines", deadline.id),
      domain: "deadlines",
      entityId: deadline.id,
      title: deadline.title,
      searchText: deadlineSearchText(deadline),
      snippet: summarizeSnippet(deadline.description || deadline.title),
      updatedAt: deadline.updatedAt,
      ...(deadline.archivedAt ? { archivedAt: deadline.archivedAt } : {}),
      ...(deadline.links ? { links: deadline.links } : {}),
    });
  }

  async function syncNoteIndex(note: NoteRecord): Promise<void> {
    const searchText = noteSearchText(note);
    putIndex({
      id: toCollectionId("notes", note.id),
      domain: "notes",
      entityId: note.id,
      title: note.title,
      searchText,
      snippet: summarizeSnippet(note.summary || searchText),
      updatedAt: note.updatedAt,
      ...(note.archivedAt ? { archivedAt: note.archivedAt } : {}),
      ...(note.links ? { links: note.links } : {}),
    });
    await maybeWriteEmbedding("notes", note.id, note.id, searchText);
  }

  async function syncPersonIndex(person: PersonRecord): Promise<void> {
    putIndex({
      id: toCollectionId("people", person.id),
      domain: "people",
      entityId: person.id,
      title: person.displayName,
      searchText: personSearchText(person),
      snippet: summarizeSnippet([person.role, person.organization, ...person.handles].filter(Boolean).join(" ")),
      updatedAt: person.updatedAt,
      ...(person.archivedAt ? { archivedAt: person.archivedAt } : {}),
      ...(person.links ? { links: person.links } : {}),
    });
  }

  async function syncEventIndex(event: EventRecord): Promise<void> {
    putIndex({
      id: toCollectionId("events", event.id),
      domain: "events",
      entityId: event.id,
      title: event.title,
      searchText: eventSearchText(event),
      snippet: summarizeSnippet([event.description, event.location].filter(Boolean).join(" ")),
      updatedAt: event.updatedAt,
      ...(event.archivedAt ? { archivedAt: event.archivedAt } : {}),
      ...(event.links ? { links: event.links } : {}),
    });
  }

  async function syncInboxThreadIndex(threadId: string): Promise<void> {
    const thread = inboxThreadsCollection.get(threadId);
    if (!thread) {
      removeIndex("inbox", threadId);
      return;
    }
    const messages = readInboxMessagesForThread(threadId);
    const combinedText = [thread.subject, thread.preview, ...messages.map((message) => message.content)].filter(Boolean).join(" ");
    putIndex({
      id: toCollectionId("inbox", thread.id),
      domain: "inbox",
      entityId: thread.id,
      title: thread.subject || `Thread ${thread.id}`,
      searchText: combinedText,
      snippet: summarizeSnippet(thread.preview || combinedText),
      updatedAt: thread.updatedAt,
      ...(thread.archivedAt ? { archivedAt: thread.archivedAt } : {}),
      ...(thread.links ? { links: thread.links } : {}),
    });
    for (const message of messages) {
      const written = await maybeWriteEmbedding("inbox", message.id, thread.id, message.content);
      if (!written) {
        removeEmbedding("inbox", message.id);
      }
    }
  }

  async function migrateProductivitySchema(): Promise<void> {
    const currentVersion = Number(readMeta("productivity_schema_version") ?? "1");
    if (currentVersion >= PRODUCTIVITY_SCHEMA_VERSION) return;

    for (const task of tasksCollection.list()) {
      tasksCollection.put(task.id, {
        ...task,
        labels: uniqueStrings(task.labels ?? []),
        watcherPersonIds: uniqueStrings(task.watcherPersonIds ?? []),
        childTaskIds: uniqueStrings(task.childTaskIds ?? []),
        dependsOnTaskIds: uniqueStrings(task.dependsOnTaskIds ?? []),
        commentIds: uniqueStrings(task.commentIds ?? []),
        attachmentIds: uniqueStrings(task.attachmentIds ?? []),
        blockedByIds: uniqueStrings(task.blockedByIds ?? []),
        evidenceIds: uniqueStrings(task.evidenceIds ?? []),
        decisionIds: uniqueStrings(task.decisionIds ?? []),
        assignmentIds: uniqueStrings(task.assignmentIds ?? []),
        handoffIds: uniqueStrings(task.handoffIds ?? []),
        approvalIds: uniqueStrings(task.approvalIds ?? []),
        checklist: normalizeChecklist(task.checklist),
      });
    }
    for (const goal of goalsCollection.list()) {
      goalsCollection.put(goal.id, {
        ...goal,
      });
    }
    for (const project of projectsCollection.list()) {
      projectsCollection.put(project.id, {
        ...project,
        milestoneIds: normalizeMilestoneIds(project.milestoneIds ?? []),
        defaultSectionIds: uniqueStrings(project.defaultSectionIds ?? []),
      });
    }
    for (const blocker of blockersCollection.list()) {
      blockersCollection.put(blocker.id, {
        ...blocker,
        dependencyTaskIds: uniqueStrings(blocker.dependencyTaskIds ?? []),
        evidenceIds: uniqueStrings(blocker.evidenceIds ?? []),
      });
    }
    for (const decision of decisionsCollection.list()) {
      decisionsCollection.put(decision.id, {
        ...decision,
        alternatives: uniqueStrings(decision.alternatives ?? []),
        artifactIds: uniqueStrings(decision.artifactIds ?? []),
      });
    }
    for (const session of workSessionsCollection.list()) {
      workSessionsCollection.put(session.id, {
        ...session,
        taskIds: uniqueStrings(session.taskIds ?? []),
        blockerIds: uniqueStrings(session.blockerIds ?? []),
      });
    }
    for (const assignment of assignmentsCollection.list()) {
      assignmentsCollection.put(assignment.id, {
        ...assignment,
      });
    }
    for (const handoff of handoffsCollection.list()) {
      handoffsCollection.put(handoff.id, {
        ...handoff,
        artifactIds: uniqueStrings(handoff.artifactIds ?? []),
        blockerIds: uniqueStrings(handoff.blockerIds ?? []),
      });
    }
    for (const approval of approvalsCollection.list()) {
      approvalsCollection.put(approval.id, {
        ...approval,
        evidenceIds: uniqueStrings(approval.evidenceIds ?? []),
        decisionIds: uniqueStrings(approval.decisionIds ?? []),
      });
    }
    for (const snapshot of capacityCollection.list()) {
      capacityCollection.put(snapshot.id, {
        ...snapshot,
        assignedTaskIds: uniqueStrings(snapshot.assignedTaskIds ?? []),
        pendingApprovalIds: uniqueStrings(snapshot.pendingApprovalIds ?? []),
        pendingHandoffIds: uniqueStrings(snapshot.pendingHandoffIds ?? []),
      });
    }
    for (const agent of agentsCollection.list()) {
      agentsCollection.put(agent.id, {
        ...agent,
        domains: uniqueStrings(agent.domains ?? []),
        permissions: uniqueStrings(agent.permissions ?? []),
        linkedTaskIds: uniqueStrings(agent.linkedTaskIds ?? []),
      });
    }
    for (const release of releasesCollection.list()) {
      releasesCollection.put(release.id, {
        ...release,
        linkedTaskIds: uniqueStrings(release.linkedTaskIds ?? []),
        incidentIds: uniqueStrings(release.incidentIds ?? []),
        approvalIds: uniqueStrings(release.approvalIds ?? []),
      });
    }
    for (const incident of incidentsCollection.list()) {
      incidentsCollection.put(incident.id, {
        ...incident,
        blockerIds: uniqueStrings(incident.blockerIds ?? []),
        feedbackIds: uniqueStrings(incident.feedbackIds ?? []),
      });
    }
    writeMeta("productivity_schema_version", String(PRODUCTIVITY_SCHEMA_VERSION));
  }

  async function rebuildIndexes(): Promise<{ reindexed: number; embeddings: number }> {
    for (const id of indexCollection.listIds()) {
      indexCollection.remove(id);
    }
    for (const id of embeddingCollection.listIds()) {
      embeddingCollection.remove(id);
    }

    let reindexed = 0;
    let embeddings = 0;
    for (const area of areasCollection.list()) {
      await syncAreaIndex(area);
      reindexed += 1;
    }
    for (const item of listsCollection.list()) {
      await syncSimpleIndex("lists", item);
      reindexed += 1;
    }
    for (const item of sectionsCollection.list()) {
      await syncSimpleIndex("sections", item);
      reindexed += 1;
    }
    for (const task of tasksCollection.list()) {
      await syncTaskIndex(task);
      reindexed += 1;
    }
    for (const goal of goalsCollection.list()) {
      await syncGoalIndex(goal);
      reindexed += 1;
    }
    for (const project of projectsCollection.list()) {
      await syncProjectIndex(project);
      reindexed += 1;
    }
    for (const item of commentsCollection.list()) {
      await syncSimpleIndex("comments", item);
      reindexed += 1;
    }
    for (const item of attachmentsCollection.list()) {
      await syncSimpleIndex("attachments", item);
      reindexed += 1;
    }
    for (const item of savedViewsCollection.list()) {
      await syncSimpleIndex("saved_views", item);
      reindexed += 1;
    }
    for (const item of recurrencesCollection.list()) {
      await syncSimpleIndex("recurrences", item);
      reindexed += 1;
    }
    for (const item of cyclesCollection.list()) {
      await syncSimpleIndex("cycles", item);
      reindexed += 1;
    }
    for (const item of epicsCollection.list()) {
      await syncSimpleIndex("epics", item);
      reindexed += 1;
    }
    for (const item of customFieldsCollection.list()) {
      await syncSimpleIndex("custom_fields", item);
      reindexed += 1;
    }
    for (const item of fieldValuesCollection.list()) {
      await syncSimpleIndex("field_values", item);
      reindexed += 1;
    }
    for (const item of templatesCollection.list()) {
      await syncSimpleIndex("templates", item);
      reindexed += 1;
    }
    for (const milestone of milestonesCollection.list()) {
      await syncMilestoneIndex(milestone);
      reindexed += 1;
    }
    for (const blocker of blockersCollection.list()) {
      await syncBlockerIndex(blocker);
      reindexed += 1;
    }
    for (const artifact of artifactsCollection.list()) {
      await syncArtifactIndex(artifact);
      reindexed += 1;
    }
    for (const decision of decisionsCollection.list()) {
      await syncDecisionIndex(decision);
      reindexed += 1;
    }
    for (const session of workSessionsCollection.list()) {
      await syncWorkSessionIndex(session);
      reindexed += 1;
    }
    for (const assignment of assignmentsCollection.list()) {
      await syncAssignmentIndex(assignment);
      reindexed += 1;
    }
    for (const handoff of handoffsCollection.list()) {
      await syncHandoffIndex(handoff);
      reindexed += 1;
    }
    for (const approval of approvalsCollection.list()) {
      await syncApprovalIndex(approval);
      reindexed += 1;
    }
    for (const snapshot of capacityCollection.list()) {
      await syncCapacityIndex(snapshot);
      reindexed += 1;
    }
    for (const agent of agentsCollection.list()) {
      await syncAgentIndex(agent);
      reindexed += 1;
    }
    for (const release of releasesCollection.list()) {
      await syncReleaseIndex(release);
      reindexed += 1;
    }
    for (const incident of incidentsCollection.list()) {
      await syncIncidentIndex(incident);
      reindexed += 1;
    }
    for (const item of feedbackCollection.list()) {
      await syncFeedbackIndex(item);
      reindexed += 1;
    }
    for (const check of checksCollection.list()) {
      await syncCheckIndex(check);
      reindexed += 1;
    }
    if (useTimeService) {
      for (const reminder of (await claw.time.list({ kind: "reminder" })).items.map((item) => temporalToReminderRecord(item))) {
        await syncReminderIndex(reminder);
        reindexed += 1;
      }
      for (const deadline of (await claw.time.list({ kind: "deadline" })).items.map((item) => temporalToDeadlineRecord(item))) {
        await syncDeadlineIndex(deadline);
        reindexed += 1;
      }
    } else {
      for (const reminder of remindersCollection.list()) {
        await syncReminderIndex(reminder);
        reindexed += 1;
      }
      for (const deadline of deadlinesCollection.list()) {
        await syncDeadlineIndex(deadline);
        reindexed += 1;
      }
    }
    for (const note of notesCollection.list()) {
      await syncNoteIndex(note);
      reindexed += 1;
    }
    for (const person of peopleCollection.list()) {
      await syncPersonIndex(person);
      reindexed += 1;
    }
    if (useTimeService) {
      for (const event of (await claw.time.list({ kind: "event" })).items.map((item) => temporalToEventRecord(item))) {
        await syncEventIndex(event);
        reindexed += 1;
      }
    } else {
      for (const event of eventsCollection.list()) {
        await syncEventIndex(event);
        reindexed += 1;
      }
    }
    for (const thread of inboxThreadsCollection.list()) {
      await syncInboxThreadIndex(thread.id);
      reindexed += 1;
    }
    for (const activity of activityCollection.list()) {
      await syncActivityIndex(activity);
      reindexed += 1;
    }
    embeddings = embeddingCollection.listIds().length;
    appendAudit("workspace.index.rebuilt", "workspace_search", { reindexed, embeddings });
    return { reindexed, embeddings };
  }

  async function migrateTemporalCollectionsToTime(): Promise<void> {
    if (!useTimeService) return;
    const migrationId = "time_embedded_projection_imported_at";
    if (workspaceMetaCollection.get(migrationId)) return;

    for (const event of eventsCollection.list()) {
      const existing = await claw.time.get(event.id).catch(() => null);
      if (existing) continue;
      await claw.time.create({
        id: event.id,
        kind: "event",
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        location: event.location,
        participants: event.attendeePersonIds.map((personId) => ({ kind: "human", label: personId, personId })),
        actions: event.reminders.map((reminder) => ({ id: reminder.id, kind: "notify", target: reminder.channel })),
        projections: [{
          id: `${event.id}-workspace-events`,
          target: "workspace_events",
          provider: "workspace",
          detail: {
            linkedTaskIds: event.linkedTaskIds,
            linkedNoteIds: event.linkedNoteIds,
          },
        }],
      });
    }

    for (const reminder of remindersCollection.list()) {
      const existing = await claw.time.get(reminder.id).catch(() => null);
      if (existing) continue;
      const created = await claw.time.create({
        id: reminder.id,
        kind: "reminder",
        title: reminder.title,
        description: reminder.description,
        startsAt: reminder.triggerAt,
        schedule: { mode: "one_off", timezone: "UTC", startsAt: reminder.triggerAt },
        actions: [{ id: `${reminder.id}-notify`, kind: "notify", target: reminder.channel }],
        anchorType: reminder.anchorType,
        anchorId: reminder.anchorId,
      });
      const targetStatus = productivityStatusToTemporalStatus(reminder.status);
      if (targetStatus && targetStatus !== created.item.status) {
        await claw.time.update(reminder.id, { status: targetStatus });
      }
    }

    for (const deadline of deadlinesCollection.list()) {
      const existing = await claw.time.get(deadline.id).catch(() => null);
      if (existing) continue;
      const created = await claw.time.create({
        id: deadline.id,
        kind: "deadline",
        title: deadline.title,
        description: deadline.description,
        dueAt: deadline.dueAt,
        schedule: { mode: "one_off", timezone: "UTC", startsAt: deadline.dueAt },
        anchorType: deadline.anchorType,
        anchorId: deadline.anchorId,
      });
      const targetStatus = productivityStatusToTemporalStatus(deadline.status);
      if (targetStatus && targetStatus !== created.item.status) {
        await claw.time.update(deadline.id, { status: targetStatus });
      }
    }

    workspaceMetaCollection.put(migrationId, { id: migrationId, migratedAt: nowIso() });
  }

  async function keywordSearch(input: WorkspaceSearchQuery): Promise<Map<string, WorkspaceSearchResult>> {
    const query = input.query.trim();
    const domains = new Set(input.domains && input.domains.length > 0 ? input.domains : ["areas", "tasks", "goals", "projects", "milestones", "activity", "blockers", "artifacts", "decisions", "work_sessions", "assignments", "handoffs", "approvals", "capacity", "agents", "releases", "incidents", "feedback", "checks", "reminders", "deadlines", "notes", "people", "inbox", "events"]);
    const results = new Map<string, WorkspaceSearchResult>();
    for (const entry of indexCollection.entries().map((item) => item.value)) {
      if (!domains.has(entry.domain)) continue;
      if (!input.includeArchived && entry.archivedAt) continue;
      const titleScore = scoreKeyword(entry.title, query, 50);
      const textScore = scoreKeyword(entry.searchText, query, 20);
      const score = titleScore + textScore;
      if (score <= 0) continue;
      const matchedFields: string[] = [];
      if (titleScore > 0) matchedFields.push("title");
      if (textScore > 0) matchedFields.push("text");
      results.set(`${entry.domain}:${entry.entityId}`, toSearchResult(entry, score, "keyword", matchedFields));
    }
    return results;
  }

  async function semanticSearch(input: WorkspaceSearchQuery): Promise<Map<string, WorkspaceSearchResult>> {
    if (!options.semanticSearch?.embed) {
      return new Map();
    }
    const queryText = input.query.trim();
    if (!queryText) return new Map();
    const queryVector = await options.semanticSearch.embed(queryText);
    const domains = new Set(input.domains && input.domains.length > 0 ? input.domains : ["areas", "tasks", "goals", "projects", "milestones", "activity", "blockers", "artifacts", "decisions", "work_sessions", "assignments", "handoffs", "approvals", "capacity", "agents", "releases", "incidents", "feedback", "checks", "reminders", "deadlines", "notes", "people", "inbox", "events"]);
    const results = new Map<string, WorkspaceSearchResult>();
    const indices = new Map(indexCollection.entries().map((entry) => [`${entry.value.domain}:${entry.value.entityId}`, entry.value]));
    for (const embedding of embeddingCollection.entries().map((entry) => entry.value)) {
      if (!domains.has(embedding.domain)) continue;
      const indexEntry = indices.get(`${embedding.domain}:${embedding.entityId}`);
      if (!indexEntry) continue;
      if (!input.includeArchived && indexEntry.archivedAt) continue;
      const similarity = cosineSimilarity(embedding.vector, queryVector);
      if (similarity <= 0.05) continue;
      const score = similarity * 100;
      const key = `${embedding.domain}:${embedding.entityId}`;
      const existing = results.get(key);
      if (!existing || score > existing.score) {
        results.set(key, toSearchResult(indexEntry, score, "semantic", ["semantic"]));
      }
    }
    return results;
  }

  async function searchWorkspace(input: WorkspaceSearchQuery): Promise<WorkspaceSearchResult[]> {
    const normalizedInput: WorkspaceSearchQuery = {
      strategy: "auto",
      limit: 10,
      ...input,
      query: input.query.trim(),
    };
    if (!normalizedInput.query) return [];

    const requestedStrategy = normalizedInput.strategy ?? "auto";
    const runKeyword = requestedStrategy === "auto" || requestedStrategy === "keyword" || requestedStrategy === "hybrid";
    const runSemantic = requestedStrategy === "semantic" || requestedStrategy === "hybrid";
    const keywordResults = runKeyword ? await keywordSearch(normalizedInput) : new Map<string, WorkspaceSearchResult>();
    const semanticResults = runSemantic ? await semanticSearch(normalizedInput) : new Map<string, WorkspaceSearchResult>();
    const combined = new Map<string, WorkspaceSearchResult>();

    for (const [key, result] of keywordResults.entries()) {
      combined.set(key, result);
    }

    if (semanticResults.size > 0) {
      for (const [key, semanticResult] of semanticResults.entries()) {
        const existing = combined.get(key);
        if (!existing) {
          combined.set(key, requestedStrategy === "hybrid"
            ? { ...semanticResult, strategy: "hybrid", matchedFields: ["semantic"] }
            : semanticResult);
          continue;
        }
        combined.set(key, {
          ...existing,
          score: existing.score + semanticResult.score,
          strategy: requestedStrategy === "hybrid" ? "hybrid" : semanticResult.strategy,
          matchedFields: uniqueStrings([...existing.matchedFields, ...semanticResult.matchedFields]),
        });
      }
    }

    const results = [...combined.values()]
      .sort((left, right) => right.score - left.score || (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
      .slice(0, normalizedInput.limit ?? 10);

    appendAudit("workspace.search.queried", "workspace_search", {
      query: normalizedInput.query,
      strategy: requestedStrategy,
      domains: normalizedInput.domains?.join(",") ?? "all",
      resultCount: results.length,
    });
    return results;
  }

  return {
    recordActivity,
    createSimpleApi,
    removeEmbedding,
    removeIndex,
    readInboxMessagesForThread,
    syncAreaIndex,
    syncTaskIndex,
    syncGoalIndex,
    syncProjectIndex,
    syncMilestoneIndex,
    syncActivityIndex,
    syncBlockerIndex,
    syncArtifactIndex,
    syncDecisionIndex,
    syncWorkSessionIndex,
    syncAssignmentIndex,
    syncHandoffIndex,
    syncApprovalIndex,
    syncCapacityIndex,
    syncAgentIndex,
    syncReleaseIndex,
    syncIncidentIndex,
    syncFeedbackIndex,
    syncCheckIndex,
    syncReminderIndex,
    syncDeadlineIndex,
    syncNoteIndex,
    syncPersonIndex,
    syncEventIndex,
    syncInboxThreadIndex,
    migrateProductivitySchema,
    rebuildIndexes,
    migrateTemporalCollectionsToTime,
    searchWorkspace,
  };
}
