import { buildMemorableMomentsApp } from "@clawjs/memorable-moments";

const { app, config } = buildMemorableMomentsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`memorable-moments service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`memorable-moments service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
