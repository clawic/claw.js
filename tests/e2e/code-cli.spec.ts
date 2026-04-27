import fs from "fs";
import os from "os";
import path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";

import { expect, test } from "./fixtures";

const execFileAsync = promisify(execFile);

function cliPath(rootDir: string) {
  return path.join(rootDir, "packages", "clawjs", "bin", "clawjs.mjs");
}

async function run(rootDir: string, repoDir: string, args: string[], options: { reject?: boolean; env?: NodeJS.ProcessEnv } = {}) {
  try {
    return await execFileAsync(process.execPath, [cliPath(rootDir), ...args], {
      cwd: repoDir,
      env: { ...process.env, ...options.env },
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    if (options.reject === false && error && typeof error === "object" && "stdout" in error && "stderr" in error) {
      return error as { stdout: string; stderr: string };
    }
    throw error;
  }
}

async function git(repoDir: string, args: string[]) {
  return await execFileAsync("git", args, { cwd: repoDir });
}

async function createRepo(parentDir?: string, name?: string) {
  const repoDir = parentDir && name
    ? path.join(parentDir, name)
    : fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-code-e2e-"));
  fs.mkdirSync(repoDir, { recursive: true });
  await git(repoDir, ["init"]);
  fs.writeFileSync(path.join(repoDir, "README.md"), "code e2e\n");
  await git(repoDir, ["add", "README.md"]);
  await git(repoDir, ["-c", "user.name=Test", "-c", "user.email=test@example.local", "commit", "-m", "chore(repo): seed"]);
  return fs.realpathSync(repoDir);
}

function parseJson<T>(stdout: string): T {
  return JSON.parse(stdout) as T;
}

async function startCodeServer(rootDir: string, cwd: string, env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [cliPath(rootDir), "code", "serve", "--host", "127.0.0.1", "--port", "0", "--json"], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start: ${stderr}`)), 15_000);
    child.stdout.on("data", () => {
      const firstLine = stdout.split(/\r?\n/).find(Boolean);
      if (!firstLine) return;
      clearTimeout(timer);
      try {
        resolve((JSON.parse(firstLine) as { url: string }).url);
      } catch (error) {
        reject(error);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}: ${stderr}`));
    });
  });
  return {
    url,
    close: async () => {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    },
  };
}

test("code cli runs an isolated intent through evidence, checks, review, commit, queue, and integration", async () => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const repoDir = await createRepo();

  const init = parseJson<{ repository: { id: string } }>((await run(rootDir, repoDir, ["code", "init", "--json"])).stdout);
  expect(init.repository.id).toBeTruthy();
  const policy = parseJson<{ policy: { policy: { mode: string; checks: { requiredNames: string[] } } } }>((await run(rootDir, repoDir, ["code", "policy", "show", "--json"])).stdout);
  expect(policy.policy.policy.mode).toBe("strict");
  expect(policy.policy.policy.checks.requiredNames).toContain("e2e");

  const started = parseJson<{ intent: { id: string; worktreePath: string; branch: string } }>((await run(rootDir, repoDir, [
    "code", "start",
    "--kind", "fix",
    "--scope", "auth",
    "--title", "handle missing token",
    "--path", "src/auth.ts",
    "--agent-id", "test-agent",
    "--json",
  ])).stdout);

  fs.mkdirSync(path.join(started.intent.worktreePath, "src"), { recursive: true });
  fs.writeFileSync(path.join(started.intent.worktreePath, "src", "auth.ts"), "export const authStatus = 'handled';\n");

  const evidence = parseJson<{ evidence: { id: string } }>((await run(rootDir, repoDir, [
    "code", "evidence", "add",
    "--intent", started.intent.id,
    "--label", "manual temp repo verification",
    "--path", "src/auth.ts",
    "--json",
  ])).stdout);
  expect(evidence.evidence.id).toContain("evidence_");

  const check = parseJson<{ check: { status: string } }>((await run(rootDir, repoDir, [
    "code", "check", "run",
    "--intent", started.intent.id,
    "--name", "e2e",
    "--command", "node -e \"process.exit(0)\"",
    "--json",
  ])).stdout);
  expect(check.check.status).toBe("passed");

  const sync = parseJson<{ sync: { status: string; payload: { head: string } } }>((await run(rootDir, repoDir, [
    "code", "sync", "github",
    "--intent", started.intent.id,
    "--dry-run",
    "--json",
  ])).stdout);
  expect(sync.sync.status).toBe("planned");
  expect(sync.sync.payload.head).toBe(started.intent.branch);

  const committed = parseJson<{ commitSha: string; message: string }>((await run(rootDir, repoDir, [
    "code", "commit",
    "--intent", started.intent.id,
    "--json",
  ])).stdout);
  expect(committed.commitSha).toHaveLength(40);
  expect(committed.message).toContain("fix(auth): handle missing token");
  expect(committed.message).toContain(`Change-Intent: ${started.intent.id}`);

  await run(rootDir, repoDir, [
    "code", "review", "approve",
    "--intent", started.intent.id,
    "--reviewer", "human-owner",
    "--json",
  ]);
  const gate = parseJson<{ gate: { status: string; effectiveRisk: string } }>((await run(rootDir, repoDir, ["code", "gate", "--intent", started.intent.id, "--json"])).stdout);
  expect(gate.gate.status).toBe("passed");
  expect(gate.gate.effectiveRisk).toBe("medium");
  await run(rootDir, repoDir, ["code", "queue", "--intent", started.intent.id, "--json"]);
  const integrated = parseJson<{ integrationSha: string; intent: { status: string } }>((await run(rootDir, repoDir, [
    "code", "integrate",
    "--intent", started.intent.id,
    "--json",
  ])).stdout);

  expect(integrated.integrationSha).toBe(committed.commitSha);
  expect(integrated.intent.status).toBe("integrated");
  expect(fs.readFileSync(path.join(repoDir, "src", "auth.ts"), "utf8")).toContain("handled");

  const log = (await git(repoDir, ["log", "-1", "--pretty=%B"])).stdout;
  expect(log).toContain("fix(auth): handle missing token");
  expect(log).toContain(`Evidence: ${evidence.evidence.id}`);
});

