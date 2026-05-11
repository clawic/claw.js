import path from "node:path";
import fs from "node:fs";

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";

import { loadConfig, type BadgerConfig } from "./config.ts";
import { openDatabase } from "./db/index.ts";
import { AuthService, type AuthPrincipal } from "./auth.ts";
import { AuditLog } from "./domain/audit.ts";
import { ChannelRegistry } from "./channels/index.ts";
import { WorkspacesService, UsersService, MembersService, InvitationsService } from "./domain/workspaces.ts";
import { ChannelAccountsService } from "./domain/channels.ts";
import { PostsService } from "./domain/posts.ts";
import { MediaService } from "./domain/media.ts";
import { QueuesService, BlackoutsService } from "./domain/queues.ts";
import { WebhooksService } from "./domain/webhooks.ts";
import {
  LabelsService,
  CampaignsService,
  TemplatesService,
  HashtagGroupsService,
  DynamicVariablesService,
  RecurrencesService,
  EvergreenService,
  AbTestsService,
  UtmTemplatesService,
  TrackedLinksService,
  ImportsService,
  AnalyticsService,
  ReportsService,
  InboxService,
  ApprovalsService,
  IntegrationsService,
  BrandVoicesService,
  SettingsService,
} from "./domain/misc.ts";
import { JobsService } from "./domain/jobs.ts";
import { createVaultClient, type VaultClient } from "./vault/client.ts";
import { RealtimeBus, registerRealtime } from "./realtime/ws.ts";
import { EventBus } from "./webhooks/emitter.ts";
import { RateLimiter } from "./pipeline/rate_limiter.ts";
import { Scheduler } from "./pipeline/scheduler.ts";
import { Worker } from "./pipeline/worker.ts";
import { registerRoutes } from "./routes/v1/index.ts";

export interface BuildAppOptions {
  config?: Partial<BadgerConfig>;
}

export interface BuiltApp {
  app: FastifyInstance;
  config: BadgerConfig;
  services: AppServices;
  timers: NodeJS.Timeout[];
  shutdown: () => Promise<void>;
}

