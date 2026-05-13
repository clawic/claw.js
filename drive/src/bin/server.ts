import path from "node:path";
import fs from "node:fs";

import { buildDriveApp, type BuildDriveAppOptions } from "../server/app.ts";
import type { DriveServiceConfig } from "../server/config.ts";

export interface StartDriveServerOptions extends BuildDriveAppOptions {
  /** Path written with the resolved port + pid so the parent process can poll readiness. */
  statusFile?: string;
}

export async function startDriveServer(options: StartDriveServerOptions = {}) {
  const built = await buildDriveApp(options);
  await built.app.listen({ host: built.config.host, port: built.config.port });

  if (options.statusFile) {
    const status = {
      ok: true,
      service: "drive",
      host: built.config.host,
      port: built.config.port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(options.statusFile), { recursive: true });
    fs.writeFileSync(options.statusFile, JSON.stringify(status, null, 2), "utf8");
  }

  return built;
}

// Top-level entry: when this file is run directly (node dist/server.js or
// `tsx src/bin/server.ts`), pick up overrides from environment variables that
// the launcher mjs sets and start the server.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const overrides: BuildDriveAppOptions & { config?: Partial<DriveServiceConfig> } = {
    ocrSidecarPath: process.env.CLAW_DRIVE_OCR_SIDECAR,
    embedSidecarPath: process.env.CLAW_DRIVE_EMBED_SIDECAR,
    cloudflaredPath: process.env.CLAW_DRIVE_CLOUDFLARED,
  };
  const cfg: Partial<DriveServiceConfig> = {};
  if (process.env.CLAW_DRIVE_PORT) cfg.port = Number(process.env.CLAW_DRIVE_PORT);
  if (process.env.CLAW_DRIVE_HOST) cfg.host = process.env.CLAW_DRIVE_HOST;
  if (process.env.CLAW_DRIVE_DATA_DIR) cfg.dataDir = process.env.CLAW_DRIVE_DATA_DIR;
  if (process.env.CLAW_DRIVE_DB_PATH) cfg.dbPath = process.env.CLAW_DRIVE_DB_PATH;
  if (Object.keys(cfg).length > 0) overrides.config = cfg;

  const statusFile = process.env.CLAW_DRIVE_STATUS_FILE;
  const { config } = await startDriveServer({ ...overrides, statusFile });
  process.stdout.write(`drive listening on http://${config.host}:${config.port}\n`);
}
