import { buildTravelApp } from "@clawjs/travel";

const { app, config } = buildTravelApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`travel service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`travel service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
