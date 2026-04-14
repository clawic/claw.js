import { buildErpApp } from "../server/app.ts";

const { app, config } = buildErpApp();

const address = await app.listen({
  host: config.host,
  port: config.port,
});

process.stdout.write(`${address}\n`);
