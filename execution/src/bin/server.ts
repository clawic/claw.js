import { buildExecutionPlaneApp } from "../server/app.ts";

const { app, config } = await buildExecutionPlaneApp();

await app.listen({
  host: config.host,
  port: config.port,
});
