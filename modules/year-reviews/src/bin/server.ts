import { buildYearReviewsApp } from "@clawjs/year-reviews";

const { app, config } = buildYearReviewsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`year-reviews service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`year-reviews service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
