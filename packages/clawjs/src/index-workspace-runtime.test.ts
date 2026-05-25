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
  useIsolatedClawDataRoot,
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

test("runCli blocks workspace file paths that escape the workspace", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-fileio-escape-"));
  const outsideFile = path.join(path.dirname(workspaceRoot), "outside.txt");

  const stdout = captureStream();
  const exitCode = await runCli([
    "files",
    "write",
    "--workspace", workspaceRoot,
    "--file", "../outside.txt",
    "--value", "escaped",
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_USAGE);
  assert.match(stdout.getOutput(), /invalid_workspace_file_path/);
  assert.equal(fs.existsSync(outsideFile), false);
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

test("runCli exposes targeted runtime portals for OpenClaw, Codex, and Hermes", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-runtime-portal-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const codexHome = path.join(workspaceRoot, ".codex-runtime");
  const codexSessions = path.join(codexHome, "sessions", "2026", "05", "21");
  fs.mkdirSync(codexSessions, { recursive: true });
  fs.writeFileSync(path.join(codexSessions, "codex-session.jsonl"), "{\"role\":\"assistant\",\"content\":\"codex native preview\"}\n");
  const hermesHomeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-runtime-portal-hermes-"));
  const hermesHome = path.join(hermesHomeRoot, ".hermes");
  const hermesSessions = path.join(hermesHome, "sessions", "2026", "05", "21");
  fs.mkdirSync(hermesSessions, { recursive: true });
  fs.mkdirSync(path.join(hermesHome, "skills", "browser-helper"), { recursive: true });
  fs.mkdirSync(path.join(hermesHome, "memories"), { recursive: true });
  fs.mkdirSync(path.join(hermesHome, "cron"), { recursive: true });
  fs.mkdirSync(path.join(hermesHome, "plugins", "memory-provider"), { recursive: true });
  fs.mkdirSync(path.join(hermesHome, "mcp"), { recursive: true });
  fs.writeFileSync(path.join(hermesSessions, "runtime-session.jsonl"), [
    "{\"type\":\"metadata\",\"content\":\"hermes native preview\"}",
    "{\"role\":\"assistant\",\"content\":\"Hermes reply with api_key=TEST_SECRET_1234567890\"}",
    "{\"role\":\"user\",\"content\":\"follow up\"}",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(hermesHome, "config.yaml"), [
    "model: openai/gpt-4.1",
    "provider: openai",
    "fallback_model: anthropic/claude-3-5-sonnet",
    "channels:",
    "  slack:",
    "    enabled: true",
  ].join("\n"));
  fs.writeFileSync(path.join(hermesHome, "memories", "profile.md"), "fixture memory content must not be exposed\n");
  fs.writeFileSync(path.join(hermesHome, "cron", "daily-summary.yaml"), "schedule: 0 9 * * *\n");
  fs.writeFileSync(path.join(hermesHome, "mcp", "github.json"), "{}\n");
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "docs/runtime-ecosystem-integration.manifest.json"), "utf8")) as {
    requiredDomains: string[];
    sessionActionContracts: Record<string, Array<{ action: string; status: string; writesRuntime: boolean; wouldWriteRuntime?: boolean; authority: string; requiredEvidence?: string[] }>>;
  };

  const adaptersStdout = captureStream();
  assert.equal(await runCli(["runtime", "adapters", "--json"], {
    stdout: adaptersStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const adaptersPayload = JSON.parse(adaptersStdout.getOutput()) as { data: { adapters: Array<{ id: string; targetedForFullIntegration: boolean }> } };
  assert.deepEqual(
    adaptersPayload.data.adapters
      .filter((adapter) => adapter.targetedForFullIntegration)
      .map((adapter) => adapter.id)
      .sort(),
    ["codex", "hermes", "openclaw"],
  );

  const commandsStdout = captureStream();
  assert.equal(await runCli(["runtime", "codex", "commands", "--workspace", workspaceRoot, "--json"], {
    stdout: commandsStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const commandsPayload = JSON.parse(commandsStdout.getOutput()) as { data: { runtimeId: string; executableByClawCli: Array<{ command: string; delegatesTo?: string; writesRuntime?: boolean; wouldWriteRuntime?: boolean }>; resourceDomains: string[] } };
  assert.equal(commandsPayload.data.runtimeId, "codex");
  assert.equal(commandsPayload.data.executableByClawCli.some((entry) => entry.command === "runtime codex status"), true);
  assert.equal(commandsPayload.data.executableByClawCli.some((entry) => entry.command === "runtime codex support"), true);
  assert.equal(commandsPayload.data.executableByClawCli.find((entry) => entry.command === "runtime codex sessions inject --session-key <id> --message <text> --confirm-runtime-write")?.writesRuntime, false);
  assert.equal(commandsPayload.data.executableByClawCli.find((entry) => entry.command === "runtime codex sessions abort --session-key <id> --confirm-runtime-write")?.writesRuntime, false);
  assert.equal(commandsPayload.data.executableByClawCli.find((entry) => entry.command === "runtime codex sessions create --title <title>")?.writesRuntime, false);
  assert.equal(commandsPayload.data.executableByClawCli.find((entry) => entry.command === "runtime codex sessions create --title <title>")?.wouldWriteRuntime, true);
  assert.deepEqual(commandsPayload.data.resourceDomains, manifest.requiredDomains);

  const codexResourcesMissingDomainStdout = captureStream();
  assert.equal(await runCli(["runtime", "codex", "resources", "--workspace", workspaceRoot, "--json"], {
    stdout: codexResourcesMissingDomainStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_USAGE);
  const codexResourcesMissingDomainPayload = JSON.parse(codexResourcesMissingDomainStdout.getOutput()) as {
    ok: boolean;
    error: { code: string; message: string };
    meta: { canonicalCommand?: string; operation?: string; runtimeId?: string };
  };
  assert.equal(codexResourcesMissingDomainPayload.ok, false);
  assert.equal(codexResourcesMissingDomainPayload.error.code, "missing_runtime_resource_domain");
  assert.equal(codexResourcesMissingDomainPayload.meta.canonicalCommand, "runtime");
  assert.equal(codexResourcesMissingDomainPayload.meta.operation, "resources");
  assert.equal(codexResourcesMissingDomainPayload.meta.runtimeId, "codex");

  const codexResourcesUnknownDomainStdout = captureStream();
  assert.equal(await runCli(["runtime", "codex", "resources", "unknown-domain", "--workspace", workspaceRoot, "--json"], {
    stdout: codexResourcesUnknownDomainStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_USAGE);
  const codexResourcesUnknownDomainPayload = JSON.parse(codexResourcesUnknownDomainStdout.getOutput()) as {
    ok: boolean;
    error: { code: string; message: string };
    meta: { canonicalCommand?: string; operation?: string; runtimeId?: string; domain?: string };
  };
  assert.equal(codexResourcesUnknownDomainPayload.ok, false);
  assert.equal(codexResourcesUnknownDomainPayload.error.code, "unknown_runtime_resource_domain");
  assert.equal(codexResourcesUnknownDomainPayload.meta.canonicalCommand, "runtime");
  assert.equal(codexResourcesUnknownDomainPayload.meta.operation, "resources");
  assert.equal(codexResourcesUnknownDomainPayload.meta.runtimeId, "codex");
  assert.equal(codexResourcesUnknownDomainPayload.meta.domain, "unknown-domain");

  const codexDomainUnknownStdout = captureStream();
  assert.equal(await runCli(["runtime", "codex", "domain", "unknown-domain", "--workspace", workspaceRoot, "--json"], {
    stdout: codexDomainUnknownStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_USAGE);
  const codexDomainUnknownPayload = JSON.parse(codexDomainUnknownStdout.getOutput()) as {
    ok: boolean;
    error: { code: string };
    meta: { canonicalCommand?: string; operation?: string; runtimeId?: string; domain?: string };
  };
  assert.equal(codexDomainUnknownPayload.ok, false);
  assert.equal(codexDomainUnknownPayload.error.code, "unknown_runtime_domain");
  assert.equal(codexDomainUnknownPayload.meta.canonicalCommand, "runtime");
  assert.equal(codexDomainUnknownPayload.meta.operation, "domain");
  assert.equal(codexDomainUnknownPayload.meta.runtimeId, "codex");
  assert.equal(codexDomainUnknownPayload.meta.domain, "unknown-domain");

  const codexGatewayResourcesStdout = captureStream();
  assert.equal(await runCli(["runtime", "codex", "resources", "gateway", "--workspace", workspaceRoot, "--json"], {
    stdout: codexGatewayResourcesStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const codexGatewayResourcesPayload = JSON.parse(codexGatewayResourcesStdout.getOutput()) as {
    data: {
      domain: string;
      data: {
        gateway?: unknown;
        gatewayAvailable?: boolean;
        supportContract?: { officialCommands?: string[]; provenance?: { domain?: string } };
        providers?: unknown[];
        models?: unknown[];
      };
    };
  };
  assert.equal(codexGatewayResourcesPayload.data.domain, "gateway");
  assert.equal(codexGatewayResourcesPayload.data.data.providers, undefined);
  assert.equal(codexGatewayResourcesPayload.data.data.models, undefined);
  assert.equal(codexGatewayResourcesPayload.data.data.supportContract?.officialCommands?.includes("codex mcp add"), true);
  assert.equal(codexGatewayResourcesPayload.data.data.supportContract?.officialCommands?.includes("codex app-server daemon"), true);
  assert.equal(codexGatewayResourcesPayload.data.data.supportContract?.provenance?.domain, "gateway");

  const codexSessionsStdout = captureStream();
  assert.equal(await runCli(["runtime", "codex", "domain", "sessions", "--workspace", workspaceRoot, "--home-dir", path.join(workspaceRoot, ".codex-runtime"), "--json"], {
    stdout: codexSessionsStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal(codexSessionsStdout.getOutput().includes("OPENAI_API_KEY"), false);
  const codexSessionsPayload = JSON.parse(codexSessionsStdout.getOutput()) as {
    data: {
      data: {
        actionContracts?: Array<{ action: string; status: string; writesRuntime: boolean; wouldWriteRuntime?: boolean; authority: string; requiredEvidence?: string[] }>;
        actionPolicy?: Array<{ action: string; status: string; writesRuntime: boolean; wouldWriteRuntime?: boolean; authority: string; requiredEvidence?: string[] }>;
        session?: { gateway?: { env?: unknown }; sessionPath?: string };
        supportContract?: {
          officialCommands?: string[];
          evidenceRequirements?: Array<{
            id: string;
            blockerClass: string;
            commandShape: string;
            approvalRequired: boolean;
            expectedEvidence?: string[];
            evidenceDisposition?: string;
            currentBehavior?: string;
            fallbackPolicy?: string;
            claimEffect?: string;
            reentryCondition?: string;
            productDecision?: string;
            supportResolution?: string;
            userVisibleContract?: string;
          }>;
        };
      };
    };
  };
  assert.equal(codexSessionsPayload.data.data.session?.gateway?.env, undefined);
  assert.equal(codexSessionsPayload.data.data.session?.sessionPath?.endsWith(".codex-runtime/sessions"), true);
  assert.equal(codexSessionsPayload.data.data.supportContract?.officialCommands?.includes("codex resume --last"), true);
  assert.equal(codexSessionsPayload.data.data.supportContract?.officialCommands?.includes("codex fork"), true);
  assert.equal(codexSessionsPayload.data.data.supportContract?.evidenceRequirements?.find((entry) => entry.id === "codex.sessions.write_back_contract")?.blockerClass, "direct_blocker");
  assert.equal(codexSessionsPayload.data.data.supportContract?.evidenceRequirements?.find((entry) => entry.id === "codex.sessions.write_back_contract")?.commandShape, "not_executable_until_official_runtime_contract_exists");
  assert.equal(codexSessionsPayload.data.data.supportContract?.evidenceRequirements?.find((entry) => entry.id === "codex.sessions.write_back_contract")?.expectedEvidence?.includes("official_runtime_cli_or_api"), true);
  assert.equal(codexSessionsPayload.data.data.supportContract?.evidenceRequirements?.find((entry) => entry.id === "codex.sessions.write_back_contract")?.evidenceDisposition, "blocked_until_official_runtime_contract");
  assert.equal(codexSessionsPayload.data.data.supportContract?.evidenceRequirements?.find((entry) => entry.id === "codex.sessions.write_back_contract")?.fallbackPolicy, "do_not_synthesize_native_write_back");
  assert.equal(codexSessionsPayload.data.data.supportContract?.evidenceRequirements?.find((entry) => entry.id === "codex.sessions.write_back_contract")?.productDecision, "native_write_back_unsupported_until_official_runtime_contract");
  assert.equal(codexSessionsPayload.data.data.supportContract?.evidenceRequirements?.find((entry) => entry.id === "codex.sessions.write_back_contract")?.supportResolution, "explicitly_product_blocked_not_a_silent_gap");
  assert.equal(codexSessionsPayload.data.data.supportContract?.evidenceRequirements?.find((entry) => entry.id === "codex.sessions.write_back_contract")?.userVisibleContract, "read_only_projection_or_local_overlay_only");
  assert.deepEqual(codexSessionsPayload.data.data.actionContracts?.map((entry) => entry.action), manifest.sessionActionContracts.codex.map((entry) => entry.action));
  assert.equal(codexSessionsPayload.data.data.actionContracts?.find((entry) => entry.action === "send")?.status, "blocked");
  assert.equal(codexSessionsPayload.data.data.actionContracts?.find((entry) => entry.action === "create")?.wouldWriteRuntime, true);
  assert.equal(codexSessionsPayload.data.data.actionContracts?.find((entry) => entry.action === "pin")?.authority, "clawix_local_overlay");
  assert.equal(codexSessionsPayload.data.data.actionPolicy?.find((entry) => entry.action === "list")?.status, "implemented");
  assert.equal(codexSessionsPayload.data.data.actionPolicy?.find((entry) => entry.action === "preview")?.status, "implemented");
  assert.equal(codexSessionsPayload.data.data.actionPolicy?.find((entry) => entry.action === "create")?.status, "blocked");
  assert.equal(codexSessionsPayload.data.data.actionPolicy?.find((entry) => entry.action === "create")?.writesRuntime, false);
  assert.equal(codexSessionsPayload.data.data.actionPolicy?.find((entry) => entry.action === "create")?.wouldWriteRuntime, true);
  assert.equal(codexSessionsPayload.data.data.actionPolicy?.find((entry) => entry.action === "create")?.requiredEvidence?.includes("official_create_command_or_api"), true);
  assert.equal(codexSessionsPayload.data.data.actionPolicy?.find((entry) => entry.action === "inject")?.status, "blocked");
  assert.equal(codexSessionsPayload.data.data.actionPolicy?.find((entry) => entry.action === "abort")?.status, "blocked");
  assert.equal(codexSessionsPayload.data.data.actionPolicy?.find((entry) => entry.action === "pin")?.authority, "clawix_local_overlay");
  assert.equal(codexSessionsPayload.data.data.actionPolicy?.find((entry) => entry.action === "pin")?.writesRuntime, false);

  const codexCreateStdout = captureStream();
  assert.equal(await runCli(["runtime", "codex", "sessions", "create", "--title", "Native Draft", "--workspace", workspaceRoot, "--home-dir", codexHome, "--json"], {
    stdout: codexCreateStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_DEGRADED);
  const codexCreatePayload = JSON.parse(codexCreateStdout.getOutput()) as {
    data: {
      status: string;
      writesRuntime: boolean;
      wouldWriteRuntime: boolean;
      createPlan?: {
        requested?: { title?: string };
        writeBackStatus?: string;
        conflictPolicy?: string;
        requiredEvidence?: string[];
        rejectedFallbacks?: string[];
      };
    };
  };
  assert.equal(codexCreatePayload.data.status, "blocked");
  assert.equal(codexCreatePayload.data.writesRuntime, false);
  assert.equal(codexCreatePayload.data.wouldWriteRuntime, true);
  assert.equal(codexCreatePayload.data.createPlan?.requested?.title, "Native Draft");
  assert.equal(codexCreatePayload.data.createPlan?.writeBackStatus, "blocked_until_official_runtime_create_contract");
  assert.equal(codexCreatePayload.data.createPlan?.conflictPolicy, "no_silent_native_object_creation");
  assert.equal(codexCreatePayload.data.createPlan?.requiredEvidence?.includes("round_trip_visible_in_native_list"), true);
  assert.equal(codexCreatePayload.data.createPlan?.rejectedFallbacks?.includes("do_not_create_claw_portable_session_and_label_it_native"), true);

  const codexPreviewStdout = captureStream();
  assert.equal(await runCli(["runtime", "codex", "sessions", "preview", "--session-key", "2026/05/21/codex-session", "--workspace", workspaceRoot, "--home-dir", codexHome, "--json"], {
    stdout: codexPreviewStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const codexPreviewPayload = JSON.parse(codexPreviewStdout.getOutput()) as {
    data: { result: { id: string; found: boolean; contentIncluded: boolean; contentPreview?: string; nativeIdentifier?: { name?: string } } };
  };
  assert.equal(codexPreviewPayload.data.result.id, "2026/05/21/codex-session");
  assert.equal(codexPreviewPayload.data.result.found, true);
  assert.equal(codexPreviewPayload.data.result.contentIncluded, false);
  assert.equal(codexPreviewPayload.data.result.contentPreview, undefined);
  assert.equal(codexPreviewPayload.data.result.nativeIdentifier?.name, "sessionPathId");

  const codexContentPreviewStdout = captureStream();
  assert.equal(await runCli(["runtime", "codex", "sessions", "preview", "--session-key", "2026/05/21/codex-session", "--include-content", "--workspace", workspaceRoot, "--home-dir", codexHome, "--json"], {
    stdout: codexContentPreviewStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const codexContentPreviewPayload = JSON.parse(codexContentPreviewStdout.getOutput()) as {
    data: { result: { contentIncluded: boolean; contentPreview?: string; contentLimitBytes?: number } };
  };
  assert.equal(codexContentPreviewPayload.data.result.contentIncluded, true);
  assert.match(codexContentPreviewPayload.data.result.contentPreview ?? "", /codex native preview/);
  assert.equal(codexContentPreviewPayload.data.result.contentLimitBytes, 4096);

  const codexSupportStdout = captureStream();
  assert.equal(await runCli(["runtime", "codex", "support", "--workspace", workspaceRoot, "--home-dir", codexHome, "--json"], {
    stdout: codexSupportStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const codexSupportPayload = JSON.parse(codexSupportStdout.getOutput()) as {
    data: {
      closureChecklist?: Array<{ domain: string; closureStatus: string; readProjectionStatus?: string; implementedFacets?: string[]; blockingFacets?: string[]; projectionDisposition?: string }>;
      domains?: Array<{ domain: string; readProjectionStatus?: string; implementedFacets?: string[]; blockingFacets?: string[] }>;
      closureChecklistSummary?: Record<string, number>;
      projectionSummary?: {
        byReadProjectionStatus?: Record<string, number>;
        implementedFacetCounts?: Record<string, number>;
        blockingFacetCounts?: Record<string, number>;
        projectedDomainCount?: number;
        unsupportedDomainCount?: number;
        productBlockedButProjectedDomainCount?: number;
      };
      evidenceReadinessSummary?: {
        statusCounts?: Record<string, number>;
        blockerClassCounts?: Record<string, number>;
        safeDefaultCounts?: Record<string, number>;
        totalRequirementCount?: number;
        approvalRequiredCount?: number;
        externalPendingCount?: number;
        upstreamContractBlockedCount?: number;
        productBlockedCount?: number;
        unresolvedNativeRequirementCount?: number;
        approvalRequiredRequirementIds?: string[];
        upstreamContractRequirementIds?: string[];
        nextRequiredActions?: string[];
        reentryPolicy?: string;
        safeDefault?: string;
      };
      syncPolicySummary?: {
        domainCount?: number;
        writeBackPolicyCounts?: Record<string, number>;
        persistenceCounts?: Record<string, number>;
        readOnlyProjectionDomains?: string[];
        writeBackAllowedDomains?: string[];
        blockedWriteBackDomains?: string[];
        localOverlayDomains?: string[];
        localOverlayActions?: string[];
        noSilentOverwrite?: boolean;
        defaultSyncMode?: string;
        safeDefault?: string;
      };
    };
  };
  const codexSessionsChecklist = codexSupportPayload.data.closureChecklist?.find((entry) => entry.domain === "sessions");
  assert.equal(codexSessionsChecklist?.closureStatus, "product_blocked");
  assert.equal(codexSessionsChecklist?.readProjectionStatus, "projected");
  assert.equal(codexSessionsChecklist?.implementedFacets?.includes("session_list_action"), true);
  assert.equal(codexSessionsChecklist?.implementedFacets?.includes("session_preview_action"), true);
  assert.equal(codexSessionsChecklist?.blockingFacets?.includes("native_action_contract"), true);
  assert.equal(codexSessionsChecklist?.projectionDisposition, "read_projection_available_write_back_blocked");
  assert.equal(codexSupportPayload.data.domains?.find((entry) => entry.domain === "sessions")?.readProjectionStatus, "projected");
  assert.equal(codexSupportPayload.data.domains?.find((entry) => entry.domain === "scheduler")?.readProjectionStatus, "unsupported_by_runtime");
  assert.equal(codexSupportPayload.data.closureChecklistSummary?.product_blocked, manifest.requiredDomains.length);
  assert.equal(codexSupportPayload.data.projectionSummary?.byReadProjectionStatus?.projected, 6);
  assert.equal(codexSupportPayload.data.projectionSummary?.byReadProjectionStatus?.unsupported_by_runtime, 1);
  assert.equal(codexSupportPayload.data.projectionSummary?.byReadProjectionStatus?.degraded_projection, 3);
  assert.equal(codexSupportPayload.data.projectionSummary?.byReadProjectionStatus?.manifest_projection_declared, 2);
  assert.equal(codexSupportPayload.data.projectionSummary?.implementedFacetCounts?.session_preview_action, 1);
  assert.equal(codexSupportPayload.data.projectionSummary?.blockingFacetCounts?.native_action_contract, 1);
  assert.equal(codexSupportPayload.data.projectionSummary?.productBlockedButProjectedDomainCount, 11);
  assert.equal(codexSupportPayload.data.evidenceReadinessSummary?.unresolvedNativeRequirementCount, 0);
  assert.equal((codexSupportPayload.data.evidenceReadinessSummary?.upstreamContractBlockedCount ?? 0) > 0, true);
  assert.equal(codexSupportPayload.data.evidenceReadinessSummary?.nextRequiredActions?.includes("official_runtime_native_contract_fixture"), true);
  assert.equal(codexSupportPayload.data.evidenceReadinessSummary?.safeDefault, "keep_unpromoted_and_follow_exact_reentry_packets");
  assert.equal(codexSupportPayload.data.syncPolicySummary?.domainCount, manifest.requiredDomains.length);
  assert.equal((codexSupportPayload.data.syncPolicySummary?.blockedWriteBackDomains?.length ?? 0) > 0, true);
  assert.equal(codexSupportPayload.data.syncPolicySummary?.localOverlayDomains?.includes("sessions"), true);
  assert.equal(codexSupportPayload.data.syncPolicySummary?.localOverlayActions?.includes("pin"), true);
  assert.equal(codexSupportPayload.data.syncPolicySummary?.noSilentOverwrite, true);
  assert.equal(codexSupportPayload.data.syncPolicySummary?.defaultSyncMode, "read_projection_first_no_silent_write_back");

  const hermesDomainsStdout = captureStream();
  const hermesExit = await runCli(["runtime", "hermes", "domains", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesDomainsStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(hermesExit), true);
  const hermesPayload = JSON.parse(hermesDomainsStdout.getOutput()) as {
    data: {
      runtimeId: string;
      support?: {
        adapter?: { supportLevel?: string; recommended?: boolean };
        ecosystem?: {
          supportStage?: string;
          recommended?: boolean;
          production?: boolean;
          uiParityClaim?: string;
          blockedWriteBackDomains?: string[];
          externalPendingDomains?: string[];
        evidenceRequirements?: Array<{ id: string; blockerClass: string; commandShape: string; approvalRequired: boolean; evidenceDisposition?: string; currentBehavior?: string; fallbackPolicy?: string; claimEffect?: string; reentryCondition?: string; productDecision?: string; supportResolution?: string; userVisibleContract?: string }>;
        };
      };
      commands?: {
        executableByClawCli?: Array<{ command: string; writesRuntime?: boolean; wouldWriteRuntime?: boolean; delegatesTo?: string }>;
        resourceDomains?: string[];
      };
      supportAudit?: {
        closureState?: string;
        supportComplete?: boolean;
        allDomainsAccountedFor?: boolean;
        blockerSummary?: {
          byBlockerClass?: Record<string, number>;
          directBlockerDomains?: string[];
          externalPendingDomains?: string[];
          evidenceRequirementCount?: number;
        };
        evidenceRequirements?: Array<{ id: string; blockerClass: string; commandShape: string; approvalRequired: boolean }>;
        domains?: Array<{ domain: string; evidenceRequirementIds?: string[]; readProjectionStatus?: string; implementedFacets?: string[]; blockingFacets?: string[] }>;
        closureChecklist?: Array<{ domain: string; closureStatus: string; evidenceRequirementIds?: string[]; safeDefault?: string; nextAction?: string; readProjectionStatus?: string; implementedFacets?: string[]; blockingFacets?: string[]; projectionDisposition?: string }>;
        closureChecklistSummary?: Record<string, number>;
        projectionSummary?: {
          byReadProjectionStatus?: Record<string, number>;
          implementedFacetCounts?: Record<string, number>;
          blockingFacetCounts?: Record<string, number>;
          projectedDomainCount?: number;
          unsupportedDomainCount?: number;
          productBlockedButProjectedDomainCount?: number;
        };
        promotionGate?: string;
        finalPromotionReview?: {
          status?: string;
          finalPromotionAllowed?: boolean;
          claimDisposition?: string;
          productBlockedByDecisionCount?: number;
          externalPendingCount?: number;
          unresolvedNativeRequirementCount?: number;
          productBlockedRequirementIds?: string[];
          externalPendingRequirementIds?: string[];
          unresolvedNativeRequirementIds?: string[];
          requiredForPromotion?: string[];
          userVisibleStatus?: string;
        };
        finalSupportClaimDecision?: {
          status?: string;
          decision?: string;
          effectiveSupportStage?: string;
          recommended?: boolean;
          production?: boolean;
          uiParityDisposition?: string;
          blockedPromotionClaims?: string[];
          reentryPolicy?: string;
          safeDefault?: string;
          userVisibleStatus?: string;
        };
      };
      domainData: {
        auth?: {
          auth?: Record<string, unknown>;
        };
        sessions?: {
          actionContracts?: Array<{ action: string; status: string; writesRuntime: boolean; wouldWriteRuntime?: boolean; authority: string; requiredEvidence?: string[] }>;
          actionPolicy?: Array<{ action: string; status: string; writesRuntime: boolean }>;
          sessions?: Array<{ id: string; kind: string; path: string; provenance?: { source?: string } }>;
        };
        skills?: {
          skills?: Array<{ id: string; enabled?: boolean; path?: string; scope?: string }>;
        };
        memory?: {
          memory?: Array<{ id: string; path?: string; summary?: string }>;
        };
        models?: {
          models?: Array<{ id: string; modelId?: string; provider?: string; source?: string; isDefault?: boolean }>;
          defaultModel?: { modelId?: string; provider?: string };
        };
        scheduler?: {
          schedulers?: Array<{ id: string; kind?: string; status?: string; enabled?: boolean }>;
        };
      };
      domains: Array<{
        domain: string;
        count?: number;
        claim?: string;
        writeBackPolicy?: string;
        validation?: string;
        evidenceRequirements?: Array<{ id: string; blockerClass: string; commandShape: string; approvalRequired: boolean; expectedEvidence?: string[]; evidenceDisposition?: string; currentBehavior?: string; fallbackPolicy?: string; claimEffect?: string; reentryCondition?: string; productDecision?: string; supportResolution?: string; userVisibleContract?: string }>;
        officialCommands?: string[];
        provenance?: { source?: string };
      }>;
    };
  };
  assert.equal(hermesPayload.data.runtimeId, "hermes");
  assert.equal(hermesPayload.data.support?.adapter?.supportLevel, "dev-only");
  assert.equal(hermesPayload.data.support?.ecosystem?.supportStage, "dev_only");
  assert.equal(hermesPayload.data.support?.ecosystem?.recommended, false);
  assert.equal(hermesPayload.data.support?.ecosystem?.production, false);
  assert.equal(hermesPayload.data.support?.ecosystem?.blockedWriteBackDomains?.includes("sessions"), true);
  assert.equal(hermesPayload.data.support?.ecosystem?.externalPendingDomains?.includes("channels"), true);
  assert.equal(hermesPayload.data.support?.ecosystem?.evidenceRequirements?.find((entry) => entry.id === "hermes.channels.live_evidence")?.approvalRequired, true);
  assert.equal(hermesPayload.data.support?.ecosystem?.evidenceRequirements?.find((entry) => entry.id === "hermes.channels.live_evidence")?.evidenceDisposition, "external_pending_until_approved_redacted_live_receipt");
  assert.equal(hermesPayload.data.support?.ecosystem?.evidenceRequirements?.find((entry) => entry.id === "hermes.channels.live_evidence")?.fallbackPolicy, "no_live_claim_promotion_without_explicit_approval");
  assert.equal(hermesPayload.data.support?.ecosystem?.evidenceRequirements?.find((entry) => entry.id === "hermes.channels.live_evidence")?.supportResolution, "external_pending_not_product_blocked");
  assert.equal(hermesPayload.data.supportAudit?.closureState, "blocked");
  assert.equal(hermesPayload.data.supportAudit?.supportComplete, false);
  assert.equal(hermesPayload.data.supportAudit?.allDomainsAccountedFor, true);
  assert.equal(hermesPayload.data.supportAudit?.blockerSummary?.directBlockerDomains?.includes("sessions"), true);
  assert.equal(hermesPayload.data.supportAudit?.blockerSummary?.externalPendingDomains?.includes("channels"), true);
  assert.equal((hermesPayload.data.supportAudit?.blockerSummary?.byBlockerClass?.direct_blocker ?? 0) > 0, true);
  assert.equal(hermesPayload.data.supportAudit?.evidenceRequirements?.some((entry) => entry.id === "hermes.sessions.create.action_contract"), true);
  assert.equal(hermesPayload.data.supportAudit?.evidenceRequirements?.find((entry) => entry.id === "hermes.sessions.create.action_contract")?.evidenceDisposition, "blocked_until_official_runtime_action_contract");
  assert.equal(hermesPayload.data.supportAudit?.evidenceRequirements?.find((entry) => entry.id === "hermes.sessions.create.action_contract")?.supportResolution, "explicitly_product_blocked_not_a_silent_gap");
  assert.equal(hermesPayload.data.supportAudit?.domains?.find((entry) => entry.domain === "sessions")?.evidenceRequirementIds?.includes("hermes.sessions.create.action_contract"), true);
  assert.equal(hermesPayload.data.supportAudit?.closureChecklist?.length, manifest.requiredDomains.length);
  assert.equal(hermesPayload.data.supportAudit?.closureChecklist?.find((entry) => entry.domain === "channels")?.closureStatus, "external_pending");
  assert.equal(hermesPayload.data.supportAudit?.closureChecklist?.find((entry) => entry.domain === "sessions")?.closureStatus, "product_blocked");
  assert.equal(hermesPayload.data.supportAudit?.closureChecklist?.find((entry) => entry.domain === "sessions")?.safeDefault, "keep_lowered_claim_until_upstream_native_contract_exists");
  assert.equal(hermesPayload.data.supportAudit?.closureChecklistSummary?.external_pending, 1);
  assert.equal(hermesPayload.data.supportAudit?.finalPromotionReview?.status, "unpromoted");
  assert.equal(hermesPayload.data.supportAudit?.finalPromotionReview?.finalPromotionAllowed, false);
  assert.equal(hermesPayload.data.supportAudit?.finalPromotionReview?.claimDisposition, "unpromoted_external_pending");
  assert.equal(hermesPayload.data.supportAudit?.finalPromotionReview?.externalPendingRequirementIds?.includes("hermes.channels.live_evidence"), true);
  assert.equal(hermesPayload.data.supportAudit?.finalPromotionReview?.productBlockedRequirementIds?.includes("hermes.sessions.create.action_contract"), true);
  assert.equal(hermesPayload.data.supportAudit?.finalPromotionReview?.unresolvedNativeRequirementCount, 0);
  assert.equal(hermesPayload.data.supportAudit?.finalPromotionReview?.requiredForPromotion?.includes("approved_redacted_live_evidence"), true);
  assert.equal(hermesPayload.data.supportAudit?.finalPromotionReview?.userVisibleStatus, "runtime_ecosystem_available_with_product_blocked_or_external_pending_claims");
  assert.equal(hermesPayload.data.supportAudit?.finalSupportClaimDecision?.status, "not_promoted");
  assert.equal(hermesPayload.data.supportAudit?.finalSupportClaimDecision?.decision, "keep_current_lowered_runtime_ecosystem_claim");
  assert.equal(hermesPayload.data.supportAudit?.finalSupportClaimDecision?.effectiveSupportStage, "dev_only");
  assert.equal(hermesPayload.data.supportAudit?.finalSupportClaimDecision?.recommended, false);
  assert.equal(hermesPayload.data.supportAudit?.finalSupportClaimDecision?.production, false);
  assert.equal(hermesPayload.data.supportAudit?.finalSupportClaimDecision?.uiParityDisposition, "partial_lens_validated_not_full_native_parity");
  assert.equal(hermesPayload.data.supportAudit?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("recommended"), true);
  assert.equal(hermesPayload.data.supportAudit?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("write_back"), true);
  assert.equal(hermesPayload.data.supportAudit?.finalSupportClaimDecision?.reentryPolicy, "use_evidenceReentryPackets_exactly_before_revisiting_claim");
  assert.equal(hermesPayload.data.supportAudit?.finalSupportClaimDecision?.safeDefault, "keep_unpromoted_until_evidence_or_upstream_contract_changes");
  assert.equal(hermesPayload.data.commands?.resourceDomains?.length, manifest.requiredDomains.length);
  assert.equal(hermesPayload.data.commands?.executableByClawCli?.find((entry) => entry.command === "runtime hermes support")?.writesRuntime, false);
  assert.equal(hermesPayload.data.commands?.executableByClawCli?.find((entry) => entry.command === "runtime hermes sessions inject --session-key <id> --message <text> --confirm-runtime-write")?.writesRuntime, false);
  assert.equal(hermesPayload.data.commands?.executableByClawCli?.find((entry) => entry.command === "runtime hermes sessions abort --session-key <id> --confirm-runtime-write")?.delegatesTo, "blocked until native abort contract");
  assert.deepEqual(hermesPayload.data.domains.map((entry) => entry.domain), manifest.requiredDomains);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "sessions")?.officialCommands?.includes("hermes --continue"), true);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "sessions")?.officialCommands?.includes("/sessions"), true);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "sessions")?.officialCommands?.includes("hermes sessions export <output> [--session-id ID]"), true);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "sessions")?.officialCommands?.includes("hermes sessions stats"), true);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "skills")?.officialCommands?.includes("hermes skills inspect"), true);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "memory")?.officialCommands?.includes("hermes memory status"), true);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "auth")?.officialCommands?.includes("hermes auth status <provider>"), true);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "scheduler")?.officialCommands?.includes("hermes cron tick"), true);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "plugins")?.officialCommands?.includes("hermes mcp serve"), true);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "gateway")?.officialCommands?.includes("hermes gateway status"), true);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "configuration")?.officialCommands?.includes("hermes config migrate"), true);
  assert.equal(
    hermesPayload.data.domains.find((entry) => entry.domain === "auth")?.count,
    Object.keys(hermesPayload.data.domainData.auth?.auth ?? {}).length,
  );
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "gateway")?.count, 1);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "doctorCompat")?.count, 1);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "sandboxPermissions")?.count, 1);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "skills")?.count, 1);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "memory")?.count, 1);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "models")?.count, 2);
  assert.equal(hermesPayload.data.domains.find((entry) => entry.domain === "scheduler")?.count, 1);
  assert.ok((hermesPayload.data.domains.find((entry) => entry.domain === "configuration")?.count ?? 0) > 0);
  assert.equal(hermesPayload.data.domainData.sessions?.sessions?.[0]?.id, "2026/05/21/runtime-session");
  assert.equal(hermesPayload.data.domainData.sessions?.sessions?.[0]?.kind, "session");
  assert.equal(hermesPayload.data.domainData.sessions?.sessions?.[0]?.provenance?.source, "runtime-session-store");
  assert.equal(hermesPayload.data.domainData.skills?.skills?.some((entry) => entry.id === "browser-helper" && entry.scope === "runtime"), true);
  assert.equal(hermesPayload.data.domainData.memory?.memory?.some((entry) => entry.id === "hermes-memory-profile" && entry.summary?.includes("not exposed by default")), true);
  assert.equal(hermesPayload.data.domainData.models?.defaultModel?.modelId, "openai/gpt-4.1");
  assert.equal(hermesPayload.data.domainData.models?.models?.some((entry) => entry.id === "openai/gpt-4.1" && entry.isDefault === true), true);
  assert.equal(hermesPayload.data.domainData.models?.models?.some((entry) => entry.id === "anthropic/claude-3-5-sonnet" && entry.source === "config"), true);
  assert.equal(hermesPayload.data.domainData.scheduler?.schedulers?.some((entry) => entry.id === "daily-summary" && entry.kind === "cron"), true);
  assert.deepEqual(hermesPayload.data.domainData.sessions?.actionContracts?.map((entry) => entry.action), manifest.sessionActionContracts.hermes.map((entry) => entry.action));
  assert.equal(hermesPayload.data.domainData.sessions?.actionContracts?.find((entry) => entry.action === "send")?.status, "blocked");
  assert.equal(hermesPayload.data.domainData.sessions?.actionContracts?.find((entry) => entry.action === "create")?.wouldWriteRuntime, true);
  assert.equal(hermesPayload.data.domainData.sessions?.actionContracts?.find((entry) => entry.action === "pin")?.authority, "clawix_local_overlay");
  assert.equal(hermesPayload.data.domainData.sessions?.actionPolicy?.find((entry) => entry.action === "list")?.status, "implemented");
  assert.equal(hermesPayload.data.domainData.sessions?.actionPolicy?.find((entry) => entry.action === "preview")?.status, "implemented");
  assert.equal(hermesPayload.data.domainData.sessions?.actionPolicy?.find((entry) => entry.action === "resolve")?.status, "implemented");
  assert.equal(hermesPayload.data.domainData.sessions?.actionPolicy?.find((entry) => entry.action === "history")?.status, "implemented");
  assert.equal(hermesPayload.data.domainData.sessions?.actionPolicy?.find((entry) => entry.action === "create")?.writesRuntime, false);
  assert.match(
    hermesPayload.data.commands?.executableByClawCli?.find((entry) => entry.command === "runtime hermes sessions resolve --session-key <id>")?.delegatesTo ?? "",
    /bounded resolve/,
  );
  assert.equal(hermesPayload.data.domainData.plugins?.plugins?.some((entry) => entry.id === "memory-provider" && entry.metadata?.kind === "plugin"), true);
  assert.equal(hermesPayload.data.domainData.plugins?.plugins?.some((entry) => entry.id === "mcp-github" && entry.metadata?.kind === "mcp_server"), true);
  const hermesChannels = hermesPayload.data.domains.find((entry) => entry.domain === "channels");
  assert.equal(hermesChannels?.claim, "inventoried");
  assert.equal(hermesChannels?.writeBackPolicy, "external_pending_live_accounts");
  assert.equal(hermesChannels?.validation, "external_pending_for_live_accounts");
  assert.equal(hermesChannels?.evidenceRequirements?.find((entry) => entry.id === "hermes.channels.live_evidence")?.blockerClass, "external_pending");
  assert.equal(hermesChannels?.evidenceRequirements?.find((entry) => entry.id === "hermes.channels.live_evidence")?.commandShape, "runtime hermes domain channels --json");
  assert.equal(hermesChannels?.evidenceRequirements?.find((entry) => entry.id === "hermes.channels.live_evidence")?.expectedEvidence?.includes("no_plaintext_secrets"), true);
  assert.equal(hermesChannels?.evidenceRequirements?.find((entry) => entry.id === "hermes.channels.live_evidence")?.currentBehavior, "read_only_projection_or_degraded_snapshot_only");
  assert.equal(hermesChannels?.evidenceRequirements?.find((entry) => entry.id === "hermes.channels.live_evidence")?.claimEffect, "blocks_recommended_production_native_parity");
  assert.equal(hermesChannels?.evidenceRequirements?.find((entry) => entry.id === "hermes.channels.live_evidence")?.productDecision, "external_live_claim_not_supported_without_approved_redacted_evidence");
  assert.equal(hermesChannels?.officialCommands?.includes("hermes gateway status"), true);
  assert.equal(hermesChannels?.provenance?.source, "runtime-ecosystem-manifest");

  for (const resourceDomain of manifest.requiredDomains) {
    const resourceStdout = captureStream();
    const resourceExit = await runCli(["runtime", "hermes", "resources", resourceDomain, "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
      stdout: resourceStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(resourceExit), true);
    const resourcePayload = JSON.parse(resourceStdout.getOutput()) as {
      data: {
        runtimeId: string;
        domain: string;
        data: {
          supportContract?: { provenance?: { runtimeId?: string; domain?: string } };
          providers?: unknown[];
          models?: unknown[];
          defaultModel?: unknown;
          skills?: unknown[];
          memory?: unknown[];
          schedulers?: unknown[];
        };
      };
    };
    assert.equal(resourcePayload.data.runtimeId, "hermes");
    assert.equal(resourcePayload.data.domain, resourceDomain);
    assert.equal(resourcePayload.data.data.supportContract?.provenance?.runtimeId, "hermes");
    assert.equal(resourcePayload.data.data.supportContract?.provenance?.domain, resourceDomain);
    if (resourceDomain !== "providers") assert.equal(resourcePayload.data.data.providers, undefined);
    if (resourceDomain !== "models") {
      assert.equal(resourcePayload.data.data.models, undefined);
      assert.equal(resourcePayload.data.data.defaultModel, undefined);
    }
    if (resourceDomain === "skills") assert.equal(Array.isArray(resourcePayload.data.data.skills), true);
    if (resourceDomain === "memory") assert.equal(Array.isArray(resourcePayload.data.data.memory), true);
    if (resourceDomain === "scheduler") assert.equal(Array.isArray(resourcePayload.data.data.schedulers), true);
  }

  const hermesSupportStdout = captureStream();
  const hermesSupportExit = await runCli(["runtime", "hermes", "support", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesSupportStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(hermesSupportExit), true);
  const hermesSupportPayload = JSON.parse(hermesSupportStdout.getOutput()) as {
    data: {
      runtimeId: string;
      scope: string;
      closureState: string;
      supportComplete: boolean;
      allDomainsAccountedFor: boolean;
      blockerSummary: {
        byBlockerClass?: Record<string, number>;
        directBlockerDomains?: string[];
        externalPendingDomains?: string[];
        evidenceRequirementCount?: number;
        productBlockedRequirementCount?: number;
      };
      evidenceRequirements?: Array<{ id: string; blockerClass: string; approvalRequired: boolean; commandShape: string; evidenceDisposition?: string; currentBehavior?: string; fallbackPolicy?: string; claimEffect?: string; reentryCondition?: string; productDecision?: string; supportResolution?: string; userVisibleContract?: string }>;
      domains?: Array<{ domain: string; evidenceRequirementIds?: string[]; blockerClasses?: string[]; evidenceDispositions?: string[]; supportResolutions?: string[]; readProjectionStatus?: string; implementedFacets?: string[]; blockingFacets?: string[] }>;
      closureChecklist?: Array<{ domain: string; closureStatus: string; evidenceRequirementIds?: string[]; safeDefault?: string; nextAction?: string; readProjectionStatus?: string; implementedFacets?: string[]; blockingFacets?: string[]; projectionDisposition?: string }>;
      closureChecklistSummary?: Record<string, number>;
      projectionSummary?: {
        byReadProjectionStatus?: Record<string, number>;
        implementedFacetCounts?: Record<string, number>;
        blockingFacetCounts?: Record<string, number>;
        projectedDomainCount?: number;
        unsupportedDomainCount?: number;
        productBlockedButProjectedDomainCount?: number;
      };
      evidenceReadinessSummary?: {
        statusCounts?: Record<string, number>;
        blockerClassCounts?: Record<string, number>;
        safeDefaultCounts?: Record<string, number>;
        totalRequirementCount?: number;
        approvalRequiredCount?: number;
        externalPendingCount?: number;
        upstreamContractBlockedCount?: number;
        productBlockedCount?: number;
        unresolvedNativeRequirementCount?: number;
        approvalRequiredRequirementIds?: string[];
        externalPendingRequirementIds?: string[];
        upstreamContractRequirementIds?: string[];
        productBlockedRequirementIds?: string[];
        unresolvedNativeRequirementIds?: string[];
        nextRequiredActions?: string[];
        reentryPolicy?: string;
        safeDefault?: string;
      };
      syncPolicySummary?: {
        domainCount?: number;
        canonicalAuthorityCounts?: Record<string, number>;
        nativeAuthorityCounts?: Record<string, number>;
        persistenceCounts?: Record<string, number>;
        relationCounts?: Record<string, number>;
        writeBackPolicyCounts?: Record<string, number>;
        lossPolicyCounts?: Record<string, number>;
        freshnessCounts?: Record<string, number>;
        readOnlyProjectionDomains?: string[];
        writeBackAllowedDomains?: string[];
        blockedWriteBackDomains?: string[];
        externalPendingDomains?: string[];
        localOverlayDomains?: string[];
        localOverlayActions?: string[];
        noSilentOverwrite?: boolean;
        defaultSyncMode?: string;
        safeDefault?: string;
      };
      promotionGate?: string;
      finalPromotionReview?: {
        status?: string;
        finalPromotionAllowed?: boolean;
        claimDisposition?: string;
        productBlockedByDecisionCount?: number;
        externalPendingCount?: number;
        unresolvedNativeRequirementCount?: number;
        productBlockedRequirementIds?: string[];
        externalPendingRequirementIds?: string[];
        unresolvedNativeRequirementIds?: string[];
        requiredForPromotion?: string[];
        userVisibleStatus?: string;
      };
      finalSupportClaimDecision?: {
        status?: string;
        decision?: string;
        effectiveSupportStage?: string;
        recommended?: boolean;
        production?: boolean;
        uiParityDisposition?: string;
        blockedPromotionClaims?: string[];
        reentryPolicy?: string;
        safeDefault?: string;
        userVisibleStatus?: string;
      };
      evidenceReentryPackets?: Array<{
        id?: string;
        requirementId?: string;
        blockerClass?: string;
        status?: string;
        approvalRequired?: boolean;
        commandShape?: string;
        expectedEvidence?: string[];
        riskControls?: string[];
        reentryCondition?: string;
        supportResolution?: string;
        productDecision?: string;
        userVisibleContract?: string;
        safeDefault?: string;
      }>;
    };
  };
  assert.equal(hermesSupportPayload.data.runtimeId, "hermes");
  assert.equal(hermesSupportPayload.data.scope, "runtime_ecosystem_support_audit");
  assert.equal(hermesSupportPayload.data.closureState, "blocked");
  assert.equal(hermesSupportPayload.data.supportComplete, false);
  assert.equal(hermesSupportPayload.data.allDomainsAccountedFor, true);
  assert.equal(hermesSupportPayload.data.blockerSummary.directBlockerDomains?.includes("sessions"), true);
  assert.equal(hermesSupportPayload.data.blockerSummary.externalPendingDomains?.includes("channels"), true);
  assert.equal((hermesSupportPayload.data.blockerSummary.byBlockerClass?.direct_blocker ?? 0) > 0, true);
  assert.equal((hermesSupportPayload.data.blockerSummary.byBlockerClass?.external_pending ?? 0) > 0, true);
  assert.equal((hermesSupportPayload.data.blockerSummary.productBlockedRequirementCount ?? 0) > 0, true);
  assert.equal(hermesSupportPayload.data.evidenceRequirements?.some((entry) => entry.id === "hermes.channels.live_evidence" && entry.approvalRequired === true), true);
  assert.equal(hermesSupportPayload.data.evidenceRequirements?.some((entry) => entry.id === "hermes.sessions.create.action_contract" && entry.commandShape === "not_executable_until_official_runtime_create_contract_exists"), true);
  assert.equal(hermesSupportPayload.data.evidenceRequirements?.find((entry) => entry.id === "hermes.sessions.create.action_contract")?.currentBehavior, "non_executable_action_plan_only");
  assert.equal(hermesSupportPayload.data.evidenceRequirements?.find((entry) => entry.id === "hermes.sessions.create.action_contract")?.fallbackPolicy, "do_not_synthesize_native_runtime_action");
  assert.equal(hermesSupportPayload.data.evidenceRequirements?.find((entry) => entry.id === "hermes.sessions.create.action_contract")?.productDecision, "native_session_action_unsupported_until_official_runtime_contract");
  assert.equal(hermesSupportPayload.data.evidenceRequirements?.find((entry) => entry.id === "hermes.sessions.pin.native_write_back_contract")?.userVisibleContract, "pin_state_is_clawix_local_overlay_until_runtime_write_back_exists");
  assert.equal(hermesSupportPayload.data.evidenceRequirements?.some((entry) => entry.id === "hermes.sessions.pin.native_write_back_contract" && entry.commandShape === "not_executable_until_official_runtime_pin_api_exists"), true);
  assert.equal(hermesSupportPayload.data.domains?.find((entry) => entry.domain === "channels")?.evidenceRequirementIds?.includes("hermes.channels.live_evidence"), true);
  assert.equal(hermesSupportPayload.data.domains?.find((entry) => entry.domain === "sessions")?.evidenceRequirementIds?.includes("hermes.sessions.create.action_contract"), true);
  assert.equal(hermesSupportPayload.data.domains?.find((entry) => entry.domain === "sessions")?.evidenceDispositions?.includes("blocked_until_official_runtime_action_contract"), true);
  assert.equal(hermesSupportPayload.data.domains?.find((entry) => entry.domain === "sessions")?.supportResolutions?.includes("explicitly_product_blocked_not_a_silent_gap"), true);
  assert.equal(hermesSupportPayload.data.domains?.find((entry) => entry.domain === "sessions")?.readProjectionStatus, "projected");
  assert.equal(hermesSupportPayload.data.domains?.find((entry) => entry.domain === "sessions")?.implementedFacets?.includes("session_list_action"), true);
  assert.equal(hermesSupportPayload.data.domains?.find((entry) => entry.domain === "sessions")?.blockingFacets?.includes("native_action_contract"), true);
  for (const projectedDomain of ["skills", "memory", "models", "scheduler"]) {
    const domainAudit = hermesSupportPayload.data.domains?.find((entry) => entry.domain === projectedDomain);
    const checklistItem = hermesSupportPayload.data.closureChecklist?.find((entry) => entry.domain === projectedDomain);
    assert.equal(domainAudit?.implementedFacets?.includes("read_projection_contract"), true);
    assert.equal(domainAudit?.blockingFacets?.includes("native_write_back_contract"), true);
    assert.equal(checklistItem?.closureStatus, "product_blocked");
    assert.equal(checklistItem?.projectionDisposition, "read_projection_available_write_back_blocked");
  }
  assert.equal(hermesSupportPayload.data.domains?.find((entry) => entry.domain === "memory")?.readProjectionStatus, "projected");
  assert.equal(hermesSupportPayload.data.domains?.find((entry) => entry.domain === "skills")?.readProjectionStatus, "degraded_projection");
  assert.equal(hermesSupportPayload.data.domains?.find((entry) => entry.domain === "models")?.readProjectionStatus, "degraded_projection");
  assert.equal(hermesSupportPayload.data.domains?.find((entry) => entry.domain === "scheduler")?.readProjectionStatus, "degraded_projection");
  assert.equal(hermesSupportPayload.data.closureChecklist?.length, manifest.requiredDomains.length);
  assert.equal(hermesSupportPayload.data.closureChecklist?.find((entry) => entry.domain === "channels")?.closureStatus, "external_pending");
  assert.equal(hermesSupportPayload.data.closureChecklist?.find((entry) => entry.domain === "channels")?.nextAction, "use_matching_evidenceReentryPacket_after_explicit_approval");
  assert.equal(hermesSupportPayload.data.closureChecklist?.find((entry) => entry.domain === "channels")?.projectionDisposition, "read_projection_available_live_evidence_pending");
  assert.equal(hermesSupportPayload.data.closureChecklist?.find((entry) => entry.domain === "sessions")?.closureStatus, "product_blocked");
  assert.equal(hermesSupportPayload.data.closureChecklist?.find((entry) => entry.domain === "sessions")?.readProjectionStatus, "projected");
  assert.equal(hermesSupportPayload.data.closureChecklist?.find((entry) => entry.domain === "sessions")?.evidenceRequirementIds?.includes("hermes.sessions.create.action_contract"), true);
  assert.equal(hermesSupportPayload.data.closureChecklist?.find((entry) => entry.domain === "sessions")?.safeDefault, "keep_lowered_claim_until_upstream_native_contract_exists");
  assert.equal(hermesSupportPayload.data.closureChecklistSummary?.external_pending, 1);
  assert.equal((hermesSupportPayload.data.closureChecklistSummary?.product_blocked ?? 0) > 0, true);
  assert.equal(hermesSupportPayload.data.projectionSummary?.projectedDomainCount, manifest.requiredDomains.length);
  assert.equal(hermesSupportPayload.data.projectionSummary?.unsupportedDomainCount, 0);
  assert.equal(hermesSupportPayload.data.projectionSummary?.byReadProjectionStatus?.projected, 4);
  assert.equal(hermesSupportPayload.data.projectionSummary?.byReadProjectionStatus?.degraded_projection, 9);
  assert.equal(hermesSupportPayload.data.projectionSummary?.productBlockedButProjectedDomainCount, 10);
  assert.equal(hermesSupportPayload.data.projectionSummary?.implementedFacetCounts?.read_projection_contract, manifest.requiredDomains.length);
  assert.equal(hermesSupportPayload.data.projectionSummary?.implementedFacetCounts?.ready_runtime_projection, 3);
  assert.equal(hermesSupportPayload.data.projectionSummary?.implementedFacetCounts?.degraded_runtime_projection, 9);
  assert.equal(hermesSupportPayload.data.projectionSummary?.implementedFacetCounts?.session_list_action, 1);
  assert.equal(hermesSupportPayload.data.projectionSummary?.blockingFacetCounts?.native_action_contract, 1);
  assert.equal(hermesSupportPayload.data.evidenceReadinessSummary?.totalRequirementCount, hermesSupportPayload.data.blockerSummary.evidenceRequirementCount);
  assert.equal(hermesSupportPayload.data.evidenceReadinessSummary?.approvalRequiredCount, 1);
  assert.equal(hermesSupportPayload.data.evidenceReadinessSummary?.externalPendingRequirementIds?.includes("hermes.channels.live_evidence"), true);
  assert.equal(hermesSupportPayload.data.evidenceReadinessSummary?.upstreamContractRequirementIds?.includes("hermes.sessions.create.action_contract"), true);
  assert.equal(hermesSupportPayload.data.evidenceReadinessSummary?.statusCounts?.approval_required, 1);
  assert.equal((hermesSupportPayload.data.evidenceReadinessSummary?.statusCounts?.blocked_until_upstream_contract ?? 0) > 0, true);
  assert.equal(hermesSupportPayload.data.evidenceReadinessSummary?.nextRequiredActions?.includes("approved_redacted_live_evidence"), true);
  assert.equal(hermesSupportPayload.data.evidenceReadinessSummary?.nextRequiredActions?.includes("official_runtime_native_contract_fixture"), true);
  assert.equal(hermesSupportPayload.data.evidenceReadinessSummary?.reentryPolicy, "use_evidence_reentry_packets_before_claim_promotion");
  assert.equal(hermesSupportPayload.data.syncPolicySummary?.domainCount, manifest.requiredDomains.length);
  assert.equal(hermesSupportPayload.data.syncPolicySummary?.externalPendingDomains?.includes("channels"), true);
  assert.equal(hermesSupportPayload.data.syncPolicySummary?.blockedWriteBackDomains?.includes("sessions"), true);
  assert.equal(hermesSupportPayload.data.syncPolicySummary?.localOverlayDomains?.includes("sessions"), true);
  assert.equal(hermesSupportPayload.data.syncPolicySummary?.localOverlayActions?.includes("unpin"), true);
  assert.equal(hermesSupportPayload.data.syncPolicySummary?.readOnlyProjectionDomains?.includes("sessions"), true);
  assert.equal((hermesSupportPayload.data.syncPolicySummary?.writeBackPolicyCounts?.blocked_until_fixture_coverage ?? 0) > 0, true);
  assert.equal(hermesSupportPayload.data.syncPolicySummary?.noSilentOverwrite, true);
  assert.equal(hermesSupportPayload.data.syncPolicySummary?.safeDefault, "project_runtime_state_do_not_sync_or_write_back_without_official_contract");
  assert.equal(hermesSupportPayload.data.promotionGate, "support_claim_remains_unpromoted_until_all_evidence_requirements_are_closed_or_explicitly_product_blocked");
  assert.equal(hermesSupportPayload.data.finalPromotionReview?.status, "unpromoted");
  assert.equal(hermesSupportPayload.data.finalPromotionReview?.claimDisposition, "unpromoted_external_pending");
  assert.equal(hermesSupportPayload.data.finalPromotionReview?.productBlockedByDecisionCount, hermesSupportPayload.data.blockerSummary.productBlockedRequirementCount);
  assert.equal(hermesSupportPayload.data.finalPromotionReview?.externalPendingCount, hermesSupportPayload.data.blockerSummary.byBlockerClass?.external_pending);
  assert.equal(hermesSupportPayload.data.finalPromotionReview?.unresolvedNativeRequirementCount, 0);
  assert.equal(hermesSupportPayload.data.finalPromotionReview?.externalPendingRequirementIds?.includes("hermes.channels.live_evidence"), true);
  assert.equal(hermesSupportPayload.data.finalPromotionReview?.productBlockedRequirementIds?.includes("hermes.sessions.create.action_contract"), true);
  assert.equal(hermesSupportPayload.data.finalPromotionReview?.unresolvedNativeRequirementIds?.length, 0);
  assert.equal(hermesSupportPayload.data.finalPromotionReview?.requiredForPromotion?.includes("keep_lowered_claim_until_upstream_native_contracts_exist"), true);
  assert.equal(hermesSupportPayload.data.finalSupportClaimDecision?.status, "not_promoted");
  assert.equal(hermesSupportPayload.data.finalSupportClaimDecision?.decision, "keep_current_lowered_runtime_ecosystem_claim");
  assert.equal(hermesSupportPayload.data.finalSupportClaimDecision?.effectiveSupportStage, "dev_only");
  assert.equal(hermesSupportPayload.data.finalSupportClaimDecision?.blockedPromotionClaims?.includes("native_parity"), true);
  assert.equal(hermesSupportPayload.data.finalSupportClaimDecision?.blockedPromotionClaims?.includes("write_back"), true);
  assert.equal(hermesSupportPayload.data.finalSupportClaimDecision?.reentryPolicy, "use_evidenceReentryPackets_exactly_before_revisiting_claim");
  assert.equal(hermesSupportPayload.data.finalSupportClaimDecision?.safeDefault, "keep_unpromoted_until_evidence_or_upstream_contract_changes");
  assert.equal(hermesSupportPayload.data.finalSupportClaimDecision?.userVisibleStatus, "runtime_ecosystem_available_but_not_recommended_or_production");
  assert.equal(hermesSupportPayload.data.evidenceReentryPackets?.length, hermesSupportPayload.data.blockerSummary.evidenceRequirementCount);
  assert.equal(hermesSupportPayload.data.evidenceReentryPackets?.find((entry) => entry.requirementId === "hermes.channels.live_evidence")?.status, "approval_required");
  assert.equal(hermesSupportPayload.data.evidenceReentryPackets?.find((entry) => entry.requirementId === "hermes.channels.live_evidence")?.safeDefault, "do_not_run_without_explicit_approval_and_redaction");
  assert.equal(hermesSupportPayload.data.evidenceReentryPackets?.find((entry) => entry.requirementId === "hermes.channels.live_evidence")?.commandShape, "runtime hermes domain channels --json");
  assert.equal(hermesSupportPayload.data.evidenceReentryPackets?.find((entry) => entry.requirementId === "hermes.channels.live_evidence")?.riskControls?.includes("read_only_first"), true);
  assert.equal(hermesSupportPayload.data.evidenceReentryPackets?.find((entry) => entry.requirementId === "hermes.sessions.create.action_contract")?.status, "blocked_until_upstream_contract");
  assert.equal(hermesSupportPayload.data.evidenceReentryPackets?.find((entry) => entry.requirementId === "hermes.sessions.create.action_contract")?.safeDefault, "keep_unpromoted_and_do_not_synthesize_runtime_state");
  assert.equal(hermesSupportPayload.data.evidenceReentryPackets?.find((entry) => entry.requirementId === "hermes.sessions.create.action_contract")?.expectedEvidence?.includes("non_destructive_fixture"), true);

  const hermesSandboxStdout = captureStream();
  const hermesSandboxExit = await runCli(["runtime", "hermes", "domain", "sandboxPermissions", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesSandboxStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(hermesSandboxExit), true);
  const hermesSandboxPayload = JSON.parse(hermesSandboxStdout.getOutput()) as { data: { domain: string; data: { capability?: { supported?: boolean }; supportContract?: { lossPolicy?: string; writeBackAllowed?: boolean } } } };
  assert.equal(hermesSandboxPayload.data.domain, "sandboxPermissions");
  assert.equal(typeof hermesSandboxPayload.data.data.capability?.supported, "boolean");
  assert.equal(hermesSandboxPayload.data.data.supportContract?.lossPolicy, "no_silent_permission_change");
  assert.equal(hermesSandboxPayload.data.data.supportContract?.writeBackAllowed, true);

  const hermesPreviewStdout = captureStream();
  const hermesPreviewExit = await runCli(["runtime", "hermes", "sessions", "preview", "--session-key", "2026/05/21/runtime-session", "--include-content", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesPreviewStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(hermesPreviewExit), true);
  const hermesPreviewPayload = JSON.parse(hermesPreviewStdout.getOutput()) as {
    data: { result: { id: string; found: boolean; contentIncluded: boolean; contentPreview?: string } };
  };
  assert.equal(hermesPreviewPayload.data.result.id, "2026/05/21/runtime-session");
  assert.equal(hermesPreviewPayload.data.result.found, true);
  assert.equal(hermesPreviewPayload.data.result.contentIncluded, true);
  assert.match(hermesPreviewPayload.data.result.contentPreview ?? "", /hermes native preview/);
  assert.equal(hermesPreviewPayload.data.result.contentPreview?.includes("TEST_SECRET_1234567890"), false);

  const hermesResolveStdout = captureStream();
  const hermesResolveExit = await runCli(["runtime", "hermes", "sessions", "resolve", "--session-key", "2026/05/21/runtime-session", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesResolveStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(hermesResolveExit), true);
  const hermesResolvePayload = JSON.parse(hermesResolveStdout.getOutput()) as {
    data: { writesRuntime: boolean; result: { id: string; found: boolean; contentIncluded: boolean; writesRuntime: boolean; nativeIdentifier?: { name?: string } } };
  };
  assert.equal(hermesResolvePayload.data.writesRuntime, false);
  assert.equal(hermesResolvePayload.data.result.id, "2026/05/21/runtime-session");
  assert.equal(hermesResolvePayload.data.result.found, true);
  assert.equal(hermesResolvePayload.data.result.contentIncluded, false);
  assert.equal(hermesResolvePayload.data.result.writesRuntime, false);
  assert.equal(hermesResolvePayload.data.result.nativeIdentifier?.name, "sessionPathId");

  const hermesHistoryMetadataStdout = captureStream();
  const hermesHistoryMetadataExit = await runCli(["runtime", "hermes", "sessions", "history", "--session-key", "2026/05/21/runtime-session", "--limit", "2", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesHistoryMetadataStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(hermesHistoryMetadataExit), true);
  const hermesHistoryMetadataPayload = JSON.parse(hermesHistoryMetadataStdout.getOutput()) as {
    data: { writesRuntime: boolean; result: { found: boolean; contentIncluded: boolean; contentPolicy?: string; messages?: Array<{ contentIncluded?: boolean; contentPreview?: string }>; totalProjected?: number; contentTruncated?: boolean } };
  };
  assert.equal(hermesHistoryMetadataPayload.data.writesRuntime, false);
  assert.equal(hermesHistoryMetadataPayload.data.result.found, true);
  assert.equal(hermesHistoryMetadataPayload.data.result.contentIncluded, false);
  assert.equal(hermesHistoryMetadataPayload.data.result.contentPolicy, "metadata_default_include_content_required");
  assert.equal(hermesHistoryMetadataPayload.data.result.totalProjected, 2);
  assert.equal(hermesHistoryMetadataPayload.data.result.contentTruncated, true);
  assert.equal(hermesHistoryMetadataPayload.data.result.messages?.some((entry) => entry.contentPreview), false);

  const hermesHistoryContentStdout = captureStream();
  const hermesHistoryContentExit = await runCli(["runtime", "hermes", "sessions", "history", "--session-key", "2026/05/21/runtime-session", "--include-content", "--limit", "3", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesHistoryContentStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(hermesHistoryContentExit), true);
  const hermesHistoryContentPayload = JSON.parse(hermesHistoryContentStdout.getOutput()) as {
    data: { result: { contentIncluded: boolean; messages?: Array<{ contentIncluded?: boolean; contentPreview?: string }>; totalProjected?: number } };
  };
  assert.equal(hermesHistoryContentPayload.data.result.contentIncluded, true);
  assert.equal(hermesHistoryContentPayload.data.result.totalProjected, 3);
  assert.equal(hermesHistoryContentPayload.data.result.messages?.some((entry) => entry.contentPreview?.includes("Hermes reply")), true);
  assert.equal(hermesHistoryContentPayload.data.result.messages?.some((entry) => entry.contentPreview?.includes("TEST_SECRET_1234567890")), false);

  const hermesSummaryStdout = captureStream();
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(await runCli(["runtime", "hermes", "summary", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesSummaryStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  })), true);
  const hermesSummaryPayload = JSON.parse(hermesSummaryStdout.getOutput()) as { data: { runtimeId: string; domains?: unknown[]; supportAudit?: { allDomainsAccountedFor?: boolean } } };
  assert.equal(hermesSummaryPayload.data.runtimeId, "hermes");
  assert.equal(hermesSummaryPayload.data.domains?.length, manifest.requiredDomains.length);
  assert.equal(hermesSummaryPayload.data.supportAudit?.allDomainsAccountedFor, true);

  const hermesStatusStdout = captureStream();
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(await runCli(["runtime", "hermes", "status", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesStatusStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  })), true);
  const hermesStatusPayload = JSON.parse(hermesStatusStdout.getOutput()) as { data: { runtimeId: string; status?: { adapter?: string; diagnostics?: { locations?: { homeDir?: string } } } } };
  assert.equal(hermesStatusPayload.data.runtimeId, "hermes");
  assert.equal(hermesStatusPayload.data.status?.adapter, "hermes");
  assert.equal(hermesStatusPayload.data.status?.diagnostics?.locations?.homeDir, hermesHome);

  const hermesSessionDescriptorStdout = captureStream();
  assert.equal(await runCli(["runtime", "hermes", "session", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesSessionDescriptorStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const hermesSessionDescriptorPayload = JSON.parse(hermesSessionDescriptorStdout.getOutput()) as { data: { runtimeId: string; session?: { sessionPath?: string; supportsGateway?: boolean; primaryTransport?: string } } };
  assert.equal(hermesSessionDescriptorPayload.data.runtimeId, "hermes");
  assert.equal(hermesSessionDescriptorPayload.data.session?.sessionPath?.endsWith(".hermes/sessions"), true);
  assert.equal(hermesSessionDescriptorPayload.data.session?.primaryTransport, "gateway");
  assert.equal(hermesSessionDescriptorPayload.data.session?.supportsGateway, true);

  const hermesWorkspaceStdout = captureStream();
  assert.equal(await runCli(["runtime", "hermes", "workspace", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesWorkspaceStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const hermesWorkspacePayload = JSON.parse(hermesWorkspaceStdout.getOutput()) as { data: { runtimeId: string; workspace?: { canonicalPaths?: Record<string, string>; managedFiles?: string[] } } };
  assert.equal(hermesWorkspacePayload.data.runtimeId, "hermes");
  assert.equal(Object.keys(hermesWorkspacePayload.data.workspace?.canonicalPaths ?? {}).includes("SOUL"), true);
  assert.equal(Array.isArray(hermesWorkspacePayload.data.workspace?.managedFiles), true);

  const hermesSessionsListStdout = captureStream();
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(await runCli(["runtime", "hermes", "sessions", "list", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesSessionsListStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  })), true);
  const hermesSessionsListPayload = JSON.parse(hermesSessionsListStdout.getOutput()) as { data: { runtimeId: string; action: string; writesRuntime: boolean; result?: { totalProjected?: number; sessions?: Array<{ id?: string; provenance?: { source?: string } }> } } };
  assert.equal(hermesSessionsListPayload.data.runtimeId, "hermes");
  assert.equal(hermesSessionsListPayload.data.action, "list");
  assert.equal(hermesSessionsListPayload.data.writesRuntime, false);
  assert.equal(hermesSessionsListPayload.data.result?.totalProjected, 1);
  assert.equal(hermesSessionsListPayload.data.result?.sessions?.[0]?.id, "2026/05/21/runtime-session");
  assert.equal(hermesSessionsListPayload.data.result?.sessions?.[0]?.provenance?.source, "runtime-session-store");

  for (const blockedAction of ["send", "inject"]) {
    const blockedStdout = captureStream();
    assert.equal(await runCli(["runtime", "hermes", "sessions", blockedAction, "--session-key", "2026/05/21/runtime-session", "--message", "hello", "--confirm-runtime-write", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
      stdout: blockedStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_DEGRADED);
    const blockedPayload = JSON.parse(blockedStdout.getOutput()) as { data: { runtimeId: string; action: string; status: string; writesRuntime: boolean; reason?: string } };
    assert.equal(blockedPayload.data.runtimeId, "hermes");
    assert.equal(blockedPayload.data.action, blockedAction);
    assert.equal(blockedPayload.data.status, "blocked");
    assert.equal(blockedPayload.data.writesRuntime, false);
    assert.match(blockedPayload.data.reason ?? "", /fixture-backed official/);
  }

  const hermesAbortStdout = captureStream();
  assert.equal(await runCli(["runtime", "hermes", "sessions", "abort", "--session-key", "2026/05/21/runtime-session", "--confirm-runtime-write", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesAbortStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_DEGRADED);
  const hermesAbortPayload = JSON.parse(hermesAbortStdout.getOutput()) as { data: { action: string; status: string; writesRuntime: boolean; reason?: string } };
  assert.equal(hermesAbortPayload.data.action, "abort");
  assert.equal(hermesAbortPayload.data.status, "blocked");
  assert.equal(hermesAbortPayload.data.writesRuntime, false);
  assert.match(hermesAbortPayload.data.reason ?? "", /fixture-backed official abort contract/);

  const hermesCreateStdout = captureStream();
  assert.equal(await runCli(["runtime", "hermes", "sessions", "create", "--title", "Native Draft", "--confirm-runtime-write", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesCreateStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_DEGRADED);
  const hermesCreatePayload = JSON.parse(hermesCreateStdout.getOutput()) as { data: { action: string; status: string; writesRuntime: boolean; wouldWriteRuntime: boolean; createPlan?: { requested?: { title?: string }; rejectedFallbacks?: string[] } } };
  assert.equal(hermesCreatePayload.data.action, "create");
  assert.equal(hermesCreatePayload.data.status, "blocked");
  assert.equal(hermesCreatePayload.data.writesRuntime, false);
  assert.equal(hermesCreatePayload.data.wouldWriteRuntime, true);
  assert.equal(hermesCreatePayload.data.createPlan?.requested?.title, "Native Draft");
  assert.equal(hermesCreatePayload.data.createPlan?.rejectedFallbacks?.includes("do_not_write_directly_to_runtime_store"), true);

  const hermesPinStdout = captureStream();
  assert.equal(await runCli(["runtime", "hermes", "sessions", "pin", "--session-key", "2026/05/21/runtime-session", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesPinStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const hermesPinPayload = JSON.parse(hermesPinStdout.getOutput()) as { data: { action: string; status: string; authority: string; writesRuntime: boolean; writesLocalOverlay: boolean; result?: { pinned?: boolean; overlayThreadId?: string } } };
  assert.equal(hermesPinPayload.data.action, "pin");
  assert.equal(hermesPinPayload.data.status, "local_overlay_applied");
  assert.equal(hermesPinPayload.data.authority, "clawix_local_overlay");
  assert.equal(hermesPinPayload.data.writesRuntime, false);
  assert.equal(hermesPinPayload.data.writesLocalOverlay, true);
  assert.equal(hermesPinPayload.data.result?.pinned, true);
  assert.equal(hermesPinPayload.data.result?.overlayThreadId, "runtime:hermes:sessions:2026%2F05%2F21%2Fruntime-session");

  const hermesConflictsStdout = captureStream();
  assert.equal(await runCli(["runtime", "hermes", "sessions", "conflicts", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesConflictsStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const hermesConflictsPayload = JSON.parse(hermesConflictsStdout.getOutput()) as { data: { action: string; authority: string; writesRuntime: boolean; result?: { totalOverlays?: number; totalConflicts?: number; overlays?: Array<{ id?: string; nativeFound?: boolean; conflictStatus?: string }> } } };
  assert.equal(hermesConflictsPayload.data.action, "conflicts");
  assert.equal(hermesConflictsPayload.data.authority, "clawix_local_overlay");
  assert.equal(hermesConflictsPayload.data.writesRuntime, false);
  assert.equal(hermesConflictsPayload.data.result?.totalOverlays, 1);
  assert.equal(hermesConflictsPayload.data.result?.totalConflicts, 1);
  assert.equal(hermesConflictsPayload.data.result?.overlays?.[0]?.id, "2026/05/21/runtime-session");
  assert.equal(hermesConflictsPayload.data.result?.overlays?.[0]?.nativeFound, true);
  assert.equal(hermesConflictsPayload.data.result?.overlays?.[0]?.conflictStatus, "local_only");

  const hermesUnpinStdout = captureStream();
  assert.equal(await runCli(["runtime", "hermes", "sessions", "unpin", "--session-key", "2026/05/21/runtime-session", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: hermesUnpinStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const hermesUnpinPayload = JSON.parse(hermesUnpinStdout.getOutput()) as { data: { action: string; status: string; writesRuntime: boolean; writesLocalOverlay: boolean; result?: { pinned?: boolean } } };
  assert.equal(hermesUnpinPayload.data.action, "unpin");
  assert.equal(hermesUnpinPayload.data.status, "local_overlay_applied");
  assert.equal(hermesUnpinPayload.data.writesRuntime, false);
  assert.equal(hermesUnpinPayload.data.writesLocalOverlay, true);
  assert.equal(hermesUnpinPayload.data.result?.pinned, false);

  const openclawSessionStdout = captureStream();
  assert.equal(await runCli(["runtime", "openclaw", "session", "--workspace", workspaceRoot, "--json"], {
    stdout: openclawSessionStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const openclawPayload = JSON.parse(openclawSessionStdout.getOutput()) as { data: { session: { supportsGateway?: boolean } } };
  assert.equal(openclawPayload.data.session.supportsGateway, true);

  const { binDir: openclawBinDir, openclawLog } = createFakeOpenClawToolchain();
  await withPatchedEnv({
    PATH: `${openclawBinDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const openclawGatewayResourcesStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "resources", "gateway", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawGatewayResourcesStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawGatewayResourcesPayload = JSON.parse(openclawGatewayResourcesStdout.getOutput()) as {
      data: { domain: string; data: { supportContract?: { officialCommands?: string[]; provenance?: { domain?: string } }; sessions?: unknown[] } };
    };
    assert.equal(openclawGatewayResourcesPayload.data.domain, "gateway");
    assert.equal(openclawGatewayResourcesPayload.data.data.sessions, undefined);
    assert.equal(openclawGatewayResourcesPayload.data.data.supportContract?.officialCommands?.includes("openclaw system event"), true);
    assert.equal(openclawGatewayResourcesPayload.data.data.supportContract?.officialCommands?.includes("openclaw system heartbeat enable"), true);
    assert.equal(openclawGatewayResourcesPayload.data.data.supportContract?.provenance?.domain, "gateway");
    assert.equal(fs.readFileSync(openclawLog, "utf8").includes("sessions.list"), false);

    const openclawSchedulerResourcesStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "resources", "scheduler", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawSchedulerResourcesStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawSchedulerResourcesPayload = JSON.parse(openclawSchedulerResourcesStdout.getOutput()) as {
      data: { domain: string; data: { supportContract?: { officialCommands?: string[]; provenance?: { domain?: string } }; sessions?: unknown[] } };
    };
    assert.equal(openclawSchedulerResourcesPayload.data.domain, "scheduler");
    assert.equal(openclawSchedulerResourcesPayload.data.data.sessions, undefined);
    assert.equal(openclawSchedulerResourcesPayload.data.data.supportContract?.officialCommands?.includes("openclaw tasks list"), true);
    assert.equal(openclawSchedulerResourcesPayload.data.data.supportContract?.officialCommands?.includes("openclaw tasks flow show"), true);
    assert.equal(openclawSchedulerResourcesPayload.data.data.supportContract?.provenance?.domain, "scheduler");

    const openclawPluginsResourcesStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "resources", "plugins", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawPluginsResourcesStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawPluginsResourcesPayload = JSON.parse(openclawPluginsResourcesStdout.getOutput()) as {
      data: { domain: string; data: { supportContract?: { officialCommands?: string[]; provenance?: { domain?: string } }; sessions?: unknown[] } };
    };
    assert.equal(openclawPluginsResourcesPayload.data.domain, "plugins");
    assert.equal(openclawPluginsResourcesPayload.data.data.sessions, undefined);
    assert.equal(openclawPluginsResourcesPayload.data.data.supportContract?.officialCommands?.includes("openclaw hooks list"), true);
    assert.equal(openclawPluginsResourcesPayload.data.data.supportContract?.officialCommands?.includes("openclaw hooks update"), true);
    assert.equal(openclawPluginsResourcesPayload.data.data.supportContract?.provenance?.domain, "plugins");

    const openclawSessionsStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "list", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawSessionsStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawSessionsPayload = JSON.parse(openclawSessionsStdout.getOutput()) as {
      data: {
        action: string;
        result: { sessions: Array<{ id: string; title: string; nativeIdentifier?: { name?: string } }> };
        writesRuntime: boolean;
      };
    };
    assert.equal(openclawSessionsPayload.data.action, "list");
    assert.equal(openclawSessionsPayload.data.result.sessions[0]?.id, "alpha");
    assert.equal(openclawSessionsPayload.data.result.sessions[0]?.nativeIdentifier?.name, "sessionKey");
    assert.equal(openclawSessionsPayload.data.writesRuntime, false);

    const openclawPreviewStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "preview", "--session-key", "alpha", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawPreviewStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawPreviewPayload = JSON.parse(openclawPreviewStdout.getOutput()) as {
      data: {
        action: string;
        result: { id: string; title: string; preview: string; nativeIdentifier?: { name?: string } };
        writesRuntime: boolean;
      };
    };
    assert.equal(openclawPreviewPayload.data.action, "preview");
    assert.equal(openclawPreviewPayload.data.result.id, "alpha");
    assert.equal(openclawPreviewPayload.data.result.title, "Native Alpha");
    assert.equal(openclawPreviewPayload.data.result.preview, "hello from native");
    assert.equal(openclawPreviewPayload.data.result.nativeIdentifier?.name, "sessionKey");
    assert.equal(openclawPreviewPayload.data.writesRuntime, false);

    const openclawResolveStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "resolve", "--session-key", "alpha", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawResolveStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawResolvePayload = JSON.parse(openclawResolveStdout.getOutput()) as {
      data: {
        action: string;
        result: { id: string; found: boolean; nativeIdentifier?: { name?: string } };
        writesRuntime: boolean;
      };
    };
    assert.equal(openclawResolvePayload.data.action, "resolve");
    assert.equal(openclawResolvePayload.data.result.id, "alpha");
    assert.equal(openclawResolvePayload.data.result.found, true);
    assert.equal(openclawResolvePayload.data.result.nativeIdentifier?.name, "sessionKey");
    assert.equal(openclawResolvePayload.data.writesRuntime, false);

    const openclawHistoryStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "history", "--session-key", "alpha", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawHistoryStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawHistoryPayload = JSON.parse(openclawHistoryStdout.getOutput()) as {
      data: {
        action: string;
        result: { id: string; messages: Array<{ role: string; content: string }>; nativeIdentifier?: { name?: string } };
        writesRuntime: boolean;
      };
    };
    assert.equal(openclawHistoryPayload.data.action, "history");
    assert.equal(openclawHistoryPayload.data.result.id, "alpha");
    assert.equal(openclawHistoryPayload.data.result.messages[0]?.content, "hello from native");
    assert.equal(openclawHistoryPayload.data.result.nativeIdentifier?.name, "sessionKey");
    assert.equal(openclawHistoryPayload.data.writesRuntime, false);

    const openclawSendPreviewStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "send", "--session-key", "alpha", "--message", "hello", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawSendPreviewStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_DEGRADED);
    const openclawSendPreviewPayload = JSON.parse(openclawSendPreviewStdout.getOutput()) as {
      data: { action: string; status: string; writesRuntime: boolean; wouldWriteRuntime: boolean; requiredFlag: string };
    };
    assert.equal(openclawSendPreviewPayload.data.action, "send");
    assert.equal(openclawSendPreviewPayload.data.status, "confirmation_required");
    assert.equal(openclawSendPreviewPayload.data.writesRuntime, false);
    assert.equal(openclawSendPreviewPayload.data.wouldWriteRuntime, true);
    assert.equal(openclawSendPreviewPayload.data.requiredFlag, "--confirm-runtime-write");

    const openclawSendStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "send", "--session-key", "alpha", "--message", "hello", "--confirm-runtime-write", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawSendStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawSendPayload = JSON.parse(openclawSendStdout.getOutput()) as {
      data: {
        action: string;
        result: { id: string; accepted: boolean; runId: string; nativeIdentifier?: { name?: string } };
        writesRuntime: boolean;
      };
    };
    assert.equal(openclawSendPayload.data.action, "send");
    assert.equal(openclawSendPayload.data.result.id, "alpha");
    assert.equal(openclawSendPayload.data.result.accepted, true);
    assert.equal(openclawSendPayload.data.result.runId, "run-alpha");
    assert.equal(openclawSendPayload.data.result.nativeIdentifier?.name, "sessionKey");
    assert.equal(openclawSendPayload.data.writesRuntime, true);

    const openclawInjectPreviewStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "inject", "--session-key", "alpha", "--message", "system note", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawInjectPreviewStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_DEGRADED);
    const openclawInjectPreviewPayload = JSON.parse(openclawInjectPreviewStdout.getOutput()) as {
      data: { action: string; status: string; writesRuntime: boolean; wouldWriteRuntime: boolean; requiredFlag: string };
    };
    assert.equal(openclawInjectPreviewPayload.data.action, "inject");
    assert.equal(openclawInjectPreviewPayload.data.status, "confirmation_required");
    assert.equal(openclawInjectPreviewPayload.data.writesRuntime, false);
    assert.equal(openclawInjectPreviewPayload.data.wouldWriteRuntime, true);
    assert.equal(openclawInjectPreviewPayload.data.requiredFlag, "--confirm-runtime-write");

    const openclawInjectStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "inject", "--session-key", "alpha", "--message", "system note", "--confirm-runtime-write", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawInjectStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawInjectPayload = JSON.parse(openclawInjectStdout.getOutput()) as {
      data: {
        action: string;
        result: { id: string; accepted: boolean; messageId: string; nativeIdentifier?: { name?: string } };
        writesRuntime: boolean;
      };
    };
    assert.equal(openclawInjectPayload.data.action, "inject");
    assert.equal(openclawInjectPayload.data.result.id, "alpha");
    assert.equal(openclawInjectPayload.data.result.accepted, true);
    assert.equal(openclawInjectPayload.data.result.messageId, "msg-alpha");
    assert.equal(openclawInjectPayload.data.result.nativeIdentifier?.name, "sessionKey");
    assert.equal(openclawInjectPayload.data.writesRuntime, true);

    const openclawAbortPreviewStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "abort", "--session-key", "alpha", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawAbortPreviewStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_DEGRADED);
    const openclawAbortPreviewPayload = JSON.parse(openclawAbortPreviewStdout.getOutput()) as {
      data: { action: string; status: string; writesRuntime: boolean; wouldWriteRuntime: boolean; requiredFlag: string };
    };
    assert.equal(openclawAbortPreviewPayload.data.action, "abort");
    assert.equal(openclawAbortPreviewPayload.data.status, "confirmation_required");
    assert.equal(openclawAbortPreviewPayload.data.writesRuntime, false);
    assert.equal(openclawAbortPreviewPayload.data.wouldWriteRuntime, true);
    assert.equal(openclawAbortPreviewPayload.data.requiredFlag, "--confirm-runtime-write");

    const openclawAbortStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "abort", "--session-key", "alpha", "--confirm-runtime-write", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawAbortStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawAbortPayload = JSON.parse(openclawAbortStdout.getOutput()) as {
      data: {
        action: string;
        result: { id: string; accepted: boolean; runId: string; nativeIdentifier?: { name?: string } };
        writesRuntime: boolean;
      };
    };
    assert.equal(openclawAbortPayload.data.action, "abort");
    assert.equal(openclawAbortPayload.data.result.id, "alpha");
    assert.equal(openclawAbortPayload.data.result.accepted, true);
    assert.equal(openclawAbortPayload.data.result.runId, "run-alpha");
    assert.equal(openclawAbortPayload.data.result.nativeIdentifier?.name, "sessionKey");
    assert.equal(openclawAbortPayload.data.writesRuntime, true);

    const openclawPinStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "pin", "--session-key", "alpha", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawPinStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawPinPayload = JSON.parse(openclawPinStdout.getOutput()) as {
      data: {
        action: string;
        status: string;
        writesRuntime: boolean;
        writesLocalOverlay: boolean;
        result: { id: string; overlayThreadId: string; pinned: boolean; receipt: { status: string; hostId: string } };
      };
    };
    assert.equal(openclawPinPayload.data.action, "pin");
    assert.equal(openclawPinPayload.data.status, "local_overlay_applied");
    assert.equal(openclawPinPayload.data.writesRuntime, false);
    assert.equal(openclawPinPayload.data.writesLocalOverlay, true);
    assert.equal(openclawPinPayload.data.result.id, "alpha");
    assert.equal(openclawPinPayload.data.result.overlayThreadId, "runtime:openclaw:sessions:alpha");
    assert.equal(openclawPinPayload.data.result.pinned, true);
    assert.equal(openclawPinPayload.data.result.receipt.status, "applied");
    assert.equal(openclawPinPayload.data.result.receipt.hostId, "runtime-portal");

    const openclawPinnedListStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "list", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawPinnedListStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawPinnedListPayload = JSON.parse(openclawPinnedListStdout.getOutput()) as {
      data: { result: { sessions: Array<{ id: string; pinned: boolean; pinAuthority?: string; divergence?: string; localOverlay?: { pinned?: boolean; writesRuntime?: boolean } }> } };
    };
    assert.equal(openclawPinnedListPayload.data.result.sessions.find((entry) => entry.id === "alpha")?.pinned, true);
    assert.equal(openclawPinnedListPayload.data.result.sessions.find((entry) => entry.id === "alpha")?.pinAuthority, "clawix_local_overlay");
    assert.equal(openclawPinnedListPayload.data.result.sessions.find((entry) => entry.id === "alpha")?.divergence, "local_overlay_not_written_to_runtime");
    assert.equal(openclawPinnedListPayload.data.result.sessions.find((entry) => entry.id === "alpha")?.localOverlay?.writesRuntime, false);

    const openclawDomainsWithSessionsStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "domains", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawDomainsWithSessionsStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawDomainsWithSessionsPayload = JSON.parse(openclawDomainsWithSessionsStdout.getOutput()) as {
      data: {
        support?: {
          adapter?: { supportLevel?: string; recommended?: boolean };
          ecosystem?: { supportStage?: string; recommended?: boolean; production?: boolean; uiParityClaim?: string; blockedWriteBackDomains?: string[]; externalPendingDomains?: string[] };
        };
        commands?: {
          executableByClawCli?: Array<{ command: string; writesRuntime?: boolean; wouldWriteRuntime?: boolean; delegatesTo?: string }>;
        };
        supportAudit?: {
          closureState?: string;
          supportComplete?: boolean;
          blockerSummary?: {
            directBlockerDomains?: string[];
            evidenceRequirementCount?: number;
          };
          domains?: Array<{ domain: string; evidenceRequirementIds?: string[] }>;
        };
        domainData: {
          sessions?: {
            actionContracts?: Array<{ action: string; status: string; writesRuntime: boolean; wouldWriteRuntime?: boolean; authority: string; requiredEvidence?: string[] }>;
            sessions?: Array<{ id: string; pinned: boolean; nativeIdentifier?: { name?: string } }>;
            overlayState?: {
              writesRuntime: boolean;
              writeBackStatus: string;
              conflictPolicy: string;
              totalConflicts: number;
              overlays: Array<{ id: string; conflictStatus: string; nativeFound: boolean; writesRuntime: boolean }>;
            };
          };
        };
        domains: Array<{ domain: string; count?: number; officialCommands?: string[] }>;
      };
    };
    assert.equal(openclawDomainsWithSessionsPayload.data.support?.adapter?.supportLevel, "production");
    assert.equal(openclawDomainsWithSessionsPayload.data.support?.adapter?.recommended, true);
    assert.equal(openclawDomainsWithSessionsPayload.data.support?.ecosystem?.supportStage, "operable");
    assert.equal(openclawDomainsWithSessionsPayload.data.support?.ecosystem?.recommended, false);
    assert.equal(openclawDomainsWithSessionsPayload.data.support?.ecosystem?.production, false);
    assert.equal(openclawDomainsWithSessionsPayload.data.support?.ecosystem?.uiParityClaim, "partial_runtime_lens");
    assert.equal(openclawDomainsWithSessionsPayload.data.support?.ecosystem?.blockedWriteBackDomains?.includes("memory"), true);
    assert.equal(openclawDomainsWithSessionsPayload.data.supportAudit?.closureState, "blocked");
    assert.equal(openclawDomainsWithSessionsPayload.data.supportAudit?.supportComplete, false);
    assert.equal(openclawDomainsWithSessionsPayload.data.supportAudit?.blockerSummary?.directBlockerDomains?.includes("sessions"), true);
    assert.equal(openclawDomainsWithSessionsPayload.data.supportAudit?.domains?.find((entry) => entry.domain === "sessions")?.evidenceRequirementIds?.includes("openclaw.sessions.pin.native_write_back_contract"), true);
    assert.equal(openclawDomainsWithSessionsPayload.data.commands?.executableByClawCli?.find((entry) => entry.command === "runtime openclaw sessions inject --session-key <id> --message <text> --confirm-runtime-write")?.delegatesTo, "runtime.openclaw.chat.inject");
    assert.equal(openclawDomainsWithSessionsPayload.data.commands?.executableByClawCli?.find((entry) => entry.command === "runtime openclaw sessions abort --session-key <id> --confirm-runtime-write")?.writesRuntime, true);
    assert.equal(openclawDomainsWithSessionsPayload.data.domainData.sessions?.sessions?.[0]?.id, "alpha");
    assert.equal(openclawDomainsWithSessionsPayload.data.domainData.sessions?.sessions?.[0]?.pinned, true);
    assert.equal(openclawDomainsWithSessionsPayload.data.domainData.sessions?.sessions?.[0]?.nativeIdentifier?.name, "sessionKey");
    assert.deepEqual(openclawDomainsWithSessionsPayload.data.domainData.sessions?.actionContracts?.map((entry) => entry.action), manifest.sessionActionContracts.openclaw.map((entry) => entry.action));
    assert.equal(openclawDomainsWithSessionsPayload.data.domainData.sessions?.actionContracts?.find((entry) => entry.action === "send")?.writesRuntime, true);
    assert.equal(openclawDomainsWithSessionsPayload.data.domainData.sessions?.actionContracts?.find((entry) => entry.action === "create")?.wouldWriteRuntime, true);
    assert.equal(openclawDomainsWithSessionsPayload.data.domainData.sessions?.actionContracts?.find((entry) => entry.action === "pin")?.authority, "clawix_local_overlay");
    assert.equal(openclawDomainsWithSessionsPayload.data.domains.find((entry) => entry.domain === "sessions")?.officialCommands?.includes("openclaw sessions --json"), true);
    assert.equal(openclawDomainsWithSessionsPayload.data.domains.find((entry) => entry.domain === "sessions")?.officialCommands?.includes("openclaw sessions cleanup --dry-run"), true);
    assert.equal(openclawDomainsWithSessionsPayload.data.domains.find((entry) => entry.domain === "sessions")?.officialCommands?.includes("openclaw sessions show"), false);
    assert.equal(openclawDomainsWithSessionsPayload.data.domains.find((entry) => entry.domain === "sessions")?.count, 1);
    assert.equal(openclawDomainsWithSessionsPayload.data.domainData.sessions?.overlayState?.writesRuntime, false);
    assert.equal(openclawDomainsWithSessionsPayload.data.domainData.sessions?.overlayState?.writeBackStatus, "blocked_until_official_runtime_pin_api");
    assert.equal(openclawDomainsWithSessionsPayload.data.domainData.sessions?.overlayState?.conflictPolicy, "no_silent_overwrite");
    assert.equal(openclawDomainsWithSessionsPayload.data.domainData.sessions?.overlayState?.totalConflicts, 1);
    assert.equal(openclawDomainsWithSessionsPayload.data.domainData.sessions?.overlayState?.overlays[0]?.id, "alpha");
    assert.equal(openclawDomainsWithSessionsPayload.data.domainData.sessions?.overlayState?.overlays[0]?.conflictStatus, "local_only");
    assert.equal(openclawDomainsWithSessionsPayload.data.domainData.sessions?.overlayState?.overlays[0]?.nativeFound, true);
    assert.equal(openclawDomainsWithSessionsPayload.data.domainData.sessions?.overlayState?.overlays[0]?.writesRuntime, false);

    const openclawConflictsStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "conflicts", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawConflictsStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawConflictsPayload = JSON.parse(openclawConflictsStdout.getOutput()) as {
      data: { result: { overlays: Array<{ id: string; conflictStatus: string }>; totalConflicts: number; writesRuntime: boolean } };
    };
    assert.equal(openclawConflictsPayload.data.result.writesRuntime, false);
    assert.equal(openclawConflictsPayload.data.result.totalConflicts, 1);
    assert.equal(openclawConflictsPayload.data.result.overlays[0]?.conflictStatus, "local_only");

    const pinnedProjectionStdout = captureStream();
    assert.equal(await runCli(["host", "app-state", "projection", "--workspace", workspaceRoot, "--json"], {
      stdout: pinnedProjectionStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const pinnedProjectionPayload = JSON.parse(pinnedProjectionStdout.getOutput()) as {
      data: { pinnedThreads: Array<{ threadId: string }>; receipts: Array<{ hostId: string }> };
    };
    assert.equal(pinnedProjectionPayload.data.pinnedThreads.some((entry) => entry.threadId === "runtime:openclaw:sessions:alpha"), true);
    assert.equal(pinnedProjectionPayload.data.receipts[0]?.hostId, "runtime-portal");

    const openclawUnpinStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "unpin", "--session-key", "alpha", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawUnpinStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawUnpinPayload = JSON.parse(openclawUnpinStdout.getOutput()) as {
      data: { action: string; status: string; writesRuntime: boolean; writesLocalOverlay: boolean; result: { overlayThreadId: string; pinned: boolean } };
    };
    assert.equal(openclawUnpinPayload.data.action, "unpin");
    assert.equal(openclawUnpinPayload.data.status, "local_overlay_applied");
    assert.equal(openclawUnpinPayload.data.writesRuntime, false);
    assert.equal(openclawUnpinPayload.data.writesLocalOverlay, true);
    assert.equal(openclawUnpinPayload.data.result.overlayThreadId, "runtime:openclaw:sessions:alpha");
    assert.equal(openclawUnpinPayload.data.result.pinned, false);

    const openclawUnpinnedListStdout = captureStream();
    assert.equal(await runCli(["runtime", "openclaw", "sessions", "list", "--workspace", workspaceRoot, "--json"], {
      stdout: openclawUnpinnedListStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const openclawUnpinnedListPayload = JSON.parse(openclawUnpinnedListStdout.getOutput()) as {
      data: { result: { sessions: Array<{ id: string; pinned: boolean; divergence?: string }> } };
    };
    assert.equal(openclawUnpinnedListPayload.data.result.sessions.find((entry) => entry.id === "alpha")?.pinned, false);
    assert.equal(openclawUnpinnedListPayload.data.result.sessions.find((entry) => entry.id === "alpha")?.divergence, "none");

    const unpinnedProjectionStdout = captureStream();
    assert.equal(await runCli(["host", "app-state", "projection", "--workspace", workspaceRoot, "--json"], {
      stdout: unpinnedProjectionStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const unpinnedProjectionPayload = JSON.parse(unpinnedProjectionStdout.getOutput()) as {
      data: { pinnedThreads: Array<{ threadId: string }> };
    };
    assert.equal(unpinnedProjectionPayload.data.pinnedThreads.some((entry) => entry.threadId === "runtime:openclaw:sessions:alpha"), false);
  });
}, 180_000);

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
}, 180_000);
