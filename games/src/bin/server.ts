import { buildGamesApp } from "@clawjs/games";

const { app, config } = buildGamesApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`games service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`games service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
