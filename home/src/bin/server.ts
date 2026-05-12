import { buildHomeApp } from "@clawjs/home";

const { app, config } = buildHomeApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`home service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`home service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
