import { buildCareerApp } from "@clawjs/career";

const { app, config } = buildCareerApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`career service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`career service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
