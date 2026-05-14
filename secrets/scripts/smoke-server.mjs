// E2E test of the Fastify server: setup, unlock, create/list/reveal,
// brokered execute, audit query+integrity, lock, recover, change-password.

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-server-"));
process.env.CLAW_SECRETS_DATA_DIR = tmpDir;
process.env.CLAW_SECRETS_DB_PATH = path.join(tmpDir, "vault.sqlite");
process.env.CLAW_SECRETS_PORT = "0"; // ephemeral
process.env.CLAW_SECRETS_HOST = "127.0.0.1";
process.env.CLAW_SECRETS_ADMIN_TOKEN = "smoke-admin-token";
process.env.CLAW_SECRETS_SIGNED_HOST_TOKEN = "smoke-signed-host-token";

const { startSecretsServer } = await import("../src/server/app.ts");

const { app, config } = await startSecretsServer({});
const addr = app.server.address();
const port = typeof addr === "object" && addr ? addr.port : config.port;
const base = `http://127.0.0.1:${port}`;
const authHeaders = { Authorization: "Bearer smoke-admin-token" };
const signedHostHeaders = { "x-claw-signed-host-token": "smoke-signed-host-token" };

let pass = 0; let fail = 0;
function ok(name) { console.log(`  ✓ ${name}`); pass++; }
function ko(name, e) { console.error(`  ✗ ${name}: ${typeof e === "string" ? e : JSON.stringify(e)}`); fail++; }

async function fetchJson(url, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { ...init, headers });
  let body;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, ok: res.ok, body };
}

// Health.
const h = await fetchJson(`${base}/v1/health`);
if (h.ok && h.body.service === "clawjs-secrets") ok("health"); else ko("health", h.body);

// Secrets state pre-setup.
const s0 = await fetchJson(`${base}/v1/secrets/state`);
if (s0.ok && !s0.body.initialized && !s0.body.unlocked) ok("secrets state: uninitialized"); else ko("state", s0.body);

const setupWithoutHost = await fetchJson(`${base}/v1/secrets/setup`, {
  method: "POST",
  body: JSON.stringify({ password: "master-pw" }),
});
if (setupWithoutHost.status === 403) ok("setup requires signed host"); else ko("setup requires signed host", setupWithoutHost.body);

// Secrets setup.
const setup = await fetchJson(`${base}/v1/secrets/setup`, {
  method: "POST",
  headers: signedHostHeaders,
  body: JSON.stringify({ password: "master-pw" }),
});
if (setup.ok && setup.body.recoveryPhrase && setup.body.recoveryPhrase.split(" ").length === 24) ok("setup");
else ko("setup", setup.body);
const recoveryPhrase = setup.body.recoveryPhrase;

// State after setup.
const s1 = await fetchJson(`${base}/v1/secrets/state`);
if (s1.body.initialized && s1.body.unlocked) ok("setup leaves secrets unlocked"); else ko("post-setup", s1.body);

// Secret types catalog.
const types = await fetchJson(`${base}/v1/secret-types`);
if (types.body.types?.length >= 20) ok(`catalog has ${types.body.types.length} types`); else ko("catalog");

// Create secrets container.
const cont = await fetchJson(`${base}/v1/tenants/clawix-local/folders`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ name: "Personal", icon: "key", color: "#FF0000" }),
});
if (cont.ok && cont.body.folder?.name === "Personal") ok("folder create with admin token"); else ko("folder create", cont.body);

const draft = {
  folderId: cont.body.folder.id,
  typeId: "github.pat",
  internalName: "github_main",
  title: "GitHub Main",
  fields: [
    { fieldName: "token", fieldKind: "password", placement: "header", isSecret: true, isConcealed: true, secretValue: "ghp_smoke_secret" },
    { fieldName: "username", fieldKind: "text", placement: "none", isSecret: false, publicValue: "octo" },
  ],
  governance: { allowedHosts: ["127.0.0.1"], allowedHeaders: ["Authorization"], allowLocalNetwork: true },
};
const created = await fetchJson(`${base}/v1/tenants/clawix-local/secrets`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ draft }),
});
if (created.ok && created.body.secret?.internalName === "github_main") ok("secret create with admin token"); else ko("secret create", created.body);

const describedNoPublic = await fetchJson(`${base}/v1/tenants/clawix-local/secrets/github_main`, {
  headers: authHeaders,
});
if (describedNoPublic.ok && describedNoPublic.body.secret?.fields?.find((f) => f.fieldName === "username")?.publicValue === null) ok("metadata omits public values by default");
else ko("metadata omits public values by default", describedNoPublic.body);

