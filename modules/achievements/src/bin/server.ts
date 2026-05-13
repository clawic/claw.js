import { buildAchievementsApp } from "@clawjs/achievements";

const { app, config } = buildAchievementsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`achievements service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`achievements service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
