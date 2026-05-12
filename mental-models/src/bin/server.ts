import { buildMentalModelsApp } from "@clawjs/mental-models";

const { app, config } = buildMentalModelsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`mental-models service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`mental-models service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
