import { buildPossessionsApp } from "@clawjs/possessions";

const { app, config } = buildPossessionsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`possessions service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`possessions service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
