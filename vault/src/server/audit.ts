// AuditStore. Replicates the Clawix audit chain in TypeScript:
//   - Each event carries a per-event key, wrapped with auditMacKey (NOT
//     masterKey, so the chain survives password changes).
//   - The payload (JSON) is sealed with that per-event key.
//   - Each event has a sequence number monotonic within (tenant_id), a
//     prev_hash and a self_hash. self_hash = HMAC-SHA256(auditMacKey,
//     prev_hash || canonicalEventBytes).
//   - The chain genesis (the prev_hash of sequence=0) lives in
//     VaultMetaSnapshot.auditChainGenesis.

import {
  asBuffer,
  asUint8Array,
  newId,
  nowIso,
  type AuditEventRow,
  type SqliteDb,
} from "./db.ts";
import {
  computeChainHash,
  generateEventKey,
  openEventPayload,
  sealEventPayload,
  unwrapEventKey,
  wrapEventKey,
  type VaultMetaSnapshot,
} from "./crypto.ts";
import { LockableSecret } from "./lockable-secret.ts";
import type {
  AuditEventFilter,
  AuditEventKind,
  AuditIntegrityReport,
  AuditSource,
  DecryptedAuditEvent,
  NewAuditEvent,
} from "./audit-events.ts";

interface AppendInput {
  tenantId: string;
  meta: VaultMetaSnapshot;
  auditMacKey: LockableSecret;
  event: NewAuditEvent;
}

function canonicalize(event: {
  id: string;
  tenantId: string;
  kind: AuditEventKind;
  timestamp: string;
  source: AuditSource;
  sequence: number;
  payloadCiphertextBase64: string;
}): Uint8Array {
  // JSON.stringify with a stable key order so the hash is deterministic.
  const ordered = {
    id: event.id,
    tenantId: event.tenantId,
    kind: event.kind,
    timestamp: event.timestamp,
    source: event.source,
    sequence: event.sequence,
    payloadCiphertextBase64: event.payloadCiphertextBase64,
  };
  return new TextEncoder().encode(JSON.stringify(ordered));
}

export class AuditStore {
  constructor(private readonly db: SqliteDb) {}

  private nextSequence(tenantId: string): number {
    const row = this.db
      .prepare("SELECT MAX(sequence) AS max_seq FROM audit_events WHERE tenant_id = ?")
      .get(tenantId) as { max_seq: number | null } | undefined;
    return row?.max_seq != null ? row.max_seq + 1 : 0;
  }

  private prevHash(tenantId: string, meta: VaultMetaSnapshot, sequence: number): Uint8Array {
    if (sequence === 0) return meta.auditChainGenesis;
    const row = this.db
      .prepare("SELECT self_hash FROM audit_events WHERE tenant_id = ? AND sequence = ?")
      .get(tenantId, sequence - 1) as { self_hash: Buffer } | undefined;
    if (!row) throw new Error(`Audit chain broken at tenant=${tenantId} sequence=${sequence - 1}`);
    return asUint8Array(row.self_hash);
  }

