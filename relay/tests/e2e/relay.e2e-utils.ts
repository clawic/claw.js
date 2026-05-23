const STABLE_EVENT_TYPES = {
  browserState: "browser.state",
  browserFrame: "browser.frame",
} as const;
import { clawApiPath } from "@clawjs/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

interface SessionRecord {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
  hasActiveGeneration?: boolean;
  messages: Array<{
    role: string;
    content: string;
    documents?: Array<{ documentId: string; name: string; mimeType: string; sizeBytes: number }>;
  }>;
}

interface RelayDocumentRecord {
  documentId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
  origin: string;
  storage: { kind: string; path: string };
  createdAt: number;
  sessionId?: string;
  indexStatus: string;
  textPath?: string;
  contentBase64: string;
}

const TEST_BROWSER_FRAME = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnSUs8AAAAASUVORK5CYII=";

const state = {
  sessionsByWorkspace: new Map<string, Map<string, SessionRecord>>(),
  workspaceFilesByWorkspace: new Map<string, Map<string, string>>(),
  documentsByWorkspace: new Map<string, Map<string, RelayDocumentRecord>>(),
  uploadSessionsByWorkspace: new Map<string, Map<string, { name: string; mimeType: string; sessionId?: string; chunks: string[] }>>(),
  tasks: [] as Array<Record<string, unknown>>,
  goals: [] as Array<Record<string, unknown>>,
  projects: [] as Array<Record<string, unknown>>,
  notes: [] as Array<Record<string, unknown>>,
  memory: [] as Array<Record<string, unknown>>,
  inbox: [] as Array<Record<string, unknown>>,
  people: [] as Array<Record<string, unknown>>,
  reminders: [] as Array<Record<string, unknown>>,
  deadlines: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>,
  personas: [] as Array<Record<string, unknown>>,
  plugins: [] as Array<Record<string, unknown>>,
  routines: [] as Array<Record<string, unknown>>,
  images: [] as Array<Record<string, unknown>>,
  contentBrands: [] as Array<Record<string, unknown>>,
  contentDestinations: [] as Array<Record<string, unknown>>,
  contentEntries: [] as Array<Record<string, unknown>>,
  contentVariants: [] as Array<Record<string, unknown>>,
  contentApprovals: [] as Array<Record<string, unknown>>,
  contentPlans: [] as Array<Record<string, unknown>>,
  contentRuns: [] as Array<Record<string, unknown>>,
};

function sessionsForWorkspace(workspaceId: string): Map<string, SessionRecord> {
  if (!state.sessionsByWorkspace.has(workspaceId)) {
    state.sessionsByWorkspace.set(workspaceId, new Map());
  }
  return state.sessionsByWorkspace.get(workspaceId)!;
}

function workspaceFilesForWorkspace(workspaceId: string): Map<string, string> {
  if (!state.workspaceFilesByWorkspace.has(workspaceId)) {
    state.workspaceFilesByWorkspace.set(workspaceId, new Map());
  }
  return state.workspaceFilesByWorkspace.get(workspaceId)!;
}

function documentsForWorkspace(workspaceId: string): Map<string, RelayDocumentRecord> {
  if (!state.documentsByWorkspace.has(workspaceId)) {
    state.documentsByWorkspace.set(workspaceId, new Map());
  }
  return state.documentsByWorkspace.get(workspaceId)!;
}

