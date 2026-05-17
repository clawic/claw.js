import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import { createWorkspaceClaw } from "./index.ts";

function createWorkspaceDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `clawjs-workspace-${label}-`));
}

function useIsolatedClawDataRoot(t: { after(fn: () => void): void }, workspaceDir: string): string {
  const previous = process.env.CLAW_DATA_DIR;
  const dataRoot = path.join(workspaceDir, "claw-data");
  process.env.CLAW_DATA_DIR = dataRoot;
  t.after(() => {
    if (previous === undefined) delete process.env.CLAW_DATA_DIR;
    else process.env.CLAW_DATA_DIR = previous;
  });
  return dataRoot;
}

function embedText(text: string): number[] {
  const normalized = text.toLowerCase();
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return alphabet.split("").map((letter) => normalized.split(letter).length - 1);
}

function daysFromNow(days: number, hour = 9, minute = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

test("createWorkspaceClaw manages tasks, notes, people, inbox, events, and badges locally", { concurrency: false }, async (t) => {
  const workspaceDir = createWorkspaceDir("crud");
  const dataRoot = useIsolatedClawDataRoot(t, workspaceDir);
  const claw = await createWorkspaceClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: "demo",
      workspaceId: "workspace-crud",
      agentId: "agent-crud",
      rootDir: workspaceDir,
    },
    productivity: {
      semanticSearch: {
        embed: async (text) => embedText(text),
        minTextLength: 10,
      },
    },
  });

  const person = await claw.people.upsert({
    displayName: "Alice Example",
    emails: ["alice@example.com"],
    identities: [{ channel: "telegram", handle: "@alice" }],
  });

  const project = await claw.projects.create({
    name: "Workspace product core",
    status: "in_progress",
    ownerPersonId: person.id,
  });

  const goal = await claw.goals.create({
    title: "Ship workspace productivity",
    status: "active",
    projectId: project.id,
    ownerPersonId: person.id,
    metricKey: "cli_crud",
    targetValue: 1,
    currentValue: 0.5,
  });

  const task = await claw.tasks.create({
    title: "Ship workspace package",
    description: "Implement the local-first productivity layer.",
    priority: "high",
    assigneePersonId: person.id,
    labels: ["sdk", "workspace"],
    dueAt: daysFromNow(1, 12, 0),
    projectId: project.id,
    goalId: goal.id,
    dependsOnTaskIds: [],
  });

  const reminder = await claw.reminders.create({
    title: "Nudge launch owner",
    triggerAt: daysFromNow(1, 10, 0),
    anchorType: "task",
    anchorId: task.id,
  });

  const deadline = await claw.deadlines.create({
    title: "Launch deadline",
    dueAt: daysFromNow(3, 18, 0),
    anchorType: "project",
    anchorId: project.id,
  });

  const note = await claw.notes.create({
    title: "Launch checklist",
    content: "Workspace launch checklist with tasks, inbox, and notes.",
    tags: ["launch", "workspace"],
    linkedEntityIds: [task.id],
  });

  const event = await claw.events.create({
    title: "Workspace review",
    startsAt: daysFromNow(2, 9, 0),
    attendeePersonIds: [person.id],
    linkedTaskIds: [task.id],
    linkedNoteIds: [note.id],
    reminders: [{ minutesBeforeStart: 30 }],
  });

  const incoming = await claw.inbox.ingestIncomingMessage({
    channel: "telegram",
    subject: "Workspace updates",
    content: "Please share the latest workspace launch checklist.",
    participantPersonIds: [person.id],
    linkedTaskIds: [task.id],
    linkedNoteIds: [note.id],
    replyTarget: { channel: "telegram", threadId: "thread-42" },
    externalThreadId: "thread-42",
    externalMessageId: "message-1",
  });

  assert.equal(incoming.thread.status, "read");
  assert.equal((await claw.inbox.getThread(incoming.thread.id))?.channel, "telegram");
  assert.equal((await claw.goals.get(goal.id))?.projectId, project.id);
  assert.equal((await claw.projects.get(project.id))?.ownerPersonId, person.id);
  assert.equal((await claw.time.get(reminder.id)).item.nextRunAt, reminder.triggerAt);
  assert.equal((await claw.time.get(deadline.id)).item.nextRunAt, deadline.dueAt);
  assert.deepEqual((await claw.events.get(event.id))?.linkedTaskIds, [task.id]);
  assert.deepEqual((await claw.events.get(event.id))?.linkedNoteIds, [note.id]);
  assert.equal((await claw.reminders.pause(reminder.id)).status, "paused");
  assert.equal((await claw.reminders.resume(reminder.id)).status, "active");
  assert.equal((await claw.deadlines.pause(deadline.id)).status, "paused");
  assert.equal((await claw.deadlines.resume(deadline.id)).status, "active");
  assert.equal((await claw.tasks.complete(task.id)).status, "done");
  assert.equal((await claw.reminders.get(reminder.id))?.status, "cancelled");
  assert.equal((await claw.deadlines.get(deadline.id))?.status, "active");

  const reply = await claw.inbox.routeReply(incoming.thread.id, {
    content: "Shared. The checklist is updated.",
    linkedTaskIds: [task.id],
  });
  assert.equal(reply.status, "sent");
  assert.deepEqual(await claw.inbox.resolveReplyTarget(incoming.thread.id), { channel: "telegram", threadId: "thread-42" });

  const results = await claw.search.query({
    query: "workspace",
    domains: ["notes", "inbox", "tasks", "goals", "projects", "reminders", "deadlines"],
    strategy: "hybrid",
  });
  assert.equal(results.some((result) => result.domain === "notes"), true);
  assert.equal(results.some((result) => result.domain === "inbox"), true);
  assert.equal(results.some((result) => result.domain === "goals"), true);
  assert.equal(results.some((result) => result.domain === "projects"), true);

  const badges = await claw.ui.badges();
  assert.equal(badges.find((badge) => badge.id === "inbox_unread")?.value, 0);
  assert.ok((badges.find((badge) => badge.id === "events_upcoming")?.value ?? 0) >= 1);

  const rebuilt = await claw.workspaceIndex.rebuild();
  assert.ok(rebuilt.reindexed >= 8);
  assert.ok(rebuilt.embeddings >= 1);

  assert.equal(fs.existsSync(path.join(dataRoot, "core.sqlite")), true);
});

