import { buildSexApp } from "@clawjs/sex";

const { app, config } = buildSexApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`sex service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`sex service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
