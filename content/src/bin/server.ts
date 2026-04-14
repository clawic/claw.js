import { buildContentApp } from "../server/app.ts";

const { app, config } = buildContentApp();

app.listen({ host: config.host, port: config.port }).then((address) => {
  process.stdout.write(`${address}\n`);
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
