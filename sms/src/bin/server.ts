import { buildSmsApp } from "../server/app.ts";

const { app, config } = buildSmsApp();
await app.listen({ host: config.host, port: config.port || 4707 });
process.stdout.write(`sms listening on http://${config.host}:${config.port || 4707}\n`);
