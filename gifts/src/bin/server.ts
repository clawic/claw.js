import { buildGiftsApp } from "@clawjs/gifts";

const { app, config } = buildGiftsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`gifts service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`gifts service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