const localProcessList = await fetchJson(`${base}/v1/tenants/clawix-local/secrets`);
if (localProcessList.status === 401) ok("local process without bearer cannot list secrets"); else ko("local process without bearer cannot list secrets", localProcessList.body);

const describedPublicWithoutHost = await fetchJson(`${base}/v1/tenants/clawix-local/secrets/github_main?includePublicValues=true`, {
  headers: authHeaders,
});
if (describedPublicWithoutHost.status === 403) ok("public values require signed host"); else ko("public values require signed host", describedPublicWithoutHost.body);

const describedWithPublic = await fetchJson(`${base}/v1/tenants/clawix-local/secrets/github_main?includePublicValues=true`, {
  headers: { ...authHeaders, ...signedHostHeaders },
});
if (describedWithPublic.ok && describedWithPublic.body.secret?.fields?.find((f) => f.fieldName === "username")?.publicValue === "octo") ok("signed host can request public values");
else ko("signed host can request public values", describedWithPublic.body);

const revealWithoutHost = await fetchJson(`${base}/v1/tenants/clawix-local/secrets/github_main/reveal-field`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ field: "token", reauthSatisfied: true }),
});
if (revealWithoutHost.status === 403) ok("reveal requires signed host"); else ko("reveal requires signed host", revealWithoutHost.body);

const localProcessReveal = await fetchJson(`${base}/v1/tenants/clawix-local/secrets/github_main/reveal-field`, {
  method: "POST",
  body: JSON.stringify({ field: "token", reauthSatisfied: true }),
});
if (localProcessReveal.status === 403) ok("local process without host token cannot reveal"); else ko("local process without host token cannot reveal", localProcessReveal.body);

const signedHostWithoutBearerReveal = await fetchJson(`${base}/v1/tenants/clawix-local/secrets/github_main/reveal-field`, {
  method: "POST",
  headers: signedHostHeaders,
  body: JSON.stringify({ field: "token", reauthSatisfied: true }),
});
if (signedHostWithoutBearerReveal.status === 401) ok("signed host token alone cannot reveal"); else ko("signed host token alone cannot reveal", signedHostWithoutBearerReveal.body);

const revealWithoutReauth = await fetchJson(`${base}/v1/tenants/clawix-local/secrets/github_main/reveal-field`, {
  method: "POST",
  headers: { ...authHeaders, ...signedHostHeaders },
  body: JSON.stringify({ field: "token" }),
});
if (revealWithoutReauth.status === 403) ok("reveal requires fresh reauth"); else ko("reveal requires fresh reauth", revealWithoutReauth.body);

const revealWithReauth = await fetchJson(`${base}/v1/tenants/clawix-local/secrets/github_main/reveal-field`, {
  method: "POST",
  headers: { ...authHeaders, ...signedHostHeaders },
  body: JSON.stringify({ field: "token", reauthSatisfied: true }),
});
if (revealWithReauth.ok && revealWithReauth.body.value?.value === "ghp_smoke_secret") ok("reveal allows signed host with reauth"); else ko("reveal allows signed host with reauth", revealWithReauth.body);

let redirectFollowed = false;
const targetServer = http.createServer((req, res) => {
  if (req.url === "/redirect") {
    res.writeHead(302, { Location: "/echo" });
    res.end();
    return;
  }
  if (req.url === "/echo") {
    redirectFollowed = true;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ authorization: req.headers.authorization ?? null }));
    return;
  }
  res.writeHead(404).end();
});
await new Promise((resolve) => targetServer.listen(0, "127.0.0.1", resolve));
const targetPort = targetServer.address().port;

async function brokerHttp(secretName, targetPath = "/echo") {
  return fetchJson(`${base}/v1/tenants/clawix-local/broker/http`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      method: "GET",
      url: `http://127.0.0.1:${targetPort}${targetPath}`,
      headers: { Authorization: `Bearer {{${secretName}.token}}` },
      agent: "smoke-agent",
      capability: "broker.http",
      riskTier: "read",
      declaredFields: [{ secretName, fieldName: "token", placement: "header" }],
    }),
  });
}

const brokerInsecureBlocked = await brokerHttp("github_main");
if (brokerInsecureBlocked.status === 400 && brokerInsecureBlocked.body.reasons?.includes("insecure_transport_blocked")) {
  ok("broker blocks insecure transport by default");
} else {
  ko("broker blocks insecure transport by default", brokerInsecureBlocked.body);
}

