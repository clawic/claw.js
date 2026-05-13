import { buildVolunteeringApp } from "@clawjs/volunteering";

const { app, config } = buildVolunteeringApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`volunteering service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`volunteering service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
