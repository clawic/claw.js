const STABLE_EVENT_TYPES = {
  brandCreated: "brand.created",
  brandUpdated: "brand.updated",
  destinationCreated: "destination.created",
  destinationUpdated: "destination.updated",
  campaignCreated: "campaign.created",
  campaignUpdated: "campaign.updated",
  entryCreated: "entry.created",
  entryUpdated: "entry.updated",
  entryArchived: "entry.archived",
  assetAttached: "asset.attached",
  variantGenerated: "variant.generated",
  variantCreated: "variant.created",
  variantUpdated: "variant.updated",
  approvalReviewed: "approval.reviewed",
  approvalCreated: "approval.created",
  planCreated: "plan.created",
  planExecuted: "plan.executed",
  planCancelled: "plan.cancelled",
} as const;
import { clawApiPath } from "@clawjs/core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";

import { ContentAuthService } from "./auth.ts";
import { loadContentConfig, type ContentServiceConfig } from "./config.ts";
import { ContentStore } from "./db.ts";
import { approvalRequired, buildGeneratedVariant, publishVariant } from "./publish.ts";
import { staticFormSchemas, staticReadModels, frontendContract } from "../shared/contracts.ts";
import { ContentError, errorEnvelope } from "../shared/errors.ts";
import type { ContentRealtimeEvent } from "../shared/events.ts";
import type { ContentOperation, ContentPublicationRun, ContentChangeEvent } from "../shared/types.ts";

function resolveUiRoot(): string | null {
  const candidates = [
    fileURLToPath(new URL("../../ui/dist", import.meta.url)),
    fileURLToPath(new URL("../ui/dist", import.meta.url)),
    path.join(process.cwd(), "ui", "dist"),
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html"))) ?? null;
}

function resolveDocsRoot(): string {
  return fileURLToPath(new URL("../../docs", import.meta.url));
}

function resolveBrandRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../../../public", import.meta.url)),
    fileURLToPath(new URL("../../public", import.meta.url)),
    path.join(process.cwd(), "../public"),
    path.join(process.cwd(), "public"),
  ];
  return candidates.find((candidate) => (
    fs.existsSync(path.join(candidate, "logo.png")) &&
    fs.existsSync(path.join(candidate, "favicon.ico"))
  )) ?? candidates[0];
}

