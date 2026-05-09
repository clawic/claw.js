// Smoke test for AuditStore. Uses a temp SQLite DB.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openDatabase } from "../src/server/db.ts";
import { vaultSetup } from "../src/server/crypto.ts";
import { ARGON2_FAST_PARAMS } from "../src/server/calibration.ts";
import { TenantStore, VaultMetaStore } from "../src/server/stores.ts";
import { AuditStore } from "../src/server/audit.ts";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-audit-"));
const dbPath = path.join(tmpDir, "vault.sqlite");
const db = openDatabase(dbPath);

let pass = 0;
let fail = 0;
function ok(name) { console.log(`  ✓ ${name}`); pass++; }
function ko(name, e) { console.error(`  ✗ ${name}: ${e?.message ?? e}`); fail++; }

const tenants = new TenantStore(db);
const metaStore = new VaultMetaStore(db);
const audit = new AuditStore(db);

tenants.upsert("clawix-local", "Clawix Local");

const setup = vaultSetup("test-pw", {
  schemaVersion: 2,
  appVersion: "0.1.2",
  kdfParams: ARGON2_FAST_PARAMS,
});
metaStore.save("clawix-local", setup.meta);
ok("vault setup persisted");

// Append three events.
const e1 = audit.append({
  tenantId: "clawix-local",
  meta: setup.meta,
  auditMacKey: setup.auditMacKey,
  event: { kind: "vaultSetup", source: "system", success: true, payload: { setup: true } },
});
const e2 = audit.append({
  tenantId: "clawix-local",
  meta: setup.meta,
  auditMacKey: setup.auditMacKey,
  event: { kind: "adminCreate", source: "ui", secretId: null, payload: { name: "github" } },
});
const e3 = audit.append({
  tenantId: "clawix-local",
  meta: setup.meta,
  auditMacKey: setup.auditMacKey,
  event: { kind: "uiCopy", source: "ui", secretId: null, payload: { field: "api_key" } },
});
if (e1.sequence === 0 && e2.sequence === 1 && e3.sequence === 2) ok("sequence increments"); else ko("sequence increments");

// Query back.
const events = audit.query({
  tenantId: "clawix-local",
  auditMacKey: setup.auditMacKey,
});
if (events.length === 3) ok("query returns 3 events"); else ko("query returns 3 events");
if (events[0].kind === "uiCopy" && events[2].kind === "vaultSetup") ok("events sorted desc"); else ko("events sorted desc");

const decryptedPayload = events.find((e) => e.kind === "adminCreate")?.payload;
if (decryptedPayload?.name === "github") ok("payload decrypts correctly"); else ko("payload decrypts");

// Integrity check.
const report1 = audit.checkIntegrity({
  tenantId: "clawix-local",
  meta: setup.meta,
  auditMacKey: setup.auditMacKey,
});
if (report1.ok && report1.verified === 3 && report1.tampered.length === 0) ok("integrity check passes (3/3)");
else ko("integrity check passes", report1);

// Tamper one event by modifying timestamp.
db.prepare("UPDATE audit_events SET timestamp = ? WHERE id = ?").run("1970-01-01T00:00:00.000Z", e2.id);
const report2 = audit.checkIntegrity({
  tenantId: "clawix-local",
  meta: setup.meta,
  auditMacKey: setup.auditMacKey,
});
if (!report2.ok && report2.tampered.find((t) => t.eventId === e2.id)) ok("tampering detected");
else ko("tampering detected", report2);

setup.masterKey.zero();
setup.auditMacKey.zero();
db.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
