import { buildPromisesApp } from "@clawjs/promises";

const { app, config } = buildPromisesApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`promises service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`promises service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
