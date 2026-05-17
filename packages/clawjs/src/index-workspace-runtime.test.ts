import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { createClaw, saveAuthStore } from "@clawjs/claw";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";

import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, runCli } from "./index.ts";
import {
  captureStream,
  createFakeOpenClawToolchain,
  runCommand,
  startDelegationPlaneTestServer,
  withPatchedEnv,
} from "./index-test-utils.ts";

test("runCli exposes explicit exit codes for success, degraded, failure, and usage states", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-exit-codes-"));

  const successExitCode = await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const degradedExitCode = await runCli(["doctor", "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-exit-degraded-")), "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const failureExitCode = await runCli(["workspace", "attach", "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-exit-failure-")), "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const usageExitCode = await runCli(["unknown"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(successExitCode, CLI_EXIT_OK);
  assert.equal(degradedExitCode, CLI_EXIT_DEGRADED);
  assert.equal(failureExitCode, CLI_EXIT_FAILURE);
  assert.equal(usageExitCode, CLI_EXIT_USAGE);
});

test("runCli can initialize a workspace in json mode", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-workspace-"));

  const exitCode = await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /manifestPath/);
});

test("runCli accepts explicit non-interactive mode", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-non-interactive-"));
  const stdout = captureStream();
  const exitCode = await runCli(["workspace", "init", "--workspace", workspaceRoot, "--non-interactive", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /manifestPath/);
});

