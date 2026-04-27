import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { expect, test } from "./fixtures";

const execFileAsync = promisify(execFile);

function cliPath(rootDir: string) {
  return path.join(rootDir, "packages", "clawjs", "bin", "clawjs.mjs");
}

async function run(rootDir: string, repoDir: string, args: string[], options: { reject?: boolean } = {}) {
  try {
    return await execFileAsync(process.execPath, [cliPath(rootDir), ...args], {
      cwd: repoDir,
      env: { ...process.env },
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

async function createRepo() {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-code-e2e-"));
  await git(repoDir, ["init"]);
  fs.writeFileSync(path.join(repoDir, "README.md"), "code e2e\n");
  await git(repoDir, ["add", "README.md"]);
  await git(repoDir, ["-c", "user.name=Test", "-c", "user.email=test@example.local", "commit", "-m", "chore(repo): seed"]);
  return repoDir;
}

function parseJson<T>(stdout: string): T {
  return JSON.parse(stdout) as T;
}

test("code cli runs an isolated intent through evidence, checks, review, commit, queue, and integration", async () => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const repoDir = await createRepo();

  const init = parseJson<{ repository: { id: string } }>((await run(rootDir, repoDir, ["code", "init", "--json"])).stdout);
  expect(init.repository.id).toBeTruthy();

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
