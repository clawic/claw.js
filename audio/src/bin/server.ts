import { buildAudioApp } from "../server/app.ts";

const { app, config } = buildAudioApp();

await app.listen({
  host: config.host,
  port: config.port,
});

process.stdout.write(`audio listening on http://${config.host}:${config.port}\n`);