const localBlocked = await fetchJson(`${base}/v1/tenants/clawix-local/secrets`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({
    draft: {
      typeId: "github.pat",
      internalName: "local_blocked",
      title: "Local Blocked",
      fields: [{ fieldName: "token", fieldKind: "password", placement: "header", isSecret: true, secretValue: "local_blocked_secret" }],
      governance: { allowedHosts: [`127.0.0.1:${targetPort}`], allowedHeaders: ["Authorization"], allowInsecureTransport: true },
    },
  }),
});
if (!localBlocked.ok) ko("local blocked secret create", localBlocked.body);
const brokerLocalBlocked = await brokerHttp("local_blocked");
if (brokerLocalBlocked.status === 400 && brokerLocalBlocked.body.reasons?.includes("local_network_blocked")) {
  ok("broker blocks local network by default");
} else {
  ko("broker blocks local network by default", brokerLocalBlocked.body);
}

const brokerAllowed = await fetchJson(`${base}/v1/tenants/clawix-local/secrets`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({
    draft: {
      typeId: "github.pat",
      internalName: "broker_allowed",
      title: "Broker Allowed",
      fields: [{ fieldName: "token", fieldKind: "password", placement: "header", isSecret: true, secretValue: "broker_allowed_secret" }],
      governance: { allowedHosts: [`127.0.0.1:${targetPort}`], allowedHeaders: ["Authorization"], allowInsecureTransport: true, allowLocalNetwork: true },
    },
  }),
});
if (!brokerAllowed.ok) ko("broker allowed secret create", brokerAllowed.body);
const brokerOk = await brokerHttp("broker_allowed");
if (brokerOk.ok && brokerOk.body.status === 200 && brokerOk.body.bodyText.includes("[REDACTED]") && !brokerOk.body.bodyText.includes("broker_allowed_secret")) {
  ok("broker executes and redacts response");
} else {
  ko("broker executes and redacts response", brokerOk.body);
}

redirectFollowed = false;
const brokerRedirect = await brokerHttp("broker_allowed", "/redirect");
if (brokerRedirect.ok && brokerRedirect.body.status === 302 && redirectFollowed === false) {
  ok("broker does not follow redirects with secrets");
} else {
  ko("broker does not follow redirects with secrets", { body: brokerRedirect.body, redirectFollowed });
}
await new Promise((resolve) => targetServer.close(resolve));

const backupExportWithoutHost = await fetchJson(`${base}/v1/secrets/backup/export`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ passphrase: "backup-passphrase" }),
});
if (backupExportWithoutHost.status === 403) ok("backup export requires signed host"); else ko("backup export requires signed host", backupExportWithoutHost.body);

const backupExportWithoutBearer = await fetchJson(`${base}/v1/secrets/backup/export`, {
  method: "POST",
  headers: signedHostHeaders,
  body: JSON.stringify({ passphrase: "backup-passphrase", reauthSatisfied: true }),
});
if (backupExportWithoutBearer.status === 401) ok("signed host token alone cannot export backup"); else ko("signed host token alone cannot export backup", backupExportWithoutBearer.body);

const backupExportWithoutReauth = await fetchJson(`${base}/v1/secrets/backup/export`, {
  method: "POST",
  headers: { ...authHeaders, ...signedHostHeaders },
  body: JSON.stringify({ passphrase: "backup-passphrase" }),
});
if (backupExportWithoutReauth.status === 403) ok("backup export requires fresh reauth"); else ko("backup export requires fresh reauth", backupExportWithoutReauth.body);

const backupExport = await fetchJson(`${base}/v1/secrets/backup/export`, {
  method: "POST",
  headers: { ...authHeaders, ...signedHostHeaders },
  body: JSON.stringify({ passphrase: "backup-passphrase", reauthSatisfied: true }),
});
if (backupExport.ok && backupExport.body.format === "clawix-secrets-backup-v1" && backupExport.body.backup?.aead?.ciphertext) {
  ok("backup export encrypted");
} else {
  ko("backup export", backupExport.body);
}

const backupImportWithoutReauth = await fetchJson(`${base}/v1/secrets/backup/import`, {
  method: "POST",
  headers: { ...authHeaders, ...signedHostHeaders },
  body: JSON.stringify({ passphrase: "backup-passphrase", backup: backupExport.body.backup }),
});
if (backupImportWithoutReauth.status === 403) ok("backup import requires fresh reauth"); else ko("backup import requires fresh reauth", backupImportWithoutReauth.body);

