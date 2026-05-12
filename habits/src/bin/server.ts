import { buildHabitsApp } from "@clawjs/habits";

const { app, config } = buildHabitsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`habits service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`habits service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
