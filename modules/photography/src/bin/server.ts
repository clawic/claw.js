import { buildPhotographyApp } from "@clawjs/photography";

const { app, config } = buildPhotographyApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`photography service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`photography service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
