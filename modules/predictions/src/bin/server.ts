import { buildPredictionsApp } from "@clawjs/predictions";

const { app, config } = buildPredictionsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`predictions service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`predictions service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
