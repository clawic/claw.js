import { buildTelegramApp } from "./app.ts";

export async function startTelegramServer() {
  const built = await buildTelegramApp();
  await built.app.listen({ host: built.config.host, port: built.config.port });
  built.app.log.info(`telegram listening on http://${built.config.host}:${built.config.port}`);
  return built;
}
