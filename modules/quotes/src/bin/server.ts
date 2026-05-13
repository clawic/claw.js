import { buildQuotesApp } from "@clawjs/quotes";

const { app, config } = buildQuotesApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`quotes service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`quotes service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
