import { buildSignalApp } from "../server/app.ts";

const { app, config } = buildSignalApp();
await app.listen({ host: config.host, port: config.port || 4706 });
process.stdout.write(`signal listening on http://${config.host}:${config.port || 4706}\n`);
