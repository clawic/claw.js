import { buildRelayApp } from "./app.ts";
import { advertiseRelay, stopAdvertising } from "./discovery.ts";

export async function startRelayServer() {
  const built = await buildRelayApp();
  built.app.addHook("onClose", async () => {
    stopAdvertising();
  });
  await built.app.listen({
    host: built.config.host,
    port: built.config.port,
  });
  built.logger.info(`Relay listening on http://${built.config.host}:${built.config.port}`);
  advertiseRelay(built.config);
  return built;
}
