import fs from "node:fs";
import nodePath from "node:path";

import { buildApp, type BuildAppOptions } from "../server/app.ts";

export async function startServer(options: BuildAppOptions & { statusFile?: string } = {}) {
  const built = await buildApp(options);
  await built.app.listen({ host: built.config.host, port: built.config.port });
  if (options.statusFile) {
    fs.mkdirSync(nodePath.dirname(options.statusFile), { recursive: true });
    fs.writeFileSync(
      options.statusFile,
      JSON.stringify({ ok: true, service: "publishing", host: built.config.host, port: built.config.port, pid: process.pid, startedAt: new Date().toISOString() }, null, 2),
      "utf8",
    );
  }
  return built;
}

const isDirectInvocation = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  const base = nodePath.basename(entry);
  return base === "server.ts" || base === "server.js";
})();

if (isDirectInvocation) {
  const overrides: BuildAppOptions = { config: {} };
  if (process.env.BADGER_PORT) overrides.config!.port = Number(process.env.BADGER_PORT);
  if (process.env.BADGER_HOST) overrides.config!.host = process.env.BADGER_HOST;
  if (process.env.BADGER_DATA_DIR) overrides.config!.dataDir = process.env.BADGER_DATA_DIR;
  const built = await startServer({ ...overrides, statusFile: process.env.BADGER_STATUS_FILE });
  process.stdout.write(`publishing listening on http://${built.config.host}:${built.config.port}\n`);
  if (process.env.BADGER_PRINT_TOKEN === "1") {
    process.stdout.write(`admin token: ${built.services.auth.getEphemeralAdminToken()}\n`);
  }
}
