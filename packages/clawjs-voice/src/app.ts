import fs from "node:fs";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import { loadVoiceConfig, type VoiceServiceConfig } from "./config.ts";
import { buildSTTProviderRegistry, buildTTSProviderRegistry } from "./providers.ts";
import { VoiceServiceStore } from "./store.ts";
import type {
  ListVoiceRunsFilter,
  STTProviderAdapter,
  STTRequest,
  STTResult,
  TTSProviderAdapter,
  TTSRequest,
  TTSResult,
} from "./types.ts";

export interface BuildVoiceAppOptions {
  config?: Partial<VoiceServiceConfig>;
  ttsProviders?: Record<string, TTSProviderAdapter>;
  sttProviders?: Record<string, STTProviderAdapter>;
}

function parseBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}
function requireSecret(request: FastifyRequest, reply: FastifyReply, secret: string): boolean {
  const token = parseBearer(request);
  if (token !== secret) { void reply.code(401).send({ error: "Unauthorized" }); return false; }
  return true;
}
function readBody(request: FastifyRequest): Record<string, unknown> { return ((request.body ?? {}) as Record<string, unknown>); }
function readQuery(request: FastifyRequest): Record<string, string> { return ((request.query ?? {}) as Record<string, string>); }
function asString(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function asNumber(value: unknown): number | undefined { if (value === undefined || value === null || value === "") return undefined; const n = Number(value); return Number.isFinite(n) ? n : undefined; }

export function buildVoiceApp(options: BuildVoiceAppOptions = {}) {
  const config = loadVoiceConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.outputDir, { recursive: true });

  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 * 1024 });
  const store = new VoiceServiceStore(config.dbPath);
  const ttsProviders = options.ttsProviders ?? buildTTSProviderRegistry({
    elevenLabsApiKey: config.elevenLabsApiKey,
    openAiApiKey: config.openAiApiKey,
    systemSayBin: config.systemSayBin,
  });
  const sttProviders = options.sttProviders ?? buildSTTProviderRegistry({
    openAiApiKey: config.openAiApiKey,
    whisperLocalBin: config.whisperLocalBin,
  });

  app.addHook("onClose", async () => { store.close(); });

  app.get("/v1/health", async () => ({
    ok: true,
    service: "voice",
    host: config.host,
    port: config.port,
    tts: Object.values(ttsProviders).map((provider) => ({ id: provider.id, available: provider.available })),
    stt: Object.values(sttProviders).map((provider) => ({ id: provider.id, available: provider.available })),
  }));

  app.get("/v1/voice/providers", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    return {
      tts: Object.values(ttsProviders).map((provider) => ({ id: provider.id, available: provider.available, description: provider.description })),
      stt: Object.values(sttProviders).map((provider) => ({ id: provider.id, available: provider.available, description: provider.description })),
    };
  });

  app.post("/v1/voice/say", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    const providerId = asString(body.provider) ?? config.defaultTtsProvider;
    const provider = ttsProviders[providerId];
    if (!provider) return await reply.code(404).send({ error: `provider_not_found:${providerId}` });
    const text = asString(body.text);
    if (!text) return await reply.code(400).send({ error: "text is required" });
    const startedAt = Date.now();
    const synthInput: TTSRequest = {
      text,
      provider: providerId as TTSRequest["provider"],
      voice: (body.voice as string | null | undefined) ?? null,
      language: (body.language as string | null | undefined) ?? null,
      speed: asNumber(body.speed) ?? null,
      outputPath: (body.outputPath as string | null | undefined) ?? null,
      metadata: (body.metadata as Record<string, unknown> | null) ?? null,
    };
    const outcome = await provider.synth(synthInput, { dataDir: config.outputDir });
    const result: TTSResult = { ...outcome, id: cryptoRandom(), createdAt: startedAt };
    store.recordTTS(result);
    return result;
  });

  app.post("/v1/voice/transcribe", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    const providerId = asString(body.provider) ?? config.defaultSttProvider;
    const provider = sttProviders[providerId];
    if (!provider) return await reply.code(404).send({ error: `provider_not_found:${providerId}` });
    const startedAt = Date.now();
    const input: STTRequest = {
      audioPath: (body.audioPath as string | null | undefined) ?? null,
      audioBase64: (body.audioBase64 as string | null | undefined) ?? null,
      provider: providerId as STTRequest["provider"],
      language: (body.language as string | null | undefined) ?? null,
      metadata: (body.metadata as Record<string, unknown> | null) ?? null,
    };
    const outcome = await provider.transcribe(input);
    const result: STTResult = { ...outcome, id: cryptoRandom(), createdAt: startedAt };
    store.recordSTT(result);
    return result;
  });

  app.get("/v1/voice/runs", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    const filter: ListVoiceRunsFilter = {
      kind: asString(query.kind) as "tts" | "stt" | undefined,
      provider: asString(query.provider),
      limit: asNumber(query.limit),
      offset: asNumber(query.offset),
    };
    return { items: store.listRuns(filter) };
  });

  return { app, config, store, ttsProviders, sttProviders };
}

function cryptoRandom(): string {
  return `voice_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
