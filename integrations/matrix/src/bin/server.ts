import { buildMatrixApp } from "../server/app.ts";

const { app, config } = buildMatrixApp();
await app.listen({ host: config.host, port: config.port || 4708 });
process.stdout.write(`matrix listening on http://${config.host}:${config.port || 4708}\n`);
