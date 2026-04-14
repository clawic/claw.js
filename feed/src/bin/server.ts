import { buildFeedApp } from "../server/app.ts";

const { app, config, ingester } = buildFeedApp();

if (config.pollEnabled) {
  ingester.start(config.pollIntervalMs);
}

await app.listen({
  host: config.host,
  port: config.port,
});

process.stdout.write(`feed listening on http://${config.host}:${config.port}\n`);
