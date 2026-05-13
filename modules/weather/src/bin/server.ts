import { buildWeatherApp } from "@clawjs/weather";

const { app, config } = buildWeatherApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`weather service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`weather service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
