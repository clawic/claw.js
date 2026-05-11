import path from "node:path";

export interface VoiceServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  outputDir: string;
  sharedSecret: string;
  defaultTtsProvider: string;
  defaultSttProvider: string;
  systemSayBin: string;
  elevenLabsApiKey: string | null;
  openAiApiKey: string | null;
  whisperLocalBin: string | null;
}

export function loadVoiceConfig(overrides: Partial<VoiceServiceConfig> = {}): VoiceServiceConfig {
  const cwd = process.cwd();
  const dataDir = overrides.dataDir ?? process.env.VOICE_DATA_DIR ?? path.join(cwd, ".data");
  return {
    host: overrides.host ?? process.env.VOICE_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.VOICE_PORT ?? process.env.PORT ?? "4690"),
    dbPath: overrides.dbPath ?? process.env.VOICE_DB_PATH ?? path.join(dataDir, "voice.sqlite"),
    dataDir,
    outputDir: overrides.outputDir ?? process.env.VOICE_OUTPUT_DIR ?? path.join(dataDir, "voice-output"),
    sharedSecret: overrides.sharedSecret ?? process.env.VOICE_SHARED_SECRET ?? "voice-dev-secret-change-me",
    defaultTtsProvider: overrides.defaultTtsProvider ?? process.env.VOICE_DEFAULT_TTS ?? "system-tts",
    defaultSttProvider: overrides.defaultSttProvider ?? process.env.VOICE_DEFAULT_STT ?? "whisper-local",
    systemSayBin: overrides.systemSayBin ?? process.env.VOICE_SYSTEM_SAY ?? "say",
    elevenLabsApiKey: overrides.elevenLabsApiKey ?? process.env.ELEVENLABS_API_KEY ?? null,
    openAiApiKey: overrides.openAiApiKey ?? process.env.OPENAI_API_KEY ?? null,
    whisperLocalBin: overrides.whisperLocalBin ?? process.env.VOICE_WHISPER_LOCAL ?? null,
  };
}