test("runCli can attach to an existing workspace", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-attach-"));
  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const stdout = captureStream();
  const exitCode = await runCli(["workspace", "attach", "--workspace", workspaceRoot, "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"workspaceId"/);
});

test("runCli can discover workspaces under an explicit root", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-discover-"));
  const workspaceA = path.join(tempRoot, "apps", "a");
  const workspaceB = path.join(tempRoot, "apps", "nested", "b");

  await runCli(["workspace", "init", "--workspace", workspaceA, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  await runCli(["workspace", "init", "--workspace", workspaceB, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const stdout = captureStream();
  const exitCode = await runCli(["workspace", "discover", "--root", tempRoot, "--max-depth", "6", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"workspaceId": "a"/);
  assert.match(stdout.getOutput(), /"workspaceId": "b"/);
});

test("runCli manages agent-native plans, policies, reviews, and delegation runs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-plans-"));
  const planPath = path.join(workspaceRoot, "low-risk-plan.json");
  const publishPlanPath = path.join(workspaceRoot, "publish-plan.json");
  const policyPath = path.join(workspaceRoot, "policy.json");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const lowRiskSemanticPlan = {
    schemaVersion: 1,
    intent: { id: "intent-low-risk", summary: "Inspect local docs", requestedBy: "frontend", constraints: [] },
    objects: [{ id: "workspace", kind: "repository", label: "Workspace", metadata: {} }],
    actions: [{
      id: "inspect",
      type: "inspect",
      label: "Inspect docs",
      objectIds: ["workspace"],
      effectIds: ["read"],
      permissionIds: ["read"],
      risk: "low",
      requiresHumanApproval: false,
    }],
    effects: [{
      id: "read",
      kind: "read",
      description: "Read local docs",
      objectIds: ["workspace"],
      reversible: true,
      risk: "low",
    }],
    permissions: [{
      id: "read",
      capability: "workspace.read",
      scope: "workspace",
      risk: "low",
      requiresHumanApproval: false,
    }],
    receipts: [],
    provenance: ["test fixture"],
  };
  const publishSemanticPlan = {
    ...lowRiskSemanticPlan,
    intent: { id: "intent-publish", summary: "Deploy the site", requestedBy: "frontend", constraints: ["owner approval required"] },
    actions: [{
      id: "publish",
      type: "publish",
      label: "Publish site",
      objectIds: ["workspace"],
      effectIds: ["publish"],
      permissionIds: ["publish"],
      risk: "high",
      requiresHumanApproval: true,
    }],
    effects: [{
      id: "publish",
      kind: "publication",
      description: "Publish to remote",
      objectIds: ["workspace"],
      reversible: false,
      risk: "high",
    }],
    permissions: [{
      id: "publish",
      capability: "workspace.publish",
      scope: "remote",
      risk: "high",
      requiresHumanApproval: true,
    }],
  };
  fs.writeFileSync(planPath, JSON.stringify(lowRiskSemanticPlan));
  fs.writeFileSync(publishPlanPath, JSON.stringify(publishSemanticPlan));
  fs.writeFileSync(policyPath, JSON.stringify({
    id: "publish-needs-owner",
    when: { "actions.type": ["publish"], "effects.kind": ["publication"] },
    then: { decision: "require_approval", approver: "human_owner", reason: "Publishing requires owner approval" },
  }));

  const delegation = await startDelegationPlaneTestServer(workspaceRoot);
  const delegationUrl = delegation.url;
  try {
    const createStdout = captureStream();
    const createExit = await runCli([
      "plan",
      "create",
      "Inspect local docs",
      "--workspace",
      workspaceRoot,
      "--agent",
      "frontend",
      "--tags",
      "web",
      "--from-file",
      planPath,
      "--delegation-url",
      delegationUrl,
      "--json",
    ], {
      stdout: createStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    const createdEnvelope = JSON.parse(createStdout.getOutput()) as { ok: boolean; data: { plan: { id: string; status: string; delegationGraphId?: string } }; meta: { canonicalCommand: string; jsonSchemaId: string; subcommand: string } };
    const created = createdEnvelope.data;
    assert.equal(createExit, CLI_EXIT_OK);
    assert.equal(createdEnvelope.ok, true);
    assert.equal(createdEnvelope.meta.canonicalCommand, "plan");
    assert.equal(createdEnvelope.meta.jsonSchemaId, "claw.cli.plan.v1");
    assert.equal(createdEnvelope.meta.subcommand, "create");
    assert.equal(created.plan.status, "running");
    assert.ok(created.plan.delegationGraphId);

    const policyExit = await runCli([
      "plan",
      "policy",
      "add",
      "--workspace",
      workspaceRoot,
      "--from-file",
      policyPath,
      "--json",
    ], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(policyExit, CLI_EXIT_OK);

    const publishStdout = captureStream();
    const publishExit = await runCli([
      "plan",
      "create",
      "Deploy the site",
      "--workspace",
      workspaceRoot,
      "--agent",
      "frontend",
      "--from-file",
      publishPlanPath,
      "--json",
    ], {
      stdout: publishStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    const publishCreatedEnvelope = JSON.parse(publishStdout.getOutput()) as { ok: boolean; data: { plan: { id: string; status: string; policyDecision: string } }; meta: { canonicalCommand: string; subcommand: string } };
    const publishCreated = publishCreatedEnvelope.data;
    assert.equal(publishExit, CLI_EXIT_OK);
    assert.equal(publishCreatedEnvelope.ok, true);
    assert.equal(publishCreatedEnvelope.meta.canonicalCommand, "plan");
    assert.equal(publishCreatedEnvelope.meta.subcommand, "create");
    assert.equal(publishCreated.plan.status, "pending");
    assert.equal(publishCreated.plan.policyDecision, "require_approval");

    const reviewStdout = captureStream();
    const reviewExit = await runCli([
      "plan",
      "review",
      publishCreated.plan.id,
      "--workspace",
      workspaceRoot,
      "--agent",
      "design-reviewer",
      "--decision",
      "approve",
      "--json",
    ], {
      stdout: reviewStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(reviewExit, CLI_EXIT_OK);
    assert.match(reviewStdout.getOutput(), /"status": "approved"/);

    const runStdout = captureStream();
    const runExit = await runCli([
      "plan",
      "run",
      publishCreated.plan.id,
      "--workspace",
      workspaceRoot,
      "--delegation-url",
      delegationUrl,
      "--json",
    ], {
      stdout: runStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(runExit, CLI_EXIT_OK);
    assert.match(runStdout.getOutput(), /"status": "running"/);

    const listStdout = captureStream();
    const listExit = await runCli(["plan", "list", "--workspace", workspaceRoot, "--json"], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(listExit, CLI_EXIT_OK);
    assert.match(listStdout.getOutput(), /Deploy the site/);

    const showStdout = captureStream();
    const showExit = await runCli(["plan", "show", publishCreated.plan.id, "--workspace", workspaceRoot], {
      stdout: showStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(showExit, CLI_EXIT_OK);
    assert.match(showStdout.getOutput(), /Publishing requires owner approval/);
  } finally {
    await delegation.stop();
  }
});

test("runCli doctor reports workspace diagnostics", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-doctor-"));

  const exitCode = await runCli(["doctor", "--workspace", workspaceRoot, "--json"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_DEGRADED);
  assert.match(stdout.getOutput(), /"workspace"/);
});

test("runCli redacts inline secrets from streamed error payloads in json mode", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-stream-error-"));
  const sessionStdout = captureStream();
  await runCli(["sessions", "create", "--workspace", workspaceRoot, "--title=Error stream", "--json"], {
    stdout: sessionStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const createdEnvelope = JSON.parse(sessionStdout.getOutput()) as { ok: boolean; data: { sessionId: string }; meta: { canonicalCommand: string; subcommand: string } };
  assert.equal(createdEnvelope.ok, true);
  assert.equal(createdEnvelope.meta.canonicalCommand, "sessions");
  assert.equal(createdEnvelope.meta.subcommand, "create");
  const created = createdEnvelope.data;
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "clawjs-app",
      workspaceId: path.basename(workspaceRoot),
      agentId: path.basename(workspaceRoot),
      rootDir: workspaceRoot,
    },
  });
  claw.sessions.appendMessage(created.sessionId, {
    role: "user",
    content: "hello",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("Authorization: Bearer secret-token-12345678", {
    status: 401,
    statusText: "Unauthorized",
  })) as typeof fetch;

  try {
    const stdout = captureStream();
    const exitCode = await runCli([
      "sessions",
      "stream",
      "--workspace", workspaceRoot,
      `--session-id=${created.sessionId}`,
      "--transport=gateway",
      "--gateway-url=http://127.0.0.1:18789",
      "--gateway-token=secret-token-12345678",
      "--events",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_FAILURE);
    assert.equal(stdout.getOutput().includes("secret-token-12345678"), false);
    assert.match(stdout.getOutput(), /Bearer \*{4,}5678/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runCli compat can refresh and persist a snapshot", async () => {
  const stdout = captureStream();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-compat-"));

  const exitCode = await runCli(["compat", "--workspace", workspaceRoot, "--refresh", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.ok(exitCode === CLI_EXIT_OK || exitCode === CLI_EXIT_DEGRADED);
  assert.match(stdout.getOutput(), /"compat"/);
  assert.equal(fs.existsSync(resolveClawPersistentSurfacePath("claw.workspace.compat", workspaceRoot, "runtime-snapshot.json")), true);
  assert.equal(fs.existsSync(resolveClawPersistentSurfacePath("claw.workspace.compat", workspaceRoot, "capability-report.json")), true);
});

test("runCli can execute runtime install, uninstall, setup-workspace, and repair against a fake toolchain", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-runtime-real-"));
  const { binDir, openclawLog, npmLog } = createFakeOpenClawToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    assert.equal(await runCli(["runtime", "install", "--workspace", workspaceRoot, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);

    assert.equal(await runCli(["runtime", "setup-workspace", "--workspace", workspaceRoot, "--agent-id", "demo-agent", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);

    assert.equal(await runCli(["runtime", "repair", "--workspace", workspaceRoot, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);

    assert.equal(await runCli(["runtime", "uninstall", "--workspace", workspaceRoot, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
  });

  assert.match(fs.readFileSync(npmLog, "utf8"), /install -g openclaw/);
  assert.match(fs.readFileSync(npmLog, "utf8"), /uninstall -g openclaw/);
  const openclawCommands = fs.readFileSync(openclawLog, "utf8");
  assert.match(openclawCommands, /agents add demo-agent --non-interactive --workspace/);
  assert.match(openclawCommands, /gateway install/);
});

test("runCli can complete a compat drift cycle against a fake runtime", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-drift-cycle-"));
  const { binDir } = createFakeOpenClawToolchain();

  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_VERSION: "1.2.3",
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    assert.ok((await runCli(["compat", "--workspace", workspaceRoot, "--refresh", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    })) === CLI_EXIT_OK);
  });

  const driftStdout = captureStream();
  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_VERSION: "2.0.0",
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    const exitCode = await runCli(["doctor", "--workspace", workspaceRoot, "--json"], {
      stdout: driftStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(exitCode, CLI_EXIT_DEGRADED);
  });

  assert.match(driftStdout.getOutput(), /compatDrift/);
  assert.match(driftStdout.getOutput(), /runtime version drifted/i);

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_VERSION: "2.0.0",
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    assert.ok((await runCli(["compat", "--workspace", workspaceRoot, "--refresh", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    })) === CLI_EXIT_OK);
  });

  const cleanStdout = captureStream();
  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_VERSION: "2.0.0",
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    const exitCode = await runCli(["doctor", "--workspace", workspaceRoot, "--json"], {
      stdout: cleanStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(exitCode, CLI_EXIT_OK);
  });

  assert.match(cleanStdout.getOutput(), /"ok": true/);
});

test("runCli can create and list sessions", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-session-"));

  const createStdout = captureStream();
  const createStderr = captureStream();
  const createExitCode = await runCli(["sessions", "create", "--workspace", workspaceRoot, "--title=Hello", "--json"], {
    stdout: createStdout.stream,
    stderr: createStderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(createExitCode, CLI_EXIT_OK);
  const createEnvelope = JSON.parse(createStdout.getOutput()) as { ok: boolean; data: { sessionId: string }; meta: { canonicalCommand: string; subcommand: string } };
  assert.equal(createEnvelope.ok, true);
  assert.equal(createEnvelope.meta.canonicalCommand, "sessions");
  assert.equal(createEnvelope.meta.subcommand, "create");

  const listStdout = captureStream();
  const listStderr = captureStream();
  const listExitCode = await runCli(["sessions", "list", "--workspace", workspaceRoot, "--json"], {
    stdout: listStdout.stream,
    stderr: listStderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(listExitCode, CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), /Hello/);
});

test("runCli can read a created session and sync a file block", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-read-"));

  const createStdout = captureStream();
  await runCli(["sessions", "create", "--workspace", workspaceRoot, "--title=Read me", "--json"], {
    stdout: createStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const createdEnvelope = JSON.parse(createStdout.getOutput()) as { ok: boolean; data: { sessionId: string }; meta: { canonicalCommand: string; subcommand: string } };
  assert.equal(createdEnvelope.ok, true);
  assert.equal(createdEnvelope.meta.canonicalCommand, "sessions");
  assert.equal(createdEnvelope.meta.subcommand, "create");
  const created = createdEnvelope.data;

  const syncStdout = captureStream();
  const syncExitCode = await runCli([
    "files", "sync",
    "--workspace", workspaceRoot,
    "--file", "SOUL.md",
    "--block-id", "tone",
    "--key", "tone",
    "--value", "direct",
    "--json",
  ], {
    stdout: syncStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(syncExitCode, CLI_EXIT_OK);
  assert.match(syncStdout.getOutput(), /SOUL\.md/);

  const readStdout = captureStream();
  const readExitCode = await runCli(["sessions", "read", "--workspace", workspaceRoot, `--session-id=${created.sessionId}`, "--json"], {
    stdout: readStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(readExitCode, CLI_EXIT_OK);
  assert.match(readStdout.getOutput(), /Read me/);
});

test("runCli can apply a template pack", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-template-"));
  const templatePackPath = path.join(workspaceRoot, "template-pack.json");
  fs.writeFileSync(templatePackPath, JSON.stringify({
    schemaVersion: 1,
    id: "demo-pack",
    name: "Demo Pack",
    mutations: [
      {
        targetFile: "SOUL.md",
        mode: "seed_if_missing",
        content: "seeded\n",
      },
    ],
  }, null, 2));

  const stdout = captureStream();
  const exitCode = await runCli([
    "files",
    "apply-template-pack",
    "--workspace", workspaceRoot,
    "--template-pack", templatePackPath,
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /SOUL\.md/);
  assert.equal(fs.readFileSync(path.join(workspaceRoot, "SOUL.md"), "utf8"), "seeded\n");
});

test("runCli can write, read and inspect workspace files", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-fileio-"));

  const writeStdout = captureStream();
  const writeExitCode = await runCli([
    "files",
    "write",
    "--workspace", workspaceRoot,
    "--file", "SOUL.md",
    "--value", "before\n\n<!-- CLAW:tone:START -->\nkind\n<!-- CLAW:tone:END -->\n",
    "--json",
  ], {
    stdout: writeStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(writeExitCode, CLI_EXIT_OK);
  assert.match(writeStdout.getOutput(), /SOUL\.md/);

  const readStdout = captureStream();
  const readExitCode = await runCli([
    "files",
    "read",
    "--workspace", workspaceRoot,
    "--file", "SOUL.md",
    "--json",
  ], {
    stdout: readStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(readExitCode, CLI_EXIT_OK);
  assert.match(readStdout.getOutput(), /CLAW:tone:START/);

  const inspectStdout = captureStream();
  const inspectExitCode = await runCli([
    "files",
    "inspect",
    "--workspace", workspaceRoot,
    "--file", "SOUL.md",
    "--json",
  ], {
    stdout: inspectStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(inspectExitCode, CLI_EXIT_OK);
  assert.match(inspectStdout.getOutput(), /managedBlocks/);
});

test("runCli removes auth profiles with equals-style flags", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-auth-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-agent-"));

  saveAuthStore(agentDir, {
    version: 1,
    profiles: {
      "anthropic:manual": { type: "api_key", provider: "anthropic", key: "sk-12345678" },
      "openai:manual": { type: "api_key", provider: "openai", key: "sk-87654321" },
    },
  });

  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = await runCli(["auth", "remove", "--workspace", workspaceRoot, `--agent-dir=${agentDir}`, "--provider=anthropic", "--json"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"removed": 1/);

  const remaining = JSON.parse(fs.readFileSync(path.join(agentDir, "auth-profiles.json"), "utf8")) as {
    profiles: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(remaining.profiles), ["openai:manual"]);
});

test("runCli supports auth login dry-run and workspace validate", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-validate-"));

  const validateBefore = captureStream();
  const validateBeforeExitCode = await runCli(["workspace", "validate", "--workspace", workspaceRoot, "--json"], {
    stdout: validateBefore.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(validateBeforeExitCode, CLI_EXIT_DEGRADED);
  assert.match(validateBefore.getOutput(), /"missingFiles"/);

  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const validateAfter = captureStream();
  const validateAfterExitCode = await runCli(["workspace", "validate", "--workspace", workspaceRoot, "--json"], {
    stdout: validateAfter.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(validateAfterExitCode, CLI_EXIT_OK);
  assert.match(validateAfter.getOutput(), /"ok": true/);

  const loginStdout = captureStream();
  const loginExitCode = await runCli(["auth", "login", "--workspace", workspaceRoot, "--provider=openai", "--dry-run", "--json"], {
    stdout: loginStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(loginExitCode, CLI_EXIT_OK);
  assert.match(loginStdout.getOutput(), /openai-codex/);

  const codexLoginStdout = captureStream();
  const codexLoginExitCode = await runCli(["auth", "login", "--runtime", "codex", "--workspace", workspaceRoot, "--dry-run", "--json"], {
    stdout: codexLoginStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(codexLoginExitCode, CLI_EXIT_OK);
  assert.match(codexLoginStdout.getOutput(), /openai-codex/);
  assert.match(codexLoginStdout.getOutput(), /"login"/);
});

test("runCli supports forced Codex login by logging out first", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-codex-force-login-"));
  const binDir = path.join(workspaceRoot, "bin");
  const fakeCodex = path.join(binDir, "codex");
  const logPath = path.join(workspaceRoot, "codex.log");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(fakeCodex, `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(${JSON.stringify(logPath)}, process.argv.slice(2).join(" ") + "\\n");
if (process.argv[2] === "logout") process.exit(0);
process.exit(0);
`, { mode: 0o755 });

  const previousCodexPath = process.env.CLAW_CODEX_PATH;
  process.env.CLAW_CODEX_PATH = fakeCodex;
  try {
    const stdout = captureStream();
    const exitCode = await runCli(["auth", "login", "--runtime", "codex", "--force", "--workspace", workspaceRoot, "--dry-run", "--json"], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.doesNotMatch(fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "", /logout/);

    const removeExitCode = await runCli(["auth", "remove", "--runtime", "codex", "--workspace", workspaceRoot, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(removeExitCode, CLI_EXIT_OK);
    assert.match(fs.readFileSync(logPath, "utf8"), /logout/);
  } finally {
    if (previousCodexPath === undefined) delete process.env.CLAW_CODEX_PATH;
    else process.env.CLAW_CODEX_PATH = previousCodexPath;
  }
});

test("runCli can repair a workspace and canonicalize compat snapshots", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-repair-"));
  fs.mkdirSync(resolveClawPersistentSurfacePath("claw.workspace.compat", workspaceRoot), { recursive: true });
  fs.writeFileSync(resolveClawPersistentSurfacePath("claw.workspace.compat", workspaceRoot, "runtime-snapshot.json"), JSON.stringify({
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

  const stdout = captureStream();
  const exitCode = await runCli(["workspace", "repair", "--workspace", workspaceRoot, "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /compatSnapshotCanonicalized/);
  assert.equal(fs.existsSync(resolveClawPersistentSurfacePath("claw.workspace.compat", workspaceRoot, "runtime-snapshot.json")), true);
});

test("runCli supports workspace reset dry-run and execution results", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-reset-"));
  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const previewStdout = captureStream();
  const previewExitCode = await runCli([
    "workspace",
    "reset",
    "--workspace", workspaceRoot,
    "--remove-runtime-files",
    "--dry-run",
    "--json",
  ], {
    stdout: previewStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(previewExitCode, CLI_EXIT_OK);
  assert.match(previewStdout.getOutput(), /runtime_file/);

  const resetStdout = captureStream();
  const resetExitCode = await runCli([
    "workspace",
    "reset",
    "--workspace", workspaceRoot,
    "--remove-runtime-files",
    "--json",
  ], {
    stdout: resetStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(resetExitCode, CLI_EXIT_OK);
  assert.match(resetStdout.getOutput(), /removedPaths/);
  assert.equal(fs.existsSync(path.join(workspaceRoot, "SOUL.md")), false);
});

test("runCli supports runtime install, uninstall, and repair dry-run", async () => {
  const installStdout = captureStream();
  const uninstallStdout = captureStream();
  const repairStdout = captureStream();
  const setupStdout = captureStream();

  const installExitCode = await runCli(["runtime", "install", "--dry-run", "--json"], {
    stdout: installStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const uninstallExitCode = await runCli(["runtime", "uninstall", "--dry-run", "--json"], {
    stdout: uninstallStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const repairExitCode = await runCli(["runtime", "repair", "--dry-run", "--json"], {
    stdout: repairStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const setupExitCode = await runCli(["runtime", "setup-workspace", "--workspace", "/tmp/claw-demo", "--agent-id", "demo", "--dry-run", "--json"], {
    stdout: setupStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(installExitCode, CLI_EXIT_OK);
  assert.equal(uninstallExitCode, CLI_EXIT_OK);
  assert.equal(repairExitCode, CLI_EXIT_OK);
  assert.equal(setupExitCode, CLI_EXIT_OK);
  assert.match(installStdout.getOutput(), /openclaw/);
  assert.match(uninstallStdout.getOutput(), /uninstall|remove/);
  assert.match(repairStdout.getOutput(), /gateway/);
  assert.match(setupStdout.getOutput(), /agents/);
});

test("runCli smokes the required command surface in dry-run or headless mode", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-smoke-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-smoke-agent-"));

  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const commands: Array<{ argv: string[]; expected: number[] }> = [
    { argv: ["runtime", "status", "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_DEGRADED] },
    { argv: ["runtime", "install", "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["runtime", "repair", "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["workspace", "attach", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["workspace", "inspect", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["workspace", "reset", "--workspace", workspaceRoot, "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["files", "diff", "--workspace", workspaceRoot, "--file", "SOUL.md", "--block-id", "tone", "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_FAILURE] },
    { argv: ["files", "sync", "--workspace", workspaceRoot, "--file", "SOUL.md", "--block-id", "tone", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["auth", "status", "--workspace", workspaceRoot, `--agent-dir=${agentDir}`, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["auth", "login", "--workspace", workspaceRoot, "--provider", "openai", "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["auth", "remove", "--workspace", workspaceRoot, `--agent-dir=${agentDir}`, "--provider=openai", "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_FAILURE] },
    { argv: ["models", "list", "--workspace", workspaceRoot, `--agent-dir=${agentDir}`, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["models", "set-default", "--workspace", workspaceRoot, "--model", "openai", "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["providers", "list", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_DEGRADED] },
    { argv: ["providers", "auth-state", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_DEGRADED] },
    { argv: ["sessions", "list", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["sessions", "search", "--workspace", workspaceRoot, "--query", "hello", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["sessions", "create", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["documents", "list", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_DEGRADED] },
    { argv: ["tts", "providers", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK] },
  ];

  for (const command of commands) {
    const exitCode = await runCli(command.argv, {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(command.expected.includes(exitCode), true, command.argv.join(" "));
  }
});
