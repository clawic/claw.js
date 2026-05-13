import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import type { RawData, WebSocket } from "ws";

import type { AuthClaims, NotebookDocument, RuntimeLanguage } from "../shared/types.ts";
import type { WorkerInboundEnvelope, WorkerInvokeEnvelope } from "../shared/protocol.ts";
import { ExecutionPlaneAuthService } from "./auth.ts";
import { loadExecutionPlaneConfig, type ExecutionPlaneConfig } from "./config.ts";
import { ExecutionPlaneDatabase } from "./db.ts";
import { ExecutionPlaneLogger } from "./logger.ts";
import { verifyPasswordHash } from "./security.ts";

interface ExecutionPlaneAppOptions {
  config?: Partial<ExecutionPlaneConfig>;
  logger?: ExecutionPlaneLogger;
}

interface ConnectedWorker {
  tenantId: string;
  workerId: string;
  runtimes: RuntimeLanguage[];
  deployKinds: string[];
  socket: WebSocket;
}

function parseBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function resolveUiDist(): string {
  const baseDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(baseDir, "../../ui/dist"),
    path.join(baseDir, "../ui/dist"),
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html"))) ?? candidates[0];
}

function workerKey(tenantId: string, workerId: string): string {
  return `${tenantId}:${workerId}`;
}

async function requireClaims(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: ExecutionPlaneAuthService,
): Promise<AuthClaims | null> {
  const token = parseBearerToken(request);
  if (!token) {
    await reply.code(401).send({ error: "Unauthorized", message: "Missing bearer token." });
    return null;
  }
  try {
    return await auth.verifyAccessToken(token);
  } catch {
    await reply.code(401).send({ error: "Unauthorized", message: "Invalid bearer token." });
    return null;
  }
}

function ensureTenant(claims: AuthClaims, tenantId: string): void {
  if (claims.tenantId !== tenantId) {
    throw new Error("Forbidden: tenant mismatch");
  }
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyRecursive(source: string, target: string): void {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    ensureDir(target);
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(target, entry));
    }
    return;
  }
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function latestSucceededRunForRevision(db: ExecutionPlaneDatabase, tenantId: string, revisionId: string) {
  return db.listRuns(tenantId).find((run) => run.revisionId === revisionId && run.status === "succeeded") ?? null;
}

