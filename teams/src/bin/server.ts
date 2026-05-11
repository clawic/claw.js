import { buildTeamsApp } from "../server/app.ts";

const { app, config } = buildTeamsApp();
await app.listen({ host: config.host, port: config.port || 4709 });
process.stdout.write(`teams listening on http://${config.host}:${config.port || 4709}\n`);
