import { buildDreamsApp } from "@clawjs/dreams";

const { app, config } = buildDreamsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`dreams service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`dreams service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
