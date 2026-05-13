import { buildWorkoutsApp } from "@clawjs/workouts";

const { app, config } = buildWorkoutsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`workouts service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`workouts service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
