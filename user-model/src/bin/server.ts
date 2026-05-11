import { buildUserModelApp } from "../server/app.ts";

const { app, config } = buildUserModelApp();

await app.listen({
  host: config.host,
  port: config.port,
});

process.stdout.write(`user-model listening on http://${config.host}:${config.port}\n`);
