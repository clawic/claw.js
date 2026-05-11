import { buildSlackApp } from "../server/app.ts";

const { app, config } = buildSlackApp();
await app.listen({ host: config.host, port: config.port || 4701 });
process.stdout.write(`slack listening on http://${config.host}:${config.port || 4701}\n`);
