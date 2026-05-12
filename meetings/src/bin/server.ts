import { buildMeetingsApp } from "@clawjs/meetings";

const { app, config } = buildMeetingsApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`meetings service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`meetings service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
