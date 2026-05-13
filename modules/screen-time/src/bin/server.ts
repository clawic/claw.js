import { buildScreenTimeApp } from "@clawjs/screen-time";

const { app, config } = buildScreenTimeApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`screen-time service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`screen-time service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
