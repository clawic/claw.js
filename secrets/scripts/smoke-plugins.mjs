// Smoke test for plugin registry + brokerhttp executor with mock fetch.

import { bootPluginRegistry } from "../src/plugins/loader.ts";
import { redactString } from "../src/plugins/redaction.ts";

let pass = 0; let fail = 0;
function ok(name) { console.log(`  ✓ ${name}`); pass++; }
function ko(name, e) { console.error(`  ✗ ${name}: ${e?.message ?? e}`); fail++; }

const registry = await bootPluginRegistry();

const types = registry.listTypes();
if (types.length >= 20) ok(`registers ${types.length} types`); else ko("not enough types", types.length);

const executors = registry.listExecutors();
const expectedExecutors = ["broker.http", "git.push", "git.fetch", "git.clone", "npm.publish", "npm.whoami", "ssh.connect", "github.release_create", "openai.image_generate", "command.exec"];
const missing = expectedExecutors.filter((id) => !executors.find((e) => e.id === id));
if (missing.length === 0) ok(`all ${expectedExecutors.length} executors registered`);
else ko("missing executors", missing.join(","));

const sessions = registry.listSessions();
if (sessions.find((s) => s.id === "jwt.bearer.refresh") && sessions.find((s) => s.id === "oauth2.refresh")) ok("session strategies registered");
else ko("session strategies missing");

const permissions = registry.listPermissionModels();
if (permissions.length === 6) ok("6 permission models"); else ko("permission models", permissions.length);

const syncs = registry.listBrandSyncs();
if (syncs.find((b) => b.id === "appstoreconnect.appsync")) ok("brand syncs registered"); else ko("brand syncs");

const redacted = redactString("Bearer ghp_secret_token_xxx", ["ghp_secret_token_xxx"]);
if (redacted === "Bearer [REDACTED]") ok("redaction helper removes secret values");
else ko("redaction helper removes secret values", redacted);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
