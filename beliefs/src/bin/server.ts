import { buildBeliefsApp } from "@clawjs/beliefs";

const { app, config } = buildBeliefsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`beliefs service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`beliefs service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
