import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { Claw, createClaw } from "./create-claw.ts";
import { resolveClawWorkspaceSurfacePath } from "./surface-paths.ts";
import { EmbeddedTimeEngine } from "./time/index.ts";
import { buildTimeApp } from "../../../time/src/server/app.ts";

import { createExplicitOpenClawToolchain, createFakeGenerationCommand, createFakeOpenClawChannelsToolchain, createFakeOpenClawImageSkillEnv, createFakeOpenClawMemoryToolchain, createFakeOpenClawPluginToolchain, createFakeSecretsProxy, createFakeSkillSourceToolchain, createOpenClawAuthReadyToolchain, withPatchedEnv } from "./create-claw-test-utils.ts";

test("createClaw instances keep separate workspaces and sessions isolated", async () => {
  const workspaceA = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-a-"));
  const workspaceB = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-b-"));

  const clawA = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-a",
      agentId: "demo-a",
      rootDir: workspaceA,
    },
  });
  const clawB = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-b",
      agentId: "demo-b",
      rootDir: workspaceB,
    },
  });

  await Promise.all([clawA.workspace.init(), clawB.workspace.init()]);

  const sessionA = clawA.sessions.createSession("Alpha");
  clawA.sessions.appendMessage(sessionA.sessionId, { role: "user", content: "only-a" });
  const sessionB = clawB.sessions.createSession("Beta");
  clawB.sessions.appendMessage(sessionB.sessionId, { role: "user", content: "only-b" });

  clawA.files.writeWorkspaceFile("notes.md", "workspace-a\n");
  clawB.files.writeWorkspaceFile("notes.md", "workspace-b\n");

  assert.equal(clawA.sessions.listSessions().length, 1);
  assert.equal(clawB.sessions.listSessions().length, 1);
  assert.equal(clawA.sessions.getSession(sessionB.sessionId), null);
  assert.equal(clawB.sessions.getSession(sessionA.sessionId), null);
  assert.equal(clawA.files.readWorkspaceFile("notes.md"), "workspace-a\n");
  assert.equal(clawB.files.readWorkspaceFile("notes.md"), "workspace-b\n");
  assert.equal(fs.existsSync(resolveClawWorkspaceSurfacePath("claw.workspace.sessions", workspaceA, `${sessionB.sessionId}.jsonl`)), false);
  assert.equal(fs.existsSync(resolveClawWorkspaceSurfacePath("claw.workspace.sessions", workspaceB, `${sessionA.sessionId}.jsonl`)), false);
});

test("createClaw instances can share a workspace and initialize it in parallel", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-shared-"));

  const clawA = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-shared",
      agentId: "demo-shared",
      rootDir: workspaceDir,
    },
  });
  const clawB = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-shared",
      agentId: "demo-shared",
      rootDir: workspaceDir,
    },
  });

  await Promise.all([clawA.workspace.init(), clawB.workspace.init()]);

  const [sessionA, sessionB] = await Promise.all([
    Promise.resolve().then(() => clawA.sessions.createSession("Alpha")),
    Promise.resolve().then(() => clawB.sessions.createSession("Beta")),
  ]);

  await Promise.all([
    Promise.resolve().then(() => clawA.sessions.appendMessage(sessionA.sessionId, { role: "user", content: "only-a" })),
    Promise.resolve().then(() => clawB.sessions.appendMessage(sessionB.sessionId, { role: "user", content: "only-b" })),
    Promise.resolve().then(() => clawA.files.writeWorkspaceFile("notes-a.md", "workspace-a\n")),
    Promise.resolve().then(() => clawB.files.writeWorkspaceFile("notes-b.md", "workspace-b\n")),
  ]);

  assert.equal(clawA.sessions.listSessions().length, 2);
  assert.equal(clawB.sessions.listSessions().length, 2);
  assert.equal(clawA.sessions.getSession(sessionB.sessionId)?.messageCount, 1);
  assert.equal(clawB.sessions.getSession(sessionA.sessionId)?.messageCount, 1);
  assert.equal(clawA.files.readWorkspaceFile("notes-a.md"), "workspace-a\n");
  assert.equal(clawA.files.readWorkspaceFile("notes-b.md"), "workspace-b\n");
  assert.equal(clawB.files.readWorkspaceFile("notes-a.md"), "workspace-a\n");
  assert.equal(clawB.files.readWorkspaceFile("notes-b.md"), "workspace-b\n");
  assert.equal(fs.existsSync(resolveClawWorkspaceSurfacePath("claw.workspace.sessions", workspaceDir, `${sessionA.sessionId}.jsonl`)), true);
  assert.equal(fs.existsSync(resolveClawWorkspaceSurfacePath("claw.workspace.sessions", workspaceDir, `${sessionB.sessionId}.jsonl`)), true);
});

