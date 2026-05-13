import { buildPainMapApp } from "@clawjs/pain-map";

const { app, config } = buildPainMapApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`pain-map service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`pain-map service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
