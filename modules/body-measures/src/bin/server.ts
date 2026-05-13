import { buildBodyMeasuresApp } from "@clawjs/body-measures";

const { app, config } = buildBodyMeasuresApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`body-measures service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`body-measures service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