const backupImport = await fetchJson(`${base}/v1/secrets/backup/import`, {
  method: "POST",
  headers: { ...authHeaders, ...signedHostHeaders },
  body: JSON.stringify({ passphrase: "backup-passphrase", backup: backupExport.body.backup, reauthSatisfied: true }),
});
if (backupImport.ok && backupImport.body.imported?.secrets === 3 && backupImport.body.state?.unlocked === false) {
  ok("backup import restores and locks");
} else {
  ko("backup import", backupImport.body);
}

const unlockAfterImport = await fetchJson(`${base}/v1/secrets/unlock`, { method: "POST", headers: signedHostHeaders, body: JSON.stringify({ password: "master-pw" }) });
if (unlockAfterImport.ok) ok("unlock after backup import"); else ko("unlock after import", unlockAfterImport.body);

// Lock.
const lockRes = await fetchJson(`${base}/v1/secrets/lock`, { method: "POST" });
if (lockRes.ok) ok("lock"); else ko("lock", { status: lockRes.status, body: lockRes.body });

// Re-unlock with wrong password.
const u1 = await fetchJson(`${base}/v1/secrets/unlock`, { method: "POST", headers: signedHostHeaders, body: JSON.stringify({ password: "wrong" }) });
if (u1.status === 401) ok("unlock rejects wrong password"); else ko("expected 401");

// Re-unlock with correct password.
const u2 = await fetchJson(`${base}/v1/secrets/unlock`, { method: "POST", headers: signedHostHeaders, body: JSON.stringify({ password: "master-pw" }) });
if (u2.ok) ok("unlock with correct password"); else ko("unlock");

// Recover via phrase.
const lock2 = await fetchJson(`${base}/v1/secrets/lock`, { method: "POST" });
if (lock2.ok) ok("lock #2");
const rec = await fetchJson(`${base}/v1/secrets/recover`, { method: "POST", headers: signedHostHeaders, body: JSON.stringify({ phrase: recoveryPhrase }) });
if (rec.ok) ok("recover via phrase"); else ko("recover", rec.body);

// Change password.
const cp = await fetchJson(`${base}/v1/secrets/change-password`, {
  method: "POST",
  headers: signedHostHeaders,
  body: JSON.stringify({ oldPassword: "master-pw", newPassword: "new-pw" }),
});
if (cp.ok && cp.body.recoveryPhrase) ok("change password"); else ko("change-password", cp.body);

// Doctor.
const doc = await fetchJson(`${base}/v1/secrets/doctor`);
if (doc.body.session?.unlocked) ok("doctor reports unlocked");
if (doc.body.capabilities?.crypto?.status === "ready") ok("doctor: crypto ready"); else ko("doctor crypto");
if (doc.body.capabilities?.audit?.status === "ready") ok("doctor: audit ready"); else ko("doctor audit", doc.body.capabilities?.audit);

// Plugin info.
const plugins = await fetchJson(`${base}/v1/plugins`);
if (plugins.body.types >= 20 && plugins.body.executors >= 8) ok("plugins endpoint reports counts");
else ko("plugins endpoint", plugins.body);

const externalPluginsDir = path.join(tmpDir, "external-plugins");
fs.mkdirSync(externalPluginsDir, { recursive: true });
fs.writeFileSync(
  path.join(externalPluginsDir, "unsafe-plugin.js"),
  "globalThis.__clawSecretsExternalPluginLoaded = true; export default { id: 'unsafe.external', version: '0.0.0', types: [{ typeId: 'unsafe.external', label: 'Unsafe External', fields: [] }] };\n",
);
delete process.env.CLAW_SECRETS_ENABLE_UNSAFE_EXTERNAL_PLUGINS;
delete globalThis.__clawSecretsExternalPluginLoaded;
const { bootPluginRegistry } = await import("../src/plugins/loader.ts");
const safeRegistry = await bootPluginRegistry({ externalPluginsDir });
if (!globalThis.__clawSecretsExternalPluginLoaded && !safeRegistry.getType("unsafe.external")) {
  ok("external plugins disabled by default");
} else {
  ko("external plugins disabled by default", {
    loaded: Boolean(globalThis.__clawSecretsExternalPluginLoaded),
    registered: Boolean(safeRegistry.getType("unsafe.external")),
  });
}

await app.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
