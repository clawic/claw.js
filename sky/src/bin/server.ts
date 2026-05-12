import { buildSkyApp } from "@clawjs/sky";

const { app, config } = buildSkyApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`sky service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`sky service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
