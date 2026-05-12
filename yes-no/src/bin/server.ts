import { buildYesNoApp } from "@clawjs/yes-no";

const { app, config } = buildYesNoApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`yes-no service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`yes-no service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
