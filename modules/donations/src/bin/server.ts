import { buildDonationsApp } from "@clawjs/donations";

const { app, config } = buildDonationsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`donations service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`donations service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
