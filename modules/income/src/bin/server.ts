import { buildIncomeApp } from "@clawjs/income";

const { app, config } = buildIncomeApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`income service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`income service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
