import { buildThoughtsRawApp } from "@clawjs/thoughts-raw";

const { app, config } = buildThoughtsRawApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`thoughts-raw service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`thoughts-raw service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
