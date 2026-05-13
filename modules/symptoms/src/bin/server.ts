import { buildSymptomsApp } from "@clawjs/symptoms";

const { app, config } = buildSymptomsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`symptoms service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`symptoms service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
