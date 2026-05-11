import path from "node:path";

export interface AudioServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  blobsDir: string;
  sharedSecret: string;
}

export function loadAudioConfig(overrides: Partial<AudioServiceConfig> = {}): AudioServiceConfig {
  const cwd = process.cwd();
  const dataDir = overrides.dataDir ?? process.env.AUDIO_DATA_DIR ?? path.join(cwd, ".data");
  return {
    host: overrides.host ?? process.env.AUDIO_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.AUDIO_PORT ?? process.env.PORT ?? "4630"),
    dbPath: overrides.dbPath ?? process.env.AUDIO_DB_PATH ?? path.join(dataDir, "audio.sqlite"),
    dataDir,
    blobsDir: overrides.blobsDir ?? process.env.AUDIO_BLOBS_DIR ?? path.join(dataDir, "blobs"),
    sharedSecret: overrides.sharedSecret ?? process.env.AUDIO_SHARED_SECRET ?? "audio-dev-secret-change-me",
  };
}
