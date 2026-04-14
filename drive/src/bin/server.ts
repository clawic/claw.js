import { buildDriveApp } from "../server/app.ts";

const { app, config } = buildDriveApp();

await app.listen({
  host: config.host,
  port: config.port,
});

process.stdout.write(`drive listening on http://${config.host}:${config.port}\n`);
