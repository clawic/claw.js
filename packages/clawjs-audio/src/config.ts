import path from "node:path";
import os from "node:os";

export interface AudioServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  blobsDir: string;
  sharedSecret: string;
}

export function loadAudioConfig(overrides: Partial<AudioServiceConfig> = {}): AudioServiceConfig {
  const dataDir = overrides.dataDir ?? process.env.AUDIO_DATA_DIR ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.AUDIO_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.AUDIO_PORT ?? process.env.PORT ?? "4630"),
    dbPath: overrides.dbPath ?? process.env.AUDIO_DB_PATH ?? path.join(dataDir, "audio.sqlite"),
    dataDir,
    blobsDir: overrides.blobsDir ?? process.env.AUDIO_BLOBS_DIR ?? path.join(dataDir, "blobs"),
    sharedSecret: overrides.sharedSecret ?? process.env.AUDIO_SHARED_SECRET ?? "audio-dev-secret-change-me",
  };
}

function defaultClawjsDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR ?? process.env.CLAWJS_MAIN_DATA_DIR ?? process.env.CLAWIX_CLAWJS_DATA_DIR;
  if (explicit) return expandHome(explicit);
  return path.join(expandHome(process.env.CLAW_HOME ?? path.join(os.homedir(), ".claw")), "data");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
