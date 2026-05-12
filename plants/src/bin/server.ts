import { buildPlantsApp } from "@clawjs/plants";

const { app, config } = buildPlantsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`plants service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`plants service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
