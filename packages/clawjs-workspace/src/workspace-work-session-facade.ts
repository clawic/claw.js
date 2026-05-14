// @ts-nocheck
import type { WorkspaceClawInstance } from "./workspace-contracts.ts";
import type { WorkSessionRecord } from "@clawjs/core";
import {
  nowIso,
  toId,
  removeUndefined,
  assertRecord,
  defaultSource,
  clampNonNegativeNumber,
  clampConfidence,
  normalizeRecordIds,
  isArchived,
} from "./workspace-utils.ts";

export function createWorkspaceWorkSessionFacade(input: {
  appendAudit: (event: string, capability: string, detail?: Record<string, unknown>) => void;
  [key: string]: any;
}): Pick<WorkspaceClawInstance, "workSessions"> {
  const {
    appendAudit,
    workSessionsCollection,
    syncWorkSessionIndex,
    recordActivity,
    removeIndex,
    searchWorkspace,
  } = input;

  const workSessionsApi: WorkspaceClawInstance["workSessions"] = {
    list: async (options = {}) => workSessionsCollection.list()
      .filter((session) => !isArchived(session, options.includeArchived))
      .filter((session) => {
        if (!options.status) return true;
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        return statuses.includes(session.status);
      })
      .filter((session) => !options.taskId || session.taskIds.includes(options.taskId))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => workSessionsCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const session: WorkSessionRecord = {
        id: toId("work-session", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        status: input.status ?? "active",
        ...(input.objective ? { objective: input.objective } : {}),
        taskIds: normalizeRecordIds(input.taskIds ?? []),
        blockerIds: normalizeRecordIds(input.blockerIds ?? []),
        startedAt: input.startedAt ?? timestamp,
        ...(input.endedAt ? { endedAt: input.endedAt } : {}),
        ...(input.outcome ? { outcome: input.outcome } : {}),
        ...(clampNonNegativeNumber(input.timeboxMinutes) !== undefined ? { timeboxMinutes: clampNonNegativeNumber(input.timeboxMinutes) } : {}),
        ...(input.ownerAgentId ? { ownerAgentId: input.ownerAgentId } : {}),
        ...(clampConfidence(input.confidence) !== undefined ? { confidence: clampConfidence(input.confidence) } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      workSessionsCollection.put(session.id, session);
      await syncWorkSessionIndex(session);
      const taskId = session.taskIds[0];
      await recordActivity({
        entityType: "work_session",
        entityId: session.id,
        kind: "created",
        title: `Work session started: ${session.title}`,
        taskId,
      });
      appendAudit("work_sessions.created", "work_sessions", { workSessionId: session.id, title: session.title });
      return session;
    },
    update: async (id, input) => {
      const current = assertRecord(workSessionsCollection.get(id), "Work session", id);
      const session: WorkSessionRecord = {
        ...current,
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        ...removeUndefined({
          objective: input.objective,
          startedAt: input.startedAt ?? current.startedAt,
          endedAt: input.endedAt,
          outcome: input.outcome,
          timeboxMinutes: clampNonNegativeNumber(input.timeboxMinutes),
          ownerAgentId: input.ownerAgentId,
          confidence: clampConfidence(input.confidence),
          archivedAt: input.archivedAt === null ? undefined : input.archivedAt,
        }),
        taskIds: input.taskIds ? normalizeRecordIds(input.taskIds) : current.taskIds,
        blockerIds: input.blockerIds ? normalizeRecordIds(input.blockerIds) : current.blockerIds,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        updatedAt: nowIso(),
      };
      if (session.status !== "active" && !session.endedAt) session.endedAt = nowIso();
      workSessionsCollection.put(id, session);
      await syncWorkSessionIndex(session);
      await recordActivity({
        entityType: "work_session",
        entityId: id,
        kind: input.archivedAt ? "archived" : session.status === "completed" && current.status !== "completed" ? "completed" : "updated",
        title: `Work session ${input.archivedAt ? "archived" : session.status === "completed" && current.status !== "completed" ? "completed" : "updated"}: ${session.title}`,
        taskId: session.taskIds[0],
      });
      appendAudit("work_sessions.updated", "work_sessions", { workSessionId: id });
      return session;
    },
    complete: async (id, outcome) => workSessionsApi.update(id, { status: "completed", outcome }),
    cancel: async (id) => workSessionsApi.update(id, { status: "cancelled" }),
    archive: async (id) => workSessionsApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = workSessionsCollection.get(id);
      if (!existing) return false;
      workSessionsCollection.remove(id);
      removeIndex("work_sessions", id);
      appendAudit("work_sessions.removed", "work_sessions", { workSessionId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["work_sessions"] }),
  };



  return { workSessions: workSessionsApi };
}