test("createClaw exposes workspace validation and binding persistence", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-workspace-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  const validation = await claw.workspace.validate();
  assert.equal(validation.ok, true);

  claw.files.writeBindingStore([{
    id: "tone",
    targetFile: "SOUL.md",
    mode: "managed_block",
    blockId: "tone",
    settingsPath: "tone",
  }]);
  claw.files.writeSettingsSchema({
    tone: { type: "string" },
  });

  assert.equal(claw.files.readBindingStore().bindings.length, 1);
  assert.equal((claw.files.readSettingsSchema().settingsSchema.tone as { type: string }).type, "string");
});

test("createClaw exposes intent, observed, and feature APIs for declarative model sync", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-intent-api-"));
  const claw = await createClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-intent",
      agentId: "demo-intent",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  const features = claw.features.describe();
  const initialIntent = claw.intent.get("models") as { defaultModel?: string | null };

  assert.equal(features.some((feature) => feature.featureId === "models" && feature.ownership === "sdk-owned"), true);
  assert.equal(initialIntent.defaultModel ?? null, null);

  const modelId = await claw.models.setDefault("openai/gpt-5.4");
  const modelsIntent = claw.intent.get("models") as { defaultModel?: string | null };
  const observedModels = claw.observed.read("models") as {
    defaultModel?: {
      modelId?: string | null;
    } | null;
  } | null;
  const diff = await claw.intent.diff({ domains: ["models"] });
  const inspected = await claw.workspace.inspect();

  assert.equal(modelId, "openai/gpt-5.4");
  assert.equal(modelsIntent.defaultModel, "openai/gpt-5.4");
  assert.equal(observedModels?.defaultModel?.modelId, "openai/gpt-5.4");
  assert.equal(diff.drifted, false);
  assert.equal(fs.existsSync(inspected.intentPaths.models), true);
  assert.equal(fs.existsSync(inspected.observedPaths.models), true);
});

test("createClaw can repair workspace layout and canonicalize compat snapshots", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-repair-"));
  fs.mkdirSync(resolveClawWorkspaceSurfacePath("claw.workspace.compat", workspaceDir), { recursive: true });
  fs.writeFileSync(resolveClawWorkspaceSurfacePath("claw.workspace.compat", workspaceDir, "runtime-snapshot.json"), JSON.stringify({
    schemaVersion: 1,
    runtimeAdapter: "openclaw",
    runtimeVersion: "1.2.3",
    probedAt: "2026-03-20T00:00:00.000Z",
    capabilities: {
      version: true,
      modelsStatus: true,
      agentsList: true,
      gatewayCall: false,
    },
  }, null, 2));

  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const repaired = await claw.workspace.repair();
  assert.equal(repaired.compatSnapshotCanonicalized, true);
  assert.equal((await claw.workspace.validate()).ok, true);
});

test("createClaw exposes workspace reset preview and result", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-reset-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  claw.files.writeWorkspaceFile("notes.md", "keep\n");
  const preview = await claw.workspace.previewReset({ removeRuntimeFiles: true });
  assert.equal(preview.targets.some((target) => target.path.endsWith("SOUL.md") && target.exists), true);

  const result = await claw.workspace.reset({ removeRuntimeFiles: true });
  assert.equal(result.removedPaths.some((entry) => entry.endsWith("SOUL.md")), true);
  assert.equal(claw.files.readWorkspaceFile("notes.md"), "keep\n");
});

test("createClaw emits domain events and supports auth key storage", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-events-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-agent-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw", agentDir },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const seen: string[] = [];
  const stop = claw.watch.events("*", (event) => {
    seen.push(event.type);
  });

  await claw.workspace.init();
  const session = claw.sessions.createSession("Hello");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "first",
  });
  const authSummary = claw.auth.setApiKey("anthropic", "sk-ant-secret-12345678");
  const diagnostics = claw.auth.diagnostics("anthropic");
  stop();

  assert.equal(authSummary.profileId, "anthropic:manual");
  assert.ok(diagnostics.profiles);
  assert.equal(diagnostics.profiles[0]?.maskedCredential, "******************5678");
  assert.deepEqual(seen, [
    "workspace.initialized",
    "sessions.session_created",
    "sessions.message_appended",
    "auth.progress",
    "auth.api_key_saved",
    "auth.progress",
  ]);

  const auditLogReadLimitBytes = 64 * 1024;
  const auditLogPath = resolveClawWorkspaceSurfacePath("claw.workspace.audit", workspaceDir, "audit.jsonl");
  const auditLogBuffer = Buffer.alloc(auditLogReadLimitBytes);
  const auditLogFd = fs.openSync(auditLogPath, "r");
  const auditLogBytes = fs.readSync(auditLogFd, auditLogBuffer, 0, auditLogReadLimitBytes, 0);
  fs.closeSync(auditLogFd);
  const auditLog = auditLogBuffer.subarray(0, auditLogBytes).toString("utf8");
  assert.equal(auditLog.includes("sk-ant-secret-12345678"), false);
});

