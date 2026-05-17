import { loadConfig } from "../config.ts";
import { createBridgeRuntime } from "../server.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const runtime = createBridgeRuntime({ config });
  await runtime.start();
  process.stdout.write(
    `clawix-bridge ready on http://${config.bindAddress}:${config.httpPort} (mesh) and ws://${config.bindAddress}:${config.bridgePort}/bridge (ws)\n`,
  );
  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`received ${signal}, shutting down\n`);
    await runtime.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((err) => {
  process.stderr.write(`clawix-bridge failed: ${String(err)}\n`);
  process.exit(1);
});
