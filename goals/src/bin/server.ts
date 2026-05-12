import { buildGoalsApp } from "@clawjs/goals";

const { app, config } = buildGoalsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`goals service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`goals service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