test("createClaw provider intents reconcile auth state and disabled providers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-provider-intent-"));
  const claw = await createClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-provider-intent",
      agentId: "demo-provider-intent",
      rootDir: workspaceDir,
    },
  });

  claw.auth.setApiKey("openai", "sk-demo-12345678");
  await claw.auth.status();
  const providersIntentAfterSave = claw.intent.get("providers") as {
    providers?: Record<string, {
      enabled?: boolean;
      preferredAuthMode?: string | null;
      profileId?: string | null;
    }>;
  };
  const diffAfterSave = await claw.intent.diff({ domains: ["providers"] });

  assert.equal(providersIntentAfterSave.providers?.openai?.enabled, true);
  assert.equal(providersIntentAfterSave.providers?.openai?.preferredAuthMode, "api_key");
  assert.equal(diffAfterSave.drifted, false);

  await claw.auth.setProviderEnabled("openai", false, {
    preferredAuthMode: "api_key",
  });

  const authState = await claw.auth.status();
  const diffAfterDisable = await claw.intent.diff({ domains: ["providers"] });

  assert.equal(authState.openai?.hasAuth, false);
  assert.equal(diffAfterDisable.drifted, false);
});

test("createClaw auth.prepareLogin and auth.login report reused OpenClaw auth with alias resolution", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-openclaw-login-plan-"));
  const agentDir = path.join(workspaceDir, ".runtime-agent");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, "auth-profiles.json"), JSON.stringify({
    version: 1,
    profiles: {
      "openai-codex:default": {
        type: "oauth",
        provider: "openai-codex",
        maskedCredential: "••••oauth",
      },
    },
  }, null, 2));
  const { binaryPath } = createOpenClawAuthReadyToolchain({});
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      binaryPath,
      agentDir,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-openclaw-login-plan",
      agentId: "demo-openclaw-login-plan",
      rootDir: workspaceDir,
    },
  });

  const seen: string[] = [];
  const plan = await claw.auth.prepareLogin("openai");
  const result = await claw.auth.login("openai", {
    onProgress: (event) => {
      seen.push(`${event.status}:${event.step ?? "none"}:${event.result ?? "none"}`);
    },
  });

  assert.equal(plan.provider, "openai-codex");
  assert.equal(plan.status, "reused");
  assert.equal(plan.launchMode, "none");
  assert.equal(result.provider, "openai-codex");
  assert.equal(result.requestedProvider, "openai");
  assert.equal(result.status, "reused");
  assert.equal(result.launchMode, "none");
  assert.deepEqual(seen, [
    "start:checking_existing_auth:none",
    "complete:reused_existing_auth:reused",
  ]);
});

test("createClaw auth.login reports launched flows through the SDK callback", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-login-progress-"));
  const claw = await createClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-login-progress",
      agentId: "demo-login-progress",
      rootDir: workspaceDir,
    },
  });

  const seen: string[] = [];
  const plan = await claw.auth.prepareLogin("openai");
  const result = await claw.auth.login("openai", {
    onProgress: (event) => {
      seen.push(`${event.status}:${event.step ?? "none"}:${event.result ?? "none"}:${event.launchMode ?? "none"}`);
    },
  });

  assert.equal(plan.status, "launch_required");
  assert.equal(result.status, "launched");
  assert.equal(result.launchMode, "browser");
  assert.equal(typeof result.command, "string");
  assert.deepEqual(seen, [
    "start:checking_existing_auth:none:none",
    "complete:launching_interactive_flow:launched:browser",
  ]);
});

test("createClaw doctor report includes workspace diagnostics", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-doctor-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const report = await claw.doctor.run();
  assert.ok("workspace" in report);
  assert.equal(Array.isArray(report.suggestedRepairs), true);
  assert.equal(report.workspace.ok, false);
});

