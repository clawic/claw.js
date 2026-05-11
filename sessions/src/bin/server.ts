import { buildSessionsApp } from "../server/app.ts";

const { app, config } = buildSessionsApp();

await app.listen({
  host: config.host,
  port: config.port,
});

process.stdout.write(`sessions listening on http://${config.host}:${config.port}\n`);
