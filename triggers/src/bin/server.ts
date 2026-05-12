import { buildTriggersApp } from "@clawjs/triggers";

const { app, config } = buildTriggersApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`triggers service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`triggers service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
