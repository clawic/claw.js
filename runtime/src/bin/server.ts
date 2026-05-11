import { buildRuntimeApp } from "../server/app.ts";

const { app, config } = buildRuntimeApp();

await app.listen({
  host: config.host,
  port: config.port,
});

process.stdout.write(`runtime listening on http://${config.host}:${config.port}\n`);
