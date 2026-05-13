import { buildJournalApp } from "@clawjs/journal";

const { app, config } = buildJournalApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`journal service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`journal service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
