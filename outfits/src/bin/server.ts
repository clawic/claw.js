import { buildOutfitsApp } from "@clawjs/outfits";

const { app, config } = buildOutfitsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`outfits service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`outfits service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
