import { buildSleepApp } from "@clawjs/sleep";

const { app, config } = buildSleepApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`sleep service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`sleep service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
