import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openDatabase } from "./db.ts";
import { LeaseStore } from "./leases.ts";

test("leases with invalid expiry fail closed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-secrets-leases-"));
  const db = openDatabase(path.join(root, "vault.sqlite"));
  try {
    seedSecret(db);
    const store = new LeaseStore(db);
    const issued = store.issue({
      tenantId: "tenant-a",
      secretId: "secret-a",
      mode: "process",
      durationMinutes: 5,
    });
    db.prepare("UPDATE leases SET expires_at = ? WHERE id = ?").run("not-a-date", issued.lease.id);

    assert.throws(() => store.consume(issued.token), /Lease expired/);
    assert.deepEqual(store.listActive("tenant-a").map((lease) => lease.id), []);
    assert.equal(store.sweepExpired(), 1);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function seedSecret(db: ReturnType<typeof openDatabase>): void {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO tenants (id, label, created_at) VALUES (?, ?, ?)").run("tenant-a", "Tenant A", now);
  db.prepare(`
    INSERT INTO secrets (
      id,
      tenant_id,
      folder_id,
      type_id,
      internal_name,
      title,
      wrapped_item_key,
      current_version_id,
      allowed_hosts_json,
      allowed_headers_json,
      allow_in_url,
      allow_in_body,
      allow_in_env,
      allow_insecure_transport,
      allow_local_network,
      allowed_agents_json,
      approval_mode,
      approval_window_minutes,
      ttl_expires_at,
      max_uses,
      rotation_reminder_days,
      redaction_label,
      clipboard_clear_seconds,
      audit_retention_days,
      requires_vpn,
      vpn_profile_name,
      is_archived,
      is_compromised,
      is_compromised_reason,
      is_locked,
      read_only,
      trashed_at,
      use_count,
      last_used_at,
      last_rotated_at,
      tags_json,
      created_at,
      updated_at
    ) VALUES (?, ?, NULL, NULL, ?, ?, ?, NULL, '[]', '[]', 0, 0, 0, 0, 0, NULL, 'auto', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, 0, 0, NULL, 0, 0, NULL, 0, NULL, NULL, '[]', ?, ?)
  `).run("secret-a", "tenant-a", "api_key", "API Key", Buffer.alloc(32), now, now);
}
