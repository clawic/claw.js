import { buildCognitionApp } from "@clawjs/cognition";

const { app, config } = buildCognitionApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`cognition service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`cognition service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
