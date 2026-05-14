import fs from "node:fs";
import nodePath from "node:path";

import { buildApp, type BuildAppOptions } from "../server/app.ts";

async function readLocalAdminBootstrap(): Promise<{ adminToken?: string }> {
  if (process.env.CLAW_LOCAL_ADMIN_BOOTSTRAP_STDIN !== "1") return {};
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) throw new Error("CLAW_LOCAL_ADMIN_BOOTSTRAP_STDIN was set but no bootstrap payload was received");
  const parsed = JSON.parse(raw) as { adminToken?: unknown };
  return typeof parsed.adminToken === "string" && parsed.adminToken.length > 0
    ? { adminToken: parsed.adminToken }
    : {};
}

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
  const bootstrap = await readLocalAdminBootstrap();
  const overrides: BuildAppOptions = { config: {} };
  if (bootstrap.adminToken) overrides.adminToken = bootstrap.adminToken;
  if (process.env.CLAW_PUBLISHING_PORT) overrides.config!.port = Number(process.env.CLAW_PUBLISHING_PORT);
  if (process.env.CLAW_PUBLISHING_HOST) overrides.config!.host = process.env.CLAW_PUBLISHING_HOST;
  if (process.env.CLAW_PUBLISHING_DATA_DIR) overrides.config!.dataDir = process.env.CLAW_PUBLISHING_DATA_DIR;
  const built = await startServer({ ...overrides, statusFile: process.env.CLAW_PUBLISHING_STATUS_FILE });
  process.stdout.write(`publishing listening on http://${built.config.host}:${built.config.port}\n`);
  if (process.env.CLAW_PUBLISHING_PRINT_TOKEN === "1") {
    process.stdout.write(`admin token: ${built.services.auth.getEphemeralAdminToken()}\n`);
  }
}
