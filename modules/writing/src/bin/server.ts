import { buildWritingApp } from "@clawjs/writing";

const { app, config } = buildWritingApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`writing service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`writing service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
