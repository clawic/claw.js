// Smoke test: full secret lifecycle (create → describe → reveal → grant → governance).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openDatabase } from "../src/server/db.ts";
import { vaultSetup } from "../src/server/crypto.ts";
import { ARGON2_FAST_PARAMS } from "../src/server/calibration.ts";
import { TenantStore, VaultMetaStore, VaultContainerStore } from "../src/server/stores.ts";
import { VaultResolver } from "../src/server/resolver.ts";
import { evaluateGovernance } from "../src/server/governance.ts";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-secrets-"));
const dbPath = path.join(tmpDir, "vault.sqlite");
const db = openDatabase(dbPath);

let pass = 0; let fail = 0;
function ok(name) { console.log(`  ✓ ${name}`); pass++; }
function ko(name, e) { console.error(`  ✗ ${name}: ${e?.message ?? e}`); fail++; }

const tenants = new TenantStore(db);
const metaStore = new VaultMetaStore(db);
const containers = new VaultContainerStore(db);
const resolver = new VaultResolver(db);

tenants.upsert("clawix-local", "Clawix Local");
const setup = vaultSetup("master-pw", { schemaVersion: 2, appVersion: "0.1.2", kdfParams: ARGON2_FAST_PARAMS });
metaStore.save("clawix-local", setup.meta);

// Create vault container.
const container = containers.create({ tenantId: "clawix-local", name: "Personal", icon: "key", color: "#FF0000" });
if (container.name === "Personal") ok("container created"); else ko("container created");

// Create a secret.
const secret = resolver.secrets.create({
  tenantId: "clawix-local",
  masterKey: setup.masterKey,
  draft: {
    vaultId: container.id,
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
  vaultCapabilities: ["broker.http", "metadata.read"],
  reason: "Push release",
  durationMinutes: 10,
});
if (grant.token.startsWith("svagt_")) ok("grant issued (svagt_)");
else ko("grant token format");

// Resolve grant with correct expectation.
const resolved = resolver.grants.resolve(grant.token, {
  expectedKind: "github.git_push",
  expectedScope: { repository: "ivan/clawix" },
  requiredVaultCapabilities: ["broker.http"],
});
if (resolved.id === grant.grant.id) ok("grant resolves with correct kind+scope+vaultCaps");
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

// Governance: blocked when host not in allowlist.
const dec1 = evaluateGovernance(secret, { host: "evil.example.com" });
if (!dec1.allowed && dec1.reasons.includes("host_not_allowed")) ok("blocks unknown host");
else ko("blocks unknown host", dec1);

const dec2 = evaluateGovernance(secret, { host: "api.github.com", headers: { Authorization: "Bearer x" } });
if (dec2.allowed) ok("allows whitelisted host+header"); else ko("allows whitelisted", dec2);

// Compromise & TTL exhausted reasons.
resolver.secrets.setCompromised(secret.id, true, "leaked in screenshot");
const reloaded = resolver.secrets.get(secret.id);
const dec3 = evaluateGovernance(reloaded, { host: "api.github.com", headers: { Authorization: "Bearer x" } });
if (!dec3.allowed && dec3.reasons.includes("secret_compromised")) ok("blocks compromised secret");
else ko("blocks compromised secret", dec3);

setup.masterKey.zero(); setup.auditMacKey.zero();
db.close();
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
