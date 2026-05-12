import { buildMistakesApp } from "@clawjs/mistakes";

const { app, config } = buildMistakesApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`mistakes service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`mistakes service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