function uploadsForWorkspace(workspaceId: string): Map<string, { name: string; mimeType: string; sessionId?: string; chunks: string[] }> {
  if (!state.uploadSessionsByWorkspace.has(workspaceId)) {
    state.uploadSessionsByWorkspace.set(workspaceId, new Map());
  }
  return state.uploadSessionsByWorkspace.get(workspaceId)!;
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function summarizeSession(session: SessionRecord): SessionRecord {
  const lastMessage = session.messages.at(-1);
  return {
    ...session,
    updatedAt: session.updatedAt || session.createdAt,
    messageCount: session.messages.length,
    preview: lastMessage?.content ?? "",
  };
}

function documentRef(document: RelayDocumentRecord) {
  return {
    documentId: document.documentId,
    name: document.name,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
  };
}

export function startFakeConnector(url: string, connectorToken: string, agentId = "demo-agent", connectorId = agentId) {
  const browserState = {
    session: {
      workspaceId: "main",
      active: false,
      status: "idle",
      navigation: {
        title: "Claw Browser",
        url: "",
        displayUrl: "Not started",
        isLocalUrl: false,
      },
      controller: null as null | {
        deviceId: string;
        userId: string;
        email?: string;
        acquiredAt: string;
      },
      viewport: { width: 1440, height: 960 },
      updatedAt: new Date().toISOString(),
    },
    frameSeq: 0,
  };
  const socket = new WebSocket(url.replace(/^http/, "ws") + clawApiPath("connector/connect"), {
    headers: { Authorization: `Bearer ${connectorToken}` },
  });
  const activeStreams = new Map<string, { timer: NodeJS.Timeout; workspaceId: string; sessionId: string }>();

  socket.on("open", () => {
    socket.send(JSON.stringify({
      type: "hello",
      payload: {
        tenantId: "demo-tenant",
        connectorId,
        agentId,
        version: "test",
        capabilities: ["sessions", "workspace", "crud", "browser"],
        workspaces: [{ workspaceId: "main", displayName: "Main" }],
      },
    }));
  });

  socket.on("message", (buffer) => {
    const message = JSON.parse(buffer.toString()) as {
      type: string;
      requestId?: string;
      operation?: string;
      workspaceId?: string;
      payload?: Record<string, unknown>;
    };
    if (message.type === "cancel") {
      const active = message.requestId ? activeStreams.get(message.requestId) : undefined;
      if (active) {
        clearTimeout(active.timer);
        const workspaceSessions = sessionsForWorkspace(active.workspaceId);
        const session = workspaceSessions.get(active.sessionId);
        if (session) {
          session.hasActiveGeneration = false;
          session.updatedAt = Date.now();
          workspaceSessions.set(active.sessionId, summarizeSession(session));
        }
        activeStreams.delete(message.requestId!);
      }
      return;
    }
    if (message.type !== "invoke") return;
    const respond = (payload: Record<string, unknown>) => {
      socket.send(JSON.stringify({ type: "result", requestId: message.requestId, payload }));
    };
    const sessionId = String(message.payload?.sessionId ?? "");
    const targetWorkspaceId = String(message.workspaceId ?? "main");
    const workspaceSessions = sessionsForWorkspace(targetWorkspaceId);
    const workspaceFiles = workspaceFilesForWorkspace(targetWorkspaceId);
    const workspaceDocuments = documentsForWorkspace(targetWorkspaceId);
    const workspaceUploads = uploadsForWorkspace(targetWorkspaceId);
    const resolveDocumentIds = (value: unknown) => (
      Array.isArray(value)
        ? value
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .map((documentId) => workspaceDocuments.get(documentId))
          .filter(Boolean)
          .map((document) => documentRef(document as RelayDocumentRecord))
        : []
    );
    const emitBrowserState = (reason: string) => {
      browserState.session.updatedAt = new Date().toISOString();
      socket.send(JSON.stringify({
        type: "event",
        event: STABLE_EVENT_TYPES.browserState,
        payload: {
          workspaceId: targetWorkspaceId,
          reason,
          session: browserState.session,
        },
      }));
    };
    const emitBrowserFrame = () => {
      browserState.frameSeq += 1;
      socket.send(JSON.stringify({
        type: "event",
        event: STABLE_EVENT_TYPES.browserFrame,
        payload: {
          workspaceId: targetWorkspaceId,
          seq: browserState.frameSeq,
          imageBase64: TEST_BROWSER_FRAME,
          mimeType: "image/png",
          capturedAt: new Date().toISOString(),
          viewport: browserState.session.viewport,
        },
      }));
    };
    switch (message.operation) {
      case "workspace.status":
        respond({ status: { workspaceId: message.workspaceId, online: true } });
        return;
      case "browser.session.status":
        respond({ session: browserState.session });
        return;
      case "browser.session.ensure":
        browserState.session = {
          ...browserState.session,
          active: true,
          status: "ready",
          navigation: {
            title: "Shared login",
            url: String(message.payload?.initialUrl ?? "http://localhost:4300/login"),
            displayUrl: "Local preview",
            isLocalUrl: true,
          },
        };
        respond({ session: browserState.session });
        emitBrowserState("session-ready");
        emitBrowserFrame();
        return;
      case "browser.control.acquire":
        browserState.session = {
          ...browserState.session,
          controller: {
            deviceId: String(message.payload?.actor?.deviceId ?? "device"),
            userId: String(message.payload?.actor?.userId ?? "user"),
            ...(typeof message.payload?.actor?.email === "string" ? { email: message.payload.actor.email } : {}),
            acquiredAt: new Date().toISOString(),
          },
        };
        respond({ session: browserState.session });
        emitBrowserState("control-acquired");
        return;
      case "browser.control.release":
        browserState.session = {
          ...browserState.session,
          controller: null,
        };
        respond({ session: browserState.session });
        emitBrowserState("control-released");
        return;
      case "browser.navigate":
        browserState.session = {
          ...browserState.session,
          navigation: {
            title: String(message.payload?.url ?? "Browser"),
            url: String(message.payload?.url ?? ""),
            displayUrl: String(message.payload?.url ?? ""),
            isLocalUrl: false,
          },
        };
        respond({ session: browserState.session });
        emitBrowserState("navigate");
        emitBrowserFrame();
        return;
      case "browser.input":
        respond({ session: browserState.session });
        emitBrowserFrame();
        return;
      case "integrations.status":
        respond({ integrations: { runtime: { adapter: "fake" }, channels: [] } });
        return;
      case "sessions.list":
        respond({
          sessions: [...workspaceSessions.values()].map((session) => {
            const summary = summarizeSession(session);
            workspaceSessions.set(summary.sessionId, summary);
            return {
              sessionId: summary.sessionId,
              title: summary.title,
              createdAt: summary.createdAt,
              updatedAt: summary.updatedAt,
              messageCount: summary.messageCount,
              preview: summary.preview,
            };
          }),
        });
        return;
      case "sessions.create": {
        const createdAt = Date.now();
        const created: SessionRecord = {
          sessionId: randomId("session"),
          title: String(message.payload?.title ?? "New chat"),
          createdAt,
          updatedAt: createdAt,
          messageCount: 0,
          preview: "",
          messages: [],
        };
        const documents = resolveDocumentIds(message.payload?.documentIds);
        if (typeof message.payload?.message === "string" || documents.length > 0) {
          created.messages.push({
            role: "user",
            content: String(message.payload?.message ?? ""),
            ...(documents.length > 0 ? { documents } : {}),
          });
        }
        const summary = summarizeSession(created);
        workspaceSessions.set(summary.sessionId, summary);
        respond({ session: summary });
        return;
      }
      case "sessions.get":
        respond({ session: workspaceSessions.get(sessionId) ?? null });
        return;
      case "sessions.update": {
        const session = workspaceSessions.get(sessionId);
        if (session) {
          session.title = String(message.payload?.title ?? session.title);
          session.updatedAt = Date.now();
          workspaceSessions.set(sessionId, summarizeSession(session));
        }
        respond({ ok: true, title: session?.title ?? null });
        return;
      }
      case "sessions.search":
        respond({ sessions: [...workspaceSessions.values()].filter((session) => session.title.includes(String(message.payload?.q ?? ""))) });
        return;
      case "sessions.append-message": {
        const session = workspaceSessions.get(sessionId);
        if (session) {
          const documents = resolveDocumentIds(message.payload?.documentIds);
          session.messages.push({
            role: String(message.payload?.role ?? "user"),
            content: String(message.payload?.content ?? ""),
            ...(documents.length > 0 ? { documents } : {}),
          });
          session.updatedAt = Date.now();
          const summary = summarizeSession(session);
          workspaceSessions.set(sessionId, summary);
          respond({ session: summary });
          return;
        }
        respond({ session: null });
        return;
      }
      case "sessions.reply": {
        const session = workspaceSessions.get(sessionId)!;
        const documents = resolveDocumentIds(message.payload?.documentIds);
        if (typeof message.payload?.message === "string" || documents.length > 0) {
          session.messages.push({
            role: "user",
            content: String(message.payload?.message ?? ""),
            ...(documents.length > 0 ? { documents } : {}),
          });
        }
        session.messages.push({ role: "assistant", content: "pong from relay" });
        session.updatedAt = Date.now();
        const summary = summarizeSession(session);
        workspaceSessions.set(sessionId, summary);
        respond({ reply: "pong from relay", session: summary });
        return;
      }
      case "sessions.stream": {
        const session = workspaceSessions.get(sessionId);
        const documents = resolveDocumentIds(message.payload?.documentIds);
        if (session && (typeof message.payload?.message === "string" || documents.length > 0)) {
          session.hasActiveGeneration = true;
          session.messages.push({
            role: "user",
            content: String(message.payload?.message ?? ""),
            ...(documents.length > 0 ? { documents } : {}),
          });
          session.updatedAt = Date.now();
          workspaceSessions.set(sessionId, summarizeSession(session));
        }
        if (message.payload?.message === "fixture-error") {
          if (session) {
            session.hasActiveGeneration = false;
            session.updatedAt = Date.now();
            workspaceSessions.set(sessionId, summarizeSession(session));
          }
          socket.send(JSON.stringify({
            type: "error",
            requestId: message.requestId,
            code: "fixture_stream_error",
            message: "fixture stream failure",
          }));
          return;
        }
        socket.send(JSON.stringify({
          type: "stream",
          requestId: message.requestId,
          event: "transport",
          payload: { type: "transport", transport: "gateway", fallback: false },
        }));
        socket.send(JSON.stringify({
          type: "stream",
          requestId: message.requestId,
          event: "chunk",
          payload: { type: "chunk", delta: "hello " },
        }));
        if (message.payload?.message === "fixture-cancel") {
          if (session) {
            session.hasActiveGeneration = false;
            session.updatedAt = Date.now();
            workspaceSessions.set(sessionId, summarizeSession(session));
          }
          respond({ cancelled: true });
          return;
        }
        socket.send(JSON.stringify({
          type: "stream",
          requestId: message.requestId,
          event: "chunk",
          payload: { type: "chunk", delta: "world" },
        }));
        socket.send(JSON.stringify({
          type: "stream",
          requestId: message.requestId,
          event: "done",
          payload: { type: "done" },
        }));
        socket.send(JSON.stringify({
          type: "stream",
          requestId: message.requestId,
          event: "title",
          payload: { type: "title", title: "hello world" },
        }));
        if (session) {
          session.messages.push({ role: "assistant", content: "hello world" });
          session.hasActiveGeneration = false;
          session.updatedAt = Date.now();
          workspaceSessions.set(sessionId, summarizeSession(session));
        }
        respond({ ok: true });
        return;
      }
      case "documents.list":
        respond({ documents: [...workspaceDocuments.values()].sort((left, right) => right.createdAt - left.createdAt) });
        return;
      case "documents.get":
        respond({ document: workspaceDocuments.get(String(message.payload?.documentId ?? "")) ?? null });
        return;
      case "documents.search": {
        const query = String(message.payload?.q ?? "").toLowerCase();
        const sessionFilter = typeof message.payload?.sessionId === "string" ? message.payload.sessionId : undefined;
        const documents = [...workspaceDocuments.values()]
          .filter((document) => !sessionFilter || document.sessionId === sessionFilter)
          .map((document) => {
            const content = Buffer.from(document.contentBase64, "base64").toString("utf8");
            const haystack = `${document.name}\n${content}`.toLowerCase();
            if (!query || !haystack.includes(query)) return null;
            return {
              ...document,
              snippet: content.includes(query) ? content : `${document.name}: ${content}`.trim(),
              score: 10,
              sourcePath: document.storage.path,
            };
          })
          .filter(Boolean);
        respond({ documents });
        return;
      }
      case "documents.register": {
        const filePath = String(message.payload?.filePath ?? "");
        const name = String(message.payload?.name ?? (path.basename(filePath) || "registered.txt"));
        const mimeType = String(message.payload?.mimeType ?? "text/plain");
        const sessionIdForDocument = typeof message.payload?.sessionId === "string" ? message.payload.sessionId : undefined;
        const contentBase64 = Buffer.from(`registered:${filePath}`, "utf8").toString("base64");
        const document: RelayDocumentRecord = {
          documentId: randomId("document"),
          name,
          mimeType,
          sizeBytes: Buffer.from(contentBase64, "base64").byteLength,
          origin: String(message.payload?.origin ?? "imported"),
          storage: { kind: "workspace_path", path: filePath },
          createdAt: Date.now(),
          ...(sessionIdForDocument ? { sessionId: sessionIdForDocument } : {}),
          indexStatus: "indexed",
          textPath: `.claw/documents/index/${path.basename(filePath)}.md`,
          contentBase64,
        };
        workspaceDocuments.set(document.documentId, document);
        respond({ document });
        return;
      }
      case "documents.upload.begin": {
        const uploadId = randomId("upload");
        workspaceUploads.set(uploadId, {
          name: String(message.payload?.name ?? "document.txt"),
          mimeType: String(message.payload?.mimeType ?? "application/octet-stream"),
          ...(typeof message.payload?.sessionId === "string" ? { sessionId: message.payload.sessionId } : {}),
          chunks: [],
        });
        respond({ uploadId });
        return;
      }
      case "documents.upload.chunk": {
        const uploadId = String(message.payload?.uploadId ?? "");
        const upload = workspaceUploads.get(uploadId);
        if (!upload) {
          respond({ uploadId, appended: 0 });
          return;
        }
        const chunk = String(message.payload?.chunk ?? "");
        upload.chunks.push(chunk);
        workspaceUploads.set(uploadId, upload);
        respond({ uploadId, appended: Buffer.from(chunk, "base64").byteLength });
        return;
      }
      case "documents.upload.commit": {
        const uploadId = String(message.payload?.uploadId ?? "");
        const upload = workspaceUploads.get(uploadId);
        if (!upload) {
          respond({ document: null });
          return;
        }
        const contentBase64 = upload.chunks.join("");
        const existing = [...workspaceDocuments.values()].find((document) => document.contentBase64 === contentBase64);
        const documentId = randomId("document");
        const document: RelayDocumentRecord = {
          documentId,
          name: upload.name,
          mimeType: upload.mimeType,
          sizeBytes: Buffer.from(contentBase64, "base64").byteLength,
          sha256: existing?.sha256 ?? `sha-${contentBase64.slice(0, 12)}`,
          origin: "user_upload",
          storage: existing?.storage ?? { kind: "blob", path: `documents/blobs/${documentId}` },
          createdAt: Date.now(),
          ...(upload.sessionId ? { sessionId: upload.sessionId } : {}),
          indexStatus: "indexed",
          textPath: `.claw/documents/index/${documentId}.md`,
          contentBase64,
        };
        workspaceDocuments.set(document.documentId, document);
        workspaceUploads.delete(uploadId);
        respond({ document });
        return;
      }
      case "documents.download": {
        const document = workspaceDocuments.get(String(message.payload?.documentId ?? ""));
        respond(document ? { document, contentBase64: document.contentBase64 } : { document: null });
        return;
      }
      case "sessions.generate-title":
        respond({ title: "generated title" });
        return;
      case "chat.feedback":
        respond({ ok: true });
        return;
      case "tasks.list":
        respond({ tasks: state.tasks });
        return;
      case "tasks.create": {
        const task = { id: randomId("task"), ...message.payload };
        state.tasks.push(task);
        respond({ task });
        return;
      }
      case "tasks.update": {
        const index = state.tasks.findIndex((task) => task.id === message.payload?.id);
        if (index >= 0) state.tasks[index] = { ...state.tasks[index], ...message.payload };
        respond({ task: state.tasks[index] });
        return;
      }
      case "tasks.delete":
        state.tasks.splice(0, state.tasks.length, ...state.tasks.filter((task) => task.id !== message.payload?.id));
        respond({ ok: true });
        return;
      case "goals.list":
        respond({ goals: state.goals });
        return;
      case "goals.create": {
        const goal = { id: randomId("goal"), ...message.payload };
        state.goals.push(goal);
        respond({ goal });
        return;
      }
      case "goals.update": {
        const index = state.goals.findIndex((goal) => goal.id === message.payload?.id);
        if (index >= 0) state.goals[index] = { ...state.goals[index], ...message.payload };
        respond({ goal: state.goals[index] });
        return;
      }
      case "goals.delete":
        state.goals.splice(0, state.goals.length, ...state.goals.filter((goal) => goal.id !== message.payload?.id));
        respond({ ok: true });
        return;
      case "projects.list":
        respond({ projects: state.projects });
        return;
      case "projects.create": {
        const project = { id: randomId("project"), ...message.payload };
        state.projects.push(project);
        respond({ project });
        return;
      }
      case "projects.update": {
        const index = state.projects.findIndex((project) => project.id === message.payload?.id);
        if (index >= 0) state.projects[index] = { ...state.projects[index], ...message.payload };
        respond({ project: state.projects[index] });
        return;
      }
      case "projects.delete":
        state.projects.splice(0, state.projects.length, ...state.projects.filter((project) => project.id !== message.payload?.id));
        respond({ ok: true });
        return;
      case "notes.list":
        respond({ notes: state.notes });
        return;
      case "notes.create": {
        const note = { id: randomId("note"), ...message.payload };
        state.notes.push(note);
        respond({ note });
        return;
      }
      case "notes.update": {
        const index = state.notes.findIndex((note) => note.id === message.payload?.id);
        if (index >= 0) state.notes[index] = { ...state.notes[index], ...message.payload };
        respond({ note: state.notes[index] });
        return;
      }
      case "notes.delete":
        state.notes.splice(0, state.notes.length, ...state.notes.filter((note) => note.id !== message.payload?.id));
        respond({ ok: true });
        return;
      case "memory.list":
        respond({ entries: state.memory });
        return;
      case "memory.create": {
        const entry = { id: randomId("memory"), ...message.payload };
        state.memory.push(entry);
        respond({ entry });
        return;
      }
      case "memory.update": {
        const index = state.memory.findIndex((entry) => entry.id === message.payload?.id);
        if (index >= 0) state.memory[index] = { ...state.memory[index], ...message.payload };
        respond({ entry: state.memory[index] });
        return;
      }
      case "memory.delete":
        state.memory.splice(0, state.memory.length, ...state.memory.filter((entry) => entry.id !== message.payload?.id));
        respond({ ok: true });
        return;
      case "inbox.list":
        respond({ messages: state.inbox });
        return;
      case "inbox.update":
        respond({ ok: true });
        return;
      case "inbox.delete":
        respond({ ok: true });
        return;
      case "people.list":
        respond({ people: state.people });
        return;
      case "people.create": {
        const person = { id: randomId("person"), ...message.payload };
        state.people.push(person);
        respond({ person });
        return;
      }
      case "people.update": {
        const index = state.people.findIndex((person) => person.id === message.payload?.id);
        if (index >= 0) state.people[index] = { ...state.people[index], ...message.payload };
        respond({ person: state.people[index] });
        return;
      }
      case "people.delete":
        respond({ ok: true });
        return;
      case "reminders.list":
        respond({ reminders: state.reminders });
        return;
      case "reminders.create": {
        const reminder = { id: randomId("reminder"), ...message.payload };
        state.reminders.push(reminder);
        respond({ reminder });
        return;
      }
      case "reminders.update": {
        const index = state.reminders.findIndex((reminder) => reminder.id === message.payload?.id);
        if (index >= 0) state.reminders[index] = { ...state.reminders[index], ...message.payload };
        respond({ reminder: state.reminders[index] });
        return;
      }
      case "reminders.delete":
        state.reminders.splice(0, state.reminders.length, ...state.reminders.filter((reminder) => reminder.id !== message.payload?.id));
        respond({ ok: true });
        return;
      case "deadlines.list":
        respond({ deadlines: state.deadlines });
        return;
      case "deadlines.create": {
        const deadline = { id: randomId("deadline"), ...message.payload };
        state.deadlines.push(deadline);
        respond({ deadline });
        return;
      }
      case "deadlines.update": {
        const index = state.deadlines.findIndex((deadline) => deadline.id === message.payload?.id);
        if (index >= 0) state.deadlines[index] = { ...state.deadlines[index], ...message.payload };
        respond({ deadline: state.deadlines[index] });
        return;
      }
      case "deadlines.delete":
        state.deadlines.splice(0, state.deadlines.length, ...state.deadlines.filter((deadline) => deadline.id !== message.payload?.id));
        respond({ ok: true });
        return;
      case "events.list":
        respond({ events: state.events });
        return;
      case "events.create": {
        const event = { id: randomId("event"), ...message.payload };
        state.events.push(event);
        respond({ event });
        return;
      }
      case "events.update": {
        const index = state.events.findIndex((event) => event.id === message.payload?.id);
        if (index >= 0) state.events[index] = { ...state.events[index], ...message.payload };
        respond({ event: state.events[index] });
        return;
      }
      case "events.delete":
        state.events.splice(0, state.events.length, ...state.events.filter((event) => event.id !== message.payload?.id));
        respond({ ok: true });
        return;
      case "personas.list":
        respond({ personas: state.personas });
        return;
      case "personas.create": {
        const persona = { id: randomId("persona"), ...message.payload };
        state.personas.push(persona);
        respond({ persona });
        return;
      }
      case "personas.update":
        respond({ persona: { ...message.payload } });
        return;
      case "personas.delete":
        respond({ ok: true });
        return;
      case "plugins.list":
        respond({ plugins: state.plugins });
        return;
      case "plugins.create": {
        const plugin = { id: randomId("plugin"), ...message.payload };
        state.plugins.push(plugin);
        respond({ plugin });
        return;
      }
      case "plugins.update":
        respond({ plugin: { ...message.payload } });
        return;
      case "plugins.delete":
        respond({ ok: true });
        return;
      case "routines.list":
        respond({ routines: state.routines, executions: [] });
        return;
      case "routines.create": {
        const routine = { id: randomId("routine"), ...message.payload };
        state.routines.push(routine);
        respond({ routine });
        return;
      }
      case "routines.update":
        respond({ routine: { ...message.payload } });
        return;
      case "routines.delete":
        respond({ ok: true });
        return;
      case "images.list":
        respond({ images: state.images });
        return;
      case "images.get":
        respond({ image: state.images.find((image) => image.id === message.payload?.imageId) ?? null });
        return;
      case "images.create": {
        const image = { id: randomId("image"), ...message.payload };
        state.images.push(image);
        respond({ image });
        return;
      }
      case "images.delete":
        respond({ removed: true });
        return;
      case "content.brands.list":
        respond({ brands: state.contentBrands });
        return;
      case "content.brands.create": {
        const brand = { id: randomId("brand"), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...message.payload };
        state.contentBrands.push(brand);
        respond({ brand });
        return;
      }
      case "content.brands.update": {
        const index = state.contentBrands.findIndex((brand) => brand.id === message.payload?.id);
        if (index >= 0) state.contentBrands[index] = { ...state.contentBrands[index], ...message.payload, updatedAt: new Date().toISOString() };
        respond({ brand: state.contentBrands[index] });
        return;
      }
      case "content.destinations.list":
        respond({ destinations: state.contentDestinations });
        return;
      case "content.destinations.create": {
        const destination = { id: randomId("destination"), status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...message.payload };
        state.contentDestinations.push(destination);
        respond({ destination });
        return;
      }
      case "content.destinations.update": {
        const index = state.contentDestinations.findIndex((destination) => destination.id === message.payload?.id);
        if (index >= 0) state.contentDestinations[index] = { ...state.contentDestinations[index], ...message.payload, updatedAt: new Date().toISOString() };
        respond({ destination: state.contentDestinations[index] });
        return;
      }
      case "content.destinations.testConnection": {
        const destination = state.contentDestinations.find((entry) => entry.id === message.payload?.id);
        respond({ ok: true, destination });
        return;
      }
      case "content.entries.list":
        respond({ entries: state.contentEntries });
        return;
      case "content.entries.get": {
        const entry = state.contentEntries.find((item) => item.id === message.payload?.id);
        respond({ entry, revisions: [], assets: [], variants: state.contentVariants.filter((variant) => variant.entryId === entry?.id) });
        return;
      }
      case "content.entries.create": {
        const entry = {
          id: randomId("entry"),
          status: "draft",
          currentRevisionNumber: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...message.payload,
        };
        state.contentEntries.push(entry);
        respond({ entry });
        return;
      }
      case "content.entries.update": {
        const index = state.contentEntries.findIndex((entry) => entry.id === message.payload?.id);
        if (index >= 0) state.contentEntries[index] = { ...state.contentEntries[index], ...message.payload, updatedAt: new Date().toISOString() };
        respond({ entry: state.contentEntries[index] });
        return;
      }
      case "content.entries.archive": {
        const index = state.contentEntries.findIndex((entry) => entry.id === message.payload?.id);
        if (index >= 0) state.contentEntries[index] = { ...state.contentEntries[index], status: "archived", updatedAt: new Date().toISOString() };
        respond({ entry: state.contentEntries[index] });
        return;
      }
      case "content.entries.attachAsset":
        respond({ asset: { id: randomId("asset"), ...message.payload } });
        return;
      case "content.entries.generateVariants": {
        const destinationIds = Array.isArray(message.payload?.destinationIds) ? message.payload.destinationIds.map(String) : [];
        const variants = destinationIds.map((destinationId) => {
          const variant = {
            id: randomId("variant"),
            entryId: message.payload?.id,
            destinationId,
            status: "ready",
            body: "Generated relay variant",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          state.contentVariants.push(variant);
          return variant;
        });
        respond({ variants });
        return;
      }
      case "content.variants.list":
        respond({ variants: state.contentVariants });
        return;
      case "content.variants.create": {
        const variant = { id: randomId("variant"), status: "ready", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...message.payload };
        state.contentVariants.push(variant);
        respond({ variant });
        return;
      }
      case "content.variants.update": {
        const index = state.contentVariants.findIndex((variant) => variant.id === message.payload?.id);
        if (index >= 0) state.contentVariants[index] = { ...state.contentVariants[index], ...message.payload, updatedAt: new Date().toISOString() };
        respond({ variant: state.contentVariants[index] });
        return;
      }
      case "content.approvals.list":
        respond({ approvals: state.contentApprovals });
        return;
      case "content.approvals.approve": {
        const index = state.contentApprovals.findIndex((approval) => approval.id === message.payload?.id);
        if (index >= 0) state.contentApprovals[index] = { ...state.contentApprovals[index], status: "approved", comment: message.payload?.comment ?? null };
        respond({ approval: state.contentApprovals[index] });
        return;
      }
      case "content.approvals.reject": {
        const index = state.contentApprovals.findIndex((approval) => approval.id === message.payload?.id);
        if (index >= 0) state.contentApprovals[index] = { ...state.contentApprovals[index], status: "rejected", comment: message.payload?.comment };
        respond({ approval: state.contentApprovals[index] });
        return;
      }
      case "content.approvals.cancel": {
        const index = state.contentApprovals.findIndex((approval) => approval.id === message.payload?.id);
        if (index >= 0) state.contentApprovals[index] = { ...state.contentApprovals[index], status: "cancelled" };
        respond({ approval: state.contentApprovals[index] });
        return;
      }
      case "content.calendar.view":
        respond({ items: state.contentPlans.map((plan) => ({ planId: plan.id, title: "Relay calendar item", scheduledAt: plan.scheduledAt ?? null })) });
        return;
      case "content.publish.listPlans":
        respond({ plans: state.contentPlans });
        return;
      case "content.publish.createPlan": {
        const variant = state.contentVariants.find((entry) => entry.id === message.payload?.variantId);
        const approval = {
          id: randomId("approval"),
          entryId: variant?.entryId,
          variantId: variant?.id,
          destinationId: variant?.destinationId,
          status: "pending",
          requestedAt: new Date().toISOString(),
          comment: null,
        };
        const plan = {
          id: randomId("plan"),
          entryId: variant?.entryId,
          variantId: variant?.id,
          destinationId: variant?.destinationId,
          status: "queued",
          scheduledAt: message.payload?.scheduledAt ?? null,
        };
        state.contentApprovals.push(approval);
        state.contentPlans.push(plan);
        respond({ plan, approval });
        return;
      }
      case "content.publish.cancelPlan": {
        const index = state.contentPlans.findIndex((plan) => plan.id === message.payload?.id);
        if (index >= 0) state.contentPlans[index] = { ...state.contentPlans[index], status: "cancelled" };
        respond({ plan: state.contentPlans[index] });
        return;
      }
      case "content.publish.runNow": {
        const plan = state.contentPlans.find((entry) => entry.id === message.payload?.id);
        const approval = state.contentApprovals.find((entry) => entry.variantId === plan?.variantId);
        if (approval?.status !== "approved") {
          socket.send(JSON.stringify({
            type: "error",
            requestId: message.requestId,
            code: "approval_required",
            message: "Plan requires an approved approval request before publication.",
          }));
          return;
        }
        const run = {
          id: randomId("run"),
          planId: plan?.id,
          entryId: plan?.entryId,
          variantId: plan?.variantId,
          destinationId: plan?.destinationId,
          status: "succeeded",
          attemptNumber: 1,
          externalId: randomId("external"),
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        if (plan) Object.assign(plan, { status: "succeeded" });
        state.contentRuns.push(run);
        respond({ plan, run });
        return;
      }
      case "content.publish.schedulerRun":
        respond({ runs: state.contentRuns });
        return;
      case "content.publish.listRuns":
        respond({ runs: state.contentRuns.map((run) => ({ ...run, canRetry: run.status === "failed" })) });
        return;
      case "content.publish.getRun": {
        const run = state.contentRuns.find((entry) => entry.id === message.payload?.id);
        respond({ run, canRetry: false, plan: state.contentPlans.find((plan) => plan.id === run?.planId) ?? null });
        return;
      }
      case "content.publish.retryRun": {
        const previous = state.contentRuns.find((entry) => entry.id === message.payload?.id);
        const run = {
          id: randomId("run"),
          planId: previous?.planId,
          entryId: previous?.entryId,
          variantId: previous?.variantId,
          destinationId: previous?.destinationId,
          status: "succeeded",
          attemptNumber: Number(previous?.attemptNumber ?? 0) + 1,
          externalId: randomId("external"),
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        state.contentRuns.push(run);
        respond({ plan: state.contentPlans.find((plan) => plan.id === previous?.planId) ?? null, run });
        return;
      }
      case "content.app.frontendContract":
        respond({ version: "1", screens: [] });
        return;
      case "content.app.screens":
        respond({ screens: [{ id: "dashboard", route: "/dashboard" }] });
        return;
      case "content.app.dashboard":
        respond({ metrics: { drafts: state.contentEntries.length } });
        return;
      case "content.app.calendar":
        respond({ items: state.contentPlans });
        return;
      case "content.app.pipeline":
        respond({ columns: [] });
        return;
      case "content.app.composer":
        respond({ entry: state.contentEntries.find((entry) => entry.id === message.payload?.entryId) ?? null });
        return;
      case "content.app.destinations":
        respond({ items: state.contentDestinations });
        return;
      case "content.app.approvals":
        respond({ items: state.contentApprovals });
        return;
      case "content.app.publications":
        respond({ items: state.contentRuns });
        return;
      case "content.app.form":
        respond({ id: message.payload?.formId ?? "entry.create" });
        return;
      case "skills.list":
        respond({ skills: [{ id: "checks", enabled: true }] });
        return;
      case "skills.search":
        respond({ results: [{ id: "checks", title: "Checks" }] });
        return;
      case "skills.sources":
        respond({ sources: [{ id: "local", label: "Local" }] });
        return;
      case "admin.workspace.create":
        respond({ ok: true, workspaceId: message.workspaceId, displayName: message.payload?.displayName ?? message.workspaceId });
        return;
      case "admin.runtime.status":
        respond({ runtime: { adapter: "fake" } });
        return;
      case "admin.config.read":
        respond({ values: { mode: "fake" } });
        return;
      case "admin.workspace-file.read":
        respond({ file: workspaceFiles.get(String(message.payload?.fileName ?? "")) ?? "" });
        return;
      case "admin.workspace-file.write":
        workspaceFiles.set(String(message.payload?.fileName ?? ""), String(message.payload?.content ?? ""));
        respond({ ok: true });
        return;
      default:
        socket.send(JSON.stringify({
          type: "error",
          requestId: message.requestId,
          code: "unsupported",
          message: "token=secret-token-12345678 should be redacted",
        }));
    }
  });

  return socket;
}
