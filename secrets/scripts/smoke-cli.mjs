// Smoke test for the @clawjs/cli secrets subcommands. Boots the secrets
// server, then drives a few commands via the CLI module directly.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-cli-"));
process.env.SECRETS_DATA_DIR = tmpDir;
process.env.SECRETS_DB_PATH = path.join(tmpDir, "vault.sqlite");
process.env.SECRETS_PORT = "0";

const { startSecretsServer } = await import("../src/server/app.ts");
const { app, config } = await startSecretsServer({});
const port = app.server.address()?.port ?? config.port;
process.env.CLAWJS_SECRETS_BASE = `http://127.0.0.1:${port}`;

let pass = 0; let fail = 0;
function ok(name) { console.log(`  ✓ ${name}`); pass++; }
function ko(name, e) { console.error(`  ✗ ${name}: ${typeof e === "string" ? e : JSON.stringify(e)}`); fail++; }

// Setup secrets directly via HTTP (the CLI prompts for password interactively,
// which is hard to drive in a smoke test).
const setupRes = await fetch(`${process.env.CLAWJS_SECRETS_BASE}/v1/secrets/setup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: "smoke-test-pw" }),
});
if (!setupRes.ok) { console.error("setup failed", await setupRes.text()); process.exit(1); }

// Now run CLI subcommands.
const { runSecretsCli } = await import("../../packages/clawjs/bin/secrets-commands.mjs");

// Capture stdout
const origLog = console.log;
let captured = "";
console.log = (...a) => { captured += a.join(" ") + "\n"; };

captured = "";
let code = await runSecretsCli(["secrets", "types"]);
console.log = origLog;
if (code === 0 && captured.includes("github.pat")) ok("secrets types lists builtins");
else ko("secrets types", { code, captured: captured.slice(0, 200) });

captured = "";
console.log = (...a) => { captured += a.join(" ") + "\n"; };
code = await runSecretsCli(["secrets", "doctor"]);
console.log = origLog;
if (code === 0 && captured.includes("crypto") && captured.includes("ready")) ok("secrets doctor reports ready");
else ko("secrets doctor", { code, captured: captured.slice(0, 300) });

captured = "";
console.log = (...a) => { captured += a.join(" ") + "\n"; };
code = await runSecretsCli(["secrets", "plugins"]);
console.log = origLog;
if (code === 0 && captured.includes("types") && captured.includes("executors")) ok("secrets plugins counts");
else ko("secrets plugins", { code });

captured = "";
console.log = (...a) => { captured += a.join(" ") + "\n"; };
code = await runSecretsCli(["secrets", "state"]);
console.log = origLog;
if (code === 0 && captured.includes("unlocked")) ok("secrets state");
else ko("secrets state");

await app.close();
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
