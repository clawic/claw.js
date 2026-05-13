import { buildMusicApp } from "@clawjs/music";

const { app, config } = buildMusicApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`music service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`music service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
