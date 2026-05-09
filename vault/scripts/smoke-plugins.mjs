// Smoke test for plugin registry + brokerhttp executor with mock fetch.

import { bootPluginRegistry } from "../src/plugins/loader.ts";
import { redactString } from "../src/plugins/redaction.ts";
import { LockableSecret } from "../src/server/lockable-secret.ts";

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

// Test broker.http executor with a mock fetch server.
const originalFetch = globalThis.fetch;
let captured;
globalThis.fetch = async (url, init) => {
  captured = { url, method: init?.method, headers: init?.headers, body: init?.body };
  return new Response('{"echo": "Bearer ghp_secret_token_xxx"}', {
    status: 200,
    headers: { "X-Echo": "ghp_secret_token_xxx" },
  });
};

try {
  const broker = registry.getExecutor("broker.http");
  const fakeSecret = {
    id: "secret-1",
    tenant_id: "clawix-local",
    vault_id: null,
    type_id: "github.pat",
    internal_name: "github_main",
    title: "x",
    wrapped_item_key: Buffer.alloc(0),
    current_version_id: null,
    allowed_hosts_json: "[]", allowed_headers_json: "[]",
    allow_in_url: 0, allow_in_body: 0, allow_in_env: 0,
    allow_insecure_transport: 0, allow_local_network: 0,
    allowed_agents_json: null, approval_mode: "auto", approval_window_minutes: null,
    ttl_expires_at: null, max_uses: null, rotation_reminder_days: null,
    redaction_label: null, clipboard_clear_seconds: null, audit_retention_days: null,
    requires_vpn: 0, vpn_profile_name: null,
    is_archived: 0, is_compromised: 0, is_compromised_reason: null,
    is_locked: 0, read_only: 0, trashed_at: null,
    use_count: 0, last_used_at: null, last_rotated_at: null,
    tags_json: "[]", created_at: "", updated_at: "",
  };
  const itemKey = LockableSecret.allocate(32);
  const out = await broker.execute({
    secret: fakeSecret,
    resolvedFields: { token: "ghp_secret_token_xxx" },
    itemKey,
    args: {
      method: "GET",
      url: "https://api.example.com/echo",
      headers: { Authorization: "Bearer {{secret.token}}" },
    },
  });
  itemKey.zero();

  if (captured.url === "https://api.example.com/echo") ok("broker.http URL resolved correctly"); else ko("URL resolved");
  if (captured.headers.Authorization === "Bearer ghp_secret_token_xxx") ok("template substituted in header");
  else ko("template substitution", captured.headers.Authorization);
  if (out.ok && out.status === 200) ok("broker.http response ok"); else ko("response ok", out);

  // Apply redaction.
  const redacted = broker.redact(out, { token: "ghp_secret_token_xxx" });
  if (redacted.body.includes("[REDACTED]") && !redacted.body.includes("ghp_secret_token_xxx")) ok("body redacted");
  else ko("body redaction", redacted.body);
  if (redacted.headers["x-echo"] === "[REDACTED]") ok("header redacted"); else ko("header redaction", redacted.headers);
} finally {
  globalThis.fetch = originalFetch;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
