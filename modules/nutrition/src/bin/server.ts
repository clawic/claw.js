import { buildNutritionApp } from "@clawjs/nutrition";

const { app, config } = buildNutritionApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`nutrition service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`nutrition service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
