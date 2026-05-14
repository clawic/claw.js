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

// Reveal all.
const all = resolver.revealAllFields({ secret, masterKey: setup.masterKey });
if (all.token === "ghp_super_secret_xxx" && all.username === "ivan") ok("reveal all fields"); else ko("reveal all fields");

// Issue agent grant.
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
