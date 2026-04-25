import { execFile as execFileCb } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFileCb);

export type SttProvider = "local-whisper";

export interface SttProviderConfig {
  enabled?: boolean;
  provider?: SttProvider;
  binaryPath?: string;
  ffmpegPath?: string;
  modelPath?: string;
  language?: string;
  translate?: boolean;
  threads?: number;
}

export interface SttProviderDescriptor {
  id: SttProvider;
  label: string;
  requiresNetwork: boolean;
  fields: Array<{
    key: keyof SttProviderConfig;
    label: string;
    type: "toggle" | "text" | "number";
    required?: boolean;
    defaultValue?: string | number | boolean;
  }>;
}

export interface SttTranscribeInput extends SttProviderConfig {
  filePath: string;
}

export interface SttTranscribeResult {
  text: string;
  provider: SttProvider;
  model?: string;
  language?: string;
  rawOutput?: string;
}

const DEFAULT_STT_CONFIG: SttProviderConfig = {
  enabled: false,
  provider: "local-whisper",
  binaryPath: "whisper-cli",
  ffmpegPath: "ffmpeg",
  language: "auto",
};

const STT_PROVIDERS: SttProviderDescriptor[] = [{
  id: "local-whisper",
  label: "Local Whisper (whisper.cpp)",
  requiresNetwork: false,
  fields: [
    { key: "enabled", label: "Enable speech to text", type: "toggle", defaultValue: false },
    { key: "binaryPath", label: "whisper.cpp binary", type: "text", required: true, defaultValue: "whisper-cli" },
    { key: "ffmpegPath", label: "FFmpeg binary", type: "text", defaultValue: "ffmpeg" },
    { key: "modelPath", label: "Model path", type: "text", required: true },
    { key: "language", label: "Language", type: "text", defaultValue: "auto" },
    { key: "translate", label: "Translate to English", type: "toggle", defaultValue: false },
    { key: "threads", label: "Threads", type: "number" },
  ],
}];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeSttConfig(input?: SttProviderConfig | null): SttProviderConfig {
  return {
    ...DEFAULT_STT_CONFIG,
    ...(input ?? {}),
    provider: "local-whisper",
    ...(input?.binaryPath?.trim() ? { binaryPath: input.binaryPath.trim() } : {}),
    ...(input?.ffmpegPath?.trim() ? { ffmpegPath: input.ffmpegPath.trim() } : {}),
    ...(input?.modelPath?.trim() ? { modelPath: input.modelPath.trim() } : {}),
    ...(input?.language?.trim() ? { language: input.language.trim() } : {}),
  };
}

export function listSttProviders(): SttProviderDescriptor[] {
  return STT_PROVIDERS;
}

function needsWavConversion(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext !== ".wav" && ext !== ".wave";
}

async function prepareWhisperInput(filePath: string, ffmpegPath: string | undefined): Promise<{ filePath: string; cleanup?: () => void }> {
  if (!needsWavConversion(filePath)) return { filePath };
  const outputPath = path.join(os.tmpdir(), `clawjs-stt-${randomUUID()}.wav`);
  try {
    await execFileAsync(ffmpegPath || "ffmpeg", [
      "-y",
      "-i", filePath,
      "-ar", "16000",
      "-ac", "1",
      "-c:a", "pcm_s16le",
      outputPath,
    ], { maxBuffer: 10 * 1024 * 1024 });
  } catch (error) {
    try {
      fs.rmSync(outputPath, { force: true });
    } catch {
      // Ignore cleanup failures for temp output.
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`ffmpeg is required to convert this audio before local-whisper transcription: ${message}`);
  }
  return {
    filePath: outputPath,
    cleanup: () => {
      try {
        fs.rmSync(outputPath, { force: true });
      } catch {
        // Ignore cleanup failures for temp output.
      }
    },
  };
}

export async function transcribe(input: SttTranscribeInput): Promise<SttTranscribeResult> {
  const config = normalizeSttConfig(input);
  const binaryPath = config.binaryPath || "whisper-cli";
  if (!config.modelPath) {
    throw new Error("local-whisper requires modelPath");
  }
  if (!fs.existsSync(input.filePath)) {
    throw new Error(`audio file does not exist: ${input.filePath}`);
  }

  const prepared = await prepareWhisperInput(input.filePath, config.ffmpegPath);
  const outputBase = path.join(os.tmpdir(), `clawjs-whisper-${randomUUID()}`);
  const args = [
    "-m", config.modelPath,
    "-f", prepared.filePath,
    "-otxt",
    "-of", outputBase,
  ];
  if (config.language && config.language !== "auto") args.push("-l", config.language);
  if (config.translate) args.push("-tr");
  if (typeof config.threads === "number" && Number.isFinite(config.threads) && config.threads > 0) {
    args.push("-t", String(Math.floor(config.threads)));
  }

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, args, {
      maxBuffer: 10 * 1024 * 1024,
    });
    const txtPath = `${outputBase}.txt`;
    const text = fs.existsSync(txtPath)
      ? fs.readFileSync(txtPath, "utf8")
      : stdout;
    try {
      fs.rmSync(txtPath, { force: true });
    } catch {
      // Ignore cleanup failures for temp output.
    }
    return {
      text: normalizeText(text),
      provider: "local-whisper",
      model: config.modelPath,
      language: config.language,
      rawOutput: stderr.trim() || stdout.trim() || undefined,
    };
  } finally {
    prepared.cleanup?.();
  }
}
