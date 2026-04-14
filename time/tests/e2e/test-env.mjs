import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-time-ui-"));
const server = spawn(process.execPath, ["dist/server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    CLAWJS_TIME_HOST: "127.0.0.1",
    CLAWJS_TIME_PORT: "4730",
    CLAWJS_TIME_DATA_DIR: path.join(tmpDir, "data"),
    CLAWJS_TIME_DB_FILE: path.join(tmpDir, "data", "time.sqlite"),
    CLAWJS_TIME_DEFAULT_TIMEZONE: "UTC",
    CLAWJS_TIME_SCHEDULER_INTERVAL_MS: "100",
  },
  stdio: "inherit",
});

function shutdown() {
  server.kill("SIGTERM");
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
server.on("exit", () => process.exit(0));
