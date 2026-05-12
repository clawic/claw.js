import { buildHotTakesApp } from "@clawjs/hot-takes";

const { app, config } = buildHotTakesApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`hot-takes service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`hot-takes service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
