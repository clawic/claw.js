import { buildCycleApp } from "@clawjs/cycle";

const { app, config } = buildCycleApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`cycle service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`cycle service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
