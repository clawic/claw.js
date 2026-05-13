import { buildComplimentsApp } from "@clawjs/compliments";

const { app, config } = buildComplimentsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`compliments service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`compliments service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
