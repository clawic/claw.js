import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadMonitorConfig } from "./config.ts";
import { MonitorDatabase } from "./db.ts";
import { HeartbeatCollector } from "./collector.ts";
import { LocalCollector } from "./local-collector.ts";
import { registerRoutes } from "./routes.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const config = loadMonitorConfig();
  const db = new MonitorDatabase(config.dbPath);

  console.log(`[monitor] Mode: ${config.mode}`);

  // Initialize collectors based on mode
  let relayCollector: HeartbeatCollector | null = null;
  let localCollector: LocalCollector | null = null;

  if (config.mode === "relay" || config.mode === "hybrid") {
    relayCollector = new HeartbeatCollector(db, config);
  }
  if (config.mode === "local" || config.mode === "hybrid") {
    localCollector = new LocalCollector(db, config);
  }

  const app = Fastify({ logger: false });

  // CORS
  if (config.corsOrigins.length > 0) {
    await app.register(cors, { origin: config.corsOrigins });
  } else {
    await app.register(cors, { origin: true });
  }

  // API routes
  registerRoutes(app, db, config, relayCollector, localCollector);

  // Serve UI static files in production
  const uiDist = path.resolve(__dirname, "../../ui/dist");
  if (existsSync(uiDist)) {
    await app.register(fastifyStatic, {
      root: uiDist,
      prefix: "/",
      wildcard: false,
    });
    // SPA fallback: serve index.html for non-API routes
    app.setNotFoundHandler(async (_request, reply) => {
      return reply.sendFile("index.html");
    });
  }

  // Start collectors
  if (relayCollector) relayCollector.start();
  if (localCollector) localCollector.start();

  // Auto-discover on first run (if no monitors exist)
  const monitors = db.listMonitors();
  if (monitors.length === 0) {
    console.log("[monitor] No monitors found, running auto-discovery...");
    setTimeout(() => {
      const promises: Promise<{ created: number }>[] = [];
      if (relayCollector) promises.push(relayCollector.discover());
      if (localCollector) promises.push(localCollector.discover());
      void Promise.all(promises).then((results) => {
        const total = results.reduce((sum, r) => sum + r.created, 0);
        console.log(`[monitor] Auto-discovered ${total} monitors`);
      }).catch((err) => {
        console.error("[monitor] Auto-discovery failed:", err);
      });
    }, 2000);
  }

  // Start server
  await app.listen({ host: config.host, port: config.port });
  console.log(`[monitor] Server listening on http://${config.host}:${config.port}`);

  // Graceful shutdown
  const shutdown = () => {
    console.log("[monitor] Shutting down...");
    if (relayCollector) relayCollector.stop();
    if (localCollector) localCollector.stop();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[monitor] Fatal error:", err);
  process.exit(1);
});
