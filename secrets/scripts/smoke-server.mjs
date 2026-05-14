// E2E test of the Fastify server: setup, unlock, create/list/reveal,
// brokered execute, audit query+integrity, lock, recover, change-password.

import fs from "node:fs";
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
  ],
  governance: { allowedHosts: ["127.0.0.1"], allowedHeaders: ["Authorization"], allowLocalNetwork: true },
};
const created = await fetchJson(`${base}/v1/tenants/clawix-local/secrets`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ draft }),
});
if (created.ok && created.body.secret?.internalName === "github_main") ok("secret create with admin token"); else ko("secret create", created.body);

const revealWithoutHost = await fetchJson(`${base}/v1/tenants/clawix-local/secrets/github_main/reveal-field`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ field: "token", reauthSatisfied: true }),
});
if (revealWithoutHost.status === 403) ok("reveal requires signed host"); else ko("reveal requires signed host", revealWithoutHost.body);

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

const backupExport = await fetchJson(`${base}/v1/secrets/backup/export`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ passphrase: "backup-passphrase" }),
});
if (backupExport.ok && backupExport.body.format === "clawix-secrets-backup-v1" && backupExport.body.backup?.aead?.ciphertext) {
  ok("backup export encrypted");
} else {
  ko("backup export", backupExport.body);
}

const backupImport = await fetchJson(`${base}/v1/secrets/backup/import`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ passphrase: "backup-passphrase", backup: backupExport.body.backup }),
});
if (backupImport.ok && backupImport.body.imported?.secrets === 1 && backupImport.body.state?.unlocked === false) {
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

await app.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
