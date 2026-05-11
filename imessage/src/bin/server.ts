import { buildImessageApp } from "../server/app.ts";

const { app, config } = buildImessageApp();
await app.listen({ host: config.host, port: config.port || 4703 });
process.stdout.write(`imessage listening on http://${config.host}:${config.port || 4703}\n`);
