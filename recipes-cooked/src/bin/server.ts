import { buildRecipesCookedApp } from "@clawjs/recipes-cooked";

const { app, config } = buildRecipesCookedApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`recipes-cooked service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`recipes-cooked service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
