import { buildBeautyApp } from "@clawjs/beauty";

const { app, config } = buildBeautyApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`beauty service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`beauty service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
