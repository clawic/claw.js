import { buildLearningApp } from "@clawjs/learning";

const { app, config } = buildLearningApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`learning service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`learning service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
