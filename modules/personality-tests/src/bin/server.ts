import { buildPersonalityTestsApp } from "@clawjs/personality-tests";

const { app, config } = buildPersonalityTestsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`personality-tests service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`personality-tests service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
