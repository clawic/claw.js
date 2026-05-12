import { buildStretchingApp } from "@clawjs/stretching";

const { app, config } = buildStretchingApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`stretching service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`stretching service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