test("code cli blocks overlapping active reservations before a second agent starts", async () => {
  const rootDir = process.cwd();
  const repoDir = await createRepo();

  await run(rootDir, repoDir, [
    "code", "start",
    "--kind", "feat",
    "--scope", "billing",
    "--title", "add invoice export",
    "--path", "src/billing",
    "--json",
  ]);

  const conflict = await run(rootDir, repoDir, [
    "code", "start",
    "--kind", "fix",
    "--scope", "billing",
    "--title", "repair invoice total",
    "--path", "src/billing/totals.ts",
    "--json",
  ], { reject: false });
  expect(conflict.stdout).toContain("Code reservation conflict");
});

test("code cli refuses integration while the latest required check is failed", async () => {
  const rootDir = process.cwd();
  const repoDir = await createRepo();

  const started = parseJson<{ intent: { id: string; worktreePath: string } }>((await run(rootDir, repoDir, [
    "code", "start",
    "--kind", "test",
    "--scope", "checkout",
    "--title", "cover checkout flow",
    "--json",
  ])).stdout);
  fs.mkdirSync(path.join(started.intent.worktreePath, "test"), { recursive: true });
  fs.writeFileSync(path.join(started.intent.worktreePath, "test", "checkout.test.ts"), "export const covered = true;\n");
  await run(rootDir, repoDir, [
    "code", "evidence", "add",
    "--intent", started.intent.id,
    "--label", "checkout e2e evidence",
    "--path", "test/checkout.test.ts",
    "--json",
  ]);

  await run(rootDir, repoDir, [
    "code", "check", "record",
    "--intent", started.intent.id,
    "--name", "e2e",
    "--status", "failed",
    "--json",
  ]);
  await run(rootDir, repoDir, ["code", "commit", "--intent", started.intent.id, "--json"]);
  await run(rootDir, repoDir, [
    "code", "review", "approve",
    "--intent", started.intent.id,
    "--reviewer", "human-owner",
    "--json",
  ]);

  const blocked = await run(rootDir, repoDir, ["code", "queue", "--intent", started.intent.id, "--json"], { reject: false });
  expect(blocked.stdout).toContain("Integration blocked by failed checks: e2e");

  await run(rootDir, repoDir, [
    "code", "check", "record",
    "--intent", started.intent.id,
    "--name", "e2e",
    "--status", "passed",
    "--json",
  ]);
  const queued = parseJson<{ queue: { status: string } }>((await run(rootDir, repoDir, ["code", "queue", "--intent", started.intent.id, "--json"])).stdout);
  expect(queued.queue.status).toBe("queued");
});

