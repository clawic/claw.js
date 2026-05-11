import { buildEmailApp } from "../server/app.ts";

const { app, config } = buildEmailApp();
await app.listen({ host: config.host, port: config.port || 4704 });
process.stdout.write(`email listening on http://${config.host}:${config.port || 4704}\n`);
