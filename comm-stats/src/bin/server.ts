import { buildCommStatsApp } from "@clawjs/comm-stats";

const { app, config } = buildCommStatsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`comm-stats service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`comm-stats service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
