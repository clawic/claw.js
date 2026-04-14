import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { buildExecutionPlaneApp } from "../../src/server/app.ts";
import { runExecutionWorker } from "../../src/worker/index.ts";

const state: {
  tmpDir: string;
  baseUrl: string;
  stop?: () => Promise<void>;
  workerAbort?: AbortController;
} = {
  tmpDir: "",
  baseUrl: "",
};

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

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
  };
}

function createLocalGitRepo(root: string): string {
  const repoDir = path.join(root, "repo-worker");
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, "README.md"), "# worker flow\n");
  execFileSync("git", ["init", "-b", "main"], { cwd: repoDir });
  execFileSync("git", ["config", "user.email", "tests@local"], { cwd: repoDir });
  execFileSync("git", ["config", "user.name", "Execution Tests"], { cwd: repoDir });
  execFileSync("git", ["add", "."], { cwd: repoDir });
  execFileSync("git", ["commit", "-m", "chore(repo): seed"], { cwd: repoDir });
  return repoDir;
}

async function waitForRun(baseUrl: string, token: string, runId: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`${baseUrl}/v1/runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { run } = await response.json() as { run: { status: string } };
    if (run.status === "succeeded" || run.status === "failed") return run;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Run did not finish in time");
}

describe("execution-plane worker e2e", () => {
  before(async () => {
    state.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "execution-plane-worker-e2e-"));
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
    state.workerAbort = new AbortController();
    runExecutionWorker([
      "--base-url", state.baseUrl,
      "--tenant-id", "demo-tenant",
      "--worker-id", "e2e-worker",
      "--workspace-root", path.join(state.tmpDir, "worker-root"),
      "--secret", "execution-plane-worker-secret",
    ], { signal: state.workerAbort.signal }).catch(() => {});
    state.stop = async () => {
      state.workerAbort?.abort();
      await new Promise((resolve) => setTimeout(resolve, 250));
      await built.app.close();
      built.db.close();
    };
  });

  after(async () => {
    await state.stop?.();
  });

  test("worker executes script run and deployment flow", async () => {
    const { accessToken } = await login(state.baseUrl);
    const repoDir = createLocalGitRepo(state.tmpDir);
    const projectRes = await fetch(`${state.baseUrl}/v1/projects`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ name: "Worker Flow", description: "" }),
    });
    const { project } = await projectRes.json() as { project: { id: string } };
    const repoRes = await fetch(`${state.baseUrl}/v1/projects/${project.id}/repositories`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ name: "repo", remoteUrl: repoDir, defaultBranch: "main" }),
    });
    const { repository } = await repoRes.json() as { repository: { id: string } };
    const assetRes = await fetch(`${state.baseUrl}/v1/projects/${project.id}/assets`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ repositoryId: repository.id, name: "site", kind: "script", path: "scripts/build.js", runtime: "node" }),
    });
    const { asset } = await assetRes.json() as { asset: { id: string } };
    const code = [
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "const artifactDir = process.env.EP_ARTIFACT_DIR;",
      "fs.mkdirSync(path.join(artifactDir, 'static-site'), { recursive: true });",
      "fs.writeFileSync(path.join(artifactDir, 'static-site', 'index.html'), '<html><body><h1>Execution Plane</h1></body></html>');",
      "console.log('built site');",
    ].join("\n");
    const revisionRes = await fetch(`${state.baseUrl}/v1/assets/${asset.id}/revisions`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ baseRef: "main", branchName: "ep/site", content: code }),
    });
    const { revision } = await revisionRes.json() as { revision: { id: string } };
    const runRes = await fetch(`${state.baseUrl}/v1/runs`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ assetId: asset.id, revisionId: revision.id }),
    });
    const { run } = await runRes.json() as { run: { id: string } };
    const finalRun = await waitForRun(state.baseUrl, accessToken, run.id);
    assert.equal(finalRun.status, "succeeded");

    const artifactsRes = await fetch(`${state.baseUrl}/v1/runs/${run.id}/artifacts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { artifacts } = await artifactsRes.json() as { artifacts: Array<{ id: string }> };
    assert.ok(artifacts.length > 0);

    const deploymentRes = await fetch(`${state.baseUrl}/v1/deployments`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ artifactId: artifacts[0]!.id, kind: "static", environment: "preview" }),
    });
    const { deployment } = await deploymentRes.json() as { deployment: { id: string; previewUrl: string } };
    assert.ok(deployment.previewUrl.includes("/preview/"));

    const domainRes = await fetch(`${state.baseUrl}/v1/deployments/${deployment.id}/attach-domain`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ domain: "demo.local" }),
    });
    assert.equal(domainRes.ok, true);

    const certRes = await fetch(`${state.baseUrl}/v1/deployments/${deployment.id}/issue-certificate`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ domain: "demo.local" }),
    });
    assert.equal(certRes.ok, true);
  });
});
