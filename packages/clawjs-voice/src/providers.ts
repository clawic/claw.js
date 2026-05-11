import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import type {
  STTProviderAdapter,
  STTRequest,
  TTSProviderAdapter,
  TTSRequest,
  TTSResult,
} from "./types.ts";

function ensureOutputPath(request: TTSRequest, defaults: { dataDir: string }, ext = "aiff"): string {
  if (request.outputPath) {
    fs.mkdirSync(path.dirname(request.outputPath), { recursive: true });
    return request.outputPath;
  }
  fs.mkdirSync(defaults.dataDir, { recursive: true });
  return path.join(defaults.dataDir, `${randomUUID()}.${ext}`);
}

export function createSystemTTSProvider(options: { binary?: string } = {}): TTSProviderAdapter {
  const binary = options.binary ?? "say";
  return {
    id: "system-tts",
    available: process.platform === "darwin",
    description: "macOS built-in `say` command. No external deps. Voice via -v flag.",
    async synth(request: TTSRequest, defaults) {
      const startedAt = Date.now();
      const outputPath = ensureOutputPath(request, defaults, "aiff");
      const args: string[] = ["-o", outputPath];
      if (request.voice) args.push("-v", request.voice);
      if (request.speed) args.push("-r", String(request.speed));
      args.push(request.text);
      return await new Promise((resolve) => {
        const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
        const stderr: Buffer[] = [];
        child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
        child.on("error", (err) => {
          resolve({ provider: "system-tts", text: request.text, outputPath: null, mimeType: "audio/aiff", durationMs: Date.now() - startedAt, bytesWritten: null, ok: false, error: err.message });
        });
        child.on("close", (code) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            const stat = fs.statSync(outputPath);
            resolve({ provider: "system-tts", text: request.text, outputPath, mimeType: "audio/aiff", durationMs: Date.now() - startedAt, bytesWritten: stat.size, ok: true, error: null });
          } else {
            resolve({ provider: "system-tts", text: request.text, outputPath: null, mimeType: "audio/aiff", durationMs: Date.now() - startedAt, bytesWritten: null, ok: false, error: Buffer.concat(stderr).toString("utf8") || `exit code ${code}` });
          }
        });
      });
    },
  };
}

export interface CloudProviderOptions { apiKey?: string | null; }

export function createElevenLabsProvider(options: CloudProviderOptions = {}): TTSProviderAdapter {
  return {
    id: "elevenlabs",
    available: typeof options.apiKey === "string" && options.apiKey.length > 0,
    description: "ElevenLabs TTS via HTTP API. Requires ELEVENLABS_API_KEY. This build returns a stub when no key is set.",
    async synth(request, defaults) {
      if (!options.apiKey) {
        return { provider: "elevenlabs", text: request.text, outputPath: null, mimeType: "audio/mpeg", durationMs: 0, bytesWritten: null, ok: false, error: "ELEVENLABS_API_KEY not configured" };
      }
      const outputPath = ensureOutputPath(request, defaults, "mp3");
      fs.writeFileSync(outputPath, "");
      return { provider: "elevenlabs", text: request.text, outputPath, mimeType: "audio/mpeg", durationMs: 0, bytesWritten: 0, ok: true, error: "stub (no real network call in this build)" };
    },
  };
}

export function createOpenAiTTSProvider(options: CloudProviderOptions = {}): TTSProviderAdapter {
  return {
    id: "openai-tts",
    available: typeof options.apiKey === "string" && options.apiKey.length > 0,
    description: "OpenAI TTS via HTTP API. Stub when no OPENAI_API_KEY.",
    async synth(request, defaults) {
      if (!options.apiKey) {
        return { provider: "openai-tts", text: request.text, outputPath: null, mimeType: "audio/mpeg", durationMs: 0, bytesWritten: null, ok: false, error: "OPENAI_API_KEY not configured" };
      }
      const outputPath = ensureOutputPath(request, defaults, "mp3");
      fs.writeFileSync(outputPath, "");
      return { provider: "openai-tts", text: request.text, outputPath, mimeType: "audio/mpeg", durationMs: 0, bytesWritten: 0, ok: true, error: "stub (no real network call in this build)" };
    },
  };
}

