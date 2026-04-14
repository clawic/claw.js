import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildNotifyApp } from "../../src/server/app.ts";

export async function startNotifyServer(prefix = "notify-e2e") {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  const { app } = buildNotifyApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(rootDir, ".data"),
      dbPath: path.join(rootDir, ".data", "notify.sqlite"),
      jwtSecret: "notify-test-secret",
    },
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 4610;
  return {
    rootDir,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await app.close();
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}
