import { buildRelationshipsApp } from "@clawjs/relationships";

const { app, config } = buildRelationshipsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`relationships service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`relationships service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
