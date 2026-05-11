import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { FastifyInstance } from "fastify";

import { VoiceApiClient, buildVoiceApp, createEchoSTTProvider } from "@clawjs/voice";

const SECRET = "voice-e2e-secret";

function injectFetch(app: FastifyInstance): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const response = await app.inject({
      method: init?.method ?? "GET",
      url: `${url.pathname}${url.search}`,
      headers: init?.headers as Record<string, string> | undefined,
      payload: init?.body ? String(init.body) : undefined,
    });
    return new Response(response.body, { status: response.statusCode, headers: response.headers as Record<string, string> });
  };
}

async function spinUp() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-e2e-"));
  const built = buildVoiceApp({
    config: {
      host: "127.0.0.1", port: 0, dataDir: tmpDir,
      dbPath: path.join(tmpDir, "voice.sqlite"),
      outputDir: path.join(tmpDir, "out"),
      sharedSecret: SECRET, defaultSttProvider: "openai-stt",
    },
    sttProviders: { "openai-stt": createEchoSTTProvider() },
  });
  const client = new VoiceApiClient({ baseUrl: "http://voice.test", token: SECRET, fetchImpl: injectFetch(built.app) });
  return { client, tmpDir, close: async () => { await built.app.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); } };
}

test("providers endpoint lists tts + stt with availability flags", async () => {
  const ctx = await spinUp();
  try {
    const result = await ctx.client.providers();
    const ttsIds = result.tts.map((entry) => entry.id);
    const sttIds = result.stt.map((entry) => entry.id);
    assert.ok(ttsIds.includes("system-tts"));
    assert.ok(ttsIds.includes("elevenlabs"));
    assert.ok(ttsIds.includes("openai-tts"));
    assert.ok(sttIds.includes("openai-stt"));
  } finally { await ctx.close(); }
});

test("say with system-tts on darwin produces audio file with bytes; non-darwin returns ok=false gracefully", async () => {
  const ctx = await spinUp();
  try {
    const result = await ctx.client.say({ text: "hola sandbox", provider: "system-tts" });
    if (process.platform === "darwin") {
      assert.equal(result.ok, true);
      assert.ok(result.outputPath && fs.existsSync(result.outputPath), "expected output file");
      assert.ok((result.bytesWritten ?? 0) > 0);
    } else {
      assert.equal(result.ok, false);
    }
  } finally { await ctx.close(); }
});

test("say with elevenlabs without key returns ok=false with error", async () => {
  const ctx = await spinUp();
  try {
    const result = await ctx.client.say({ text: "hello", provider: "elevenlabs" });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /ELEVENLABS_API_KEY/);
  } finally { await ctx.close(); }
});

test("transcribe with echo provider returns metadata transcript", async () => {
  const ctx = await spinUp();
  try {
    const result = await ctx.client.transcribe({
      provider: "openai-stt",
      audioBase64: "ignored",
      metadata: { transcript: "buenas noches" },
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "buenas noches");
  } finally { await ctx.close(); }
});

test("runs endpoint lists past TTS + STT calls", async () => {
  const ctx = await spinUp();
  try {
    await ctx.client.transcribe({ provider: "openai-stt", audioBase64: "x", metadata: { transcript: "test 1" } });
    await ctx.client.transcribe({ provider: "openai-stt", audioBase64: "x", metadata: { transcript: "test 2" } });
    const list = await ctx.client.runs({ kind: "stt" });
    assert.ok(list.items.length >= 2);
  } finally { await ctx.close(); }
});

test("unknown provider returns 404", async () => {
  const ctx = await spinUp();
  try {
    await assert.rejects(() => ctx.client.say({ text: "x", provider: "no-such-provider" as "system-tts" }), /provider_not_found|404/);
  } finally { await ctx.close(); }
});
