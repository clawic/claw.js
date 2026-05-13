import { buildFinanceApp } from "@clawjs/finance";

const { app, config } = buildFinanceApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`finance service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`finance service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
