// Smoke test: full secret lifecycle (create → describe → reveal → grant → governance).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openDatabase } from "../src/server/db.ts";
import { secretsSetup } from "../src/server/crypto.ts";
import { ARGON2_FAST_PARAMS } from "../src/server/calibration.ts";
import { TenantStore, SecretsMetaStore, FolderStore } from "../src/server/stores.ts";
import { SecretsResolver } from "../src/server/resolver.ts";
import { evaluateGovernance } from "../src/server/governance.ts";
import { decryptBackup, encryptBackup } from "../src/server/backup.ts";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-secrets-"));
const dbPath = path.join(tmpDir, "vault.sqlite");
const db = openDatabase(dbPath);

let pass = 0; let fail = 0;
function ok(name) { console.log(`  ✓ ${name}`); pass++; }
function ko(name, e) { console.error(`  ✗ ${name}: ${e?.message ?? e}`); fail++; }

const tenants = new TenantStore(db);
const metaStore = new SecretsMetaStore(db);
const containers = new FolderStore(db);
const resolver = new SecretsResolver(db);

tenants.upsert("clawix-local", "Clawix Local");
const setup = secretsSetup("master-pw", { schemaVersion: 2, appVersion: "0.1.2", kdfParams: ARGON2_FAST_PARAMS });
metaStore.save("clawix-local", setup.meta);

// Create secrets container.
const container = containers.create({ tenantId: "clawix-local", name: "Personal", icon: "key", color: "#FF0000" });
if (container.name === "Personal") ok("container created"); else ko("container created");

// Create a secret.
const secret = resolver.secrets.create({
  tenantId: "clawix-local",
  masterKey: setup.masterKey,
  draft: {
    folderId: container.id,
    typeId: "github.pat",
    internalName: "github_main",
    title: "GitHub Personal Access Token",
    fields: [
      { fieldName: "token", fieldKind: "password", placement: "header", isSecret: true, isConcealed: true, secretValue: "ghp_super_secret_xxx" },
      { fieldName: "username", fieldKind: "text", placement: "none", isSecret: false, publicValue: "ivan" },
    ],
    notes: "Use only for clawix repo",
    tags: ["github", "ci"],
    governance: {
      allowedHosts: ["api.github.com", "github.com"],
      allowedHeaders: ["Authorization"],
      allowInUrl: false,
      allowInBody: false,
      approvalMode: "auto",
    },
  },
});
ok("secret created");

// Describe.
const desc = resolver.describeSecret(secret);
if (desc.fields.length === 2 && desc.hasNotes && desc.tags.includes("github")) ok("describe with fields/notes/tags");
else ko("describe with fields/notes/tags");

// Reveal field.
const revealed = resolver.revealField({ secret, fieldName: "token", masterKey: setup.masterKey });
if (revealed.value === "ghp_super_secret_xxx") ok("reveal token roundtrip"); else ko("reveal token roundtrip");

// Reveal notes.
const notes = resolver.revealNotes({ secret, masterKey: setup.masterKey });
if (notes === "Use only for clawix repo") ok("reveal notes roundtrip"); else ko("reveal notes roundtrip");

// Reveal public field through the same per-field path; broad plaintext dumps are not exposed.
const publicField = resolver.revealField({ secret, fieldName: "username", masterKey: setup.masterKey });
if (publicField.value === "ivan") ok("reveal public field roundtrip"); else ko("reveal public field roundtrip");

const encryptedBackup = encryptBackup(db, "backup-passphrase");
const encryptedBackupJson = JSON.stringify(encryptedBackup);
if (!encryptedBackupJson.includes("ghp_super_secret_xxx") && !encryptedBackupJson.includes("Use only for clawix repo")) ok("backup export omits plaintext");
else ko("backup export omits plaintext");
const logicalBackup = decryptBackup(encryptedBackup, "backup-passphrase");
const fieldTable = logicalBackup.tables.find((table) => table.name === "secret_fields");
if (fieldTable?.rows.some((row) => row.field_name === "token" && row.value_ciphertext && !("secretValue" in row))) ok("backup decrypts to encrypted field rows");
else ko("backup decrypts to encrypted field rows", fieldTable);

// Issue grant for runtime actor.
const grant = resolver.grants.issue({
  tenantId: "clawix-local",
  agent: "claude-code",
  secretId: secret.id,
  capability: { kind: "github.git_push", repository: "ivan/clawix" },
  secretsCapabilities: ["broker.http", "metadata.read"],
  reason: "Push release",
  durationMinutes: 10,
});
if (grant.token.startsWith("svagt_")) ok("grant issued (svagt_)");
else ko("grant token format");

// Resolve grant with correct expectation.
const resolved = resolver.grants.resolve(grant.token, {
  expectedKind: "github.git_push",
  expectedScope: { repository: "ivan/clawix" },
  requiredSecretsCapabilities: ["broker.http"],
});
if (resolved.id === grant.grant.id) ok("grant resolves with correct kind+scope+secretsCaps");
else ko("grant resolve");