test("code integration gate blocks stale base and merge conflicts before queueing", async () => {
  const rootDir = process.cwd();
  const repoDir = await createRepo();

  const started = parseJson<{ intent: { id: string; worktreePath: string } }>((await run(rootDir, repoDir, [
    "code", "start",
    "--kind", "fix",
    "--scope", "readme",
    "--title", "update readme",
    "--path", "README.md",
    "--json",
  ])).stdout);
  fs.writeFileSync(path.join(started.intent.worktreePath, "README.md"), "agent change\n");
  await run(rootDir, repoDir, ["code", "evidence", "add", "--intent", started.intent.id, "--label", "readme evidence", "--path", "README.md", "--json"]);
  await run(rootDir, repoDir, ["code", "check", "record", "--intent", started.intent.id, "--name", "e2e", "--status", "passed", "--json"]);
  await run(rootDir, repoDir, ["code", "commit", "--intent", started.intent.id, "--json"]);
  await run(rootDir, repoDir, ["code", "review", "approve", "--intent", started.intent.id, "--reviewer", "human-owner", "--json"]);

  fs.writeFileSync(path.join(repoDir, "README.md"), "base change\n");
  await git(repoDir, ["add", "README.md"]);
  await git(repoDir, ["-c", "user.name=Test", "-c", "user.email=test@example.local", "commit", "-m", "docs(readme): update base"]);

  const blocked = await run(rootDir, repoDir, ["code", "gate", "--intent", started.intent.id, "--json"], { reject: false });
  expect(blocked.stdout).toContain("Base branch is stale");
  expect(blocked.stdout).toContain("Merge simulation failed");
  const queued = await run(rootDir, repoDir, ["code", "queue", "--intent", started.intent.id, "--json"], { reject: false });
  expect(queued.stdout).toContain("Base branch is stale");
});

test("code integration gate enforces evidence and high-risk human review", async () => {
  const rootDir = process.cwd();
  const repoDir = await createRepo();
  const policy = parseJson<{ policy: { policy: Record<string, unknown> } }>((await run(rootDir, repoDir, ["code", "policy", "show", "--json"])).stdout).policy.policy;
  const nextPolicy = {
    ...policy,
    risk: {
      ...(policy.risk as Record<string, unknown>),
      criticalPaths: ["src/critical/"],
    },
  };
  await run(rootDir, repoDir, ["code", "policy", "set", "--policy-json", JSON.stringify(nextPolicy), "--json"]);

  const started = parseJson<{ intent: { id: string; worktreePath: string } }>((await run(rootDir, repoDir, [
    "code", "start",
    "--kind", "feat",
    "--scope", "payments",
    "--title", "add critical payment hook",
    "--path", "src/critical/payments.ts",
    "--agent-id", "agent-risk",
    "--json",
  ])).stdout);
  fs.mkdirSync(path.join(started.intent.worktreePath, "src", "critical"), { recursive: true });
  fs.writeFileSync(path.join(started.intent.worktreePath, "src", "critical", "payments.ts"), "export const criticalPayment = true;\n");
  await run(rootDir, repoDir, ["code", "check", "record", "--intent", started.intent.id, "--name", "e2e", "--status", "passed", "--json"]);
  await run(rootDir, repoDir, ["code", "commit", "--intent", started.intent.id, "--json"]);
  await run(rootDir, repoDir, ["code", "review", "approve", "--intent", started.intent.id, "--reviewer", "agent-risk", "--json"]);

  const missingEvidence = await run(rootDir, repoDir, ["code", "gate", "--intent", started.intent.id, "--json"], { reject: false });
  expect(missingEvidence.stdout).toContain("Integration requires at least 2 evidence item");
  expect(missingEvidence.stdout).toContain("High risk integration requires human review");

  await run(rootDir, repoDir, ["code", "evidence", "add", "--intent", started.intent.id, "--label", "risk test", "--path", "src/critical/payments.ts", "--json"]);
  await run(rootDir, repoDir, ["code", "evidence", "add", "--intent", started.intent.id, "--label", "risk screenshot", "--url", "https://example.local/evidence", "--json"]);
  await run(rootDir, repoDir, ["code", "review", "approve", "--intent", started.intent.id, "--reviewer", "human-owner", "--json"]);
  const passed = parseJson<{ gate: { status: string; effectiveRisk: string } }>((await run(rootDir, repoDir, ["code", "gate", "--intent", started.intent.id, "--json"])).stdout);
  expect(passed.gate.status).toBe("passed");
  expect(passed.gate.effectiveRisk).toBe("high");
});