test("createClaw doctor report surfaces compat snapshot drift", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-doctor-drift-"));
  fs.mkdirSync(resolveClawWorkspaceSurfacePath("claw.workspace.compat", workspaceDir), { recursive: true });
  fs.writeFileSync(resolveClawWorkspaceSurfacePath("claw.workspace.compat", workspaceDir, "runtime-snapshot.json"), JSON.stringify({
    schemaVersion: 1,
    runtimeAdapter: "openclaw",
    runtimeVersion: "0.9.0",
    probedAt: "2026-03-20T00:00:00.000Z",
    capabilities: {
      version: true,
      modelsStatus: true,
      agentsList: true,
      gatewayCall: true,
    },
    diagnostics: {
      versionFamily: "0.9",
      capabilitySignature: "agentsList=1|gatewayCall=1|modelsStatus=1|version=1",
    },
  }, null, 2));

  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const report = await claw.doctor.run();
  assert.equal(report.compatSnapshot?.runtimeVersion, "0.9.0");
  assert.equal(report.compatDrift.drifted, true);
  assert.match(report.suggestedRepairs.join(" "), /Refresh the compat snapshot/);
});

test("createClaw doctor report surfaces malformed managed blocks", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-doctor-blocks-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  claw.files.writeWorkspaceFile("SOUL.md", [
    "<!-- CLAW:tone:START -->",
    "kind",
    "<!-- CLAW:tone:START -->",
  ].join("\n"));

  const report = await claw.doctor.run();
  assert.equal(report.managedBlockProblems?.length ? report.managedBlockProblems.length > 0 : false, true);
  assert.match(report.issues.map((issue) => issue.message).join(" "), /Managed block tone/);
});

test("createClaw exposes runtime command builders", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-runtime-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  assert.equal(path.basename(claw.runtime.installCommand("pnpm").command), "pnpm");
  assert.deepEqual(claw.runtime.installCommand("pnpm").args, ["add", "-g", "openclaw"]);
  assert.equal(path.basename(claw.runtime.uninstallCommand("pnpm").command), "pnpm");
  assert.deepEqual(claw.runtime.uninstallCommand("pnpm").args, ["remove", "-g", "openclaw"]);
  assert.deepEqual(claw.runtime.setupWorkspaceCommand(), {
    command: "openclaw",
    args: ["agents", "add", "demo-main", "--non-interactive", "--workspace", workspaceDir, "--json"],
    env: claw.runtime.setupWorkspaceCommand().env,
  });
  assert.deepEqual(claw.runtime.repairCommand(), {
    command: "openclaw",
    args: ["gateway", "install"],
    env: claw.runtime.repairCommand().env,
  });
  assert.deepEqual(
    claw.runtime.installPlan("pnpm").steps.map((step) => step.phase),
    ["runtime.install.prepare", "runtime.install.execute", "runtime.install.finalize"],
  );
  assert.deepEqual(
    claw.runtime.uninstallPlan("pnpm").steps.map((step) => step.phase),
    ["runtime.uninstall.prepare", "runtime.uninstall.execute", "runtime.uninstall.finalize"],
  );
});

test("createClaw exposes richer workspace file helpers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-files-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  const preview = claw.files.previewWorkspaceFile("SOUL.md", "hello\n");
  assert.equal(preview.exists, true);
  assert.equal(preview.changed, true);

  claw.files.writeWorkspaceFile("SOUL.md", "before\n\n<!-- CLAW:tone:START -->\nkind\n<!-- CLAW:tone:END -->\n");
  assert.equal(claw.files.readWorkspaceFile("SOUL.md"), "before\n\n<!-- CLAW:tone:START -->\nkind\n<!-- CLAW:tone:END -->\n");
  assert.equal(claw.files.inspectWorkspaceFile("SOUL.md").managedBlocks.length, 1);
  assert.equal(claw.files.inspectManagedBlock("SOUL.md", "tone").innerContent, "kind");
});

test("createClaw compat refresh persists capability and provider state artifacts", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-compat-state-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-compat-agent-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw", agentDir },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  await claw.compat.refresh();
  await claw.auth.status();
  const inspected = await claw.workspace.inspect();

  assert.equal(fs.existsSync(inspected.capabilityReportPath), true);
  assert.equal(fs.existsSync(inspected.workspaceStatePath), true);
  assert.equal(fs.existsSync(inspected.providerStatePath), true);
  assert.equal(inspected.capabilityReport?.schemaVersion, 1);
  assert.equal(inspected.workspaceState?.workspaceId, "demo-main");
  assert.ok(inspected.providerState?.providers);
});

