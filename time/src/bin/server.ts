import { buildTimeApp } from "../server/app.ts";

const built = buildTimeApp();
built.startScheduler();

built.app.listen({
  host: built.config.host,
  port: built.config.port,
}).then((address) => {
  process.stdout.write(`[time] listening on ${address}\n`);
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