test("code cli coordinates projects, agents, global queue, and project-scoped integration", async () => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-code-global-"));
  const codeHome = path.join(tempRoot, "code-home");
  const projectsRoot = path.join(tempRoot, "projects");
  const appRepo = await createRepo(projectsRoot, "app");
  const apiRepo = await createRepo(projectsRoot, "api");
  const env = { CLAWJS_CODE_HOME: codeHome };

  const added = parseJson<{ project: { id: string; status: string } }>((await run(rootDir, tempRoot, [
    "code", "projects", "add", appRepo,
    "--id", "app",
    "--name", "App",
    "--json",
  ], { env })).stdout);
  expect(added.project.id).toBe("app");
  expect(added.project.status).toBe("uninitialized");

  const discovered = parseJson<{ projects: Array<{ id: string; rootDir: string }> }>((await run(rootDir, tempRoot, [
    "code", "projects", "discover", projectsRoot,
    "--max-depth", "2",
    "--json",
  ], { env })).stdout);
  expect(discovered.projects.some((project) => project.rootDir === apiRepo)).toBeTruthy();

  await run(rootDir, tempRoot, ["code", "init", "--project", "app", "--json"], { env });
  const apiProject = discovered.projects.find((project) => project.rootDir === apiRepo)!;
  await run(rootDir, tempRoot, ["code", "init", "--project", apiProject.id, "--json"], { env });

  const appIntent = parseJson<{ intent: { id: string; worktreePath: string } }>((await run(rootDir, tempRoot, [
    "code", "start",
    "--project", "app",
    "--kind", "fix",
    "--scope", "login",
    "--title", "repair callback",
    "--path", "src/login.ts",
    "--agent-id", "agent-app",
    "--json",
  ], { env })).stdout);
  const apiIntent = parseJson<{ intent: { id: string } }>((await run(rootDir, tempRoot, [
    "code", "start",
    "--project", apiProject.id,
    "--kind", "feat",
    "--scope", "billing",
    "--title", "add invoice hook",
    "--agent-id", "agent-api",
    "--json",
  ], { env })).stdout);
  expect(apiIntent.intent.id).toContain("intent_");

  const agents = parseJson<{ agents: Array<{ id: string; status: string; projectId: string }> }>((await run(rootDir, tempRoot, [
    "code", "agents", "list",
    "--json",
  ], { env })).stdout);
  expect(agents.agents.find((agent) => agent.id === "agent-app")?.status).toBe("working");

  const staleAgents = parseJson<{ agents: Array<{ id: string; status: string }> }>((await run(rootDir, tempRoot, [
    "code", "agents", "list",
    "--offline-after-ms", "-1",
    "--json",
  ], { env })).stdout);
  expect(staleAgents.agents.find((agent) => agent.id === "agent-app")?.status).toBe("offline");

  fs.mkdirSync(path.join(appIntent.intent.worktreePath, "src"), { recursive: true });
  fs.writeFileSync(path.join(appIntent.intent.worktreePath, "src", "login.ts"), "export const loginCallback = 'repaired';\n");
  await run(rootDir, tempRoot, ["code", "evidence", "add", "--project", "app", "--intent", appIntent.intent.id, "--label", "global e2e", "--path", "src/login.ts", "--json"], { env });
  await run(rootDir, tempRoot, ["code", "check", "run", "--project", "app", "--intent", appIntent.intent.id, "--name", "e2e", "--command", "node -e \"process.exit(0)\"", "--json"], { env });
  await run(rootDir, tempRoot, ["code", "commit", "--project", "app", "--intent", appIntent.intent.id, "--json"], { env });
  await run(rootDir, tempRoot, ["code", "review", "approve", "--project", "app", "--intent", appIntent.intent.id, "--reviewer", "human-owner", "--json"], { env });
  await run(rootDir, tempRoot, ["code", "queue", "--project", "app", "--intent", appIntent.intent.id, "--json"], { env });

  const globalQueue = parseJson<{ queue: Array<{ projectId: string; intentId: string }> }>((await run(rootDir, tempRoot, [
    "code", "queue", "--all", "--json",
  ], { env })).stdout);
  expect(globalQueue.queue).toContainEqual(expect.objectContaining({ projectId: "app", intentId: appIntent.intent.id }));

  const status = parseJson<{ projects: Array<{ id: string }>; intents: Array<{ projectId: string; agentId: string }> }>((await run(rootDir, tempRoot, [
    "code", "status", "--all", "--json",
  ], { env })).stdout);
  expect(status.projects.length).toBeGreaterThanOrEqual(2);
  expect(status.intents).toContainEqual(expect.objectContaining({ projectId: "app", agentId: "agent-app" }));

  const integrated = parseJson<{ intent: { status: string }; integrationSha: string }>((await run(rootDir, tempRoot, [
    "code", "integrate",
    "--project", "app",
    "--intent", appIntent.intent.id,
    "--json",
  ], { env })).stdout);
  expect(integrated.intent.status).toBe("integrated");
  expect(fs.readFileSync(path.join(appRepo, "src", "login.ts"), "utf8")).toContain("repaired");
});

