import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { buildExecutionPlaneApp } from "../../src/server/app.ts";

const state: {
  tmpDir: string;
  baseUrl: string;
  stop?: () => Promise<void>;
} = {
  tmpDir: "",
  baseUrl: "",
};

async function login(baseUrl: string) {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@execution.local",
      password: "execution-admin",
      tenantId: "demo-tenant",
    }),
  });
  assert.equal(response.ok, true);
  return await response.json() as {
    accessToken: string;
    refreshToken: string;
  };
}

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function createLocalGitRepo(root: string): string {
  const repoDir = path.join(root, "repo");
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, "README.md"), "# execution-plane test\n");
  execFileSync("git", ["init", "-b", "main"], { cwd: repoDir });
  execFileSync("git", ["config", "user.email", "tests@local"], { cwd: repoDir });
  execFileSync("git", ["config", "user.name", "Execution Tests"], { cwd: repoDir });
  execFileSync("git", ["add", "."], { cwd: repoDir });
  execFileSync("git", ["commit", "-m", "chore(repo): seed"], { cwd: repoDir });
  return repoDir;
}

describe("execution-plane backend e2e", () => {
  before(async () => {
    state.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "execution-plane-e2e-"));
    const built = await buildExecutionPlaneApp({
      config: {
        host: "127.0.0.1",
        port: 0,
        dataDir: path.join(state.tmpDir, "data"),
        databaseFile: path.join(state.tmpDir, "data", "ep.sqlite"),
        deploymentsDir: path.join(state.tmpDir, "deployments"),
      },
    });
    const address = await built.app.listen({ host: "127.0.0.1", port: 0 });
    state.baseUrl = address.replace(/\/$/, "");
    state.stop = async () => {
      await built.app.close();
      built.db.close();
    };
  });

  after(async () => {
    await state.stop?.();
  });

  test("project -> repository -> asset -> revision flow works", async () => {
    const tokens = await login(state.baseUrl);
    const repoDir = createLocalGitRepo(state.tmpDir);
    const projectResponse = await fetch(`${state.baseUrl}/v1/projects`, {
      method: "POST",
      headers: authHeaders(tokens.accessToken),
      body: JSON.stringify({ name: "Execution Plane", description: "backend flow" }),
    });
    const { project } = await projectResponse.json() as { project: { id: string } };
    const repositoryResponse = await fetch(`${state.baseUrl}/v1/projects/${project.id}/repositories`, {
      method: "POST",
      headers: authHeaders(tokens.accessToken),
      body: JSON.stringify({ name: "repo", remoteUrl: repoDir, defaultBranch: "main" }),
    });
    const { repository } = await repositoryResponse.json() as { repository: { id: string } };
    const assetResponse = await fetch(`${state.baseUrl}/v1/projects/${project.id}/assets`, {
      method: "POST",
      headers: authHeaders(tokens.accessToken),
      body: JSON.stringify({ repositoryId: repository.id, name: "hello", kind: "script", path: "scripts/hello.js", runtime: "node" }),
    });
    const { asset } = await assetResponse.json() as { asset: { id: string } };
    const revisionResponse = await fetch(`${state.baseUrl}/v1/assets/${asset.id}/revisions`, {
      method: "POST",
      headers: authHeaders(tokens.accessToken),
      body: JSON.stringify({
        branchName: "ep/working",
        baseRef: "main",
        content: "console.log('hello from execution plane')",
      }),
    });
    const { revision } = await revisionResponse.json() as { revision: { id: string } };
    assert.ok(revision.id);
  });
});