test("createWorkspaceClaw builds context blocks and augments session streaming", { concurrency: false }, async (t) => {
  const workspaceDir = createWorkspaceDir("context");
  useIsolatedClawDataRoot(t, workspaceDir);
  const claw = await createWorkspaceClaw({
    runtime: {
      adapter: "openclaw",
      gateway: { url: "http://127.0.0.1:18889" },
    },
    workspace: {
      appId: "demo",
      workspaceId: "workspace-context",
      agentId: "agent-context",
      rootDir: workspaceDir,
    },
  });

  await claw.tasks.create({
    title: "Workspace launch checklist response",
    description: "Summarize the workspace launch checklist for the user.",
    priority: "urgent",
  });
  await claw.notes.create({
    title: "Workspace launch checklist",
    content: "Workspace launch checklist includes tasks, inbox routing, notes, and events.",
  });
  await claw.events.create({
    title: "Launch call",
    startsAt: daysFromNow(2, 11, 0),
  });

  const session = claw.sessions.createSession("Workspace help");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "Please summarize the workspace launch checklist",
  });

  const bundle = await claw.context.build({
    sessionId: session.sessionId,
    query: "workspace launch checklist",
    strategy: "keyword",
  });
  assert.equal(bundle.blocks.some((block) => block.title === "Relevant tasks"), true);
  assert.equal(bundle.blocks.some((block) => block.title === "Relevant notes"), true);

  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  globalThis.fetch = (async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Workspace"}}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" summary"}}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), { status: 200 })) as typeof fetch;

  try {
    const seen: string[] = [];
    for await (const event of claw.sessions.streamAssistantReplyEvents({
      sessionId: session.sessionId,
      transport: "gateway",
      workspaceContext: "auto",
    })) {
      if (event.type === "chunk") {
        seen.push(event.chunk.delta);
      }
    }
    assert.deepEqual(seen, ["Workspace", " summary"]);
    assert.equal(claw.sessions.getSession(session.sessionId)?.messages.at(-1)?.content, "Workspace summary");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
