import { buildEmotionsApp } from "@clawjs/emotions";

const { app, config } = buildEmotionsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`emotions service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`emotions service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
