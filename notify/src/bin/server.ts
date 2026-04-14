import { buildNotifyApp } from "../server/app.ts";

const { app, config } = buildNotifyApp();

await app.listen({
  host: config.host,
  port: config.port,
});

process.stdout.write(`notify listening on http://${config.host}:${config.port}\n`);
