import { buildLessonsApp } from "@clawjs/lessons";

const { app, config } = buildLessonsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`lessons service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`lessons service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