test("createClaw can stream and persist an assistant reply through gateway config", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-stream-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: {
        url: "http://127.0.0.1:18789",
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  let gatewayBody = "";
  globalThis.fetch = (async (_url, init) => {
    gatewayBody = typeof init?.body === "string" ? init.body : "";
    return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event: response.output_text.delta\ndata: {"delta":"hello"}\n\n'));
      controller.enqueue(encoder.encode('event: response.output_text.delta\ndata: {"delta":" world"}\n\n'));
      controller.close();
    },
  }), { status: 200 });
  }) as typeof fetch;

  try {
    claw.rules.upsertScope({ id: "global", kind: "user", name: "global" });
    claw.rules.propose({
      id: "reply-style",
      title: "Reply style",
      kind: "directive",
      status: "active",
      scopeId: "global",
      content: "Keep streamed replies direct.",
    });
    const session = claw.sessions.createSession("Hello");
    claw.sessions.appendMessage(session.sessionId, {
      role: "user",
      content: "say hi",
    });

    const seen: string[] = [];
    for await (const chunk of claw.sessions.streamAssistantReply({
      sessionId: session.sessionId,
      systemPrompt: "Be concise.",
      contextBlocks: [{ title: "Mode", content: "Friendly." }],
      transport: "gateway",
      coalesceMs: 0,
    })) {
      if (!chunk.done) seen.push(chunk.delta);
    }

    assert.deepEqual(seen, ["hello", " world"]);
    assert.equal(
      claw.sessions.getSession(session.sessionId)?.messages.at(-1)?.content,
      "hello world",
    );
    assert.match(gatewayBody, /Applicable Rules/);
    assert.match(gatewayBody, /Keep streamed replies direct/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createClaw sends persisted documents through OpenClaw responses transport", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-stream-docs-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: {
        url: "http://127.0.0.1:18789",
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-docs",
      agentId: "demo-docs",
      rootDir: workspaceDir,
    },
  });

  let requestBody: Record<string, unknown> | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: response.output_text.delta\ndata: {"delta":"reviewed"}\n\n'));
        controller.close();
      },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const session = claw.sessions.createSession("Budget");
    const document = await claw.documents.upload({
      name: "budget.pdf",
      mimeType: "application/pdf",
      data: Buffer.from("budget alpha").toString("base64"),
      sessionId: session.sessionId,
    });
    claw.sessions.appendMessage(session.sessionId, {
      role: "user",
      content: "Review the attached budget",
      documents: [{
        documentId: document.documentId,
        name: document.name,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
      }],
    });

    const seen: string[] = [];
    for await (const chunk of claw.sessions.streamAssistantReply({
      sessionId: session.sessionId,
      transport: "gateway",
      coalesceMs: 0,
    })) {
      if (!chunk.done) seen.push(chunk.delta);
    }

    assert.deepEqual(seen, ["reviewed"]);
    assert.match(JSON.stringify(requestBody), /input_file/);
    assert.match(JSON.stringify(requestBody), /budget\.pdf/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createClaw can generate and persist a session title", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-title-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: {
        url: "http://127.0.0.1:18789",
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{ message: { content: "Work anxiety" } }],
  }), { status: 200 })) as typeof fetch;

  try {
    const session = claw.sessions.createSession("Hello");
    claw.sessions.appendMessage(session.sessionId, {
      role: "user",
      content: "I want to talk about anxiety at work",
    });

    const title = await claw.sessions.generateTitle({
      sessionId: session.sessionId,
      transport: "gateway",
    });

    assert.equal(title, "Work anxiety");
    assert.equal(claw.sessions.getSession(session.sessionId)?.title, "Work anxiety");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createClaw surfaces runtime progress and session events", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-progress-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const runtimeEvents: string[] = [];
  await claw.runtime.repair((event) => {
    runtimeEvents.push(`${event.phase}:${event.status}`);
  }).catch(() => {});
  assert.ok(runtimeEvents.length >= 2);

  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  globalThis.fetch = (async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event: response.output_text.delta\ndata: {"delta":"Plan"}\n\n'));
      controller.enqueue(encoder.encode('event: response.output_text.delta\ndata: {"delta":" a launch checklist"}\n\n'));
      controller.close();
    },
  }), { status: 200 })) as typeof fetch;

  try {
    const streamingClaw = await createClaw({
      runtime: {
        adapter: "openclaw",
        gateway: { url: "http://127.0.0.1:18789" },
      },
      workspace: {
        appId: "demo",
        workspaceId: "demo-events",
        agentId: "demo-events",
        rootDir: fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-events-stream-")),
      },
    });
    const session = streamingClaw.sessions.createSession("Hello");
    streamingClaw.sessions.appendMessage(session.sessionId, {
      role: "user",
      content: "Plan a launch checklist",
    });

    const events: string[] = [];
    for await (const event of streamingClaw.sessions.streamAssistantReplyEvents({
      sessionId: session.sessionId,
      transport: "gateway",
      coalesceMs: 0,
    })) {
      events.push(event.type === "transport" ? `${event.type}:${event.transport}` : event.type);
    }

    assert.deepEqual(events, ["transport:gateway", "chunk", "chunk", "done", "title"]);
    assert.equal(streamingClaw.sessions.getSession(session.sessionId)?.title, "Plan a launch checklist");
    const assistant = streamingClaw.sessions.getSession(session.sessionId)?.messages.at(-1);
    assert.equal(assistant?.content, "Plan a launch checklist");
    assert.deepEqual((assistant?.metadata?.streamTrace as { deltas?: Array<{ text: string }> } | undefined)?.deltas?.map((delta) => delta.text), ["Plan", " a launch checklist"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createClaw exposes native OpenClaw session and chat gateway wrappers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-native-openclaw-"));
  const { binDir, configPath, statePath } = createFakeOpenClawPluginToolchain();

  await withPatchedEnv({
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const claw = await createClaw({
      runtime: {
        adapter: "openclaw",
        configPath,
      },
      workspace: {
        appId: "demo",
        workspaceId: "demo-native-openclaw",
        agentId: "demo-native-openclaw",
        rootDir: workspaceDir,
      },
    });

    const list = await claw.runtime.openclaw.sessions.list({ limit: 5 }) as { sessions: Array<{ sessionKey: string }> };
    const preview = await claw.runtime.openclaw.sessions.preview({ sessionKey: "alpha" }) as { sessionKey: string; title: string };
    const history = await claw.runtime.openclaw.chat.history({ sessionKey: "alpha" }) as { sessionKey: string; messages: Array<{ role: string; content: string }> };
    const sent = await claw.runtime.openclaw.chat.send({ sessionKey: "alpha", message: "hello" }) as { accepted: boolean; sessionKey: string };

    assert.equal(list.sessions[0]?.sessionKey, "alpha");
    assert.equal(preview.title, "Native Alpha");
    assert.equal(history.messages[0]?.content, "hello from native");
    assert.equal(sent.accepted, true);
    assert.equal(sent.sessionKey, "alpha");

    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      gatewayCalls: Array<{ method: string }>;
    };
    assert.deepEqual(
      state.gatewayCalls.map((entry) => entry.method).slice(-4),
      ["sessions.list", "sessions.preview", "chat.history", "chat.send"],
    );
  });
});

