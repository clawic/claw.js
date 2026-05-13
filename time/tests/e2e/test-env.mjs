import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-time-ui-"));
const server = spawn(process.execPath, ["dist/server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    CLAW_TIME_HOST: "127.0.0.1",
    CLAW_TIME_PORT: "4730",
    CLAW_TIME_DATA_DIR: path.join(tmpDir, "data"),
    CLAW_TIME_DB_FILE: path.join(tmpDir, "data", "clawjs.sqlite"),
    CLAW_TIME_DEFAULT_TIMEZONE: "UTC",
    CLAW_TIME_SCHEDULER_INTERVAL_MS: "100",
  },
  stdio: "inherit",
});

function shutdown() {
  server.kill("SIGTERM");
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
server.on("exit", () => process.exit(0));
