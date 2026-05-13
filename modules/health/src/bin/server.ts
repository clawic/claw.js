import { buildHealthApp } from "@clawjs/health";

const { app, config } = buildHealthApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`health service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`health service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
