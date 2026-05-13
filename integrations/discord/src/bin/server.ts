import { buildDiscordApp } from "../server/app.ts";

const { app, config } = buildDiscordApp();
await app.listen({ host: config.host, port: config.port || 4702 });
process.stdout.write(`discord listening on http://${config.host}:${config.port || 4702}\n`);
