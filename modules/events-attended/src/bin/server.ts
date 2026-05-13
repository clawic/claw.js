import { buildEventsAttendedApp } from "@clawjs/events-attended";

const { app, config } = buildEventsAttendedApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`events-attended service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`events-attended service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
