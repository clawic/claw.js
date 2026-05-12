import { buildIdentityValuesApp } from "@clawjs/identity-values";

const { app, config } = buildIdentityValuesApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`identity-values service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`identity-values service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
