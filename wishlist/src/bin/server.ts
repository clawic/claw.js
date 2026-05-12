import { buildWishlistApp } from "@clawjs/wishlist";

const { app, config } = buildWishlistApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`wishlist service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`wishlist service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
