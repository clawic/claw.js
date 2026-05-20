import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { FastifyInstance } from "fastify";

import { clawApiPath } from "@clawjs/core";
import { RuntimeApiClient, buildRuntimeApp } from "@clawjs/runtime";
import { SessionsApiClient, buildSessionsApp } from "@clawjs/sessions";
import { UserModelApiClient, buildUserModelApp } from "@clawjs/user-model";

const SECRET = "runtime-e2e-secret";
const CANONICAL_CAPABILITY_SURFACES = ["sdk", "cli", "serviceApi", "mcp", "relay", "hostBridge"];

function assertCompleteResolvedSurfaces(
  capabilities: Array<{ id: string; surfaces: Array<{ surface: string; status: string; ref?: string }> }>,
): void {
  for (const capability of capabilities) {
    assert.deepEqual(capability.surfaces.map((surface) => surface.surface), CANONICAL_CAPABILITY_SURFACES, capability.id);
    for (const surface of capability.surfaces) {
      assert.notEqual(surface.status, "pending", `${capability.id}:${surface.surface}`);
      if (surface.status === "available") {
        assert.equal(Boolean(surface.ref), true, `${capability.id}:${surface.surface}`);
      } else {
        assert.equal(surface.ref, undefined, `${capability.id}:${surface.surface}`);
      }
    }
  }
}

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
  runtimeFetch: typeof fetch;
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
      dbPath: path.join(tmpDir, "user-model", "core.sqlite"),
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

  const runtimeFetch = injectFetch(runtime.app);
  const runtimeClient = new RuntimeApiClient({
    baseUrl: "http://runtime.test",
    token: SECRET,
    fetchImpl: runtimeFetch,
  });

  return {
    runtimeClient,
    runtimeFetch,
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

test("runtime service API exposes custom app SDK contracts as read-only metadata", async () => {
  const ctx = await spinUp();
  try {
    const payload = await ctx.runtimeClient.customAppSDKContracts() as {
      serviceApiRole: string;
      richUiRuntime: string;
      executionBoundary: {
        kind: string;
        executesCapabilityCalls: boolean;
        richUiExecutionPath: string;
        nonExecutableSurfaces: string[];
        dbSearchExecution: string;
      };
      schemaRefs: string[];
      missingSchemaRefs: string[];
      riskMap: { ordinaryAccess: string[]; approvalRequired: string[] };
      capabilities: Array<{
        id: string;
        inputSchemaRef?: string;
        dispatch?: { mode: string; status: string };
        surfaces: Array<{ surface: string; status: string; ref?: string }>;
      }>;
    };
    assert.equal(payload.serviceApiRole, "inspection_validation_contract_resource");
    assert.equal(payload.richUiRuntime, "sdk_host_bridge_not_service_api_process");
    assert.equal(payload.executionBoundary.kind, "metadata_only_contract_catalog");
    assert.equal(payload.executionBoundary.executesCapabilityCalls, false);
    assert.equal(payload.executionBoundary.richUiExecutionPath, "sdk_host_bridge");
    assert.equal(payload.executionBoundary.nonExecutableSurfaces.includes("service_api.contracts"), true);
    assert.equal(payload.executionBoundary.dbSearchExecution, "host_bridge_only");
    assert.deepEqual(payload.missingSchemaRefs, []);
    assert.ok(payload.schemaRefs.includes("claw.resources.payload.v1"));
    assert.ok(payload.riskMap.ordinaryAccess.includes("search.query"));
    assert.ok(payload.riskMap.approvalRequired.includes("actions.invoke"));
    assertCompleteResolvedSurfaces(payload.capabilities);
    assert.equal(
      payload.capabilities.find((capability) => capability.id === "db.query")?.inputSchemaRef,
      "claw.db.query.v1",
    );
    assert.equal(
      payload.capabilities.find((capability) => capability.id === "actions.invoke")?.dispatch?.mode,
      "approvalRequiredNoRunner",
    );
  } finally {
    await ctx.close();
  }
});

test("runtime custom app SDK contract route does not execute DB or Search calls", async () => {
  const ctx = await spinUp();
  try {
    const response = await ctx.runtimeFetch(`http://runtime.test${clawApiPath("contracts/custom-app-sdk")}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SECRET}`,
      },
      body: JSON.stringify({
        operation: "db.query",
        query: { collection: "tasks", filter: {} },
      }),
    });

    assert.equal(response.status, 404);
    const body = await response.json() as { error: string };
    assert.equal(body.error, "Not Found");
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
