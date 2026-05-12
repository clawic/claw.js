import { buildVehicleApp } from "@clawjs/vehicle";

const { app, config } = buildVehicleApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`vehicle service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`vehicle service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
