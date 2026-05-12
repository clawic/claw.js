import { buildHydrationApp } from "@clawjs/hydration";

const { app, config } = buildHydrationApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`hydration service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`hydration service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
