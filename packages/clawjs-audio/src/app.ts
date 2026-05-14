import { clawApiPath } from "@clawjs/core";
import fs from "node:fs";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import { loadAudioConfig, type AudioServiceConfig } from "./config.ts";
import { AudioServiceStore } from "./store.ts";
import type {
  AttachTranscriptInput,
  AudioKind,
  AudioOriginActor,
  AudioTranscriptRole,
  ListAudioFilter,
  ListGlobalAudioFilter,
  RegisterAudioInput,
} from "./types.ts";

export interface BuildAudioAppOptions {
  config?: Partial<AudioServiceConfig>;
}

function parseBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function requireSecret(request: FastifyRequest, reply: FastifyReply, secret: string): boolean {
  const token = parseBearer(request);
  if (token !== secret) {
    void reply.code(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return ((request.body ?? {}) as Record<string, unknown>);
}

function readQuery(request: FastifyRequest): Record<string, string> {
  return ((request.query ?? {}) as Record<string, string>);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function buildAudioApp(options: BuildAudioAppOptions = {}) {
  const config = loadAudioConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 * 1024 });
  const store = new AudioServiceStore(config.dbPath, config.blobsDir);

  app.addHook("onClose", async () => {
    store.close();
  });

  app.get(clawApiPath("health"), async () => ({
    ok: true,
    service: "audio",
    host: config.host,
    port: config.port,
  }));

  app.post(clawApiPath("audio"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const body = readBody(request);
      const input: RegisterAudioInput = {
        id: asString(body.id),
        kind: body.kind as AudioKind,
        appId: String(body.appId ?? ""),
        originActor: body.originActor as AudioOriginActor,
        mimeType: String(body.mimeType ?? ""),
        bytesBase64: String(body.bytesBase64 ?? ""),
        durationMs: Number(body.durationMs ?? 0),
        deviceId: (body.deviceId as string | null) ?? null,
        sessionId: (body.sessionId as string | null) ?? null,
        threadId: (body.threadId as string | null) ?? null,
        linkedMessageId: (body.linkedMessageId as string | null) ?? null,
        metadata: (body.metadata as Record<string, unknown> | null) ?? null,
        transcript: body.transcript as RegisterAudioInput["transcript"],
      };
      if (!input.appId || !input.kind || !input.originActor || !input.mimeType || !input.bytesBase64) {
        return await reply.code(400).send({ error: "Missing required fields" });
      }
      return store.register(input);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post(clawApiPath("audio/:id/transcripts"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const params = request.params as { id: string };
      const body = readBody(request);
      const input: AttachTranscriptInput = {
        text: String(body.text ?? ""),
        role: (body.role as AudioTranscriptRole) ?? "transcription",
        provider: (body.provider as string | null) ?? null,
        language: (body.language as string | null) ?? null,
        markAsPrimary: body.markAsPrimary === true,
      };
      if (!input.text) return await reply.code(400).send({ error: "text is required" });
      return store.attachTranscript(params.id, input);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(clawApiPath("audio/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const query = readQuery(request);
    const appId = asString(query.appId);
    if (!appId) return await reply.code(400).send({ error: "appId query param is required" });
    const result = store.getById(params.id, appId);
    if (!result) return await reply.code(404).send({ error: "audio_not_found" });
    return result;
  });

  app.get(clawApiPath("audio/:id/bytes"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const query = readQuery(request);
    const appId = asString(query.appId);
    if (!appId) return await reply.code(400).send({ error: "appId query param is required" });
    const result = store.getBytes(params.id, appId);
    if (!result) return await reply.code(404).send({ error: "audio_not_found" });
    return result;
  });

  app.get(clawApiPath("audio"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    const appId = asString(query.appId);
    if (!appId) return await reply.code(400).send({ error: "appId query param is required" });
    const filter: ListAudioFilter = {
      appId,
      kind: asString(query.kind) as AudioKind | undefined,
      originActor: asString(query.originActor) as AudioOriginActor | undefined,
      deviceId: asString(query.deviceId),
      sessionId: asString(query.sessionId),
      threadId: asString(query.threadId),
      linkedMessageId: asString(query.linkedMessageId),
      fromCreatedAt: asNumber(query.fromCreatedAt),
      toCreatedAt: asNumber(query.toCreatedAt),
      limit: asNumber(query.limit),
      offset: asNumber(query.offset),
    };
    return store.list(filter);
  });

  app.get(clawApiPath("audio-global"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    const filter: ListGlobalAudioFilter = {
      appId: asString(query.appId),
      kind: asString(query.kind) as AudioKind | undefined,
      originActor: asString(query.originActor) as AudioOriginActor | undefined,
      deviceId: asString(query.deviceId),
      sessionId: asString(query.sessionId),
      threadId: asString(query.threadId),
      linkedMessageId: asString(query.linkedMessageId),
      fromCreatedAt: asNumber(query.fromCreatedAt),
      toCreatedAt: asNumber(query.toCreatedAt),
      limit: asNumber(query.limit),
      offset: asNumber(query.offset),
    };
    return store.listGlobal(filter);
  });

  app.delete(clawApiPath("audio/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const query = readQuery(request);
    const appId = asString(query.appId);
    if (!appId) return await reply.code(400).send({ error: "appId query param is required" });
    return { deleted: store.delete(params.id, appId) };
  });

  return { app, config, store };
}
