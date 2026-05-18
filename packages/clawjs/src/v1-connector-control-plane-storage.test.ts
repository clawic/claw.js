import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

import {
  doctorPayload,
  ensureV1MainSchema,
  openSidecar,
  resetDomain,
  resolveClawjsMainDbPath,
} from "./v1-data-core.ts";

const connectorTables = [
  "connector_providers",
  "connector_context_records",
  "connector_context_defaults",
  "connector_context_audit_events",
  "connector_external_principals",
  "connector_credential_bindings",
  "connector_capabilities",
  "connector_operations",
  "connector_policies",
  "connector_budgets",
  "connector_network_policies",
  "connector_audit_events",
] as const;

test("connector control plane storage is durable, brokered, and resettable", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-connector-storage-"));
  const previousDataDir = process.env.CLAW_DATA_DIR;
  process.env.CLAW_DATA_DIR = tempRoot;

  const sqlite = new Database(resolveClawjsMainDbPath());
  try {
    ensureV1MainSchema(sqlite);

    const tables = sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'connector_%'
      ORDER BY name
    `).all() as Array<{ name: string }>;
    assert.deepEqual(tables.map((row) => row.name).sort(), [...connectorTables].sort());

    const now = new Date("2026-05-15T00:00:00.000Z").toISOString();
    sqlite.prepare(`
      INSERT INTO connector_providers (id, display_name, trust_tier, enabled, created_at, updated_at)
      VALUES ('openai', 'OpenAI', 'external_saas', 1, ?, ?)
    `).run(now, now);
    sqlite.prepare(`
      INSERT INTO connector_capabilities (id, domain, action, facet, summary, created_at, updated_at)
      VALUES ('image.edit.background', 'image', 'edit', 'background', 'Edit image backgrounds', ?, ?)
    `).run(now, now);
    sqlite.prepare(`
      INSERT INTO connector_network_policies (id, required, egress_profile_id, vpn_profile_id, allowed_hosts_json, created_at, updated_at)
      VALUES ('openai-egress', 1, 'egress.default', 'vpn.openai', '["api.openai.com"]', ?, ?)
    `).run(now, now);
    sqlite.prepare(`
      INSERT INTO connector_operations (id, provider_id, runtime_kind, support, native_name, capability_ids_json, network_policy_id, created_at, updated_at)
      VALUES ('openai.images.edit', 'openai', 'api', 'supported', 'images.edit', '["image.edit.background"]', 'openai-egress', ?, ?)
    `).run(now, now);
    sqlite.prepare(`
      INSERT INTO connector_external_principals (id, provider_id, kind, display_name, external_id, created_at, updated_at)
      VALUES ('openai.account.primary', 'openai', 'account', 'Primary OpenAI account', 'acct_123', ?, ?)
    `).run(now, now);
    sqlite.prepare(`
      INSERT INTO connector_credential_bindings (id, provider_id, principal_id, secret_ref, scopes_json, operation_ids_json, created_at, updated_at)
      VALUES ('openai.key.admin', 'openai', 'openai.account.primary', 'vault://connectors/openai/admin', '["images"]', '["openai.images.edit"]', ?, ?)
    `).run(now, now);
    sqlite.prepare(`
      INSERT INTO connector_policies (id, default_effect, rules_json, created_at, updated_at)
      VALUES ('default', 'deny', '[]', ?, ?)
    `).run(now, now);
    sqlite.prepare(`
      INSERT INTO connector_budgets (id, provider_id, operation_id, capability_id, unit, window, limit_value, created_at, updated_at)
      VALUES ('openai.images.daily', 'openai', 'openai.images.edit', 'image.edit.background', 'calls', 'day', 100, ?, ?)
    `).run(now, now);
    sqlite.prepare(`
      INSERT INTO connector_audit_events (id, request_id, provider_id, operation_id, capability_id, credential_binding_id, decision, raw_trace_ref, created_at)
      VALUES ('audit.1', 'request.1', 'openai', 'openai.images.edit', 'image.edit.background', 'openai.key.admin', 'allow', 'vault://connector-raw-traces/audit.1', ?)
    `).run(now);

    const binding = sqlite.prepare("SELECT secret_ref FROM connector_credential_bindings WHERE id = 'openai.key.admin'").get() as { secret_ref: string };
    assert.equal(binding.secret_ref, "vault://connectors/openai/admin");
    const doctor = doctorPayload(sqlite) as { logicalDomains: { mainDb: string[] }; tables: string[] };
    assert.equal(doctor.logicalDomains.mainDb.includes("connectors"), true);
    assert.equal(doctor.tables.includes("connector_audit_events"), true);

    const reset = resetDomain(sqlite, "connectors") as { deleted: Record<string, number> };
    assert.equal(reset.deleted.connector_audit_events, 1);
    assert.equal(reset.deleted.connector_providers, 1);
  } finally {
    sqlite.close();
  }

  const vault = openSidecar("vault.sqlite");
  try {
    const columns = vault.prepare("PRAGMA table_info(connector_raw_trace_refs)").all() as Array<{ name: string }>;
    assert.deepEqual(columns.map((column) => column.name).sort(), [
      "audit_event_id",
      "created_at",
      "encrypted_payload_ref",
      "expires_at",
      "id",
      "key_ref",
      "metadata_json",
      "operation_id",
      "provider_id",
    ].sort());
  } finally {
    vault.close();
    if (previousDataDir === undefined) delete process.env.CLAW_DATA_DIR;
    else process.env.CLAW_DATA_DIR = previousDataDir;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
