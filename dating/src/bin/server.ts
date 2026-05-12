import { buildDatingApp } from "@clawjs/dating";

const { app, config } = buildDatingApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`dating service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`dating service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
