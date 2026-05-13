import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { PostsService } from "../../domain/posts.ts";
import type {
  UtmTemplatesService,
  EvergreenService,
  AbTestsService,
  ReportsService,
  IntegrationsService,
  BrandVoicesService,
} from "../../domain/misc.ts";

import {
  approvalWorkflowInput,
  campaignInput,
  channelAccountInput,
  labelInput,
  memberInput,
  postSpec,
  queueInput,
  queueSlotInput,
  recurrenceInput,
  templateInput,
  tokenInput,
  webhookInput,
  workspaceInput,
} from "../../../shared/schemas.ts";
import type { AuthPrincipal } from "../../auth.ts";

function authorizedFor(principal: AuthPrincipal | null, workspaceId: string): boolean {
  if (!principal) return false;
  if (principal.kind === "ephemeral_admin") return true;
  if (principal.kind === "user" || principal.kind === "service") {
    return !principal.workspaceId || principal.workspaceId === workspaceId;
  }
  return false;
}

function wsParam(req: FastifyRequest): string {
  return (req.params as { ws: string }).ws;
}

function badRequest(reply: FastifyReply, issues: unknown) {
  return reply.code(400).send({ error: "invalid_input", issues });
}

export async function registerRoutes(app: FastifyInstance) {
  const s = () => app.services;

  // ───── Workspaces and identity ────────────────────────────────────────────
  app.get("/v1/workspaces", async () => ({ workspaces: s().workspaces.list() }));
  app.post("/v1/workspaces", async (req, reply) => {
    const parsed = workspaceInput.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const ws = s().workspaces.create(parsed.data);
    s().audit.record({ workspaceId: ws.id, principal: req.principal, action: "workspace.created", targetType: "workspace", targetId: ws.id });
    s().events.emit({ workspaceId: ws.id, name: "workspace.created", data: { workspace: ws } });
    return reply.code(201).send({ workspace: ws });
  });
  app.get<{ Params: { ws: string } }>("/v1/workspaces/:ws", async (req, reply) => {
    if (!authorizedFor(req.principal, req.params.ws)) return reply.code(403).send({ error: "forbidden" });
    const ws = s().workspaces.get(req.params.ws);
    if (!ws) return reply.code(404).send({ error: "not_found" });
    return ws;
  });
  app.patch<{ Params: { ws: string } }>("/v1/workspaces/:ws", async (req, reply) => {
    if (!authorizedFor(req.principal, req.params.ws)) return reply.code(403).send({ error: "forbidden" });
    return s().workspaces.update(req.params.ws, req.body as Record<string, never>);
  });
  app.delete<{ Params: { ws: string } }>("/v1/workspaces/:ws", async (req, reply) => {
    if (!authorizedFor(req.principal, req.params.ws)) return reply.code(403).send({ error: "forbidden" });
    s().workspaces.delete(req.params.ws);
    return { ok: true };
  });

  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/members", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const parsed = memberInput.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const user = s().users.upsert(parsed.data.email, parsed.data.email);
    s().members.add(wsParam(req), user.id, parsed.data.role, parsed.data.scoped_account_ids ?? null);
    s().events.emit({ workspaceId: wsParam(req), name: "member.added", data: { user_id: user.id, role: parsed.data.role } });
    return reply.code(201).send({ member: { workspace_id: wsParam(req), user_id: user.id, role: parsed.data.role } });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/members", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { members: s().members.list(wsParam(req)) };
  });
  app.delete<{ Params: { ws: string; userId: string } }>("/v1/ws/:ws/members/:userId", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    s().members.remove(req.params.ws, req.params.userId);
    s().events.emit({ workspaceId: req.params.ws, name: "member.removed", data: { user_id: req.params.userId } });
    return { ok: true };
  });

  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/invitations", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const parsed = memberInput.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    return reply.code(201).send({ invitation: s().invitations.create(wsParam(req), parsed.data.email, parsed.data.role) });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/invitations", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { invitations: s().invitations.list(wsParam(req)) };
  });

  // ───── Tokens ─────────────────────────────────────────────────────────────
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/tokens", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const parsed = tokenInput.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const minted = s().auth.createToken({
      workspaceId: wsParam(req),
      userId: null,
      name: parsed.data.name,
      scopes: parsed.data.scopes,
      expiresAt: parsed.data.expires_at ? Date.parse(parsed.data.expires_at) : null,
    });
    return reply.code(201).send({ id: minted.id, secret: minted.secret, name: parsed.data.name });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/tokens", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { tokens: s().auth.listTokens(wsParam(req)) };
  });
  app.delete<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/tokens/:id", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    s().auth.revokeToken(req.params.id);
    return { ok: true };
  });

  // ───── Audit ──────────────────────────────────────────────────────────────
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/audit", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { events: s().audit.list(wsParam(req)) };
  });

  // ───── Channels ───────────────────────────────────────────────────────────
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/channels", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const parsed = channelAccountInput.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const account = s().channels.create({
      workspaceId: wsParam(req),
      familyId: parsed.data.family_id,
      providerAccountId: parsed.data.provider_account_id,
      displayName: parsed.data.display_name,
      handle: parsed.data.handle ?? null,
      avatarUrl: parsed.data.avatar_url ?? null,
      metadata: parsed.data.metadata,
      credentialsVaultRef: parsed.data.credentials_vault_ref ?? null,
      scopes: parsed.data.scopes,
    });
    s().events.emit({ workspaceId: wsParam(req), name: "channel.connected", data: { channel_account_id: account.id, family_id: account.familyId } });
    return reply.code(201).send({ account });
  });
  app.post<{ Params: { ws: string; family: string } }>("/v1/ws/:ws/channels/connect/:family", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const adapter = s().registry.adapter(req.params.family);
    if (!adapter || !adapter.connectStatic) return reply.code(400).send({ error: "family_does_not_support_static_connect" });
    const ctxReal = adapterContextForConnect(app, wsParam(req), req.params.family);
    const init = await adapter.connectStatic(ctxReal, (req.body ?? {}) as Record<string, unknown>);
    const account = s().channels.create({
      workspaceId: wsParam(req),
      familyId: req.params.family,
      providerAccountId: init.providerAccountId,
      displayName: init.displayName,
      handle: init.handle ?? null,
      avatarUrl: init.avatarUrl ?? null,
      metadata: init.metadata,
      credentialsVaultRef: init.credentialsVaultRef,
      scopes: init.scopes,
      tokenExpiresAt: init.tokenExpiresAt ?? null,
    });
    s().events.emit({ workspaceId: wsParam(req), name: "channel.connected", data: { channel_account_id: account.id, family_id: req.params.family } });
    return reply.code(201).send({ account });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/channels", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { accounts: s().channels.list(wsParam(req)) };
  });
  app.get<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/channels/:id", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const account = s().channels.get(wsParam(req), req.params.id);
    if (!account) return reply.code(404).send({ error: "not_found" });
    return account;
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/channels/:id/probe", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    s().jobs.enqueue({
      workspaceId: wsParam(req),
      kind: "health_probe",
      payload: { channel_account_id: req.params.id },
      maxAttempts: 1,
      availableAt: Date.now(),
    });
    return { ok: true, queued: true };
  });
  app.delete<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/channels/:id", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    s().channels.remove(req.params.id);
    s().events.emit({ workspaceId: wsParam(req), name: "channel.removed", data: { channel_account_id: req.params.id } });
    return { ok: true };
  });

  // ───── Posts ──────────────────────────────────────────────────────────────
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/posts", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const parsed = postSpec.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const post = s().posts.create(wsParam(req), null, parsed.data);
    s().events.emit({ workspaceId: wsParam(req), name: "post.created", data: { post_id: post.id } });
    return reply.code(201).send({ post });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/posts", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const q = req.query as { status?: string; from?: string; to?: string; limit?: string };
    return {
      posts: s().posts.list(wsParam(req), {
        status: q.status as never,
        from: q.from ? Date.parse(q.from) : undefined,
        to: q.to ? Date.parse(q.to) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
      }),
    };
  });
  app.get<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/posts/:id", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const post = s().posts.get(wsParam(req), req.params.id);
    if (!post) return reply.code(404).send({ error: "not_found" });
    return {
      post,
      variants: s().posts.listVariants(post.id),
      accounts: s().posts.listAccountsForPost(post.id),
      activity: s().posts.activity(post.id),
    };
  });
  app.patch<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/posts/:id", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return s().posts.update(req.params.ws, req.params.id, (req.body ?? {}) as Record<string, never>);
  });
  app.delete<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/posts/:id", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    s().posts.delete(req.params.ws, req.params.id);
    s().events.emit({ workspaceId: wsParam(req), name: "post.deleted", data: { post_id: req.params.id } });
    return { ok: true };
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/posts/:id/schedule", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = (req.body ?? {}) as { at?: string; tz?: string; now?: boolean };
    if (body.now) {
      const post = s().posts.schedule(req.params.ws, req.params.id, Date.now());
      s().events.emit({ workspaceId: wsParam(req), name: "post.scheduled", data: { post_id: post.id, scheduled_at: post.scheduled_at } });
      return { post };
    }
    if (!body.at) return reply.code(400).send({ error: "missing_at" });
    const ts = Date.parse(body.at);
    if (Number.isNaN(ts)) return reply.code(400).send({ error: "invalid_at" });
    const post = s().posts.schedule(req.params.ws, req.params.id, ts);
    s().events.emit({ workspaceId: wsParam(req), name: "post.scheduled", data: { post_id: post.id, scheduled_at: post.scheduled_at } });
    return { post };
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/posts/:id/unschedule", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { post: s().posts.unschedule(req.params.ws, req.params.id) };
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/posts/:id/cancel", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { post: s().posts.cancel(req.params.ws, req.params.id) };
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/posts/:id/duplicate", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const dup = s().posts.duplicate(req.params.ws, req.params.id, null);
    s().events.emit({ workspaceId: wsParam(req), name: "post.duplicated", data: { post_id: dup.id, source_id: req.params.id } });
    return { post: dup };
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/posts/:id/retry", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = (req.body ?? {}) as { account?: string };
    const post = s().posts.get(req.params.ws, req.params.id);
    if (!post) return reply.code(404).send({ error: "not_found" });
    const accounts = s().posts.listAccountsForPost(post.id).filter((a) => !a.provider_post_id && (!body.account || a.channel_account_id === body.account));
    const batch = s().jobs.createBatch(wsParam(req), "retry_publish", post.id);
    for (const a of accounts) {
      s().jobs.enqueue({
        workspaceId: wsParam(req),
        batchId: batch.id,
        kind: "publish_post_account",
        payload: { post_id: post.id, channel_account_id: a.channel_account_id },
        maxAttempts: 5,
        availableAt: Date.now(),
      });
    }
    s().posts.setPublishStatus(post.id, "publishing");
    return { post: s().posts.get(req.params.ws, req.params.id), retried_accounts: accounts.length };
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/posts/:id/editorial", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = (req.body ?? {}) as { status?: string };
    if (!body.status) return reply.code(400).send({ error: "missing_status" });
    s().posts.setEditorialStatus(req.params.id, body.status as never);
    return { ok: true };
  });
  app.put<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/posts/:id/variants", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { channel_account_id?: string | null; variant: Parameters<PostsService["setVariant"]>[2] };
    s().posts.setVariant(req.params.id, body.channel_account_id ?? null, body.variant);
    return { ok: true };
  });

  // ───── Media ──────────────────────────────────────────────────────────────
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/media", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    if (!req.isMultipart()) return reply.code(400).send({ error: "expected_multipart" });
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "no_file" });
    const buffer = await part.toBuffer();
    const altText = (part.fields.alt_text as { value?: string } | undefined)?.value;
    const media = s().media.upload(wsParam(req), {
      name: part.filename ?? "upload",
      mimeType: part.mimetype,
      body: buffer,
      altText,
    });
    s().events.emit({ workspaceId: wsParam(req), name: "media.uploaded", data: { media_id: media.id } });
    return reply.code(201).send({ media });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/media", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { media: s().media.list(wsParam(req), (req.query as { mime?: string }).mime) };
  });
  app.get<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/media/:id", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const media = s().media.get(req.params.ws, req.params.id);
    if (!media) return reply.code(404).send({ error: "not_found" });
    return media;
  });

  // ───── Queues + blackouts ─────────────────────────────────────────────────
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/queues", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const parsed = queueInput.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    return reply.code(201).send({ queue: s().queues.create(wsParam(req), parsed.data) });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/queues", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { queues: s().queues.list(wsParam(req)) };
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/queues/:id/slots", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const parsed = queueSlotInput.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    return reply.code(201).send({ slot: s().queues.addSlot(req.params.id, parsed.data.day_of_week, parsed.data.time_of_day) });
  });
  app.get<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/queues/:id/slots", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { slots: s().queues.listSlots(req.params.id) };
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/queues/:id/accounts", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { channel_account_id: string };
    s().queues.attachAccount(req.params.id, body.channel_account_id);
    return { ok: true };
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/queues/:id/entries", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { post_id: string };
    const entry = s().queues.enqueue(req.params.id, body.post_id);
    const blackouts = s().blackouts.list(req.params.ws, null);
    s().queues.resolvePending(req.params.id, blackouts);
    return reply.code(201).send({ entry });
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/queues/:id/pause", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    s().queues.pause(req.params.id);
    s().events.emit({ workspaceId: wsParam(req), name: "queue.paused", data: { queue_id: req.params.id } });
    return { ok: true };
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/queues/:id/resume", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    s().queues.resume(req.params.id);
    s().events.emit({ workspaceId: wsParam(req), name: "queue.resumed", data: { queue_id: req.params.id } });
    return { ok: true };
  });
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/blackouts", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { channel_account_id?: string; starts_at: string; ends_at: string; reason?: string };
    return reply.code(201).send({
      blackout: s().blackouts.create(wsParam(req), {
        channel_account_id: body.channel_account_id ?? null,
        starts_at: Date.parse(body.starts_at),
        ends_at: Date.parse(body.ends_at),
        reason: body.reason,
      }),
    });
  });

  // ───── Labels, campaigns, templates, hashtags, dynvars, UTM ───────────────
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/labels", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const parsed = labelInput.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    return reply.code(201).send({ label: s().labels.create(wsParam(req), parsed.data) });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/labels", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { labels: s().labels.list(wsParam(req)) };
  });
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/campaigns", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const parsed = campaignInput.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    return reply.code(201).send({
      campaign: s().campaigns.create(wsParam(req), {
        ...parsed.data,
        starts_at: parsed.data.starts_at ? Date.parse(parsed.data.starts_at) : null,
        ends_at: parsed.data.ends_at ? Date.parse(parsed.data.ends_at) : null,
      }),
    });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/campaigns", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { campaigns: s().campaigns.list(wsParam(req)) };
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/campaigns/:id/posts", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { post_id: string };
    s().campaigns.addPost(req.params.id, body.post_id);
    return { ok: true };
  });
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/templates", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const parsed = templateInput.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    return reply.code(201).send({ template: s().templates.create(wsParam(req), null, parsed.data) });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/templates", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { templates: s().templates.list(wsParam(req)) };
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/templates/:id/apply", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const tpl = s().templates.get(req.params.ws, req.params.id);
    if (!tpl) return reply.code(404).send({ error: "not_found" });
    const vars = (req.body ?? {}) as Record<string, string>;
    return { blocks: s().templates.apply({ blocks: tpl.blocks as unknown[], variables: tpl.variables as Record<string, unknown> }, vars) };
  });
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/hashtag-groups", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { name: string; hashtags: string[]; applicable_families?: string[] };
    return reply.code(201).send({ group: s().hashtagGroups.create(wsParam(req), body) });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/hashtag-groups", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { groups: s().hashtagGroups.list(wsParam(req)) };
  });
  app.put<{ Params: { ws: string } }>("/v1/ws/:ws/dynamic-variables", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { name: string; kind: string; value: unknown; cache_ttl_seconds?: number };
    return { variable: s().dynamicVariables.upsert(wsParam(req), body) };
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/dynamic-variables", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { variables: s().dynamicVariables.list(wsParam(req)) };
  });
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/utm-templates", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as Parameters<UtmTemplatesService["create"]>[1];
    return reply.code(201).send({ template: s().utm.create(wsParam(req), body) });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/utm-templates", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { templates: s().utm.list(wsParam(req)) };
  });

  // ───── Recurrences, evergreen, A/B ────────────────────────────────────────
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/recurrences", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const parsed = recurrenceInput.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    return reply.code(201).send({
      recurrence: s().recurrences.create(wsParam(req), {
        ...parsed.data,
        until_at: parsed.data.until_at ? Date.parse(parsed.data.until_at) : null,
      }),
    });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/recurrences", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { recurrences: s().recurrences.list(wsParam(req)) };
  });
  app.delete<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/recurrences/:id", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    s().recurrences.cancel(req.params.id);
    s().events.emit({ workspaceId: wsParam(req), name: "recurrence.cancelled", data: { recurrence_id: req.params.id } });
    return { ok: true };
  });
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/evergreen-pools", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as Parameters<EvergreenService["createPool"]>[1];
    return reply.code(201).send({ pool: s().evergreen.createPool(wsParam(req), body) });
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/evergreen-pools/:id/posts", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { post_id: string };
    s().evergreen.addMember(req.params.id, body.post_id);
    return { ok: true };
  });
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/ab-sets", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as Parameters<AbTestsService["create"]>[1];
    return reply.code(201).send({ set: s().ab.create(wsParam(req), body) });
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/ab-sets/:id/arms", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { post_id: string; arm_label: string; share: number };
    s().ab.addArm(req.params.id, body.post_id, body.arm_label, body.share);
    return { ok: true };
  });

  // ───── Imports ────────────────────────────────────────────────────────────
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/imports/json", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { posts: Parameters<typeof postSpec.parse>[0][] };
    const batch = s().imports.startBatch(wsParam(req), "json");
    const created: string[] = [];
    for (const row of body.posts ?? []) {
      const parsed = postSpec.safeParse(row);
      if (parsed.success) {
        const p = s().posts.create(wsParam(req), null, parsed.data);
        s().imports.countRow(batch.id, true);
        created.push(p.id);
      } else {
        s().imports.countRow(batch.id, false);
      }
    }
    return reply.code(201).send({ batch_id: batch.id, created });
  });

  // ───── Inbox ──────────────────────────────────────────────────────────────
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/inbox/threads", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const q = req.query as { status?: string; channel?: string; assignee?: string };
    return { threads: s().inbox.listThreads(wsParam(req), { status: q.status, channelAccountId: q.channel, assignee: q.assignee }) };
  });
  app.get<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/inbox/threads/:id/messages", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { messages: s().inbox.listMessages(req.params.id) };
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/inbox/threads/:id/messages", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { body: string };
    s().inbox.appendMessage(req.params.id, "outbound", body.body, { kind: "agent" });
    return { ok: true };
  });

  // ───── Approvals ──────────────────────────────────────────────────────────
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/approvals/workflows", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const parsed = approvalWorkflowInput.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    return reply.code(201).send({ workflow: s().approvals.createWorkflow(wsParam(req), parsed.data) });
  });
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/approvals", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { post_id: string; workflow_id: string };
    const out = s().approvals.startApproval(body.post_id, body.workflow_id);
    s().events.emit({ workspaceId: wsParam(req), name: "post.approval_started", data: { approval_id: out.id, post_id: body.post_id } });
    return reply.code(201).send(out);
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/approvals/:id/decisions", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { stage_index: number; reviewer_user_id: string; decision: "approve" | "reject" | "request_changes"; comment?: string };
    const out = s().approvals.recordDecision(req.params.id, body.stage_index, body.reviewer_user_id, body.decision, body.comment);
    s().events.emit({ workspaceId: wsParam(req), name: "post.approval_stage_decided", data: { approval_id: req.params.id, stage_index: body.stage_index, decision: body.decision } });
    if (out.finalState !== "pending") {
      s().events.emit({ workspaceId: wsParam(req), name: out.finalState === "approved" ? "post.approval_completed" : "post.approval_rejected", data: { approval_id: req.params.id } });
    }
    return out;
  });

  // ───── Webhooks ───────────────────────────────────────────────────────────
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/webhooks", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const parsed = webhookInput.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const wh = await s().webhooks.create(wsParam(req), parsed.data);
    return reply.code(201).send({ webhook: wh });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/webhooks", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { webhooks: s().webhooks.list(wsParam(req)) };
  });
  app.get<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/webhooks/:id/deliveries", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { deliveries: s().webhooks.deliveries(req.params.id) };
  });
  app.post<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/webhooks/:id/replay", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { delivery_id: string };
    const previous = s().webhooks.delivery(body.delivery_id) as Record<string, unknown> | undefined;
    if (!previous) return reply.code(404).send({ error: "not_found" });
    s().jobs.enqueue({
      workspaceId: wsParam(req),
      kind: "webhook_deliver",
      payload: { webhook_id: req.params.id, event: JSON.parse(String(previous.payload)) },
      maxAttempts: 5,
      availableAt: Date.now(),
    });
    return { ok: true, requeued: true };
  });

  // ───── Metrics / reports / best time ──────────────────────────────────────
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/metrics/accounts", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const q = req.query as { channel?: string; from?: string; to?: string };
    if (!q.channel || !q.from || !q.to) return reply.code(400).send({ error: "missing_params" });
    return { rows: s().analytics.accountDaily(q.channel, q.from, q.to) };
  });
  app.get<{ Params: { ws: string; id: string } }>("/v1/ws/:ws/metrics/posts/:id", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { rows: s().analytics.postMetrics(req.params.id) };
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/suggest-time", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const q = req.query as { account: string };
    return { suggestions: s().analytics.suggestBestTimes(q.account) };
  });
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/reports", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as Parameters<ReportsService["create"]>[1];
    return reply.code(201).send({ report: s().reports.create(wsParam(req), body) });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/reports", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { reports: s().reports.list(wsParam(req)) };
  });

  // ───── Integrations + brand voices ────────────────────────────────────────
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/integrations", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as Parameters<IntegrationsService["create"]>[1];
    return reply.code(201).send({ integration: s().integrations.create(wsParam(req), body) });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/integrations", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { integrations: s().integrations.list(wsParam(req)) };
  });
  app.post<{ Params: { ws: string } }>("/v1/ws/:ws/brand-voices", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as Parameters<BrandVoicesService["create"]>[1];
    return reply.code(201).send({ voice: s().brandVoices.create(wsParam(req), body) });
  });
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/brand-voices", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { voices: s().brandVoices.list(wsParam(req)) };
  });

  // ───── Jobs (read-only inspector) ─────────────────────────────────────────
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/jobs", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const q = req.query as { state?: string; limit?: string };
    return { jobs: s().jobs.list(wsParam(req), { state: q.state as never, limit: q.limit ? Number(q.limit) : undefined }) };
  });

  // ───── Settings / system status ───────────────────────────────────────────
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/settings", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    return { settings: s().settings.list("workspace", wsParam(req)) };
  });
  app.put<{ Params: { ws: string } }>("/v1/ws/:ws/settings", async (req, reply) => {
    if (!authorizedFor(req.principal, wsParam(req))) return reply.code(403).send({ error: "forbidden" });
    const body = req.body as { key: string; value: unknown };
    s().settings.set("workspace", wsParam(req), body.key, body.value);
    return { ok: true };
  });

  app.get("/v1/system/status", async () => {
    const m = s().jobs.metrics();
    return {
      ok: true,
      jobs: m,
      families: s().registry.list().length,
      uptime_seconds: Math.floor(process.uptime()),
    };
  });

  // ───── OpenAPI stub ───────────────────────────────────────────────────────
  app.get("/openapi.json", async () => ({
    openapi: "3.0.0",
    info: { title: "clawjs-publishing", version: "0.1.0" },
    paths: {},
  }));
}

function adapterContextForConnect(app: FastifyInstance, workspaceId: string, familyId: string) {
  const services = app.services;
  return {
    workspaceId,
    now: () => Date.now(),
    logger: {
      info: (msg: string) => app.log.info(`[adapter:${familyId}] ${msg}`),
      warn: (msg: string) => app.log.warn(`[adapter:${familyId}] ${msg}`),
      error: (msg: string) => app.log.error(`[adapter:${familyId}] ${msg}`),
    },
    fetch,
    vault: services.vault,
    rateLimiter: services.rateLimiter,
    idempotency: { lookup: async () => null, record: async () => {} },
  };
}
