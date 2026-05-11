import { buildSandboxApp } from "../server/app.ts";

const { app, config } = buildSandboxApp();

await app.listen({
  host: config.host,
  port: config.port,
});

process.stdout.write(`sandbox listening on http://${config.host}:${config.port}\n`);