test("createClaw does not persist partial assistant text when stream aborts", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-abort-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: { url: "http://127.0.0.1:18789" },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-abort",
      agentId: "demo-abort",
      rootDir: workspaceDir,
    },
  });

  const session = claw.sessions.createSession("Hello");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "Plan a launch checklist",
  });

  const abortController = new AbortController();
  abortController.abort("user_cancelled");

  const events: string[] = [];
  for await (const event of claw.sessions.streamAssistantReplyEvents({
    sessionId: session.sessionId,
    transport: "gateway",
    signal: abortController.signal,
  })) {
    events.push(event.type);
  }

  assert.deepEqual(events, ["aborted"]);
  assert.equal(claw.sessions.getSession(session.sessionId)?.messageCount, 1);
});

test("createClaw exposes runtime/provider watchers and async event iteration", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-watchers-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-watchers-agent-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      agentDir,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-watchers",
      agentId: "demo-watchers",
      rootDir: workspaceDir,
    },
  });

  const runtimeSnapshots: boolean[] = [];
  const stopRuntime = claw.watch.runtimeStatus((status) => {
    runtimeSnapshots.push(status.cliAvailable);
  }, { intervalMs: 20 });

  const providerSnapshots: boolean[] = [];
  const stopProviders = claw.watch.providerStatus((providers) => {
    providerSnapshots.push(Object.values(providers).some((provider) => provider.hasAuth));
  }, { intervalMs: 20 });

  const iterator = claw.watch.eventsIterator("auth.api_key_saved")[Symbol.asyncIterator]();
  claw.auth.setApiKey("anthropic", "sk-12345678");
  const nextEvent = await iterator.next();
  await iterator.return?.();

  const abortController = new AbortController();
  abortController.abort();
  const abortedIterator = claw.watch.eventsIterator("*", { signal: abortController.signal })[Symbol.asyncIterator]();
  const abortedEvent = await Promise.race([
    abortedIterator.next(),
    new Promise<IteratorResult<unknown>>((_, reject) => {
      setTimeout(() => reject(new Error("timed out waiting for aborted event iterator")), 1_000);
    }),
  ]);

  await new Promise((resolve) => setTimeout(resolve, 80));
  stopRuntime();
  stopProviders();

  assert.equal(nextEvent.done, false);
  assert.equal(nextEvent.value?.type, "auth.api_key_saved");
  assert.equal(abortedEvent.done, true);
  assert.equal(runtimeSnapshots.every((value) => typeof value === "boolean"), true);
  assert.equal(providerSnapshots.every((value) => typeof value === "boolean"), true);
});