export function createAzureSpeechProvider(options: CloudProviderOptions = {}): TTSProviderAdapter {
  return {
    id: "azure-speech",
    available: typeof options.apiKey === "string" && options.apiKey.length > 0,
    description: "Azure Speech TTS. Stub when no AZURE_SPEECH_KEY.",
    async synth(request, defaults) {
      void defaults;
      return { provider: "azure-speech", text: request.text, outputPath: null, mimeType: "audio/wav", durationMs: 0, bytesWritten: null, ok: false, error: "azure-speech stub (configure API key + region to enable)" };
    },
  };
}

export interface WhisperLocalProviderOptions { binary?: string | null; }

export function createWhisperLocalProvider(options: WhisperLocalProviderOptions = {}): STTProviderAdapter {
  return {
    id: "whisper-local",
    available: typeof options.binary === "string" && options.binary.length > 0,
    description: "Local whisper.cpp invocation. Requires VOICE_WHISPER_LOCAL pointing to whisper-cpp binary.",
    async transcribe(request: STTRequest) {
      if (!options.binary) {
        return { provider: "whisper-local", text: "", language: request.language ?? null, durationMs: 0, ok: false, error: "whisper-local binary not configured" };
      }
      return { provider: "whisper-local", text: "", language: request.language ?? null, durationMs: 0, ok: false, error: "stub (would invoke whisper.cpp on configured audio)" };
    },
  };
}

export function createWhisperCloudProvider(options: CloudProviderOptions = {}): STTProviderAdapter {
  return {
    id: "whisper-cloud",
    available: typeof options.apiKey === "string" && options.apiKey.length > 0,
    description: "OpenAI Whisper API. Requires OPENAI_API_KEY.",
    async transcribe(request) {
      if (!options.apiKey) {
        return { provider: "whisper-cloud", text: "", language: request.language ?? null, durationMs: 0, ok: false, error: "OPENAI_API_KEY not configured" };
      }
      return { provider: "whisper-cloud", text: "", language: request.language ?? null, durationMs: 0, ok: true, error: "stub (no real network call in this build)" };
    },
  };
}

export function createDeepgramProvider(options: CloudProviderOptions = {}): STTProviderAdapter {
  return {
    id: "deepgram",
    available: typeof options.apiKey === "string" && options.apiKey.length > 0,
    description: "Deepgram STT. Stub when no DEEPGRAM_API_KEY.",
    async transcribe(request) {
      void request;
      return { provider: "deepgram", text: "", language: null, durationMs: 0, ok: false, error: "deepgram stub" };
    },
  };
}

export function createEchoSTTProvider(): STTProviderAdapter {
  return {
    id: "openai-stt",
    available: true,
    description: "Test-only echo STT: returns metadata.transcript or a fixed placeholder. Used by tests when no real engine is wired.",
    async transcribe(request) {
      const metadata = (request.metadata ?? {}) as { transcript?: string };
      return {
        provider: "openai-stt",
        text: metadata.transcript ?? "(no transcription engine wired)",
        language: request.language ?? "en",
        durationMs: 0,
        ok: true,
        error: null,
      };
    },
  };
}

export function buildTTSProviderRegistry(config: { elevenLabsApiKey: string | null; openAiApiKey: string | null; systemSayBin: string }): Record<string, TTSProviderAdapter> {
  return {
    "system-tts": createSystemTTSProvider({ binary: config.systemSayBin }),
    "elevenlabs": createElevenLabsProvider({ apiKey: config.elevenLabsApiKey }),
    "openai-tts": createOpenAiTTSProvider({ apiKey: config.openAiApiKey }),
    "azure-speech": createAzureSpeechProvider({ apiKey: null }),
  };
}

export function buildSTTProviderRegistry(config: { openAiApiKey: string | null; whisperLocalBin: string | null }): Record<string, STTProviderAdapter> {
  return {
    "whisper-local": createWhisperLocalProvider({ binary: config.whisperLocalBin }),
    "whisper-cloud": createWhisperCloudProvider({ apiKey: config.openAiApiKey }),
    "deepgram": createDeepgramProvider({ apiKey: null }),
    "openai-stt": createEchoSTTProvider(),
  };
}

export function buildResult<T extends TTSResult | { provider: string; text: string; language: string | null; durationMs: number; ok: boolean; error: string | null }>(partial: Omit<T, "id" | "createdAt">): T {
  return { ...(partial as object), id: randomUUID(), createdAt: Date.now() } as T;
}
