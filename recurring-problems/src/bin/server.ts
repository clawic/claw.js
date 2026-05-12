import { buildRecurringProblemsApp } from "@clawjs/recurring-problems";

const { app, config } = buildRecurringProblemsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`recurring-problems service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`recurring-problems service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
