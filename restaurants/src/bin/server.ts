import { buildRestaurantsApp } from "@clawjs/restaurants";

const { app, config } = buildRestaurantsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`restaurants service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`restaurants service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