export interface AppServices {
  auth: AuthService;
  registry: ChannelRegistry;
  workspaces: WorkspacesService;
  users: UsersService;
  members: MembersService;
  invitations: InvitationsService;
  channels: ChannelAccountsService;
  posts: PostsService;
  media: MediaService;
  queues: QueuesService;
  blackouts: BlackoutsService;
  webhooks: WebhooksService;
  labels: LabelsService;
  campaigns: CampaignsService;
  templates: TemplatesService;
  hashtagGroups: HashtagGroupsService;
  dynamicVariables: DynamicVariablesService;
  recurrences: RecurrencesService;
  evergreen: EvergreenService;
  ab: AbTestsService;
  utm: UtmTemplatesService;
  trackedLinks: TrackedLinksService;
  imports: ImportsService;
  analytics: AnalyticsService;
  reports: ReportsService;
  inbox: InboxService;
  approvals: ApprovalsService;
  integrations: IntegrationsService;
  brandVoices: BrandVoicesService;
  settings: SettingsService;
  jobs: JobsService;
  audit: AuditLog;
  events: EventBus;
  realtime: RealtimeBus;
  rateLimiter: RateLimiter;
  scheduler: Scheduler;
  worker: Worker;
  vault: VaultClient;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<BuiltApp> {
  const config = loadConfig(options.config ?? {});
  fs.mkdirSync(config.dataDir, { recursive: true });

  const db = openDatabase(config.dbPath);
  const auth = new AuthService(db, config.tokenStorePath);
  const audit = new AuditLog(db);
  const vault = createVaultClient({
    baseUrl: config.vaultBaseUrl,
    fallbackDir: path.join(config.dataDir, "vault"),
  });

  const registry = new ChannelRegistry();
  registry.seed(db);

  const workspaces = new WorkspacesService(db);
  const users = new UsersService(db);
  const members = new MembersService(db);
  const invitations = new InvitationsService(db);
  const channels = new ChannelAccountsService(db);
  const posts = new PostsService(db);
  const media = new MediaService(db, path.join(config.dataDir, "media"));
  const queues = new QueuesService(db);
  const blackouts = new BlackoutsService(db);
  const webhooks = new WebhooksService(db, vault);
  const labels = new LabelsService(db);
  const campaigns = new CampaignsService(db);
  const templates = new TemplatesService(db);
  const hashtagGroups = new HashtagGroupsService(db);
  const dynamicVariables = new DynamicVariablesService(db);
  const recurrences = new RecurrencesService(db);
  const evergreen = new EvergreenService(db);
  const ab = new AbTestsService(db);
  const utm = new UtmTemplatesService(db);
  const trackedLinks = new TrackedLinksService(db);
  const imports = new ImportsService(db);
  const analytics = new AnalyticsService(db);
  const reports = new ReportsService(db);
  const inbox = new InboxService(db);
  const approvals = new ApprovalsService(db);
  const integrations = new IntegrationsService(db);
  const brandVoices = new BrandVoicesService(db);
  const settings = new SettingsService(db);
  const jobs = new JobsService(db);

  const realtime = new RealtimeBus();
  const events = new EventBus(webhooks, jobs, vault, realtime);
  const rateLimiter = new RateLimiter();
  const scheduler = new Scheduler(posts, jobs, channels, events);
  const worker = new Worker({
    db,
    jobs,
    posts,
    channels,
    registry,
    events,
    vault,
    rateLimiter,
    analytics,
    recurrences,
    ab,
    evergreen,
  });

  const app = Fastify({ logger: { level: process.env.BADGER_LOG_LEVEL ?? "info" } });
  await app.register(cors, { origin: config.corsOrigins.length ? config.corsOrigins : true, credentials: true });
  await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } });
  await app.register(websocket);

  const services: AppServices = {
    auth, registry, workspaces, users, members, invitations, channels, posts, media,
    queues, blackouts, webhooks, labels, campaigns, templates, hashtagGroups,
    dynamicVariables, recurrences, evergreen, ab, utm, trackedLinks, imports,
    analytics, reports, inbox, approvals, integrations, brandVoices, settings, jobs, audit,
    events, realtime, rateLimiter, scheduler, worker, vault,
  };

  app.decorate("services", services);
  app.decorate("badgerConfig", config);
  app.decorateRequest("principal", null);

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const principal = auth.resolvePrincipal(request);
    (request as FastifyRequest & { principal: AuthPrincipal | null }).principal = principal;
    if (isOpenPath(request.url)) return;
    if (!principal) {
      reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/healthz", async () => ({ ok: true, service: "badger" }));
  app.get("/v1/families", async () => ({ families: registry.list() }));
  app.get<{ Params: { id: string } }>("/v1/families/:id", async (req, reply) => {
    const family = registry.family(req.params.id);
    if (!family) return reply.code(404).send({ error: "not_found" });
    return family;
  });

  await registerRealtime(app, realtime, auth);
  await registerRoutes(app);

  const timers: NodeJS.Timeout[] = [];
  if (config.pipelineEnabled) {
    timers.push(setInterval(() => {
      try { scheduler.tick(); } catch (err) { app.log.error({ err }, "scheduler tick failed"); }
    }, config.schedulerTickMs));
    timers.push(setInterval(() => {
      worker.tick().catch((err) => app.log.error({ err }, "worker tick failed"));
    }, config.workerTickMs));
    timers.push(setInterval(() => {
      try {
        const due = recurrences.due(Date.now());
        for (const r of due) recurrences.advance(String(r.id), String(r.rule));
      } catch (err) {
        app.log.error({ err }, "recurrence tick failed");
      }
    }, config.recurrenceTickMs));
  }

  const shutdown = async () => {
    for (const t of timers) clearInterval(t);
    await app.close();
    db.close();
  };

  return { app, config, services, timers, shutdown };
}

function isOpenPath(url: string): boolean {
  if (url === "/healthz") return true;
  if (url.startsWith("/openapi.json")) return true;
  return false;
}

declare module "fastify" {
  interface FastifyInstance {
    services: AppServices;
    badgerConfig: BadgerConfig;
  }
  interface FastifyRequest {
    principal: AuthPrincipal | null;
  }
}