test("createClaw saveApiKey supports runtime command mode and auth progress events", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-auth-runtime-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-auth-runtime-agent-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      agentDir,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-auth-runtime",
      agentId: "demo-auth-runtime",
      rootDir: workspaceDir,
    },
  });

  const progress: string[] = [];
  const stop = claw.watch.events("auth.progress", (event) => {
    const payload = event.payload as { phase: string; status: string };
    progress.push(`${payload.phase}:${payload.status}`);
  });

  const persisted = await claw.auth.saveApiKey("openai", "sk-live-12345678", {
    runtimeCommand: {
      command: "/bin/sh",
      args: ["-lc", "exit 0"],
    },
  });
  stop();

  assert.equal(persisted.mode, "runtime");
  assert.equal(persisted.summary.maskedCredential, "************5678");
  assert.deepEqual(progress, [
    "auth.api_key.save:start",
    "auth.api_key.save:complete",
  ]);
  const authFile = fs.readFileSync(path.join(agentDir, "auth-profiles.json"), "utf8");
  assert.equal(authFile.includes("sk-live-12345678"), false);
});

test("createClaw initializes runtime-specific workspace layouts for zeroclaw and picoclaw", async () => {
  const scenarios = [
    {
      adapter: "zeroclaw" as const,
      expectedFile: "MEMORY.md",
      unexpectedFile: "TOOLS.md",
    },
    {
      adapter: "picoclaw" as const,
      expectedFile: path.join("memory", "MEMORY.md"),
      unexpectedFile: "TOOLS.md",
    },
  ];

  for (const scenario of scenarios) {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), `clawjs-instance-${scenario.adapter}-`));
    const claw = await createClaw({
      runtime: { adapter: scenario.adapter },
      workspace: {
        appId: "demo",
        workspaceId: `${scenario.adapter}-main`,
        agentId: `${scenario.adapter}-main`,
        rootDir: workspaceDir,
      },
    });

    await claw.workspace.init();
    const validation = await claw.workspace.validate();
    const canonicalPaths = claw.workspace.canonicalPaths();

    assert.equal(validation.ok, true);
    assert.equal(fs.existsSync(path.join(workspaceDir, scenario.expectedFile)), true);
    assert.equal(fs.existsSync(path.join(workspaceDir, scenario.unexpectedFile)), false);
    assert.equal(Object.values(canonicalPaths).some((entry) => entry.endsWith(scenario.expectedFile)), true);
  }
});

test("createClaw reports detect-only OpenClaw plugin bridge state without mutating runtime", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-plugin-detect-"));
  const { binDir, configPath, statePath, openclawLog } = createFakeOpenClawPluginToolchain();

  await withPatchedEnv({
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const claw = await createClaw({
      runtime: {
        adapter: "openclaw",
        configPath,
        pluginBridge: {
          mode: "detect-only",
        },
      },
      workspace: {
        appId: "demo",
        workspaceId: "demo-plugin-detect",
        agentId: "demo-plugin-detect",
        rootDir: workspaceDir,
      },
    });

    const bridge = await claw.runtime.plugins.status() as unknown as {
      supported: boolean;
      mode: string;
      basePlugin: { installed: boolean };
    };
    const list = await claw.runtime.plugins.list();
    const runtimeStatus = await claw.runtime.status();
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      plugins: Record<string, unknown>;
    };
    const log = fs.readFileSync(openclawLog, "utf8");

    assert.equal(bridge.supported, true);
    assert.equal(bridge.mode, "detect-only");
    assert.equal(bridge.basePlugin.installed, false);
    assert.equal(list.plugins.length, 0);
    assert.equal(runtimeStatus.capabilityMap.plugins.status, "degraded");
    assert.equal((runtimeStatus.capabilityMap.plugins.diagnostics as { mode?: string }).mode, "detect-only");
    assert.deepEqual(Object.keys(state.plugins), []);
    assert.equal(log.includes("plugins install @clawjs/openclaw-plugin"), false);
  });
});

