import { buildSubstancesApp } from "@clawjs/substances";

const { app, config } = buildSubstancesApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`substances service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`substances service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
