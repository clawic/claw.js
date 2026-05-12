import { buildPetsApp } from "@clawjs/pets";

const { app, config } = buildPetsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`pets service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`pets service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
