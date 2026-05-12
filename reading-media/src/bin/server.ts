import { buildReadingMediaApp } from "@clawjs/reading-media";

const { app, config } = buildReadingMediaApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`reading-media service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`reading-media service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
