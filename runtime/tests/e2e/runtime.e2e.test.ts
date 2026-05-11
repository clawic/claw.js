import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { FastifyInstance } from "fastify";

import { RuntimeApiClient, buildRuntimeApp } from "@clawjs/runtime";
import { SessionsApiClient, buildSessionsApp } from "@clawjs/sessions";
import { UserModelApiClient, buildUserModelApp } from "@clawjs/user-model";

const SECRET = "runtime-e2e-secret";

function injectFetch(app: FastifyInstance): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const response = await app.inject({
      method: init?.method ?? "GET",
      url: `${url.pathname}${url.search}`,
      headers: init?.headers as Record<string, string> | undefined,
      payload: init?.body ? String(init.body) : undefined,
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: response.headers as Record<string, string>,
    });
  };
}

interface TestContext {
  runtimeClient: RuntimeApiClient;
  sessionsClient: SessionsApiClient;
  userModelClient: UserModelApiClient;
  skillsOutputDir: string;
  tmpDir: string;
  close: () => Promise<void>;
}

async function spinUp(): Promise<TestContext> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-e2e-"));
  const skillsOutputDir = path.join(tmpDir, "skills-distilled");

  const sessionsApp = buildSessionsApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "sessions"),
      dbPath: path.join(tmpDir, "sessions", "sessions.sqlite"),
      sharedSecret: SECRET,
    },
  }).app;
  const userModelApp = buildUserModelApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "user-model"),
      dbPath: path.join(tmpDir, "user-model", "user-model.sqlite"),
      sharedSecret: SECRET,
    },
  }).app;

  const sessionsClient = new SessionsApiClient({
    baseUrl: "http://sessions.test",
    token: SECRET,
    fetchImpl: injectFetch(sessionsApp),
  });
  const userModelClient = new UserModelApiClient({
    baseUrl: "http://user-model.test",
    token: SECRET,
    fetchImpl: injectFetch(userModelApp),
  });

  const runtime = buildRuntimeApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "runtime"),
      dbPath: path.join(tmpDir, "runtime", "runtime.sqlite"),
      skillsOutputDir,
      sharedSecret: SECRET,
    },
    context: {
      sessionsClient,
      userModelClient,
      skillsOutputDir,
    },
  });

  const runtimeClient = new RuntimeApiClient({
    baseUrl: "http://runtime.test",
    token: SECRET,
    fetchImpl: injectFetch(runtime.app),
  });

  return {
    runtimeClient,
    sessionsClient,
    userModelClient,
    skillsOutputDir,
    tmpDir,
    close: async () => {
      await runtime.app.close();
      await userModelApp.close();
      await sessionsApp.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

async function seedSession(
  ctx: TestContext,
  options: {
    id?: string;
    agent?: string;
    userMessages: string[];
    assistantMessages: string[];
    toolMessages?: number;
  },
): Promise<string> {
  const session = await ctx.sessionsClient.createSession({
    agent: options.agent ?? "codex",
    title: "Seeded session",
    id: options.id,
  });
  let timestamp = session.createdAt + 1000;
  const userTexts = options.userMessages;
  const assistantTexts = options.assistantMessages;
  const interleave = Math.max(userTexts.length, assistantTexts.length);
  for (let i = 0; i < interleave; i += 1) {
    if (userTexts[i]) {
      await ctx.sessionsClient.appendMessage(session.id, {
        role: "user",
        contentText: userTexts[i],
        timestamp,
      });
      timestamp += 1000;
    }
    if (assistantTexts[i]) {
      await ctx.sessionsClient.appendMessage(session.id, {
        role: "assistant",
        contentText: assistantTexts[i],
        timestamp,
      });
      timestamp += 1000;
    }
  }
  for (let t = 0; t < (options.toolMessages ?? 0); t += 1) {
    await ctx.sessionsClient.appendMessage(session.id, {
      role: "tool",
      contentText: `tool call #${t + 1}: ran command`,
      timestamp,
      toolCalls: [{ name: "shell", args: { command: `step-${t + 1}` } }],
    });
    timestamp += 1000;
  }
  return session.id;
}

test("distill produces SKILL.md with provenance=distilled and confidence > 0", async () => {
  const ctx = await spinUp();
  try {
    const sessionId = await seedSession(ctx, {
      userMessages: ["help me ship the kanban dispatcher loop"],
      assistantMessages: ["sure, here is the plan and result"],
      toolMessages: 4,
    });

    const record = await ctx.runtimeClient.distill({ sessionId });
    assert.equal(record.status, "completed");
    assert.equal(record.provenance, "distilled");
    assert.ok(record.skillMarkdownPath, "should have a skill markdown path");
    assert.ok(record.confidence > 0, "confidence should be positive");

    const skillContent = fs.readFileSync(record.skillMarkdownPath!, "utf8");
    assert.match(skillContent, /provenance: distilled/);
    assert.match(skillContent, /fromSessionId: "/);
    assert.match(skillContent, /^# Distilled:/m);
  } finally {
    await ctx.close();
  }
});

test("distill skips when tool call count below threshold", async () => {
  const ctx = await spinUp();
  try {
    const sessionId = await seedSession(ctx, {
      userMessages: ["small chat"],
      assistantMessages: ["sure"],
      toolMessages: 0,
    });

    const record = await ctx.runtimeClient.distill({ sessionId, minToolCalls: 2 });
    assert.equal(record.status, "skipped");
    assert.match(record.reason ?? "", /tool_count_below_threshold/);
  } finally {
    await ctx.close();
  }
});

test("distill is idempotent on same session via ON CONFLICT update", async () => {
  const ctx = await spinUp();
  try {
    const sessionId = await seedSession(ctx, {
      userMessages: ["distill me please"],
      assistantMessages: ["here is the result"],
      toolMessages: 3,
    });

    const first = await ctx.runtimeClient.distill({ sessionId });
    const second = await ctx.runtimeClient.distill({ sessionId });
    assert.equal(first.skillSlug, second.skillSlug);

    const list = await ctx.runtimeClient.listDistillations(sessionId);
    assert.equal(list.items.length, 1);
  } finally {
    await ctx.close();
  }
});

test("nudge captures user preferences via heuristic patterns", async () => {
  const ctx = await spinUp();
  try {
    const sessionId = await seedSession(ctx, {
      userMessages: [
        "I prefer terse responses without trailing summaries",
        "don't use em-dashes in the output",
        "this is some neutral text without trigger phrases",
        "remember that this project uses Flutter",
      ],
      assistantMessages: ["got it", "noted", "ok", "noted"],
    });

    const result = await ctx.runtimeClient.nudge({ sessionId, lookbackMinutes: 60 * 24 * 365 });
    const classifications = result.items.map((item) => item.classification).sort();
    assert.ok(classifications.includes("preference"), `expected preference in ${classifications.join(",")}`);
    assert.ok(classifications.includes("constraint"));
    assert.ok(classifications.includes("explicit_save"));
    assert.ok(!classifications.includes("neutral"), "neutral text should not match");
  } finally {
    await ctx.close();
  }
});

test("refresh-user-model extracts items into user-model/ via heuristics", async () => {
  const ctx = await spinUp();
  try {
    await seedSession(ctx, {
      userMessages: [
        "I prefer concise commit messages",
        "I am working on Clawix native macOS",
        "expert in Flutter and Swift native UI",
      ],
      assistantMessages: ["understood", "ok", "got it"],
    });

    const result = await ctx.runtimeClient.refreshUserModel({ reason: "test_refresh" });
    assert.equal(result.status, "completed");
    assert.ok(result.itemsAdded >= 2, `expected at least 2 items added, got ${result.itemsAdded}`);

    const grouped = await ctx.userModelClient.bySection();
    const allText = [
      ...grouped.preference.map((item) => item.contentText),
      ...grouped.project.map((item) => item.contentText),
      ...grouped.expertise.map((item) => item.contentText),
    ].join(" | ");
    assert.match(allText, /concise commit messages/i);
    assert.match(allText, /Clawix native macOS/i);
  } finally {
    await ctx.close();
  }
});

test("status returns recent jobs and last actions", async () => {
  const ctx = await spinUp();
  try {
    const sessionId = await seedSession(ctx, {
      userMessages: ["I prefer markdown output"],
      assistantMessages: ["ok"],
      toolMessages: 2,
    });
    await ctx.runtimeClient.distill({ sessionId });
    await ctx.runtimeClient.nudge({ sessionId, lookbackMinutes: 60 * 24 * 365 });
    await ctx.runtimeClient.refreshUserModel({ reason: "status_check" });

    const status = await ctx.runtimeClient.status();
    assert.ok(status.recent.jobs.length >= 3, `expected >= 3 jobs, got ${status.recent.jobs.length}`);
    assert.ok(status.recent.distillations.length >= 1);
    assert.ok(status.recent.userModelRefreshes.length >= 1);
  } finally {
    await ctx.close();
  }
});

test("jobs endpoint lists by kind", async () => {
  const ctx = await spinUp();
  try {
    const sessionId = await seedSession(ctx, {
      userMessages: ["test"],
      assistantMessages: ["ok"],
      toolMessages: 2,
    });
    await ctx.runtimeClient.distill({ sessionId });
    const jobs = await ctx.runtimeClient.listJobs("distill");
    assert.ok(jobs.items.length >= 1);
    assert.ok(jobs.items.every((job) => job.kind === "distill"));
  } finally {
    await ctx.close();
  }
});
