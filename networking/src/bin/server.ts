import { buildNetworkingApp } from "@clawjs/networking";

const { app, config } = buildNetworkingApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`networking service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`networking service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
