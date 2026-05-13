import { buildSpiritualityApp } from "@clawjs/spirituality";

const { app, config } = buildSpiritualityApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`spirituality service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`spirituality service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
