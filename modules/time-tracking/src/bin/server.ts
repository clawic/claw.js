import { buildTimeTrackingApp } from "@clawjs/time-tracking";

const { app, config } = buildTimeTrackingApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`time-tracking service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`time-tracking service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
