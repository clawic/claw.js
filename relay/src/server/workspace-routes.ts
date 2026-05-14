import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";

import { RelayAuthService } from "./auth.ts";
import type { RelayConfig } from "./config.ts";
import { ConnectorRegistry } from "./connector-registry.ts";
import { RelayDatabase } from "./db.ts";
import { MonitorBus } from "./monitor-bus.ts";
import {
  assignmentWorkspaceParams,
  ensureWorkspaceAccess,
  forwardIotEventStream,
  forwardIotJson,
  invokeProjectAssignment,
  invokeWorkspace,
  normalizeUploadData,
  readRequestBody,
  requireClaims,
  requireProjectAssignmentAccess,
  resolveConnectorId,
  tokensFromText,
  type ProjectAgentParams,
  type WorkspaceParams,
} from "./app-helpers.ts";

export function registerWorkspaceRoutes(input: {
  app: FastifyInstance;
  auth: RelayAuthService;
  config: RelayConfig;
  db: RelayDatabase;
  monitor: MonitorBus;
  registry: ConnectorRegistry;
}): void {
  const { app, auth, config, db, monitor, registry } = input;

  const workspacePrefix = "/v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId";
  const projectWorkspacePrefix = "/v1/tenants/:tenantId/projects/:projectId/agents/:agentId";

  app.get(`${workspacePrefix}/activity`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "workspace:read");
    if (!claims) return;
    const params = request.params as WorkspaceParams;
    ensureWorkspaceAccess(claims, params, db);
    return {
      activity: db.listActivity(params.tenantId, params.agentId, params.workspaceId),
    };
  });

  app.get(`${projectWorkspacePrefix}/activity`, async (request, reply) => {
    const access = await requireProjectAssignmentAccess(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      db,
      "workspace:read",
    );
    if (!access) return;
    return {
      activity: db.listActivity(access.params.tenantId, access.params.agentId, access.assignment.workspaceId),
    };
  });

  app.get(`${workspacePrefix}/usage`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "workspace:read");
    if (!claims) return;
    const params = request.params as WorkspaceParams;
    ensureWorkspaceAccess(claims, params, db);
    return {
      usage: db.listUsage(params.tenantId, params.agentId, params.workspaceId),
    };
  });

  app.get(`${projectWorkspacePrefix}/usage`, async (request, reply) => {
    const access = await requireProjectAssignmentAccess(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      db,
      "workspace:read",
    );
    if (!access) return;
    return {
      usage: db.listUsage(access.params.tenantId, access.params.agentId, access.assignment.workspaceId),
    };
  });

  app.get(`${workspacePrefix}/iot/state`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: "/v1/state",
    });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/iot/actions`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const result = await forwardIotJson(request, reply, auth, config, "workspace:data", {
      tenantId: params.tenantId,
      method: "POST",
      path: "/v1/actions",
      body: await readRequestBody(request),
    });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/iot/scenes`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: "/v1/scenes",
    });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/iot/approvals`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: "/v1/approvals",
    });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/integrations/status`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "integrations.status",
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/integrations/status`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "integrations.status",
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/sessions`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.list",
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/sessions`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.list",
    );
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/sessions`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.create",
      await readRequestBody(request),
    );
    if (!result) return;
    return result;
  });

  app.post(`${projectWorkspacePrefix}/sessions`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.create",
      await readRequestBody(request),
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/sessions:search`, async (request, reply) => {
    const query = request.query as { q?: string; limit?: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.search",
      {
        q: query.q ?? "",
        ...(query.limit ? { limit: Number(query.limit) } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/sessions:search`, async (request, reply) => {
    const query = request.query as { q?: string; limit?: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.search",
      {
        q: query.q ?? "",
        ...(query.limit ? { limit: Number(query.limit) } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/sessions/:sessionId`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.get",
      { sessionId: params.sessionId },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/sessions/:sessionId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.get",
      { sessionId: params.sessionId },
    );
    if (!result) return;
    return result;
  });

  app.patch(`${workspacePrefix}/sessions/:sessionId`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.update",
      { sessionId: params.sessionId, title: body.title },
    );
    if (!result) return;
    return result;
  });

  app.patch(`${projectWorkspacePrefix}/sessions/:sessionId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const body = await readRequestBody(request);
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.update",
      { sessionId: params.sessionId, title: body.title },
    );
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/sessions/:sessionId/messages`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.append-message",
      { sessionId: params.sessionId, ...body },
    );
    if (!result) return;
    monitor.publish(params.tenantId, "monitor.session.touch", {
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      lastMessageAt: Date.now(),
      ...(typeof body.message === "string" ? { snippet: body.message.slice(0, 200) } : {}),
    });
    return result;
  });

  app.post(`${projectWorkspacePrefix}/sessions/:sessionId/messages`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const body = await readRequestBody(request);
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.append-message",
      { sessionId: params.sessionId, ...body },
    );
    if (!result) return;
    monitor.publish(params.tenantId, "monitor.session.touch", {
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      agentId: params.agentId,
      projectId: params.projectId,
      lastMessageAt: Date.now(),
      ...(typeof body.message === "string" ? { snippet: body.message.slice(0, 200) } : {}),
    });
    return result;
  });

  app.post(`${workspacePrefix}/sessions/:sessionId/reply`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.reply",
      { sessionId: params.sessionId, ...body },
    );
    if (!result) return;
    const inputMessage = typeof body.message === "string" ? body.message : "";
    const replyText = typeof result.reply === "string" ? result.reply : "";
    db.recordUsage({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      tokensIn: tokensFromText(inputMessage),
      tokensOut: tokensFromText(replyText),
    });
    monitor.publish(params.tenantId, "monitor.session.touch", {
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      lastMessageAt: Date.now(),
      ...(replyText ? { snippet: replyText.slice(0, 200) } : inputMessage ? { snippet: inputMessage.slice(0, 200) } : {}),
    });
    return result;
  });

  app.post(`${projectWorkspacePrefix}/sessions/:sessionId/reply`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const body = await readRequestBody(request);
    const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
    if (!assignment) {
      return await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    }
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.reply",
      { sessionId: params.sessionId, ...body },
    );
    if (!result) return;
    const inputMessage = typeof body.message === "string" ? body.message : "";
    const replyText = typeof result.reply === "string" ? result.reply : "";
    db.recordUsage({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: assignment.workspaceId,
      tokensIn: tokensFromText(inputMessage),
      tokensOut: tokensFromText(replyText),
    });
    monitor.publish(params.tenantId, "monitor.session.touch", {
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: assignment.workspaceId,
      projectId: params.projectId,
      lastMessageAt: Date.now(),
      ...(replyText ? { snippet: replyText.slice(0, 200) } : inputMessage ? { snippet: inputMessage.slice(0, 200) } : {}),
    });
    return result;
  });

  app.get(`${workspacePrefix}/sessions/:sessionId/stream`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "chat:stream");
    if (!claims) return;
    const params = request.params as WorkspaceParams;
    try {
      ensureWorkspaceAccess(claims, params, db);
    } catch (error) {
      await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const query = request.query as { message?: string; systemPrompt?: string; transport?: string };
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");

    const abortController = new AbortController();
    request.raw.on("close", () => abortController.abort("client_disconnect"));

    let streamedText = "";
    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      if (reply.raw.destroyed) return;
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const monitorRequestId = randomUUID();
    const monitorStartedAt = Date.now();
    const monitorBase = {
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      requestId: monitorRequestId,
    };
    monitor.publish(params.tenantId, "monitor.session.start", {
      ...monitorBase,
      startedAt: monitorStartedAt,
      ...(query.message ? { snippet: query.message.slice(0, 200) } : {}),
    });

    try {
      const result = await registry.invoke({
        tenantId: params.tenantId,
        connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        operation: "sessions.stream",
        payload: {
          sessionId: params.sessionId,
          ...(query.message ? { message: query.message } : {}),
          ...(query.systemPrompt ? { systemPrompt: query.systemPrompt } : {}),
          ...(query.transport ? { transport: query.transport } : {}),
        },
        onStream: (stream) => {
          const payload = stream.payload;
          if (typeof payload.delta === "string") {
            streamedText += payload.delta;
            monitor.publish(params.tenantId, "monitor.session.delta", {
              ...monitorBase,
              delta: payload.delta,
            });
          }
          writeEvent(stream.event, payload);
        },
        signal: abortController.signal,
      });
      db.recordUsage({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        tokensIn: tokensFromText(query.message ?? ""),
        tokensOut: tokensFromText(streamedText),
      });
      if (result.cancelled) {
        writeEvent("cancelled", {});
        monitor.publish(params.tenantId, "monitor.session.end", {
          ...monitorBase,
          reason: "cancelled",
          durationMs: Date.now() - monitorStartedAt,
        });
      } else {
        writeEvent("complete", { ok: true });
        monitor.publish(params.tenantId, "monitor.session.end", {
          ...monitorBase,
          reason: "complete",
          durationMs: Date.now() - monitorStartedAt,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeEvent("error", { error: message });
      monitor.publish(params.tenantId, "monitor.session.end", {
        ...monitorBase,
        reason: "error",
        error: message,
        durationMs: Date.now() - monitorStartedAt,
      });
    } finally {
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });

  app.get(`${projectWorkspacePrefix}/sessions/:sessionId/stream`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "chat:stream");
    if (!claims) return;
    const params = request.params as ProjectAgentParams;
    const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
    if (!assignment) {
      return await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    }
    try {
      ensureWorkspaceAccess(claims, assignmentWorkspaceParams(params, assignment.workspaceId), db);
    } catch (error) {
      await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const query = request.query as { message?: string; systemPrompt?: string; transport?: string };
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");

    const abortController = new AbortController();
    request.raw.on("close", () => abortController.abort("client_disconnect"));

    let streamedText = "";
    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      if (reply.raw.destroyed) return;
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const monitorRequestId = randomUUID();
    const monitorStartedAt = Date.now();
    const monitorBase = {
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: assignment.workspaceId,
      projectId: params.projectId,
      requestId: monitorRequestId,
    };
    monitor.publish(params.tenantId, "monitor.session.start", {
      ...monitorBase,
      startedAt: monitorStartedAt,
      ...(query.message ? { snippet: query.message.slice(0, 200) } : {}),
    });

    try {
      const result = await registry.invoke({
        tenantId: params.tenantId,
        connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
        agentId: params.agentId,
        workspaceId: assignment.workspaceId,
        operation: "sessions.stream",
        payload: {
          sessionId: params.sessionId,
          ...(query.message ? { message: query.message } : {}),
          ...(query.systemPrompt ? { systemPrompt: query.systemPrompt } : {}),
          ...(query.transport ? { transport: query.transport } : {}),
        },
        onStream: (stream) => {
          const streamPayload = stream.payload;
          if (typeof streamPayload.delta === "string") {
            streamedText += streamPayload.delta;
            monitor.publish(params.tenantId, "monitor.session.delta", {
              ...monitorBase,
              delta: streamPayload.delta,
            });
          }
          writeEvent(stream.event, streamPayload);
        },
        signal: abortController.signal,
      });
      db.recordUsage({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: assignment.workspaceId,
        tokensIn: tokensFromText(query.message ?? ""),
        tokensOut: tokensFromText(streamedText),
      });
      if (result.cancelled) {
        writeEvent("cancelled", {});
        monitor.publish(params.tenantId, "monitor.session.end", {
          ...monitorBase,
          reason: "cancelled",
          durationMs: Date.now() - monitorStartedAt,
        });
      } else {
        writeEvent("complete", { ok: true });
        monitor.publish(params.tenantId, "monitor.session.end", {
          ...monitorBase,
          reason: "complete",
          durationMs: Date.now() - monitorStartedAt,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeEvent("error", { error: message });
      monitor.publish(params.tenantId, "monitor.session.end", {
        ...monitorBase,
        reason: "error",
        error: message,
        durationMs: Date.now() - monitorStartedAt,
      });
    } finally {
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });

  app.post(`${workspacePrefix}/sessions/:sessionId/stream`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "chat:stream");
    if (!claims) return;
    const params = request.params as WorkspaceParams;
    try {
      ensureWorkspaceAccess(claims, params, db);
    } catch (error) {
      await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const body = await readRequestBody(request);
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");

    const abortController = new AbortController();
    request.raw.on("close", () => abortController.abort("client_disconnect"));

    let streamedText = "";
    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      if (reply.raw.destroyed) return;
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const monitorRequestId = randomUUID();
    const monitorStartedAt = Date.now();
    const monitorBase = {
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      requestId: monitorRequestId,
    };
    const initialMessage = typeof body.message === "string" ? body.message : "";
    monitor.publish(params.tenantId, "monitor.session.start", {
      ...monitorBase,
      startedAt: monitorStartedAt,
      ...(initialMessage ? { snippet: initialMessage.slice(0, 200) } : {}),
    });

    try {
      const result = await registry.invoke({
        tenantId: params.tenantId,
        connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        operation: "sessions.stream",
        payload: {
          sessionId: params.sessionId,
          ...(typeof body.message === "string" ? { message: body.message } : {}),
          ...(typeof body.systemPrompt === "string" ? { systemPrompt: body.systemPrompt } : {}),
          ...(typeof body.transport === "string" ? { transport: body.transport } : {}),
          ...(Array.isArray(body.documentIds) ? { documentIds: body.documentIds } : {}),
        },
        onStream: (stream) => {
          const payload = stream.payload;
          if (typeof payload.delta === "string") {
            streamedText += payload.delta;
            monitor.publish(params.tenantId, "monitor.session.delta", {
              ...monitorBase,
              delta: payload.delta,
            });
          }
          writeEvent(stream.event, payload);
        },
        signal: abortController.signal,
      });
      db.recordUsage({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        tokensIn: tokensFromText(initialMessage),
        tokensOut: tokensFromText(streamedText),
      });
      if (result.cancelled) {
        writeEvent("cancelled", {});
        monitor.publish(params.tenantId, "monitor.session.end", {
          ...monitorBase,
          reason: "cancelled",
          durationMs: Date.now() - monitorStartedAt,
        });
      } else {
        writeEvent("complete", { ok: true });
        monitor.publish(params.tenantId, "monitor.session.end", {
          ...monitorBase,
          reason: "complete",
          durationMs: Date.now() - monitorStartedAt,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeEvent("error", { error: message });
      monitor.publish(params.tenantId, "monitor.session.end", {
        ...monitorBase,
        reason: "error",
        error: message,
        durationMs: Date.now() - monitorStartedAt,
      });
    } finally {
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });

  app.post(`${projectWorkspacePrefix}/sessions/:sessionId/stream`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "chat:stream");
    if (!claims) return;
    const params = request.params as ProjectAgentParams;
    const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
    if (!assignment) {
      return await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    }
    try {
      ensureWorkspaceAccess(claims, assignmentWorkspaceParams(params, assignment.workspaceId), db);
    } catch (error) {
      await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const body = await readRequestBody(request);
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");

    const abortController = new AbortController();
    request.raw.on("close", () => abortController.abort("client_disconnect"));

    let streamedText = "";
    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      if (reply.raw.destroyed) return;
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const monitorRequestId = randomUUID();
    const monitorStartedAt = Date.now();
    const monitorBase = {
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: assignment.workspaceId,
      projectId: params.projectId,
      requestId: monitorRequestId,
    };
    const initialMessage = typeof body.message === "string" ? body.message : "";
    monitor.publish(params.tenantId, "monitor.session.start", {
      ...monitorBase,
      startedAt: monitorStartedAt,
      ...(initialMessage ? { snippet: initialMessage.slice(0, 200) } : {}),
    });

    try {
      const result = await registry.invoke({
        tenantId: params.tenantId,
        connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
        agentId: params.agentId,
        workspaceId: assignment.workspaceId,
        operation: "sessions.stream",
        payload: {
          sessionId: params.sessionId,
          ...(typeof body.message === "string" ? { message: body.message } : {}),
          ...(typeof body.systemPrompt === "string" ? { systemPrompt: body.systemPrompt } : {}),
          ...(typeof body.transport === "string" ? { transport: body.transport } : {}),
          ...(Array.isArray(body.documentIds) ? { documentIds: body.documentIds } : {}),
        },
        onStream: (stream) => {
          const payload = stream.payload;
          if (typeof payload.delta === "string") {
            streamedText += payload.delta;
            monitor.publish(params.tenantId, "monitor.session.delta", {
              ...monitorBase,
              delta: payload.delta,
            });
          }
          writeEvent(stream.event, payload);
        },
        signal: abortController.signal,
      });
      db.recordUsage({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: assignment.workspaceId,
        tokensIn: tokensFromText(initialMessage),
        tokensOut: tokensFromText(streamedText),
      });
      if (result.cancelled) {
        writeEvent("cancelled", {});
        monitor.publish(params.tenantId, "monitor.session.end", {
          ...monitorBase,
          reason: "cancelled",
          durationMs: Date.now() - monitorStartedAt,
        });
      } else {
        writeEvent("complete", { ok: true });
        monitor.publish(params.tenantId, "monitor.session.end", {
          ...monitorBase,
          reason: "complete",
          durationMs: Date.now() - monitorStartedAt,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeEvent("error", { error: message });
      monitor.publish(params.tenantId, "monitor.session.end", {
        ...monitorBase,
        reason: "error",
        error: message,
        durationMs: Date.now() - monitorStartedAt,
      });
    } finally {
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });

  app.post(`${workspacePrefix}/sessions/:sessionId/generate-title`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.generate-title",
      { sessionId: params.sessionId },
    );
    if (!result) return;
    return result;
  });

  app.post(`${projectWorkspacePrefix}/sessions/:sessionId/generate-title`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.generate-title",
      { sessionId: params.sessionId },
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/documents`, async (request, reply) => {
    const query = request.query as { sessionId?: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.list",
      {
        ...(typeof query.sessionId === "string" ? { sessionId: query.sessionId } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/documents`, async (request, reply) => {
    const query = request.query as { sessionId?: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.list",
      {
        ...(typeof query.sessionId === "string" ? { sessionId: query.sessionId } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/documents:search`, async (request, reply) => {
    const query = request.query as { q?: string; limit?: string; sessionId?: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.search",
      {
        q: query.q ?? "",
        ...(query.limit ? { limit: Number(query.limit) } : {}),
        ...(typeof query.sessionId === "string" ? { sessionId: query.sessionId } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/documents:search`, async (request, reply) => {
    const query = request.query as { q?: string; limit?: string; sessionId?: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.search",
      {
        q: query.q ?? "",
        ...(query.limit ? { limit: Number(query.limit) } : {}),
        ...(typeof query.sessionId === "string" ? { sessionId: query.sessionId } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/documents/:documentId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { documentId: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.get",
      { documentId: params.documentId },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/documents/:documentId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams & { documentId: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.get",
      { documentId: params.documentId },
    );
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/documents/register`, async (request, reply) => {
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.register",
      body,
    );
    if (!result) return;
    return result;
  });

  app.post(`${projectWorkspacePrefix}/documents/register`, async (request, reply) => {
    const body = await readRequestBody(request);
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.register",
      body,
    );
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/documents/upload`, async (request, reply) => {
    const body = await readRequestBody(request);
    const begin = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.begin",
      {
        name: body.name,
        mimeType: body.mimeType,
        ...(typeof body.origin === "string" ? { origin: body.origin } : {}),
        ...(typeof body.sessionId === "string" ? { sessionId: body.sessionId } : {}),
      },
    );
    if (!begin) return;
    const uploadId = typeof begin.uploadId === "string" ? begin.uploadId : "";
    const chunk = normalizeUploadData(body.data);
    const chunkResult = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.chunk",
      { uploadId, chunk },
    );
    if (!chunkResult) return;
    const commit = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.commit",
      { uploadId },
    );
    if (!commit) return;
    return commit;
  });

  app.post(`${projectWorkspacePrefix}/documents/upload`, async (request, reply) => {
    const body = await readRequestBody(request);
    const begin = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.begin",
      {
        name: body.name,
        mimeType: body.mimeType,
        ...(typeof body.origin === "string" ? { origin: body.origin } : {}),
        ...(typeof body.sessionId === "string" ? { sessionId: body.sessionId } : {}),
      },
    );
    if (!begin) return;
    const uploadId = typeof begin.uploadId === "string" ? begin.uploadId : "";
    const chunk = normalizeUploadData(body.data);
    const chunkResult = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.chunk",
      { uploadId, chunk },
    );
    if (!chunkResult) return;
    const commit = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.commit",
      { uploadId },
    );
    if (!commit) return;
    return commit;
  });

  app.get(`${workspacePrefix}/documents/:documentId/download`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { documentId: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.download",
      { documentId: params.documentId },
    );
    if (!result) return;
    const document = (result.document ?? null) as { name?: string; mimeType?: string } | null;
    const contentBase64 = typeof result.contentBase64 === "string" ? result.contentBase64 : "";
    if (!document || !contentBase64) {
      return await reply.code(404).send({ error: "document_not_found" });
    }
    reply.header("content-type", document.mimeType ?? "application/octet-stream");
    reply.header("content-disposition", `attachment; filename="${document.name ?? params.documentId}"`);
    return Buffer.from(contentBase64, "base64");
  });

  app.get(`${projectWorkspacePrefix}/documents/:documentId/download`, async (request, reply) => {
    const params = request.params as ProjectAgentParams & { documentId: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.download",
      { documentId: params.documentId },
    );
    if (!result) return;
    const document = (result.document ?? null) as { name?: string; mimeType?: string } | null;
    const contentBase64 = typeof result.contentBase64 === "string" ? result.contentBase64 : "";
    if (!document || !contentBase64) {
      return await reply.code(404).send({ error: "document_not_found" });
    }
    reply.header("content-type", document.mimeType ?? "application/octet-stream");
    reply.header("content-disposition", `attachment; filename="${document.name ?? params.documentId}"`);
    return Buffer.from(contentBase64, "base64");
  });

  app.post(`${workspacePrefix}/chat/feedback`, async (request, reply) => {
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "chat.feedback",
      body,
    );
    if (!result) return;
    return result;
  });

  app.post(`${projectWorkspacePrefix}/chat/feedback`, async (request, reply) => {
    const body = await readRequestBody(request);
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "chat.feedback",
      body,
    );
    if (!result) return;
    return result;
  });

  const resourceMap = [
    { path: "tasks", scope: "workspace:data" },
    { path: "goals", scope: "workspace:data" },
    { path: "projects", scope: "workspace:data" },
    { path: "notes", scope: "workspace:data" },
    { path: "memory", scope: "workspace:data" },
    { path: "inbox", scope: "workspace:data" },
    { path: "people", scope: "workspace:data" },
    { path: "reminders", scope: "workspace:data" },
    { path: "deadlines", scope: "workspace:data" },
    { path: "events", scope: "workspace:data" },
    { path: "time", scope: "workspace:data" },
    { path: "personas", scope: "workspace:data" },
    { path: "plugins", scope: "workspace:data" },
    { path: "routines", scope: "workspace:data" },
    { path: "images", scope: "workspace:data" },
  ] as const;

  for (const resource of resourceMap) {
    app.get(`${workspacePrefix}/${resource.path}`, async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      const result = await invokeWorkspace(
        request as FastifyRequest<{ Params: WorkspaceParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.list`,
        query,
      );
      if (!result) return;
      return result;
    });

    app.get(`${projectWorkspacePrefix}/${resource.path}`, async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      const result = await invokeProjectAssignment(
        request as FastifyRequest<{ Params: ProjectAgentParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.list`,
        query,
      );
      if (!result) return;
      return result;
    });

    app.post(`${workspacePrefix}/${resource.path}`, async (request, reply) => {
      const result = await invokeWorkspace(
        request as FastifyRequest<{ Params: WorkspaceParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.create`,
        await readRequestBody(request),
      );
      if (!result) return;
      return result;
    });

    app.post(`${projectWorkspacePrefix}/${resource.path}`, async (request, reply) => {
      const result = await invokeProjectAssignment(
        request as FastifyRequest<{ Params: ProjectAgentParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.create`,
        await readRequestBody(request),
      );
      if (!result) return;
      return result;
    });

    app.put(`${workspacePrefix}/${resource.path}`, async (request, reply) => {
      const result = await invokeWorkspace(
        request as FastifyRequest<{ Params: WorkspaceParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.update`,
        await readRequestBody(request),
      );
      if (!result) return;
      return result;
    });

    app.put(`${projectWorkspacePrefix}/${resource.path}`, async (request, reply) => {
      const result = await invokeProjectAssignment(
        request as FastifyRequest<{ Params: ProjectAgentParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.update`,
        await readRequestBody(request),
      );
      if (!result) return;
      return result;
    });

    app.delete(`${workspacePrefix}/${resource.path}`, async (request, reply) => {
      const body = await readRequestBody(request);
      const query = request.query as Record<string, unknown>;
      const payload = Object.keys(body).length > 0 ? body : query;
      const result = await invokeWorkspace(
        request as FastifyRequest<{ Params: WorkspaceParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.delete`,
        payload,
      );
      if (!result) return;
      return result;
    });

    app.delete(`${projectWorkspacePrefix}/${resource.path}`, async (request, reply) => {
      const body = await readRequestBody(request);
      const query = request.query as Record<string, unknown>;
      const payload = Object.keys(body).length > 0 ? body : query;
      const result = await invokeProjectAssignment(
        request as FastifyRequest<{ Params: ProjectAgentParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.delete`,
        payload,
      );
      if (!result) return;
      return result;
    });
  }

  app.get(`${workspacePrefix}/content/brands`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.brands.list");
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/brands`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.brands.create", await readRequestBody(request));
    if (!result) return;
    return result;
  });

  app.put(`${workspacePrefix}/content/brands/:brandId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { brandId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.brands.update", {
      id: params.brandId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/destinations`, async (request, reply) => {
    const query = request.query as { brandId?: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.destinations.list", query);
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/destinations`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.destinations.create", await readRequestBody(request));
    if (!result) return;
    return result;
  });

  app.put(`${workspacePrefix}/content/destinations/:destinationId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { destinationId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.destinations.update", {
      id: params.destinationId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/destinations/:destinationId/test-connection`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { destinationId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.destinations.testConnection", { id: params.destinationId });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/campaigns`, async (request, reply) => {
    const query = request.query as { brandId?: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.campaigns.list", query);
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/campaigns`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.campaigns.create", await readRequestBody(request));
    if (!result) return;
    return result;
  });

  app.put(`${workspacePrefix}/content/campaigns/:campaignId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { campaignId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.campaigns.update", {
      id: params.campaignId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/entries`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.entries.list", request.query as Record<string, unknown>);
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/entries`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.entries.create", await readRequestBody(request));
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/entries/:entryId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { entryId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.entries.get", { id: params.entryId });
    if (!result) return;
    return result;
  });

  app.put(`${workspacePrefix}/content/entries/:entryId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { entryId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.entries.update", {
      id: params.entryId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/entries/:entryId/archive`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { entryId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.entries.archive", { id: params.entryId });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/entries/:entryId/assets`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { entryId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.entries.attachAsset", {
      id: params.entryId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/entries/:entryId/variants:generate`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { entryId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.entries.generateVariants", {
      id: params.entryId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/variants`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.variants.list", request.query as Record<string, unknown>);
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/variants`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.variants.create", await readRequestBody(request));
    if (!result) return;
    return result;
  });

  app.put(`${workspacePrefix}/content/variants/:variantId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { variantId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.variants.update", {
      id: params.variantId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/approvals`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.approvals.list", request.query as Record<string, unknown>);
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/approvals/:approvalId/approve`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { approvalId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.approvals.approve", {
      id: params.approvalId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/approvals/:approvalId/reject`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { approvalId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.approvals.reject", {
      id: params.approvalId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/approvals/:approvalId/cancel`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { approvalId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.approvals.cancel", { id: params.approvalId });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/calendar`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.calendar.view");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/plans`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.publish.listPlans", request.query as Record<string, unknown>);
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/plans`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.publish.createPlan", await readRequestBody(request));
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/plans/:planId/cancel`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { planId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.publish.cancelPlan", { id: params.planId });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/plans/:planId/run`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { planId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.publish.runNow", { id: params.planId });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/publications`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.publish.listRuns");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/publications/:runId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { runId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.publish.getRun", { id: params.runId });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/publications/:runId/retry`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { runId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.publish.retryRun", { id: params.runId });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/frontend-contract`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.frontendContract");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/screens`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.screens");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/dashboard`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.dashboard");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/calendar`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.calendar");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/pipeline`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.pipeline");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/composer/:entryId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { entryId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.composer", { entryId: params.entryId });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/destinations`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.destinations");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/approvals`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.approvals");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/publications`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.publications");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/forms/:formId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { formId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.form", { formId: params.formId });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/images/:imageId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { imageId: string };
    const result = await invokeWorkspace(
      { ...request, params } as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "images.get",
      { imageId: params.imageId },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/images/:imageId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams & { imageId: string };
    const result = await invokeProjectAssignment(
      { ...request, params } as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "images.get",
      { imageId: params.imageId },
      params,
    );
    if (!result) return;
    return result;
  });

  app.delete(`${workspacePrefix}/images/:imageId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { imageId: string };
    const result = await invokeWorkspace(
      { ...request, params } as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "images.delete",
      { imageId: params.imageId },
    );
    if (!result) return;
    return result;
  });

  app.delete(`${projectWorkspacePrefix}/images/:imageId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams & { imageId: string };
    const result = await invokeProjectAssignment(
      { ...request, params } as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "images.delete",
      { imageId: params.imageId },
      params,
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/skills/list`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.list",
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/skills/list`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.list",
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/skills/search`, async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.search",
      query,
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/skills/search`, async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.search",
      query,
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/skills/sources`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.sources",
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/skills/sources`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.sources",
    );
    if (!result) return;
    return result;
  });
}
