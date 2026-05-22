import { resolveClawGlobalDataStorageDir } from "@clawjs/core";
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
  const dataDir = overrides.dataDir ?? process.env.CLAW_AUDIO_DATA_DIR ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.CLAW_AUDIO_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.CLAW_AUDIO_PORT ?? process.env.PORT ?? "24151"),
    dbPath: overrides.dbPath ?? process.env.CLAW_AUDIO_DB_PATH ?? path.join(dataDir, "audio.sqlite"),
    dataDir,
    blobsDir: overrides.blobsDir ?? process.env.CLAW_AUDIO_BLOBS_DIR ?? path.join(dataDir, "blobs"),
    sharedSecret: overrides.sharedSecret ?? process.env.CLAW_AUDIO_SHARED_SECRET ?? "audio-dev-secret-change-me",
  };
}

function defaultClawjsDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR;
  return resolveClawGlobalDataStorageDir({
    homeDir: os.homedir(),
    ...(explicit ? { dataDir: explicit } : {}),
    ...(process.env.CLAW_HOME ? { clawHome: process.env.CLAW_HOME } : {}),
  });
}
