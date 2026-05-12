import { buildWildlifeApp } from "@clawjs/wildlife";

const { app, config } = buildWildlifeApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`wildlife service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`wildlife service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
