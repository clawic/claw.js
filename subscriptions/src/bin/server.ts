import { buildSubscriptionsApp } from "@clawjs/subscriptions";

const { app, config } = buildSubscriptionsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`subscriptions service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`subscriptions service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
