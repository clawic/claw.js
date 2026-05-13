import { buildDecisionsApp } from "@clawjs/decisions";

const { app, config } = buildDecisionsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`decisions service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`decisions service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