  append(input: AppendInput): DecryptedAuditEvent {
    const id = newId();
    const timestamp = nowIso();
    const sequence = this.nextSequence(input.tenantId);
    const prevHash = this.prevHash(input.tenantId, input.meta, sequence);

    const eventKeyBytes = generateEventKey();
    const wrappedEventKey = wrapEventKey(eventKeyBytes, id, input.auditMacKey);
    const eventKey = LockableSecret.fromBytes(eventKeyBytes);
    eventKeyBytes.fill(0);

    const payloadCiphertext = sealEventPayload(JSON.stringify(input.event.payload), eventKey, id);
    eventKey.zero();

    const payloadCiphertextBase64 = Buffer.from(payloadCiphertext).toString("base64");
    const canonical = canonicalize({
      id,
      tenantId: input.tenantId,
      kind: input.event.kind,
      timestamp,
      source: input.event.source,
      sequence,
      payloadCiphertextBase64,
    });
    const selfHash = computeChainHash(prevHash, canonical, input.auditMacKey);

    const row: AuditEventRow = {
      id,
      tenant_id: input.tenantId,
      secret_id: input.event.secretId ?? null,
      vault_id: input.event.vaultId ?? null,
      version_id: input.event.versionId ?? null,
      kind: input.event.kind,
      timestamp,
      source: input.event.source,
      success: input.event.success === undefined ? null : input.event.success ? 1 : 0,
      device_id: input.event.deviceId ?? null,
      session_id: input.event.sessionId ?? null,
      wrapped_event_key: asBuffer(wrappedEventKey),
      payload_ciphertext: asBuffer(payloadCiphertext),
      prev_hash: asBuffer(prevHash),
      self_hash: asBuffer(selfHash),
      sequence,
    };

    this.db
      .prepare(
        `INSERT INTO audit_events (
           id, tenant_id, secret_id, vault_id, version_id, kind, timestamp, source,
           success, device_id, session_id, wrapped_event_key, payload_ciphertext,
           prev_hash, self_hash, sequence
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.tenant_id,
        row.secret_id,
        row.vault_id,
        row.version_id,
        row.kind,
        row.timestamp,
        row.source,
        row.success,
        row.device_id,
        row.session_id,
        row.wrapped_event_key,
        row.payload_ciphertext,
        row.prev_hash,
        row.self_hash,
        row.sequence,
      );

    return {
      id: row.id,
      tenantId: row.tenant_id,
      secretId: row.secret_id,
      vaultId: row.vault_id,
      versionId: row.version_id,
      kind: row.kind as AuditEventKind,
      timestamp: row.timestamp,
      source: row.source as AuditSource,
      success: row.success === null ? null : row.success === 1,
      deviceId: row.device_id,
      sessionId: row.session_id,
      sequence: row.sequence,
      prevHashBase64: Buffer.from(prevHash).toString("base64"),
      selfHashBase64: Buffer.from(selfHash).toString("base64"),
      payload: input.event.payload,
    };
  }

  query(input: { tenantId: string; auditMacKey: LockableSecret; filter?: AuditEventFilter }): DecryptedAuditEvent[] {
    const filter = input.filter ?? {};
    const where: string[] = ["tenant_id = ?"];
    const params: unknown[] = [input.tenantId];
    if (filter.kinds && filter.kinds.length > 0) {
      where.push(`kind IN (${filter.kinds.map(() => "?").join(",")})`);
      params.push(...filter.kinds);
    }
    if (filter.source) {
      where.push("source = ?");
      params.push(filter.source);
    }
    if (filter.secretId) {
      where.push("secret_id = ?");
      params.push(filter.secretId);
    }
    if (filter.since) {
      where.push("timestamp >= ?");
      params.push(filter.since);
    }
    if (filter.until) {
      where.push("timestamp <= ?");
      params.push(filter.until);
    }
    const limit = filter.limit ?? 200;
    const sql = `SELECT * FROM audit_events WHERE ${where.join(" AND ")} ORDER BY sequence DESC LIMIT ?`;
    const rows = this.db.prepare(sql).all(...params, limit) as AuditEventRow[];

    return rows.map((row) => {
      const eventKey = unwrapEventKey(asUint8Array(row.wrapped_event_key), row.id, input.auditMacKey);
      let payload: Record<string, unknown> = {};
      try {
        const text = openEventPayload(asUint8Array(row.payload_ciphertext), eventKey, row.id);
        payload = JSON.parse(text) as Record<string, unknown>;
      } finally {
        eventKey.zero();
      }
      return {
        id: row.id,
        tenantId: row.tenant_id,
        secretId: row.secret_id,
        vaultId: row.vault_id,
        versionId: row.version_id,
        kind: row.kind as AuditEventKind,
        timestamp: row.timestamp,
        source: row.source as AuditSource,
        success: row.success === null ? null : row.success === 1,
        deviceId: row.device_id,
        sessionId: row.session_id,
        sequence: row.sequence,
        prevHashBase64: Buffer.from(row.prev_hash).toString("base64"),
        selfHashBase64: Buffer.from(row.self_hash).toString("base64"),
        payload,
      };
    });
  }

  /**
   * Walks the chain and verifies that each event's self_hash matches the
   * recomputed HMAC. Reports tampered events.
   */
  checkIntegrity(input: {
    tenantId: string;
    meta: VaultMetaSnapshot;
    auditMacKey: LockableSecret;
  }): AuditIntegrityReport {
    const rows = this.db
      .prepare("SELECT * FROM audit_events WHERE tenant_id = ? ORDER BY sequence ASC")
      .all(input.tenantId) as AuditEventRow[];
    const tampered: { eventId: string; sequence: number }[] = [];
    let verified = 0;
    let expectedPrev = input.meta.auditChainGenesis;
    for (const row of rows) {
      const payloadCiphertextBase64 = Buffer.from(row.payload_ciphertext).toString("base64");
      const canonical = canonicalize({
        id: row.id,
        tenantId: row.tenant_id,
        kind: row.kind as AuditEventKind,
        timestamp: row.timestamp,
        source: row.source as AuditSource,
        sequence: row.sequence,
        payloadCiphertextBase64,
      });
      const expectedHash = computeChainHash(expectedPrev, canonical, input.auditMacKey);
      const actualHash = asUint8Array(row.self_hash);
      const actualPrev = asUint8Array(row.prev_hash);
      const prevMatches = Buffer.compare(Buffer.from(actualPrev), Buffer.from(expectedPrev)) === 0;
      const hashMatches = Buffer.compare(Buffer.from(actualHash), Buffer.from(expectedHash)) === 0;
      if (prevMatches && hashMatches) {
        verified++;
        expectedPrev = actualHash;
      } else {
        tampered.push({ eventId: row.id, sequence: row.sequence });
        // Continue from the recorded hash so subsequent events can still
        // self-validate even past tampering. This surfaces all bad events.
        expectedPrev = actualHash;
      }
    }
    return {
      totalEvents: rows.length,
      verified,
      tampered,
      ok: tampered.length === 0,
    };
  }

  sweepExpired(input: { tenantId: string; retentionDays: number }): number {
    const cutoff = new Date(Date.now() - input.retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const result = this.db
      .prepare("DELETE FROM audit_events WHERE tenant_id = ? AND timestamp < ?")
      .run(input.tenantId, cutoff);
    return result.changes;
  }
}