export async function buildExecutionPlaneApp(options: ExecutionPlaneAppOptions = {}) {
  const config = loadExecutionPlaneConfig(options.config);
  ensureDir(config.dataDir);
  ensureDir(config.deploymentsDir);
  const logger = options.logger ?? new ExecutionPlaneLogger();
  const db = new ExecutionPlaneDatabase(config.databaseFile);
  const auth = new ExecutionPlaneAuthService(config, db);
  const workers = new Map<string, ConnectedWorker>();

  const app = Fastify();
  await app.register(cors, { origin: true });
  await app.register(websocket);

  const uiDist = resolveUiDist();
  if (fs.existsSync(path.join(uiDist, "index.html"))) {
    await app.register(fastifyStatic, {
      root: path.join(uiDist, "assets"),
      prefix: "/assets/",
      wildcard: false,
    });
  }

  app.get("/v1/health", async () => ({ ok: true }));

  app.post("/v1/auth/login", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const tenantId = String(body.tenantId ?? "demo-tenant");
    const user = db.getUserByEmail(email);
    if (!user) return await reply.code(401).send({ error: "Unauthorized", message: "Invalid login." });
    const verified = await verifyPasswordHash(user.passwordHash, password);
    if (!verified.valid) return await reply.code(401).send({ error: "Unauthorized", message: "Invalid login." });
    const membership = db.getMembership(user.id, tenantId);
    if (!membership) return await reply.code(403).send({ error: "Forbidden", message: "No tenant access." });
    const tokens = await auth.issueTokenPair({
      userId: user.id,
      email: user.email,
      role: membership.role,
      tenantId,
      scopes: membership.scopes,
    });
    return {
      ...tokens,
      tenantId,
      role: membership.role,
      scopes: membership.scopes,
    };
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const refreshToken = String(body.refreshToken ?? "");
    const consumed = db.consumeRefreshToken(refreshToken);
    if (!consumed) return await reply.code(401).send({ error: "Unauthorized", message: "Invalid refresh token." });
    const userId = consumed.userId;
    const row = db.sqlite.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email: string } | undefined;
    const membership = db.getMembership(userId, consumed.tenantId);
    if (!row || !membership) return await reply.code(401).send({ error: "Unauthorized", message: "Refresh failed." });
    return {
      ...(await auth.issueTokenPair({
        userId,
        email: row.email,
        role: membership.role,
        tenantId: consumed.tenantId,
        scopes: consumed.scopes,
      })),
      tenantId: consumed.tenantId,
      role: membership.role,
      scopes: consumed.scopes,
    };
  });

  app.post("/v1/auth/logout", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    db.revokeRefreshToken(String(body.refreshToken ?? ""));
    return { ok: true };
  });

  app.get("/v1/me", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    return claims;
  });

  app.get("/v1/workers", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    return {
      workers: db.listWorkers(claims.tenantId).map((worker) => ({
        workerId: worker.id,
        label: worker.label,
        workspaceRoot: worker.workspaceRoot,
        runtimes: JSON.parse(worker.runtimesJson) as RuntimeLanguage[],
        deployKinds: JSON.parse(worker.deployKindsJson) as string[],
        online: worker.online === 1,
        lastSeenAt: worker.lastSeenAt,
      })),
    };
  });

  app.get("/v1/projects", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    return { projects: db.listProjects(claims.tenantId) };
  });

  app.post("/v1/projects", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    return { project: db.createProject({ tenantId: claims.tenantId, name: String(body.name ?? "Untitled Project"), description: String(body.description ?? "") }) };
  });

  app.get("/v1/projects/:projectId", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const projectId = String((request.params as Record<string, unknown>).projectId ?? "");
    const project = db.getProject(claims.tenantId, projectId);
    if (!project) return await reply.code(404).send({ error: "Not found" });
    return { project };
  });

  app.get("/v1/projects/:projectId/repositories", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const projectId = String((request.params as Record<string, unknown>).projectId ?? "");
    return { repositories: db.listRepositories(claims.tenantId, projectId) };
  });

  app.post("/v1/projects/:projectId/repositories", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const projectId = String((request.params as Record<string, unknown>).projectId ?? "");
    const body = (request.body ?? {}) as Record<string, unknown>;
    return {
      repository: db.createRepository({
        tenantId: claims.tenantId,
        projectId,
        name: String(body.name ?? "repo"),
        remoteUrl: String(body.remoteUrl ?? ""),
        defaultBranch: String(body.defaultBranch ?? "main"),
        secretRef: String(body.secretRef ?? ""),
      }),
    };
  });

  app.get("/v1/projects/:projectId/assets", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const projectId = String((request.params as Record<string, unknown>).projectId ?? "");
    return { assets: db.listAssets(claims.tenantId, projectId) };
  });

  app.post("/v1/projects/:projectId/assets", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const projectId = String((request.params as Record<string, unknown>).projectId ?? "");
    const body = (request.body ?? {}) as Record<string, unknown>;
    return {
      asset: db.createAsset({
        tenantId: claims.tenantId,
        projectId,
        repositoryId: String(body.repositoryId ?? ""),
        name: String(body.name ?? "asset"),
        kind: body.kind === "notebook" ? "notebook" : "script",
        path: String(body.path ?? (body.kind === "notebook" ? "notebooks/main.epnb.json" : "scripts/main.js")),
        runtime: body.runtime === "python" ? "python" : "node",
      }),
    };
  });

  app.get("/v1/assets/:assetId", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const assetId = String((request.params as Record<string, unknown>).assetId ?? "");
    const asset = db.getAsset(claims.tenantId, assetId);
    if (!asset) return await reply.code(404).send({ error: "Not found" });
    return {
      asset,
      notebookCells: asset.kind === "notebook" ? db.listNotebookCells(assetId) : [],
      snapshots: asset.kind === "notebook" ? db.listNotebookSnapshots(assetId) : [],
    };
  });

  app.get("/v1/assets/:assetId/revisions", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const assetId = String((request.params as Record<string, unknown>).assetId ?? "");
    return { revisions: db.listRevisions(claims.tenantId, assetId) };
  });

  app.post("/v1/assets/:assetId/revisions", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const assetId = String((request.params as Record<string, unknown>).assetId ?? "");
    const asset = db.getAsset(claims.tenantId, assetId);
    if (!asset) return await reply.code(404).send({ error: "Not found" });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const content = typeof body.content === "string"
      ? body.content
      : JSON.stringify(body.content ?? { cells: [] }, null, 2);
    return {
      revision: db.createRevision({
        tenantId: claims.tenantId,
        projectId: asset.projectId,
        repositoryId: asset.repositoryId,
        assetId,
        branchName: String(body.branchName ?? "ep/working"),
        baseRef: String(body.baseRef ?? "main"),
        gitCommit: body.gitCommit ? String(body.gitCommit) : null,
        content,
        createdBy: claims.email,
      }),
    };
  });

  app.post("/v1/assets/:assetId/promote", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const assetId = String((request.params as Record<string, unknown>).assetId ?? "");
    const asset = db.getAsset(claims.tenantId, assetId);
    if (!asset || asset.kind !== "notebook") return await reply.code(404).send({ error: "Notebook not found" });
    const revisions = db.listRevisions(claims.tenantId, assetId);
    const latest = revisions[0];
    if (!latest) return await reply.code(400).send({ error: "No revision to promote" });
    const notebook = JSON.parse(latest.content) as NotebookDocument;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const target = body.target === "workflow" ? "workflow" : "script";
    const cellIds = Array.isArray(body.cellIds) ? body.cellIds.map(String) : notebook.cells.map((cell) => cell.id);
    const selected = notebook.cells.filter((cell) => cellIds.includes(cell.id));
    const combined = selected.map((cell) => cell.code).join("\n\n");
    if (target === "workflow") {
      const scriptAsset = db.createAsset({
        tenantId: claims.tenantId,
        projectId: asset.projectId,
        repositoryId: asset.repositoryId,
        name: `${asset.name} promoted`,
        kind: "script",
        path: asset.path.replace(/\.json$/, ".js"),
        runtime: asset.runtime,
      });
      const revision = db.createRevision({
        tenantId: claims.tenantId,
        projectId: asset.projectId,
        repositoryId: asset.repositoryId,
        assetId: scriptAsset.id,
        branchName: "ep/promoted",
        baseRef: latest.baseRef,
        content: combined,
        createdBy: claims.email,
      });
      const workflow = db.createWorkflow({
        tenantId: claims.tenantId,
        projectId: asset.projectId,
        name: `${asset.name} workflow`,
        assetId: scriptAsset.id,
        cron: "",
        inputs: {},
      });
      return { workflow, promotedAsset: scriptAsset, revision };
    }
    const promotedAsset = db.createAsset({
      tenantId: claims.tenantId,
      projectId: asset.projectId,
      repositoryId: asset.repositoryId,
      name: `${asset.name} script`,
      kind: "script",
      path: asset.path.replace(/\.json$/, ".js"),
      runtime: asset.runtime,
    });
    const revision = db.createRevision({
      tenantId: claims.tenantId,
      projectId: asset.projectId,
      repositoryId: asset.repositoryId,
      assetId: promotedAsset.id,
      branchName: "ep/promoted",
      baseRef: latest.baseRef,
      content: combined,
      createdBy: claims.email,
    });
    return { asset: promotedAsset, revision };
  });

  app.get("/v1/projects/:projectId/change-requests", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const projectId = String((request.params as Record<string, unknown>).projectId ?? "");
    return { changeRequests: db.listChangeRequests(claims.tenantId, projectId) };
  });

  app.post("/v1/projects/:projectId/change-requests", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const projectId = String((request.params as Record<string, unknown>).projectId ?? "");
    const body = (request.body ?? {}) as Record<string, unknown>;
    const asset = db.getAsset(claims.tenantId, String(body.assetId ?? ""));
    if (!asset) return await reply.code(404).send({ error: "Asset not found" });
    return {
      changeRequest: db.createChangeRequest({
        tenantId: claims.tenantId,
        projectId,
        repositoryId: asset.repositoryId,
        assetId: asset.id,
        revisionId: String(body.revisionId ?? ""),
        title: String(body.title ?? "New change"),
        description: String(body.description ?? ""),
        targetBranch: String(body.targetBranch ?? "main"),
        createdBy: claims.email,
      }),
    };
  });

  app.post("/v1/change-requests/:changeRequestId/reviews", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const changeRequestId = String((request.params as Record<string, unknown>).changeRequestId ?? "");
    const body = (request.body ?? {}) as Record<string, unknown>;
    return {
      review: db.createChangeRequestReview({
        changeRequestId,
        reviewer: claims.email,
        status: body.status === "rejected" ? "rejected" : body.status === "pending" ? "pending" : "approved",
        notes: String(body.notes ?? ""),
      }),
      reviews: db.listChangeRequestReviews(changeRequestId),
    };
  });

  app.post("/v1/change-requests/:changeRequestId/merge", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const changeRequestId = String((request.params as Record<string, unknown>).changeRequestId ?? "");
    const changeRequest = db.getChangeRequest(claims.tenantId, changeRequestId);
    if (!changeRequest) return await reply.code(404).send({ error: "Not found" });
    const reviews = db.listChangeRequestReviews(changeRequestId);
    if (reviews.length === 0 || reviews.some((review) => review.status !== "approved")) {
      return await reply.code(400).send({ error: "Merge blocked", message: "All reviews must be approved." });
    }
    const linkedRun = latestSucceededRunForRevision(db, claims.tenantId, changeRequest.revisionId);
    if (!linkedRun) {
      return await reply.code(400).send({ error: "Merge blocked", message: "A successful run is required before merge." });
    }
    const bundle = db.getRevisionBundle(claims.tenantId, linkedRun.id);
    if (!bundle) return await reply.code(400).send({ error: "Missing revision bundle" });
    const workDir = path.join(config.dataDir, "merge", changeRequestId);
    fs.rmSync(workDir, { force: true, recursive: true });
    ensureDir(path.dirname(workDir));
    execFileSync("git", ["clone", bundle.repository.remoteUrl, workDir], { stdio: "ignore" });
    execFileSync("git", ["-C", workDir, "checkout", bundle.revision.baseRef], { stdio: "ignore" });
    ensureDir(path.join(workDir, path.dirname(bundle.asset.path)));
    fs.writeFileSync(path.join(workDir, bundle.asset.path), bundle.revision.content);
    execFileSync("git", ["-C", workDir, "config", "user.email", "execution@local"], { stdio: "ignore" });
    execFileSync("git", ["-C", workDir, "config", "user.name", "Execution"], { stdio: "ignore" });
    execFileSync("git", ["-C", workDir, "checkout", "-B", changeRequest.targetBranch], { stdio: "ignore" });
    execFileSync("git", ["-C", workDir, "add", bundle.asset.path], { stdio: "ignore" });
    execFileSync("git", ["-C", workDir, "commit", "-m", `merge(${bundle.asset.name}): ${changeRequest.title}`], { stdio: "ignore" });
    execFileSync("git", ["-C", workDir, "push", bundle.repository.remoteUrl, `HEAD:${changeRequest.targetBranch}`, "--force"], { stdio: "ignore" });
    db.updateChangeRequestStatus(claims.tenantId, changeRequestId, "merged");
    return { ok: true, changeRequest: db.getChangeRequest(claims.tenantId, changeRequestId) };
  });

  app.get("/v1/runs", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    return { runs: db.listRuns(claims.tenantId) };
  });

  app.post("/v1/runs", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const asset = db.getAsset(claims.tenantId, String(body.assetId ?? ""));
    if (!asset) return await reply.code(404).send({ error: "Asset not found" });
    const revisionId = String(body.revisionId ?? db.listRevisions(claims.tenantId, asset.id)[0]?.id ?? "");
    if (!revisionId) return await reply.code(400).send({ error: "Revision required" });
    return {
      run: db.createRun({
        tenantId: claims.tenantId,
        projectId: asset.projectId,
        repositoryId: asset.repositoryId,
        assetId: asset.id,
        revisionId,
        workflowId: body.workflowId ? String(body.workflowId) : null,
        inputs: typeof body.inputs === "object" && body.inputs ? body.inputs as Record<string, unknown> : {},
        targetCellId: body.targetCellId ? String(body.targetCellId) : null,
      }),
    };
  });

  app.get("/v1/runs/:runId", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const runId = String((request.params as Record<string, unknown>).runId ?? "");
    const run = db.getRun(claims.tenantId, runId);
    if (!run) return await reply.code(404).send({ error: "Not found" });
    return { run };
  });

  app.post("/v1/runs/:runId/cancel", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const runId = String((request.params as Record<string, unknown>).runId ?? "");
    db.completeRun({ tenantId: claims.tenantId, runId, status: "cancelled", exitCode: 130, outputText: "", errorText: "Cancelled by user" });
    return { ok: true };
  });

  app.post("/v1/runs/:runId/rerun", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const runId = String((request.params as Record<string, unknown>).runId ?? "");
    const run = db.getRun(claims.tenantId, runId);
    if (!run) return await reply.code(404).send({ error: "Not found" });
    return {
      run: db.createRun({
        tenantId: run.tenantId,
        projectId: run.projectId,
        repositoryId: run.repositoryId,
        assetId: run.assetId,
        revisionId: run.revisionId,
        workflowId: run.workflowId,
        inputs: JSON.parse(run.inputsJson) as Record<string, unknown>,
        targetCellId: run.targetCellId,
      }),
    };
  });

  app.get("/v1/runs/:runId/logs", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const runId = String((request.params as Record<string, unknown>).runId ?? "");
    return {
      logs: db.listRunLogs(runId),
      transcript: db.getRunTranscript(runId),
    };
  });

  app.get("/v1/runs/:runId/artifacts", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const runId = String((request.params as Record<string, unknown>).runId ?? "");
    return { artifacts: db.listArtifacts(runId) };
  });

  app.get("/v1/projects/:projectId/workflows", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const projectId = String((request.params as Record<string, unknown>).projectId ?? "");
    return { workflows: db.listWorkflows(claims.tenantId, projectId) };
  });

  app.post("/v1/projects/:projectId/workflows", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const projectId = String((request.params as Record<string, unknown>).projectId ?? "");
    const body = (request.body ?? {}) as Record<string, unknown>;
    return {
      workflow: db.createWorkflow({
        tenantId: claims.tenantId,
        projectId,
        name: String(body.name ?? "Workflow"),
        cron: String(body.cron ?? ""),
        assetId: String(body.assetId ?? ""),
        enabled: body.enabled !== false,
        inputs: typeof body.inputs === "object" && body.inputs ? body.inputs as Record<string, unknown> : {},
      }),
    };
  });

  app.post("/v1/workflows/:workflowId/run", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const workflowId = String((request.params as Record<string, unknown>).workflowId ?? "");
    const workflow = db.getWorkflow(claims.tenantId, workflowId);
    if (!workflow) return await reply.code(404).send({ error: "Not found" });
    const asset = db.getAsset(claims.tenantId, workflow.assetId);
    if (!asset) return await reply.code(404).send({ error: "Asset not found" });
    const revision = db.listRevisions(claims.tenantId, asset.id)[0];
    if (!revision) return await reply.code(400).send({ error: "No revision" });
    return {
      run: db.createRun({
        tenantId: claims.tenantId,
        projectId: asset.projectId,
        repositoryId: asset.repositoryId,
        assetId: asset.id,
        revisionId: revision.id,
        workflowId: workflow.id,
        inputs: JSON.parse(workflow.inputsJson) as Record<string, unknown>,
      }),
    };
  });

  app.get("/v1/deployments", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    return { deployments: db.listDeployments(claims.tenantId) };
  });

  app.post("/v1/deployments", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const artifactId = String(body.artifactId ?? "");
    const artifact = db.sqlite.prepare("SELECT * FROM run_artifacts WHERE id = ?").get(artifactId) as Record<string, unknown> | undefined;
    if (!artifact) return await reply.code(404).send({ error: "Artifact not found" });
    const kind = (body.kind === "node-web" ? "node-web" : body.kind === "static" ? "static" : String(artifact.deployable_kind || "static")) as "static" | "node-web";
    const deploymentId = `release_${Math.random().toString(36).slice(2, 10)}`;
    const releasePath = path.join(config.deploymentsDir, deploymentId);
    fs.rmSync(releasePath, { recursive: true, force: true });
    copyRecursive(String(artifact.path), releasePath);
    let previewUrl = `${config.publicBaseUrl}/preview/${deploymentId}/`;
    if (kind === "node-web") {
      const entryFile = fs.statSync(releasePath).isDirectory()
        ? path.join(releasePath, "server.js")
        : releasePath;
      const port = 5200 + Math.floor(Math.random() * 1000);
      const child = spawn(process.execPath, [entryFile], {
        env: { ...process.env, PORT: String(port) },
        stdio: "ignore",
        detached: true,
      });
      child.unref();
      previewUrl = `http://127.0.0.1:${port}`;
    }
    return {
      deployment: db.createDeployment({
        tenantId: claims.tenantId,
        projectId: String(artifact.project_id),
        artifactId,
        kind,
        environment: body.environment === "production" ? "production" : body.environment === "staging" ? "staging" : "preview",
        releasePath,
        previewUrl,
      }),
    };
  });

  app.post("/v1/deployments/:deploymentId/promote", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const deploymentId = String((request.params as Record<string, unknown>).deploymentId ?? "");
    db.updateDeploymentStatus(claims.tenantId, deploymentId, "live");
    return { deployment: db.getDeployment(claims.tenantId, deploymentId) };
  });

  app.post("/v1/deployments/:deploymentId/attach-domain", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const deploymentId = String((request.params as Record<string, unknown>).deploymentId ?? "");
    const body = (request.body ?? {}) as Record<string, unknown>;
    return { domain: db.attachDeploymentDomain(deploymentId, String(body.domain ?? "")) };
  });

  app.post("/v1/deployments/:deploymentId/issue-certificate", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const deploymentId = String((request.params as Record<string, unknown>).deploymentId ?? "");
    const body = (request.body ?? {}) as Record<string, unknown>;
    const domain = String(body.domain ?? "");
    return { certificate: db.issueDeploymentCertificate(deploymentId, domain, domain.includes("localhost") || domain.endsWith(".local") ? "issued" : "pending") };
  });

  app.post("/v1/deployments/:deploymentId/rollback", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    const deploymentId = String((request.params as Record<string, unknown>).deploymentId ?? "");
    db.updateDeploymentStatus(claims.tenantId, deploymentId, "rolled_back");
    return { deployment: db.getDeployment(claims.tenantId, deploymentId) };
  });

  app.get("/v1/settings", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth);
    if (!claims) return;
    return {
      settings: {
        tenantId: claims.tenantId,
        publicBaseUrl: config.publicBaseUrl,
        workerMode: "reverse-websocket",
        runtimes: ["node", "python"],
        deploymentKinds: ["static", "node-web"],
        demoRepositoryPath: process.env.EXECUTION_PLANE_DEMO_REPO ?? "",
      },
    };
  });

  app.get("/preview/:deploymentId/*", async (request, reply) => {
    const deploymentId = String((request.params as Record<string, unknown>).deploymentId ?? "");
    const wildcard = String((request.params as Record<string, unknown>)["*"] ?? "index.html");
    const deploymentDir = path.join(config.deploymentsDir, deploymentId);
    const target = path.join(deploymentDir, wildcard || "index.html");
    if (!fs.existsSync(target)) {
      return await reply.code(404).send({ error: "Not found" });
    }
    return reply.send(fs.readFileSync(target));
  });

  app.get("/v1/workers/connect", { websocket: true }, (socket) => {
    let activeKey: string | null = null;
    socket.on("message", (raw: RawData) => {
      const message = JSON.parse(raw.toString()) as WorkerInboundEnvelope;
      if (message.type === "hello") {
        if (message.payload.secret !== config.workerSharedSecret) {
          socket.send(JSON.stringify({ type: "error", code: "worker_auth_failed", message: "Invalid worker secret" }));
          socket.close();
          return;
        }
        const worker = db.upsertWorker({
          tenantId: message.payload.tenantId,
          workerId: message.payload.workerId,
          label: message.payload.label,
          workspaceRoot: message.payload.workspaceRoot,
          runtimes: message.payload.runtimes,
          deployKinds: message.payload.deployKinds,
        });
        activeKey = workerKey(worker.tenantId, worker.id);
        workers.set(activeKey, {
          tenantId: worker.tenantId,
          workerId: worker.id,
          runtimes: JSON.parse(worker.runtimesJson) as RuntimeLanguage[],
          deployKinds: JSON.parse(worker.deployKindsJson) as string[],
          socket: socket as unknown as WebSocket,
        });
        socket.send(JSON.stringify({ type: "ack", payload: { ok: true } }));
        return;
      }
      if (!activeKey) return;
      const connected = workers.get(activeKey);
      if (!connected) return;
      if (message.type === "heartbeat") {
        db.markWorkerSeen(connected.tenantId, connected.workerId);
        socket.send(JSON.stringify({ type: "ack", payload: { ok: true } }));
        return;
      }
      if (message.type === "claimRun") {
        const claimed = db.claimNextRun(connected.tenantId, connected.workerId, connected.runtimes);
        if (!claimed) {
          socket.send(JSON.stringify({ type: "ack", payload: { claimed: false } }));
          return;
        }
        const bundle = db.getRevisionBundle(connected.tenantId, claimed.id);
        if (!bundle) {
          socket.send(JSON.stringify({ type: "error", requestId: claimed.id, code: "missing_bundle", message: "Unable to resolve run bundle." }));
          return;
        }
        db.markRunRunning(connected.tenantId, claimed.id);
        const invoke: WorkerInvokeEnvelope = {
          type: "invoke",
          requestId: claimed.id,
          payload: {
            runId: claimed.id,
            tenantId: claimed.tenantId,
            projectId: claimed.projectId,
            repositoryId: claimed.repositoryId,
            assetId: claimed.assetId,
            revisionId: claimed.revisionId,
            assetKind: bundle.asset.kind,
            runtime: bundle.asset.runtime,
            repository: {
              remoteUrl: bundle.repository.remoteUrl,
              defaultBranch: bundle.repository.defaultBranch,
            },
            asset: {
              path: bundle.asset.path,
              name: bundle.asset.name,
            },
            revision: {
              content: bundle.revision.content,
              baseRef: bundle.revision.baseRef,
              branchName: bundle.revision.branchName,
            },
            inputs: JSON.parse(claimed.inputsJson) as Record<string, unknown>,
            targetCellId: claimed.targetCellId,
            artifactDir: path.join(config.dataDir, "artifacts", claimed.id),
          },
        };
        socket.send(JSON.stringify(invoke));
        return;
      }
      if (message.type === "streamLogs") {
        db.appendRunLog(message.payload.runId, message.payload.stream, message.payload.line);
        return;
      }
      if (message.type === "terminalData") {
        db.appendRunLog(message.payload.runId, "system", message.payload.data);
        return;
      }
      if (message.type === "completeRun") {
        db.completeRun({
          tenantId: connected.tenantId,
          runId: message.payload.runId,
          status: message.payload.status,
          exitCode: message.payload.exitCode,
          outputText: message.payload.outputText,
          errorText: message.payload.errorText,
        });
        const run = db.getRun(connected.tenantId, message.payload.runId);
        if (run) {
          for (const artifact of message.payload.artifacts) {
            db.addArtifact({
              runId: run.id,
              tenantId: run.tenantId,
              projectId: run.projectId,
              kind: artifact.kind,
              name: artifact.name,
              path: artifact.path,
              contentType: artifact.contentType,
              sizeBytes: artifact.sizeBytes,
              deployableKind: artifact.deployableKind ?? null,
            });
          }
          if (message.payload.notebookSnapshot) {
            db.createNotebookSnapshot({
              assetId: run.assetId,
              revisionId: run.revisionId,
              runId: run.id,
              snapshotJson: JSON.stringify(message.payload.notebookSnapshot),
            });
          }
        }
      }
    });

    socket.on("close", () => {
      if (!activeKey) return;
      const connected = workers.get(activeKey);
      if (connected) {
        db.markWorkerOffline(connected.tenantId, connected.workerId);
        workers.delete(activeKey);
      }
    });
  });

  if (fs.existsSync(path.join(uiDist, "index.html"))) {
    const htmlShell = fs.readFileSync(path.join(uiDist, "index.html"), "utf8");
    const spaRoutes = ["/", "/login", "/projects", "/scripts", "/notebooks", "/runs", "/changes", "/workflows", "/deployments", "/workers", "/settings"];
    for (const route of spaRoutes) {
      app.get(route, async (_request, reply) => reply.type("text/html").send(htmlShell));
    }
  }

  return { app, db, auth, config, logger };
}
