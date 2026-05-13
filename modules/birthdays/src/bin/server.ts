import { buildBirthdaysApp } from "@clawjs/birthdays";

const { app, config } = buildBirthdaysApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`birthdays service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`birthdays service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
