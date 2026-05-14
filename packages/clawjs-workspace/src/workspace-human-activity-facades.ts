// @ts-nocheck
import type { ClawInstance } from "@clawjs/claw";

import type { CreateNoteInput, PersonIdentity, WorkspaceClawInstance } from "./workspace-contracts.ts";
import {
  nowIso,
  uniqueStrings,
  toId,
  removeUndefined,
  assertRecord,
  defaultSource,
  normalizeBlocks,
  normalizeReminders,
  isArchived,
} from "./workspace-utils.ts";
import { temporalToEventRecord } from "./workspace-temporal.ts";
import { messagePreview } from "./workspace-search-text.ts";

function dedupeIdentities(identities: PersonIdentity[]): PersonIdentity[] {
  const seen = new Set<string>();
  const output: PersonIdentity[] = [];
  for (const identity of identities) {
    const key = `${identity.channel}:${identity.handle}:${identity.externalId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(identity);
  }
  return output;
}

export function createWorkspaceHumanActivityFacades(input: {
  claw: ClawInstance;
  useTimeService: boolean;
  appendAudit: (event: string, capability: string, detail?: Record<string, unknown>) => void;
  [key: string]: any;
}): Pick<WorkspaceClawInstance, "notes" | "people" | "inbox" | "events"> {
  const {
    claw,
    useTimeService,
    appendAudit,
    notesCollection,
    peopleCollection,
    inboxThreadsCollection,
    inboxMessagesCollection,
    eventsCollection,
    tasksApi,
    remindersApi,
    syncNoteIndex,
    syncPersonIndex,
    syncInboxThreadIndex,
    syncEventIndex,
    readInboxMessagesForThread,
    searchWorkspace,
    recordActivity,
    removeIndex,
    removeEmbedding,
  } = input;

  const notesApi: WorkspaceClawInstance["notes"] = {
    list: async (options = {}) => notesCollection.list()
      .filter((note) => !isArchived(note, options.includeArchived))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => notesCollection.get(id),
    create: async (input) => {
      const timestamp = nowIso();
      const blocks = normalizeBlocks(input);
      const note: NoteRecord = {
        id: toId("note", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        blocks,
        tags: uniqueStrings(input.tags ?? []),
        ...(input.summary ? { summary: input.summary } : {}),
        ...(input.attachments ? { attachments: input.attachments } : {}),
        linkedEntityIds: uniqueStrings(input.linkedEntityIds ?? []),
        searchText: [input.title, ...blocks.map((block) => block.text), ...(input.tags ?? [])].join(" "),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      notesCollection.put(note.id, note);
      await syncNoteIndex(note);
      appendAudit("notes.created", "notes", { noteId: note.id, title: note.title });
      return note;
    },
    update: async (id, input) => {
      const current = assertRecord(notesCollection.get(id), "Note", id);
      const mergedInput: CreateNoteInput = {
        title: input.title ?? current.title,
        blocks: input.blocks ?? current.blocks,
        content: input.content,
        tags: input.tags ?? current.tags,
        summary: input.summary ?? current.summary,
        attachments: input.attachments ?? current.attachments,
        linkedEntityIds: input.linkedEntityIds ?? current.linkedEntityIds,
        source: input.source ?? current.source,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
      };
      const blocks = normalizeBlocks(mergedInput);
      const note: NoteRecord = {
        ...current,
        title: (input.title ?? current.title).trim(),
        blocks,
        tags: input.tags ? uniqueStrings(input.tags) : current.tags,
        summary: input.summary ?? current.summary,
        attachments: input.attachments ?? current.attachments,
        linkedEntityIds: input.linkedEntityIds ? uniqueStrings(input.linkedEntityIds) : current.linkedEntityIds,
        searchText: [(input.title ?? current.title), ...blocks.map((block) => block.text), ...(input.tags ?? current.tags)].join(" "),
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        archivedAt: input.archivedAt === null ? undefined : input.archivedAt ?? current.archivedAt,
        updatedAt: nowIso(),
      };
      notesCollection.put(id, note);
      await syncNoteIndex(note);
      appendAudit("notes.updated", "notes", { noteId: id });
      return note;
    },
    archive: async (id) => notesApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      const existing = notesCollection.get(id);
      if (!existing) return false;
      notesCollection.remove(id);
      removeIndex("notes", id);
      removeEmbedding("notes", id);
      appendAudit("notes.removed", "notes", { noteId: id });
      return true;
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["notes"] }),
  };

  const peopleApi: WorkspaceClawInstance["people"] = {
    list: async (options = {}) => peopleCollection.list()
      .filter((person) => !isArchived(person, options.includeArchived))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => peopleCollection.get(id),
    upsert: async (input) => {
      const existing = input.id ? peopleCollection.get(input.id) : null;
      const timestamp = nowIso();
      const person: PersonRecord = existing ? {
        ...existing,
        displayName: input.displayName.trim(),
        kind: input.kind ?? existing.kind,
        identities: input.identities ? dedupeIdentities(input.identities) : existing.identities,
        emails: input.emails ? uniqueStrings(input.emails) : existing.emails,
        phones: input.phones ? uniqueStrings(input.phones) : existing.phones,
        handles: input.handles ? uniqueStrings(input.handles) : existing.handles,
        role: input.role ?? existing.role,
        organization: input.organization ?? existing.organization,
        links: input.links ?? existing.links,
        metadata: input.metadata ?? existing.metadata,
        updatedAt: timestamp,
      } : {
        id: toId("person", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        displayName: input.displayName.trim(),
        kind: input.kind ?? "human",
        identities: dedupeIdentities(input.identities ?? []),
        emails: uniqueStrings(input.emails ?? []),
        phones: uniqueStrings(input.phones ?? []),
        handles: uniqueStrings(input.handles ?? []),
        ...(input.role ? { role: input.role } : {}),
        ...(input.organization ? { organization: input.organization } : {}),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      peopleCollection.put(person.id, person);
      await syncPersonIndex(person);
      appendAudit(existing ? "people.updated" : "people.created", "people", { personId: person.id, displayName: person.displayName });
      return person;
    },
    upsertPersonIdentity: async (identity, input = {}) => {
      const existing = peopleCollection.list().find((person) => person.identities.some((candidate) => {
        if (candidate.channel !== identity.channel) return false;
        return candidate.handle === identity.handle || Boolean(identity.externalId && candidate.externalId === identity.externalId);
      }));
      return peopleApi.upsert({
        id: existing?.id,
        displayName: input.displayName ?? existing?.displayName ?? identity.label ?? identity.handle,
        kind: input.kind ?? existing?.kind,
        identities: dedupeIdentities([...(existing?.identities ?? []), identity]),
        emails: input.emails ?? existing?.emails,
        phones: input.phones ?? existing?.phones,
        handles: uniqueStrings([...(existing?.handles ?? []), identity.handle, ...(input.handles ?? [])]),
        role: input.role ?? existing?.role,
        organization: input.organization ?? existing?.organization,
        links: input.links ?? existing?.links,
        metadata: input.metadata ?? existing?.metadata,
        source: input.source ?? existing?.source,
      });
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["people"] }),
  };

  const inboxApi: WorkspaceClawInstance["inbox"] = {
    list: async (options = {}) => inboxThreadsCollection.list()
      .filter((thread) => !isArchived(thread, options.includeArchived))
      .filter((thread) => !options.unreadOnly || thread.status === "unread")
      .sort((left, right) => (right.latestMessageAt ?? right.updatedAt).localeCompare(left.latestMessageAt ?? left.updatedAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    getThread: async (id) => inboxThreadsCollection.get(id),
    readThread: async (id) => {
      const current = inboxThreadsCollection.get(id);
      if (!current) return null;
      const thread = current.status === "unread"
        ? { ...current, status: "read" as const, updatedAt: nowIso() }
        : current;
      if (thread !== current) {
        inboxThreadsCollection.put(id, thread);
        await syncInboxThreadIndex(id);
        appendAudit("inbox.thread_read", "inbox", { threadId: id });
      }
      return {
        thread,
        messages: readInboxMessagesForThread(id),
      };
    },
    search: async (query, options = {}) => searchWorkspace({ ...options, query, domains: ["inbox"] }),
    createDraft: async (input) => {
      const timestamp = nowIso();
      const threadId = input.threadId?.trim() || toId("thread");
      const thread = inboxThreadsCollection.get(threadId) ?? {
        id: threadId,
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        channel: input.channel,
        ...(input.subject ? { subject: input.subject } : {}),
        participantPersonIds: uniqueStrings(input.participantPersonIds ?? []),
        status: "read" as const,
        ...(input.replyTarget ? { replyTarget: input.replyTarget } : {}),
        linkedTaskIds: uniqueStrings(input.linkedTaskIds ?? []),
        linkedNoteIds: uniqueStrings(input.linkedNoteIds ?? []),
        preview: messagePreview(input.content),
        latestMessageAt: timestamp,
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      if (!inboxThreadsCollection.get(threadId)) {
        inboxThreadsCollection.put(threadId, thread);
      }
      const message: InboxMessageRecord = {
        id: toId("message"),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        threadId,
        channel: input.channel,
        participantPersonIds: uniqueStrings(input.participantPersonIds ?? []),
        direction: "outbound",
        status: "draft",
        ...(input.replyTarget ? { replyTarget: input.replyTarget } : {}),
        ...(input.attachments ? { attachments: input.attachments } : {}),
        linkedTaskIds: uniqueStrings(input.linkedTaskIds ?? []),
        linkedNoteIds: uniqueStrings(input.linkedNoteIds ?? []),
        content: input.content,
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      inboxMessagesCollection.put(message.id, message);
      inboxThreadsCollection.put(threadId, {
        ...thread,
        updatedAt: timestamp,
        latestMessageAt: timestamp,
        preview: messagePreview(input.content),
      });
      await syncInboxThreadIndex(threadId);
      appendAudit("inbox.draft_created", "inbox", { threadId, messageId: message.id });
      return assertRecord(await inboxApi.readThread(threadId), "Inbox thread", threadId);
    },
    routeReply: async (threadId, input) => {
      const thread = assertRecord(inboxThreadsCollection.get(threadId), "Inbox thread", threadId);
      const timestamp = nowIso();
      const message: InboxMessageRecord = {
        id: toId("message"),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: { kind: "derived", channel: thread.channel },
        threadId,
        channel: thread.channel,
        participantPersonIds: thread.participantPersonIds,
        direction: "outbound",
        status: "sent",
        replyTarget: thread.replyTarget,
        ...(input.attachments ? { attachments: input.attachments } : {}),
        linkedTaskIds: uniqueStrings(input.linkedTaskIds ?? []),
        linkedNoteIds: uniqueStrings(input.linkedNoteIds ?? []),
        content: input.content,
      };
      inboxMessagesCollection.put(message.id, message);
      inboxThreadsCollection.put(threadId, {
        ...thread,
        status: "read",
        updatedAt: timestamp,
        latestMessageAt: timestamp,
        preview: messagePreview(input.content),
      });
      await syncInboxThreadIndex(threadId);
      appendAudit("inbox.reply_routed", "inbox", { threadId, messageId: message.id, channel: thread.channel });
      return message;
    },
    archive: async (threadId) => {
      const current = assertRecord(inboxThreadsCollection.get(threadId), "Inbox thread", threadId);
      const thread: InboxThreadRecord = {
        ...current,
        status: "archived",
        archivedAt: nowIso(),
        updatedAt: nowIso(),
      };
      inboxThreadsCollection.put(threadId, thread);
      await syncInboxThreadIndex(threadId);
      appendAudit("inbox.archived", "inbox", { threadId });
      return thread;
    },
    ingestIncomingMessage: async (input) => {
      const timestamp = nowIso();
      const existingThread = input.threadId
        ? inboxThreadsCollection.get(input.threadId)
        : inboxThreadsCollection.list().find((thread) => thread.externalThreadId && thread.externalThreadId === input.externalThreadId);
      const threadId = existingThread?.id ?? input.threadId?.trim() ?? toId("thread");
      const thread: InboxThreadRecord = existingThread ?? {
        id: threadId,
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source ?? { kind: "channel", channel: input.channel, externalId: input.externalThreadId }),
        channel: input.channel,
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.externalThreadId ? { externalThreadId: input.externalThreadId } : {}),
        participantPersonIds: uniqueStrings(input.participantPersonIds ?? []),
        status: "unread",
        ...(input.replyTarget ? { replyTarget: input.replyTarget } : {}),
        linkedTaskIds: uniqueStrings(input.linkedTaskIds ?? []),
        linkedNoteIds: uniqueStrings(input.linkedNoteIds ?? []),
        preview: messagePreview(input.content),
        latestMessageAt: timestamp,
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      inboxThreadsCollection.put(threadId, {
        ...thread,
        status: "unread",
        updatedAt: timestamp,
        latestMessageAt: timestamp,
        preview: messagePreview(input.content),
        participantPersonIds: uniqueStrings([...(thread.participantPersonIds ?? []), ...(input.participantPersonIds ?? [])]),
      });
      const message: InboxMessageRecord = {
        id: toId("message"),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source ?? { kind: "channel", channel: input.channel, externalId: input.externalMessageId }),
        threadId,
        channel: input.channel,
        ...(input.externalThreadId ? { externalThreadId: input.externalThreadId } : {}),
        ...(input.externalMessageId ? { externalMessageId: input.externalMessageId } : {}),
        participantPersonIds: uniqueStrings(input.participantPersonIds ?? []),
        direction: "inbound",
        status: "unread",
        ...(input.replyTarget ? { replyTarget: input.replyTarget } : {}),
        ...(input.attachments ? { attachments: input.attachments } : {}),
        linkedTaskIds: uniqueStrings(input.linkedTaskIds ?? []),
        linkedNoteIds: uniqueStrings(input.linkedNoteIds ?? []),
        content: input.content,
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      inboxMessagesCollection.put(message.id, message);
      await syncInboxThreadIndex(threadId);
      appendAudit("inbox.ingested", "inbox", { threadId, messageId: message.id, channel: input.channel });
      return assertRecord(await inboxApi.readThread(threadId), "Inbox thread", threadId);
    },
    resolveReplyTarget: async (threadId) => inboxThreadsCollection.get(threadId)?.replyTarget ?? null,
    process: async (threadId, input) => {
      const thread = assertRecord(inboxThreadsCollection.get(threadId), "Inbox thread", threadId);
      const view = await inboxApi.readThread(threadId);
      const subject = thread.subject || thread.preview || thread.id;
      const task = input.taskTitle
        ? await tasksApi.create({
            title: input.taskTitle,
            description: `Inbox thread: ${subject}`,
            areaId: input.areaId,
            projectId: input.projectId,
            goalId: input.goalId,
          })
        : undefined;
      const note = input.noteTitle
        ? await notesApi.create({
            title: input.noteTitle,
            content: view?.messages.map((message) => `${message.direction}: ${message.content}`).join("\n") || thread.preview || "",
            linkedEntityIds: uniqueStrings([task?.id]),
          })
        : undefined;
      const reminder = input.reminderTitle && input.reminderAt
        ? await remindersApi.create({
            title: input.reminderTitle,
            triggerAt: input.reminderAt,
            anchorType: "thread",
            anchorId: threadId,
          })
        : undefined;
      const updatedThread: InboxThreadRecord = {
        ...thread,
        linkedTaskIds: uniqueStrings([...(thread.linkedTaskIds ?? []), task?.id]),
        linkedNoteIds: uniqueStrings([...(thread.linkedNoteIds ?? []), note?.id]),
        updatedAt: nowIso(),
      };
      inboxThreadsCollection.put(threadId, updatedThread);
      await syncInboxThreadIndex(threadId);
      await recordActivity({
        entityType: "inbox_thread",
        entityId: threadId,
        kind: "processed",
        title: `Inbox processed: ${subject}`,
        areaId: input.areaId,
        projectId: input.projectId,
        goalId: input.goalId,
        taskId: task?.id,
        threadId,
      });
      appendAudit("inbox.processed", "inbox", { threadId, taskId: task?.id, noteId: note?.id, reminderId: reminder?.id });
      return { thread: updatedThread, ...(task ? { task } : {}), ...(note ? { note } : {}), ...(reminder ? { reminder } : {}) };
    },
  };

  const eventsApi: WorkspaceClawInstance["events"] = {
    list: async (options = {}) => useTimeService
      ? (await claw.time.list({ kind: "event" })).items
        .filter((item) => !options.upcomingOnly || Boolean(item.startsAt && item.startsAt >= nowIso()))
        .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER)
        .map((item) => temporalToEventRecord(item))
      : eventsCollection.list()
      .filter((event) => !isArchived(event, options.includeArchived))
      .filter((event) => !options.upcomingOnly || event.startsAt >= nowIso())
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER),
    get: async (id) => {
      if (useTimeService) {
        const payload = await claw.time.get(id).catch(() => null);
        return payload ? temporalToEventRecord(payload.item) : null;
      }
      return eventsCollection.get(id);
    },
    create: async (input) => {
      if (useTimeService) {
        const eventId = toId("event", input.id);
        const created = await claw.time.create({
          id: eventId,
          kind: "event",
          title: input.title,
          description: input.description,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          location: input.location,
          participants: (input.attendeePersonIds ?? []).map((personId) => ({ kind: "human", label: personId, personId })),
          actions: (input.reminders ?? []).map((reminder) => ({ kind: "notify", target: reminder.channel, id: reminder.id })),
          projections: [{
            id: `${eventId}-workspace-events`,
            target: "workspace_events",
            provider: "workspace",
            detail: {
              linkedTaskIds: input.linkedTaskIds ?? [],
              linkedNoteIds: input.linkedNoteIds ?? [],
            },
          }],
        });
        const event = temporalToEventRecord(created.item);
        await syncEventIndex(event);
        appendAudit("events.created", "events", { eventId: event.id, title: event.title });
        return event;
      }
      const timestamp = nowIso();
      const event: EventRecord = {
        id: toId("event", input.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: defaultSource(input.source),
        title: input.title.trim(),
        startsAt: input.startsAt,
        ...(input.description ? { description: input.description } : {}),
        ...(input.endsAt ? { endsAt: input.endsAt } : {}),
        ...(input.location ? { location: input.location } : {}),
        attendeePersonIds: uniqueStrings(input.attendeePersonIds ?? []),
        linkedTaskIds: uniqueStrings(input.linkedTaskIds ?? []),
        linkedNoteIds: uniqueStrings(input.linkedNoteIds ?? []),
        reminders: normalizeReminders(input.reminders),
        ...(input.links ? { links: input.links } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      eventsCollection.put(event.id, event);
      await syncEventIndex(event);
      appendAudit("events.created", "events", { eventId: event.id, title: event.title });
      return event;
    },
    update: async (id, input) => {
      if (useTimeService) {
        const updated = await claw.time.update(id, {
          title: input.title,
          description: input.description,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          location: input.location,
          participants: input.attendeePersonIds?.map((personId) => ({ kind: "human", label: personId, personId })),
          actions: input.reminders?.map((reminder) => ({ kind: "notify", target: reminder.channel, id: reminder.id })),
          projections: input.linkedTaskIds || input.linkedNoteIds
            ? [{
                id: `${id}-workspace-events`,
                target: "workspace_events",
                provider: "workspace",
                detail: {
                  linkedTaskIds: input.linkedTaskIds ?? [],
                  linkedNoteIds: input.linkedNoteIds ?? [],
                },
              }]
            : undefined,
          status: input.archivedAt ? "cancelled" : undefined,
        });
        const event = temporalToEventRecord(updated.item);
        await syncEventIndex(event);
        appendAudit("events.updated", "events", { eventId: id });
        return event;
      }
      const current = assertRecord(eventsCollection.get(id), "Event", id);
      const event: EventRecord = {
        ...current,
        title: input.title?.trim() ?? current.title,
        description: input.description ?? current.description,
        startsAt: input.startsAt ?? current.startsAt,
        endsAt: input.endsAt ?? current.endsAt,
        location: input.location ?? current.location,
        attendeePersonIds: input.attendeePersonIds ? uniqueStrings(input.attendeePersonIds) : current.attendeePersonIds,
        linkedTaskIds: input.linkedTaskIds ? uniqueStrings(input.linkedTaskIds) : current.linkedTaskIds,
        linkedNoteIds: input.linkedNoteIds ? uniqueStrings(input.linkedNoteIds) : current.linkedNoteIds,
        reminders: input.reminders ? normalizeReminders(input.reminders) : current.reminders,
        links: input.links ?? current.links,
        metadata: input.metadata ?? current.metadata,
        archivedAt: input.archivedAt === null ? undefined : input.archivedAt ?? current.archivedAt,
        updatedAt: nowIso(),
      };
      eventsCollection.put(id, event);
      await syncEventIndex(event);
      appendAudit("events.updated", "events", { eventId: id });
      return event;
    },
    archive: async (id) => eventsApi.update(id, { archivedAt: nowIso() }),
    remove: async (id) => {
      if (useTimeService) {
        const removed = await claw.time.delete(id);
        removeIndex("events", id);
        appendAudit("events.removed", "events", { eventId: id });
        return removed.ok;
      }
      const existing = eventsCollection.get(id);
      if (!existing) return false;
      eventsCollection.remove(id);
      removeIndex("events", id);
      appendAudit("events.removed", "events", { eventId: id });
      return true;
    },
    search: async (query, options = {}) => useTimeService
      ? (await eventsApi.list({ includeArchived: options.includeArchived, limit: options.limit }))
        .filter((event) => event.title.toLowerCase().includes(query.toLowerCase()) || (event.description ?? "").toLowerCase().includes(query.toLowerCase()) || (event.location ?? "").toLowerCase().includes(query.toLowerCase()))
        .map((event) => ({
          domain: "events" as const,
          id: event.id,
          title: event.title,
          snippet: [event.description, event.location].filter(Boolean).join(" "),
          score: 100,
          strategy: "keyword" as const,
          matchedFields: ["title"],
          updatedAt: event.updatedAt,
        }))
      : searchWorkspace({ ...options, query, domains: ["events"] }),
  };

  return {
    notes: notesApi,
    people: peopleApi,
    inbox: inboxApi,
    events: eventsApi,
  };
}
