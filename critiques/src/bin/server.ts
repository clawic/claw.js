import { buildCritiquesApp } from "@clawjs/critiques";

const { app, config } = buildCritiquesApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`critiques service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`critiques service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