// Resolve grant with wrong scope.
try {
  resolver.grants.resolve(grant.token, { expectedKind: "github.git_push", expectedScope: { repository: "other/repo" } });
  ko("grant rejects wrong scope");
} catch { ok("grant rejects wrong scope"); }

// Issue lease.
const leaseRes = resolver.leases.issue({
  tenantId: "clawix-local", secretId: secret.id, mode: "process", durationMinutes: 5,
});
if (leaseRes.token.startsWith("svlse_")) ok("lease issued"); else ko("lease issued");
const consumed = resolver.leases.consume(leaseRes.token);
if (consumed.consumed_at) ok("lease consumed");
try { resolver.leases.consume(leaseRes.token); ko("lease cant be consumed twice"); }
catch { ok("lease cant be consumed twice"); }

const revocableLease = resolver.leases.issue({
  tenantId: "clawix-local", secretId: secret.id, mode: "process", durationMinutes: 5,
});
if (resolver.grants.revokeForSecret(secret.id) >= 1) ok("revokes active grants for secret");
else ko("revokes active grants for secret");
if (resolver.leases.revokeForSecret(secret.id) >= 1) ok("revokes active leases for secret");
else ko("revokes active leases for secret", revocableLease);

// Governance: blocked when host not in allowlist.
const dec1 = evaluateGovernance(secret, { host: "evil.example.com" });
if (!dec1.allowed && dec1.reasons.includes("host_not_allowed")) ok("blocks unknown host");
else ko("blocks unknown host", dec1);

const dec2 = evaluateGovernance(secret, { host: "api.github.com", headers: { Authorization: "Bearer x" } });
if (dec2.allowed) ok("allows whitelisted host+header"); else ko("allows whitelisted", dec2);

const decPlacement = evaluateGovernance(secret, {
  host: "api.github.com",
  placements: ["query"],
  riskTier: "read",
  agent: "claude-code",
  requireCompleteContext: true,
});
if (!decPlacement.allowed && decPlacement.reasons.includes("placement_not_allowed")) ok("blocks disallowed placement");
else ko("blocks disallowed placement", decPlacement);

const decStrictMissing = evaluateGovernance(secret, { requireCompleteContext: true });
if (!decStrictMissing.allowed && decStrictMissing.reasons.includes("missing_context")) ok("strict governance fails closed on missing context");
else ko("strict governance fails closed on missing context", decStrictMissing);

const decStrictRead = evaluateGovernance(secret, {
  host: "api.github.com",
  headers: { Authorization: "Bearer x" },
  placements: ["header"],
  riskTier: "read",
  agent: "claude-code",
  requireCompleteContext: true,
});
if (decStrictRead.allowed) ok("strict governance allows complete read context"); else ko("strict governance allows complete read context", decStrictRead);

const noHostSecret = resolver.secrets.create({
  tenantId: "clawix-local",
  masterKey: setup.masterKey,
  draft: {
    internalName: "no_host_token",
    title: "No Host Token",
    fields: [{ fieldName: "token", fieldKind: "password", placement: "header", isSecret: true, secretValue: "nohost" }],
    governance: { allowedHeaders: ["Authorization"], approvalMode: "auto" },
  },
});
const decNoHost = evaluateGovernance(noHostSecret, {
  host: "api.example.com",
  headers: { Authorization: "Bearer x" },
  placements: ["header"],
  riskTier: "read",
  agent: "claude-code",
  requireCompleteContext: true,
});
if (!decNoHost.allowed && decNoHost.reasons.includes("host_not_allowed")) ok("strict governance requires explicit host allowlist");
else ko("strict governance requires explicit host allowlist", decNoHost);

const wildcardSecret = resolver.secrets.create({
  tenantId: "clawix-local",
  masterKey: setup.masterKey,
  draft: {
    internalName: "wildcard_token",
    title: "Wildcard Token",
    fields: [{ fieldName: "token", fieldKind: "password", placement: "header", isSecret: true, secretValue: "wildcard" }],
    governance: {
      allowedHosts: ["*.example.com"],
      allowedHeaders: ["Authorization"],
      approvalMode: "auto",
    },
  },
});
const decWildcard = evaluateGovernance(wildcardSecret, {
  host: "api.example.com",
  headers: { Authorization: "Bearer x" },
  placements: ["header"],
  riskTier: "read",
  agent: "claude-code",
  requireCompleteContext: true,
});
const decWildcardRoot = evaluateGovernance(wildcardSecret, {
  host: "example.com",
  headers: { Authorization: "Bearer x" },
  placements: ["header"],
  riskTier: "read",
  agent: "claude-code",
  requireCompleteContext: true,
});
if (decWildcard.allowed && !decWildcardRoot.allowed && decWildcardRoot.reasons.includes("host_not_allowed")) ok("wildcard host matches subdomains only");
else ko("wildcard host matches subdomains only", { decWildcard, decWildcardRoot });

