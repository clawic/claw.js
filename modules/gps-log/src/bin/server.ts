import { buildGpsLogApp } from "@clawjs/gps-log";

const { app, config } = buildGpsLogApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`gps-log service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`gps-log service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
