import { buildWikiApp } from "../server/app.ts";

const { app, config } = buildWikiApp();

await app.listen({
  host: config.host,
  port: config.port,
});

process.stdout.write(`wiki listening on http://${config.host}:${config.port}\n`);