test("createClaw managed OpenClaw plugin bridge auto-installs and exposes ClawJS RPC wrappers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-plugin-managed-"));
  const { binDir, configPath, statePath, openclawLog } = createFakeOpenClawPluginToolchain();

  await withPatchedEnv({
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const claw = await createClaw({
      runtime: {
        adapter: "openclaw",
        configPath,
        pluginBridge: {
          mode: "managed",
          enableContextEngine: true,
        },
      },
      workspace: {
        appId: "demo",
        workspaceId: "demo-plugin-managed",
        agentId: "demo-plugin-managed",
        rootDir: workspaceDir,
      },
    });

    const bridgeStatus = await claw.runtime.plugins.status() as unknown as {
      basePlugin: { installed: boolean; enabled: boolean; loaded: boolean };
      contextPlugin: { installed: boolean; enabled: boolean; selected: boolean; selectedEngineId: string | null };
    };
    const status = await claw.runtime.plugins.claw.status() as {
      pluginId: string;
      features: { observability: boolean };
    };
    const events = await claw.runtime.plugins.claw.events.list({ kind: "tool", limit: 3 }) as {
      items: Array<{ kind: string }>;
    };
    const inspect = await claw.runtime.plugins.claw.sessions.inspect({ sessionKey: "alpha" }) as {
      found: boolean;
      session: { sessionKey: string };
    };
    const run = await claw.runtime.plugins.claw.subagent.run({ sessionKey: "alpha", message: "hello" }) as {
      runId: string;
    };
    const wait = await claw.runtime.plugins.claw.subagent.wait({ runId: run.runId, timeoutMs: 500 }) as {
      status: string;
    };
    const messages = await claw.runtime.plugins.claw.subagent.messages({ sessionKey: "alpha", limit: 5 }) as {
      messages: Array<{ role: string; content: string }>;
    };
    const hooks = await claw.runtime.plugins.claw.hooks.list() as {
      hooks: Array<{ name: string }>;
    };
    const hookStatus = await claw.runtime.plugins.claw.hooks.status() as {
      allowPromptInjection: boolean;
    };
    const context = await claw.runtime.plugins.claw.context.status() as {
      installed: boolean;
      selected: boolean;
    };
    const doctor = await claw.runtime.plugins.claw.doctor() as {
      ok: boolean;
    };
    const runtimeStatus = await claw.runtime.status();
    const runtimeDoctor = await claw.runtime.plugins.doctor();
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      plugins?: { slots?: { contextEngine?: string } };
    };
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      plugins: Record<string, { enabled?: boolean; status?: string }>;
      gatewayRestarts: number;
    };
    const log = fs.readFileSync(openclawLog, "utf8");

    assert.equal(bridgeStatus.basePlugin.installed, false);
    assert.equal(status.pluginId, "clawjs");
    assert.equal(status.features.observability, true);
    assert.equal(events.items[0]?.kind, "tool");
    assert.equal(inspect.found, true);
    assert.equal(inspect.session.sessionKey, "alpha");
    assert.equal(run.runId, "run:alpha");
    assert.equal(wait.status, "completed");
    assert.deepEqual(messages.messages, [{ role: "assistant", content: "bridge:alpha" }]);
    assert.equal(hooks.hooks[0]?.name, "session_start");
    assert.equal(hookStatus.allowPromptInjection, false);
    assert.equal(context.installed, true);
    assert.equal(context.selected, true);
    assert.equal(doctor.ok, true);
    assert.equal(runtimeDoctor.ok, true);
    assert.equal(runtimeStatus.capabilityMap.plugins.status, "ready");
    assert.equal(config.plugins?.slots?.contextEngine, "clawjs-context");
    assert.equal(state.plugins.clawjs?.enabled, true);
    assert.equal(state.plugins["clawjs-context"]?.enabled, true);
    assert.equal(state.gatewayRestarts >= 1, true);
    assert.match(log, /plugins install @clawjs\/openclaw-plugin/);
    assert.match(log, /plugins enable clawjs/);
    assert.match(log, /plugins install @clawjs\/openclaw-context-engine/);
    assert.match(log, /plugins enable clawjs-context/);
    assert.match(log, /gateway restart/);
    assert.match(log, /gateway call --json --timeout 10000 --params \{\} --token plugin-test-token --url ws:\/\/127\.0\.0\.1:18789 clawjs\.status/);

    const ensuredBridge = await claw.runtime.plugins.status() as unknown as {
      basePlugin: { enabled: boolean; loaded: boolean };
      contextPlugin: { selected: boolean; selectedEngineId: string | null };
    };
    assert.equal(ensuredBridge.basePlugin.enabled, true);
    assert.equal(ensuredBridge.basePlugin.loaded, true);
    assert.equal(ensuredBridge.contextPlugin.selected, true);
    assert.equal(ensuredBridge.contextPlugin.selectedEngineId, "clawjs-context");
  });
});
