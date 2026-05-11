import { buildWebhooksApp } from "../server/app.ts";

const { app, config } = buildWebhooksApp();
await app.listen({ host: config.host, port: config.port || 4700 });
process.stdout.write(`webhooks listening on http://${config.host}:${config.port || 4700}\n`);
