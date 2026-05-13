import { buildConflictsApp } from "@clawjs/conflicts";

const { app, config } = buildConflictsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`conflicts service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`conflicts service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
