import { buildBookmarksApp } from "@clawjs/bookmarks";

const { app, config } = buildBookmarksApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`bookmarks service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`bookmarks service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