test("code local HTTP API exposes projects, agents, intents, and queue for future UI clients", async () => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-code-api-"));
  const codeHome = path.join(tempRoot, "code-home");
  const repoDir = await createRepo(tempRoot, "app");
  const env = { CLAWJS_CODE_HOME: codeHome };

  await run(rootDir, tempRoot, ["code", "projects", "add", repoDir, "--id", "app", "--json"], { env });
  await run(rootDir, tempRoot, ["code", "init", "--project", "app", "--json"], { env });

  const server = await startCodeServer(rootDir, tempRoot, env);
  try {
    const projects = await (await fetch(`${server.url}/v1/projects`)).json() as { projects: Array<{ id: string }> };
    expect(projects.projects).toContainEqual(expect.objectContaining({ id: "app" }));

    const intentResponse = await fetch(`${server.url}/v1/intents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "app",
        kind: "docs",
        scope: "readme",
        title: "update guide",
        agentId: "api-agent",
        paths: ["README.md"],
      }),
    });
    expect(intentResponse.ok).toBeTruthy();
    const created = await intentResponse.json() as { intent: { id: string; worktreePath: string } };
    expect(created.intent.id).toContain("intent_");

    const policy = await (await fetch(`${server.url}/v1/policy?projectId=app`)).json() as { policy: { policy: Record<string, unknown> } };
    const policyResponse = await fetch(`${server.url}/v1/policy`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "app", policy: policy.policy.policy }),
    });
    expect(policyResponse.ok).toBeTruthy();

    fs.writeFileSync(path.join(created.intent.worktreePath, "README.md"), "api docs update\n");
    await run(rootDir, tempRoot, ["code", "check", "record", "--project", "app", "--intent", created.intent.id, "--name", "e2e", "--status", "passed", "--json"], { env });
    await run(rootDir, tempRoot, ["code", "commit", "--project", "app", "--intent", created.intent.id, "--json"], { env });
    await run(rootDir, tempRoot, ["code", "review", "approve", "--project", "app", "--intent", created.intent.id, "--reviewer", "human-owner", "--json"], { env });
    const gateResponse = await fetch(`${server.url}/v1/gate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "app", intentId: created.intent.id }),
    });
    expect(gateResponse.ok).toBeTruthy();
    const gate = await gateResponse.json() as { gate: { status: string } };
    expect(gate.gate.status).toBe("passed");
    const gates = await (await fetch(`${server.url}/v1/gates?projectId=app&intentId=${created.intent.id}`)).json() as { gates: unknown[] };
    expect(gates.gates.length).toBeGreaterThan(0);

    const agents = await (await fetch(`${server.url}/v1/agents`)).json() as { agents: Array<{ id: string; projectId: string }> };
    expect(agents.agents).toContainEqual(expect.objectContaining({ id: "api-agent", projectId: "app" }));

    const intents = parseJson<{ intents: Array<{ id: string; projectId: string }> }>((await run(rootDir, tempRoot, [
      "code", "list", "--all", "--json",
    ], { env })).stdout);
    expect(intents.intents).toContainEqual(expect.objectContaining({ id: created.intent.id, projectId: "app" }));

    const queue = await (await fetch(`${server.url}/v1/queue`)).json() as { queue: unknown[] };
    expect(Array.isArray(queue.queue)).toBeTruthy();
  } finally {
    await server.close();
  }
});
