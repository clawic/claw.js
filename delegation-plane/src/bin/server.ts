import { buildDelegationPlaneApp } from "../server/app.ts";

const built = await buildDelegationPlaneApp();
if (built.config.startScheduler) built.startScheduler();
const url = await built.app.listen({ host: built.config.host, port: built.config.port });
process.stdout.write(`delegation-plane listening on ${url}\n`);