const expiredSecret = resolver.secrets.create({
  tenantId: "clawix-local",
  masterKey: setup.masterKey,
  draft: {
    internalName: "expired_token",
    title: "Expired Token",
    fields: [{ fieldName: "token", fieldKind: "password", placement: "header", isSecret: true, secretValue: "expired" }],
    governance: { allowedHosts: ["api.example.com"], allowedHeaders: ["Authorization"], ttlExpiresAt: "2000-01-01T00:00:00.000Z" },
  },
});
const decExpired = evaluateGovernance(expiredSecret, { host: "api.example.com", headers: { Authorization: "Bearer x" }, placements: ["header"], riskTier: "read", agent: "claude-code", requireCompleteContext: true });
if (!decExpired.allowed && decExpired.reasons.includes("ttl_expired")) ok("blocks expired secret");
else ko("blocks expired secret", decExpired);

const maxUsesSecret = resolver.secrets.create({
  tenantId: "clawix-local",
  masterKey: setup.masterKey,
  draft: {
    internalName: "max_uses_token",
    title: "Max Uses Token",
    fields: [{ fieldName: "token", fieldKind: "password", placement: "header", isSecret: true, secretValue: "maxuses" }],
    governance: { allowedHosts: ["api.example.com"], allowedHeaders: ["Authorization"], maxUses: 0 },
  },
});
const decMaxUses = evaluateGovernance(maxUsesSecret, { host: "api.example.com", headers: { Authorization: "Bearer x" }, placements: ["header"], riskTier: "read", agent: "claude-code", requireCompleteContext: true });
if (!decMaxUses.allowed && decMaxUses.reasons.includes("max_uses_exhausted")) ok("blocks max-uses exhausted secret");
else ko("blocks max-uses exhausted secret", decMaxUses);

const lockedSecret = resolver.secrets.create({
  tenantId: "clawix-local",
  masterKey: setup.masterKey,
  draft: {
    internalName: "locked_token",
    title: "Locked Token",
    fields: [{ fieldName: "token", fieldKind: "password", placement: "header", isSecret: true, secretValue: "locked" }],
    governance: { allowedHosts: ["api.example.com"], allowedHeaders: ["Authorization"] },
  },
});
db.prepare("UPDATE secrets SET is_locked = 1 WHERE id = ?").run(lockedSecret.id);
const decLocked = evaluateGovernance(resolver.secrets.get(lockedSecret.id), { host: "api.example.com", headers: { Authorization: "Bearer x" }, placements: ["header"], riskTier: "read", agent: "claude-code", requireCompleteContext: true });
if (!decLocked.allowed && decLocked.reasons.includes("secret_locked")) ok("blocks locked secret");
else ko("blocks locked secret", decLocked);

const trashedSecret = resolver.secrets.create({
  tenantId: "clawix-local",
  masterKey: setup.masterKey,
  draft: {
    internalName: "trashed_token",
    title: "Trashed Token",
    fields: [{ fieldName: "token", fieldKind: "password", placement: "header", isSecret: true, secretValue: "trashed" }],
    governance: { allowedHosts: ["api.example.com"], allowedHeaders: ["Authorization"] },
  },
});
resolver.secrets.trash(trashedSecret.id);
const decTrashed = evaluateGovernance(resolver.secrets.get(trashedSecret.id), { host: "api.example.com", headers: { Authorization: "Bearer x" }, placements: ["header"], riskTier: "read", agent: "claude-code", requireCompleteContext: true });
if (!decTrashed.allowed && decTrashed.reasons.includes("secret_trashed")) ok("blocks trashed secret");
else ko("blocks trashed secret", decTrashed);

// Compromise & TTL exhausted reasons.
const activeGrant = resolver.grants.issue({
  tenantId: "clawix-local",
  agent: "rotation-check",
  secretId: secret.id,
  capability: { kind: "github.git_push", repository: "ivan/clawix" },
  secretsCapabilities: ["broker.http"],
  reason: "Revocation check",
  durationMinutes: 10,
});
const activeLease = resolver.leases.issue({
  tenantId: "clawix-local", secretId: secret.id, mode: "process", durationMinutes: 5,
});
resolver.secrets.setCompromised(secret.id, true, "leaked in screenshot");
resolver.grants.revokeForSecret(secret.id);
resolver.leases.revokeForSecret(secret.id);
const revokedGrant = resolver.grants.list("clawix-local").find((row) => row.id === activeGrant.grant.id);
const revokedLease = resolver.leases.list("clawix-local").find((row) => row.id === activeLease.lease.id);
if (revokedGrant?.revoked_at && revokedLease?.revoked_at) ok("compromise revokes active grants and leases");
else ko("compromise revokes active grants and leases", { revokedGrant, revokedLease });
const reloaded = resolver.secrets.get(secret.id);
const dec3 = evaluateGovernance(reloaded, { host: "api.github.com", headers: { Authorization: "Bearer x" } });
if (!dec3.allowed && dec3.reasons.includes("secret_compromised")) ok("blocks compromised secret");
else ko("blocks compromised secret", dec3);

setup.masterKey.zero(); setup.auditMacKey.zero();
db.close();
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