function placeholderHtml(): string {
  return [
    "<!doctype html>",
    "<html lang='en'>",
    "<head>",
    "<meta charset='utf-8' />",
    "<meta name='viewport' content='width=device-width, initial-scale=1' />",
    "<title>Content</title>",
    "<style>",
    "body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#0b1020;color:#e2e8f0;}",
    "main{max-width:1100px;margin:0 auto;padding:48px 24px;}",
    ".card{background:#111827;border:1px solid #334155;border-radius:16px;padding:24px;margin-top:20px;}",
    ".mono{font-family:ui-monospace,SFMono-Regular,monospace;color:#93c5fd;}",
    "a{color:#93c5fd;text-decoration:none}",
    "ul{line-height:1.6}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1 data-testid='content-placeholder-title'>Content backend is ready</h1>",
    "<p data-testid='content-placeholder-copy'>The backend, CLI, SDK contract, relay surface, frontend contracts, fixtures, and placeholder shell are implemented. The SPA mount at <span class='mono'>content/ui/</span> is intentionally reserved for the design implementation phase.</p>",
    "<div class='card' data-testid='content-placeholder-contracts'>",
    "<h2>Reserved frontend mount</h2>",
    "<ul>",
    `<li><a href='${clawApiPath("app/frontend-contract")}'>Frontend contract</a></li>`,
    `<li><a href='${clawApiPath("app/screens")}'>Screen definitions</a></li>`,
    `<li><a href='${clawApiPath("app/forms/entry.create")}'>Entry form schema</a></li>`,
    "<li><a href='/docs/frontend-checklist.md'>Frontend checklist</a></li>",
    "<li><a href='/docs/api-openapi.json'>OpenAPI</a></li>",
    "</ul>",
    "</div>",
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return (request.body ?? {}) as Record<string, unknown>;
}

function parseBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

class RealtimeHub {
  private readonly wsClients = new Set<import("ws").WebSocket>();

  attachSocket(socket: import("ws").WebSocket): void {
    this.wsClients.add(socket);
    socket.on("close", () => {
      this.wsClients.delete(socket);
    });
  }

  broadcast(event: ContentRealtimeEvent): void {
    const data = JSON.stringify(event);
    for (const socket of this.wsClients) {
      if (socket.readyState === socket.OPEN) socket.send(data);
    }
  }
}

async function requirePrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: ContentAuthService,
  store: ContentStore,
  operation?: ContentOperation,
): Promise<{ kind: "admin"; adminId: string; email: string } | { kind: "token"; operations: ContentOperation[] } | null> {
  const token = parseBearerToken(request);
  if (!token) {
    await reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  const admin = await auth.verifyAdminToken(token);
  if (admin) return admin;
  const scoped = store.authenticateScopedToken(token);
  if (!scoped) {
    await reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  if (operation && !scoped.operations.includes(operation)) {
    await reply.code(403).send({ error: "Forbidden" });
    return null;
  }
  return {
    kind: "token",
    operations: scoped.operations,
  };
}

async function createTemporalSchedule(
  config: ContentServiceConfig,
  input: { planId: string; entryId: string; variantId: string; title: string; scheduledAt: string },
): Promise<string | null> {
  if (!config.timeBaseUrl) return null;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.timeToken) headers.authorization = `Bearer ${config.timeToken}`;
  const response = await fetch(`${config.timeBaseUrl.replace(/\/$/, "")}/v1/items`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      kind: "reminder",
      title: `Publish ${input.title}`,
      description: `content plan ${input.planId}`,
      schedule: {
        mode: "one_off",
        timezone: "UTC",
        startsAt: input.scheduledAt,
      },
      sourceProvider: "content",
      anchorId: input.entryId,
      ownerId: input.variantId,
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { item?: { id?: string } };
  return payload.item?.id ?? null;
}

function buildDashboard(store: ContentStore) {
  const entries = store.listEntries();
  const destinations = store.listDestinations();
  const approvals = store.listApprovals({ status: "pending" });
  const runs = store.listRuns();
  const plans = store.listPlans();
  const assets = entries.flatMap((entry) => store.listAssets({ entryId: entry.id }));
  return {
    metrics: {
      drafts: entries.filter((entry) => entry.status === "draft").length,
      scheduled: entries.filter((entry) => entry.status === "scheduled").length,
      published: entries.filter((entry) => entry.status === "published" || entry.status === "partially_published").length,
      failed: entries.filter((entry) => entry.status === "failed").length,
      pendingApprovals: approvals.length,
      healthyDestinations: destinations.filter((destination) => destination.status === "active").length,
      assetsAttached: assets.length,
      activeCampaigns: store.listCampaigns().filter((campaign) => campaign.status === "active").length,
    },
    upcoming: plans.filter((plan) => plan.scheduledAt).slice(0, 10).map((plan) => {
      const entry = store.getEntry(plan.entryId);
      const destination = store.getDestination(plan.destinationId);
      return {
        planId: plan.id,
        title: entry?.title ?? "Untitled",
        scheduledAt: plan.scheduledAt,
        destination: destination?.name ?? plan.destinationId,
      };
    }),
    activity: runs.slice(0, 10).map((run) => {
      const destination = store.getDestination(run.destinationId);
      return {
        id: run.id,
        type: run.status === "failed" ? "publication.failed" : "publication.completed",
        label: `${run.status === "failed" ? "Failed" : "Published"} ${run.externalId ?? run.id} on ${destination?.name ?? run.destinationId}`,
        at: run.completedAt ?? run.startedAt,
      };
    }),
  };
}

function buildCalendar(store: ContentStore) {
  return {
    items: store.listPlans().filter((plan) => plan.scheduledAt).map((plan) => {
      const entry = store.getEntry(plan.entryId);
      const destination = store.getDestination(plan.destinationId);
      const approval = store.findLatestApprovalForVariant(plan.variantId);
      return {
        planId: plan.id,
        entryId: plan.entryId,
        title: entry?.title ?? "Untitled",
        scheduledAt: plan.scheduledAt,
        destination: destination ? { id: destination.id, name: destination.name, kind: destination.kind } : null,
        approvalStatus: approval?.status ?? null,
        planStatus: plan.status,
        canReschedule: plan.status === "scheduled",
      };
    }),
  };
}

function buildPipeline(store: ContentStore) {
  const entries = store.listEntries();
  const map: Record<string, ContentPublicationRun[]> = {};
  for (const run of store.listRuns()) {
    map[run.entryId] ??= [];
    map[run.entryId]!.push(run);
  }
  return {
    columns: ["draft", "review", "approved", "scheduled", "failed", "published"].map((column) => ({
      id: column,
      items: entries.filter((entry) => {
        if (column === "review") return entry.status === "in_review";
        return entry.status === column || (column === "published" && entry.status === "partially_published");
      }).map((entry) => ({
        id: entry.id,
        title: entry.title,
        status: entry.status,
        destinationSummary: store.listVariants({ entryId: entry.id }).length,
        assetCount: store.listAssets({ entryId: entry.id }).length,
        latestRunStatus: map[entry.id]?.[0]?.status ?? null,
        updatedAt: entry.updatedAt,
      })),
    })),
  };
}

function buildComposer(store: ContentStore, entryId: string) {
  const entry = store.getEntry(entryId);
  if (!entry) return staticReadModels.composer;
  return {
    entry,
    revisions: store.listRevisions(entry.id),
    variants: store.listVariants({ entryId: entry.id }).map((variant) => {
      const destination = store.getDestination(variant.destinationId);
      return {
        ...variant,
        destinationKind: destination?.kind ?? "webhook",
        destinationName: destination?.name ?? variant.destinationId,
      };
    }),
    assets: store.listAssets({ entryId: entry.id }),
    approvals: store.listApprovals().filter((approval) => approval.entryId === entry.id),
    plans: store.listPlans().filter((plan) => plan.entryId === entry.id),
  };
}

function buildDestinationsReadModel(store: ContentStore) {
  return {
    items: store.listDestinations().map((destination) => ({
      ...destination,
      variantCount: store.listVariants({ destinationId: destination.id }).length,
      pendingApprovalCount: store.listApprovals({ status: "pending" }).filter((approval) => approval.destinationId === destination.id).length,
    })),
  };
}

function buildApprovalsReadModel(store: ContentStore) {
  return {
    items: store.listApprovals().map((approval) => ({
      ...approval,
      entry: store.getEntry(approval.entryId),
      destination: store.getDestination(approval.destinationId),
      latestRevision: store.listRevisions(approval.entryId)[0] ?? null,
      previousRevision: store.listRevisions(approval.entryId)[1] ?? null,
    })),
  };
}

function buildPublicationsReadModel(store: ContentStore) {
  return {
    items: store.listRuns().map((run) => ({
      ...run,
      destination: store.getDestination(run.destinationId),
      entry: store.getEntry(run.entryId),
      canRetry: run.status === "failed",
    })),
  };
}

async function executePlan(store: ContentStore, planId: string): Promise<{ plan: Record<string, unknown>; run: ContentPublicationRun }> {
  const plan = store.getPlan(planId);
  if (!plan) throw new ContentError("Plan not found.", 404, "plan_not_found");
  const latestRun = store.latestRunForPlan(plan.id);
  if (latestRun?.status === "succeeded") {
    return {
      plan,
      run: latestRun,
    };
  }
  const entry = store.getEntry(plan.entryId);
  const variant = store.getVariant(plan.variantId);
  const destination = store.getDestination(plan.destinationId);
  if (!entry || !variant || !destination) {
    throw new ContentError("Plan references missing resources.", 409, "plan_references_missing");
  }
  const latestApproval = store.findLatestApprovalForVariant(variant.id);
  const assets = store.listAssets({ entryId: entry.id });
  if (approvalRequired({ destination, assets, scheduledAt: plan.scheduledAt }) && latestApproval?.status !== "approved") {
    throw new ContentError("Plan requires an approved approval request before publication.", 409, "approval_required");
  }
  const run = store.createRun({
    planId: plan.id,
    entryId: plan.entryId,
    variantId: plan.variantId,
    destinationId: plan.destinationId,
    attemptNumber: (latestRun?.attemptNumber ?? 0) + 1,
  });
  store.updatePlan(plan.id, { status: "running" });
  store.updateVariant(variant.id, { status: "scheduled" });
  store.updateEntry(entry.id, { status: "publishing" });
  try {
    const published = await publishVariant({
      planId: plan.id,
      entry,
      variant,
      destination,
      assets,
      attemptNumber: run.attemptNumber,
    });
    const completed = store.completeRun(run.id, {
      status: "succeeded",
      externalId: published.externalId,
      providerMessage: published.providerMessage,
      error: null,
    });
    store.updatePlan(plan.id, { status: "succeeded" });
    store.updateVariant(variant.id, { status: "published" });
    store.updateEntry(entry.id, { status: "published" });
    return { plan: store.getPlan(plan.id) ?? plan, run: completed };
  } catch (error) {
    const completed = store.completeRun(run.id, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    store.updatePlan(plan.id, { status: "failed" });
    store.updateVariant(variant.id, { status: "failed" });
    store.updateEntry(entry.id, { status: "failed" });
    throw new ContentError(completed.error ?? "Publication failed.", 500, "publication_failed", { runId: completed.id });
  }
}

function routeError(reply: FastifyReply, error: unknown): void {
  const correlationId = `corr_${randomUUID().slice(0, 8)}`;
  const envelope = errorEnvelope(error, correlationId);
  const statusCode = error instanceof ContentError ? error.statusCode : 500;
  void reply.code(statusCode).send(envelope);
}

export interface BuildContentAppOptions {
  config?: Partial<ContentServiceConfig>;
}

export function buildContentApp(options: BuildContentAppOptions = {}) {
  const config = loadContentConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false });
  const auth = new ContentAuthService(config.jwtSecret);
  const store = new ContentStore(config.dbPath, {
    adminEmail: config.adminEmail,
    adminPassword: config.adminPassword,
  });
  const realtime = new RealtimeHub();
  const uiRoot = resolveUiRoot();
  const docsRoot = resolveDocsRoot();
  const brandRoot = resolveBrandRoot();

  const emit = (event: ContentChangeEvent) => realtime.broadcast(event);

  app.addHook("onClose", async () => {
    store.close();
  });

  app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  });

  if (uiRoot) {
    app.register(fastifyStatic, {
      root: uiRoot,
      prefix: "/",
      wildcard: false,
      index: false,
    });
  }
  app.register(fastifyStatic, {
    root: docsRoot,
    prefix: "/docs/",
    decorateReply: false,
  });
  app.register(fastifyStatic, {
    root: brandRoot,
    prefix: "/brand/",
    decorateReply: false,
  });
  app.register(async (wsApp) => {
    await wsApp.register(websocket);
    wsApp.get(clawApiPath("events/ws"), { websocket: true }, async (socket) => {
      realtime.attachSocket(socket);
      socket.send(JSON.stringify({ type: "ready", at: new Date().toISOString() }));
    });
  });

  app.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    if (uiRoot) {
      return fs.readFileSync(path.join(uiRoot, "index.html"), "utf8");
    }
    return placeholderHtml();
  });

  app.get("/favicon.ico", async (_request, reply) => {
    await reply.code(204).send();
  });

  app.get(clawApiPath("health"), async () => ({
    ok: true,
    service: "content",
    host: config.host,
    port: config.port,
  }));

  app.post(clawApiPath("auth/admin/login"), async (request, reply) => {
    const body = readBody(request);
    const admin = store.verifyAdmin(String(body.email ?? ""), String(body.password ?? ""));
    if (!admin) return await reply.code(401).send({ error: "Invalid email or password." });
    const accessToken = await auth.issueAdminToken({ adminId: admin.id, email: admin.email });
    return { accessToken, admin };
  });

  app.get(clawApiPath("brands"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "brands:list");
    if (!principal) return null;
    return { brands: store.listBrands() };
  });

  app.post(clawApiPath("brands"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "brands:create");
    if (!principal) return null;
    try {
      const brand = store.createBrand(readBody(request) as Record<string, never>);
      emit({ type: STABLE_EVENT_TYPES.brandCreated, payload: brand as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return await reply.code(201).send({ brand });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.put(clawApiPath("brands/:brandId"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "brands:update");
    if (!principal) return null;
    try {
      const params = request.params as { brandId: string };
      const brand = store.updateBrand(params.brandId, readBody(request) as Record<string, never>);
      emit({ type: STABLE_EVENT_TYPES.brandUpdated, payload: brand as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return { brand };
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("destinations"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "destinations:list");
    if (!principal) return null;
    const query = request.query as { brandId?: string };
    return { destinations: store.listDestinations({ brandId: query.brandId }) };
  });

  app.post(clawApiPath("destinations"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "destinations:create");
    if (!principal) return null;
    try {
      const destination = store.createDestination(readBody(request) as Record<string, never>);
      emit({ type: STABLE_EVENT_TYPES.destinationCreated, payload: destination as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return await reply.code(201).send({ destination });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.put(clawApiPath("destinations/:destinationId"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "destinations:update");
    if (!principal) return null;
    try {
      const params = request.params as { destinationId: string };
      const destination = store.updateDestination(params.destinationId, readBody(request) as Record<string, never>);
      emit({ type: STABLE_EVENT_TYPES.destinationUpdated, payload: destination as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return { destination };
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("destinations/:destinationId/test-connection"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "destinations:update");
    if (!principal) return null;
    try {
      const params = request.params as { destinationId: string };
      const current = store.getDestination(params.destinationId);
      if (!current) throw new ContentError("Destination not found.", 404, "destination_not_found");
      const ok = current.kind === "website_page" || current.kind === "blog_post" || current.kind === "webhook" || Boolean(current.secretRef);
      const destination = store.updateDestination(current.id, {
        lastCheckedAt: new Date().toISOString(),
        lastError: ok ? null : "Destination requires secretRef before connection can be tested.",
        status: ok ? "active" : "error",
      });
      return { ok, destination };
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("campaigns"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "campaigns:list");
    if (!principal) return null;
    const query = request.query as { brandId?: string };
    return { campaigns: store.listCampaigns({ brandId: query.brandId }) };
  });

  app.post(clawApiPath("campaigns"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "campaigns:create");
    if (!principal) return null;
    try {
      const campaign = store.createCampaign(readBody(request) as Record<string, never>);
      emit({ type: STABLE_EVENT_TYPES.campaignCreated, payload: campaign as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return await reply.code(201).send({ campaign });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.put(clawApiPath("campaigns/:campaignId"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "campaigns:update");
    if (!principal) return null;
    try {
      const params = request.params as { campaignId: string };
      const campaign = store.updateCampaign(params.campaignId, readBody(request) as Record<string, never>);
      emit({ type: STABLE_EVENT_TYPES.campaignUpdated, payload: campaign as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return { campaign };
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("entries"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "entries:list");
    if (!principal) return null;
    const query = request.query as { brandId?: string; campaignId?: string; status?: ContentPublicationRun["status"] };
    return { entries: store.listEntries(query as Record<string, never>) };
  });

  app.post(clawApiPath("entries"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "entries:create");
    if (!principal) return null;
    try {
      const entry = store.createEntry(readBody(request) as Record<string, never>);
      emit({ type: STABLE_EVENT_TYPES.entryCreated, payload: entry as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return await reply.code(201).send({ entry });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("entries/:entryId"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "entries:read");
    if (!principal) return null;
    const params = request.params as { entryId: string };
    const entry = store.getEntry(params.entryId);
    if (!entry) return await reply.code(404).send({ error: "entry_not_found" });
    return {
      entry,
      revisions: store.listRevisions(entry.id),
      assets: store.listAssets({ entryId: entry.id }),
      variants: store.listVariants({ entryId: entry.id }),
    };
  });

  app.put(clawApiPath("entries/:entryId"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "entries:update");
    if (!principal) return null;
    try {
      const params = request.params as { entryId: string };
      const entry = store.updateEntry(params.entryId, readBody(request) as Record<string, never>);
      emit({ type: STABLE_EVENT_TYPES.entryUpdated, payload: entry as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return { entry };
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("entries/:entryId/archive"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "entries:archive");
    if (!principal) return null;
    try {
      const params = request.params as { entryId: string };
      const entry = store.archiveEntry(params.entryId);
      emit({ type: STABLE_EVENT_TYPES.entryArchived, payload: entry as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return { entry };
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("entries/:entryId/revisions"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "entries:read");
    if (!principal) return null;
    const params = request.params as { entryId: string };
    return { revisions: store.listRevisions(params.entryId) };
  });

  app.post(clawApiPath("entries/:entryId/assets"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "entries:assets:write");
    if (!principal) return null;
    try {
      const params = request.params as { entryId: string };
      const asset = store.attachAsset({
        entryId: params.entryId,
        driveItemId: String(readBody(request).driveItemId ?? ""),
        assetKind: String(readBody(request).assetKind ?? "image") as "image" | "video" | "document" | "audio",
        name: String(readBody(request).name ?? "Asset"),
        altText: typeof readBody(request).altText === "string" ? String(readBody(request).altText) : null,
      });
      emit({ type: STABLE_EVENT_TYPES.assetAttached, payload: asset as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return await reply.code(201).send({ asset });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("entries/:entryId/variants:generate"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "variants:generate");
    if (!principal) return null;
    try {
      const params = request.params as { entryId: string };
      const body = readBody(request);
      const entry = store.getEntry(params.entryId);
      if (!entry) throw new ContentError("Entry not found.", 404, "entry_not_found");
      const destinationIds = Array.isArray(body.destinationIds) ? body.destinationIds.map(String) : [];
      const assets = store.listAssets({ entryId: entry.id });
      const variants = destinationIds.map((destinationId) => {
        const destination = store.getDestination(destinationId);
        if (!destination) throw new ContentError("Destination not found.", 404, "destination_not_found");
        const generated = buildGeneratedVariant({ entry, destination, assets });
        const existing = store.listVariants({ entryId: entry.id, destinationId: destination.id })[0] ?? null;
        return existing
          ? store.updateVariant(existing.id, generated)
          : store.createVariant({
            entryId: entry.id,
            destinationId: destination.id,
            ...generated,
          });
      });
      emit({ type: STABLE_EVENT_TYPES.variantGenerated, payload: { entryId: entry.id, count: variants.length }, at: new Date().toISOString() });
      return { variants };
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("variants"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "variants:list");
    if (!principal) return null;
    const query = request.query as { entryId?: string; destinationId?: string; status?: string };
    return { variants: store.listVariants(query as Record<string, never>) };
  });

  app.post(clawApiPath("variants"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "variants:create");
    if (!principal) return null;
    try {
      const variant = store.createVariant(readBody(request) as Record<string, never>);
      emit({ type: STABLE_EVENT_TYPES.variantCreated, payload: variant as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return await reply.code(201).send({ variant });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.put(clawApiPath("variants/:variantId"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "variants:update");
    if (!principal) return null;
    try {
      const params = request.params as { variantId: string };
      const variant = store.updateVariant(params.variantId, readBody(request) as Record<string, never>);
      emit({ type: STABLE_EVENT_TYPES.variantUpdated, payload: variant as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return { variant };
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("approvals"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "approvals:list");
    if (!principal) return null;
    const query = request.query as { status?: string };
    return { approvals: store.listApprovals({ status: query.status as "pending" | "approved" | "rejected" | "expired" | "cancelled" | undefined }) };
  });

  app.post(clawApiPath("approvals/:approvalId/approve"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "approvals:review");
    if (!principal) return null;
    try {
      const params = request.params as { approvalId: string };
      const approval = store.reviewApproval(params.approvalId, {
        status: "approved",
        reviewedBy: principal.kind === "admin" ? principal.email : "scoped-token",
        comment: typeof readBody(request).comment === "string" ? String(readBody(request).comment) : null,
      });
      const plan = store.listPlans().find((item) => item.variantId === approval.variantId && (item.status === "queued" || item.status === "scheduled"));
      if (plan) {
        store.updatePlan(plan.id, { status: plan.scheduledAt ? "scheduled" : "queued" });
      }
      const variant = store.getVariant(approval.variantId);
      if (variant) store.updateVariant(variant.id, { status: "approved" });
      emit({ type: STABLE_EVENT_TYPES.approvalReviewed, payload: approval as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return { approval };
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("approvals/:approvalId/reject"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "approvals:review");
    if (!principal) return null;
    try {
      const params = request.params as { approvalId: string };
      const comment = typeof readBody(request).comment === "string" ? String(readBody(request).comment) : "";
      if (!comment.trim()) throw new ContentError("Reject requires comment.", 400, "approval_comment_required");
      const approval = store.reviewApproval(params.approvalId, {
        status: "rejected",
        reviewedBy: principal.kind === "admin" ? principal.email : "scoped-token",
        comment,
      });
      const plan = store.listPlans().find((item) => item.variantId === approval.variantId && item.status !== "succeeded");
      if (plan) store.updatePlan(plan.id, { status: "cancelled" });
      emit({ type: STABLE_EVENT_TYPES.approvalReviewed, payload: approval as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return { approval };
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("approvals/:approvalId/cancel"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "approvals:review");
    if (!principal) return null;
    try {
      const params = request.params as { approvalId: string };
      const approval = store.reviewApproval(params.approvalId, {
        status: "cancelled",
        reviewedBy: principal.kind === "admin" ? principal.email : "scoped-token",
      });
      emit({ type: STABLE_EVENT_TYPES.approvalReviewed, payload: approval as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return { approval };
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("plans"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "plans:list");
    if (!principal) return null;
    const query = request.query as { status?: string };
    return { plans: store.listPlans({ status: query.status as "queued" | "scheduled" | "running" | "succeeded" | "failed" | "cancelled" | undefined }) };
  });

  app.post(clawApiPath("plans"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "plans:create");
    if (!principal) return null;
    try {
      const body = readBody(request);
      const variant = store.getVariant(String(body.variantId ?? ""));
      if (!variant) throw new ContentError("Variant not found.", 404, "variant_not_found");
      if (variant.validationErrors.length > 0) throw new ContentError("Variant has validation errors.", 409, "variant_blocked", { validationErrors: variant.validationErrors });
      const entry = store.getEntry(variant.entryId);
      const destination = store.getDestination(variant.destinationId);
      if (!entry || !destination) throw new ContentError("Variant references missing resources.", 409, "variant_references_missing");
      const assets = store.listAssets({ entryId: entry.id });
      const scheduledAt = typeof body.scheduledAt === "string" && body.scheduledAt.trim() ? String(body.scheduledAt) : null;
      const requiresApproval = approvalRequired({ destination, assets, scheduledAt });
      const plan = store.createPlan({
        entryId: entry.id,
        variantId: variant.id,
        destinationId: destination.id,
        status: scheduledAt ? "scheduled" : (requiresApproval ? "queued" : "queued"),
        scheduledAt,
        temporalItemId: null,
        destinationSnapshot: {
          id: destination.id,
          name: destination.name,
          kind: destination.kind,
          publishPolicy: destination.publishPolicy,
          capabilityMap: destination.capabilityMap,
        },
      });
      const updatedTemporalItemId = scheduledAt ? await createTemporalSchedule(config, {
        planId: plan.id,
        entryId: entry.id,
        variantId: variant.id,
        title: entry.title,
        scheduledAt,
      }) : null;
      const finalPlan = updatedTemporalItemId !== plan.temporalItemId
        ? store.updatePlan(plan.id, { temporalItemId: updatedTemporalItemId })
        : plan;
      let approval = null;
      if (requiresApproval) {
        approval = store.createApproval({
          entryId: entry.id,
          variantId: variant.id,
          destinationId: destination.id,
          requestedBy: principal.kind === "admin" ? principal.email : "scoped-token",
        });
        store.updateVariant(variant.id, { status: "draft" });
        store.updateEntry(entry.id, { status: "in_review" });
        emit({ type: STABLE_EVENT_TYPES.approvalCreated, payload: approval as unknown as Record<string, unknown>, at: new Date().toISOString() });
      } else {
        store.updateVariant(variant.id, { status: scheduledAt ? "scheduled" : "approved" });
        store.updateEntry(entry.id, { status: scheduledAt ? "scheduled" : "approved" });
      }
      emit({ type: STABLE_EVENT_TYPES.planCreated, payload: finalPlan as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return await reply.code(201).send({ plan: finalPlan, approval });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("plans/:planId/run"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "plans:run");
    if (!principal) return null;
    try {
      const params = request.params as { planId: string };
      const result = await executePlan(store, params.planId);
      emit({ type: STABLE_EVENT_TYPES.planExecuted, payload: { planId: params.planId, runId: result.run.id }, at: new Date().toISOString() });
      return result;
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("plans/:planId/cancel"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "plans:cancel");
    if (!principal) return null;
    try {
      const params = request.params as { planId: string };
      const plan = store.updatePlan(params.planId, { status: "cancelled" });
      emit({ type: STABLE_EVENT_TYPES.planCancelled, payload: plan as unknown as Record<string, unknown>, at: new Date().toISOString() });
      return { plan };
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("publications"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "publications:list");
    if (!principal) return null;
    const runs = store.listRuns().map((run) => ({ ...run, canRetry: run.status === "failed" }));
    return { runs };
  });

  app.get(clawApiPath("publications/:runId"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "publications:list");
    if (!principal) return null;
    const params = request.params as { runId: string };
    const run = store.getRun(params.runId);
    if (!run) return await reply.code(404).send({ error: "publication_run_not_found" });
    return { run, canRetry: run.status === "failed", plan: store.getPlan(run.planId) };
  });

  app.post(clawApiPath("publications/:runId/retry"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "publications:retry");
    if (!principal) return null;
    try {
      const params = request.params as { runId: string };
      const run = store.getRun(params.runId);
      if (!run) throw new ContentError("Publication run not found.", 404, "publication_run_not_found");
      if (run.status !== "failed") throw new ContentError("Only failed runs can be retried.", 409, "publication_retry_forbidden");
      const result = await executePlan(store, run.planId);
      return result;
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("scheduler/run"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "plans:run");
    if (!principal) return null;
    try {
      const runs: ContentPublicationRun[] = [];
      for (const plan of store.duePlans()) {
        const result = await executePlan(store, plan.id).catch(() => null);
        if (result) runs.push(result.run);
      }
      return { runs };
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("tokens"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "tokens:issue");
    if (!principal) return null;
    return { tokens: store.listTokens() };
  });

  app.post(clawApiPath("tokens"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "tokens:issue");
    if (!principal) return null;
    try {
      const body = readBody(request);
      const issued = store.issueScopedToken({
        label: String(body.label ?? "Content token"),
        operations: Array.isArray(body.operations) ? body.operations.map(String) as never[] : ["app:read"],
      });
      return await reply.code(201).send(issued);
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("tokens/:tokenId/revoke"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "tokens:revoke");
    if (!principal) return null;
    try {
      const params = request.params as { tokenId: string };
      const record = store.revokeToken(params.tokenId);
      return { record };
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("app/frontend-contract"), async (_request) => frontendContract);
  app.get(clawApiPath("app/screens"), async () => ({ screens: frontendContract.screens }));
  app.get(clawApiPath("app/dashboard"), async () => buildDashboard(store));
  app.get(clawApiPath("app/calendar"), async () => buildCalendar(store));
  app.get(clawApiPath("app/pipeline"), async () => buildPipeline(store));
  app.get(clawApiPath("app/composer/:entryId"), async (request) => {
    const params = request.params as { entryId: string };
    return buildComposer(store, params.entryId);
  });
  app.get(clawApiPath("app/destinations"), async () => buildDestinationsReadModel(store));
  app.get(clawApiPath("app/approvals"), async () => buildApprovalsReadModel(store));
  app.get(clawApiPath("app/publications"), async () => buildPublicationsReadModel(store));
  app.get(clawApiPath("app/forms/:formId"), async (request, reply) => {
    const params = request.params as { formId: string };
    const form = staticFormSchemas[params.formId];
    if (!form) return await reply.code(404).send({ error: "form_not_found" });
    return form;
  });

  // SPA catch-all: serve index.html for any unmatched GET that is not an API or static route
  if (uiRoot) {
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/v1/") && !request.url.startsWith("/docs/") && !request.url.startsWith("/brand/")) {
        reply.type("text/html; charset=utf-8");
        return fs.readFileSync(path.join(uiRoot, "index.html"), "utf8");
      }
      return reply.code(404).send({ error: "not_found" });
    });
  }

  return { app, store, auth, config };
}
