// Storage layer for the marketplace/1.0.0 marketplace protocol tables.
//
// This file extends the IndexStore with methods scoped to mp_* tables. It
// intentionally lives in a separate file so the regular index storage stays
// unchanged.

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

import type {
  MpDeviceKeyRow, MpInboundMessageRow, MpIntentRow, MpKnownBrokerRow,
  MpMatchReceiptRow, MpOutboundMessageRow, MpPeerLevelRow, MpRatingRow,
  MpReceiptStatus, MpRevocationRow, MpRoleKeyRow, MpRootKeyRow,
  MpVouchInboundRow, MpVouchOutboundRow,
} from "./marketplace-types.ts";

function uuid(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 22)}`;
}

function asBuf(value: Uint8Array | Buffer | null | undefined): Buffer | null {
  if (value == null) return null;
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function asBytes(value: Buffer | Uint8Array | null | undefined): Uint8Array | null {
  if (value == null) return null;
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

export class MpStore {
  constructor(private readonly db: Database.Database) {}

  // ---- root keys ----

  insertRootKey(input: {
    pubkey: Uint8Array;
    encryptedSeed: Uint8Array;
    encryptionMeta: Record<string, unknown>;
    label?: string;
  }): MpRootKeyRow {
    const id = uuid("root");
    this.db.prepare(`
      INSERT INTO mp_root_keys (id, pubkey, encrypted_seed, encryption_meta, label)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, asBuf(input.pubkey), asBuf(input.encryptedSeed), JSON.stringify(input.encryptionMeta), input.label ?? null);
    return this.getRootKey(id)!;
  }

  getRootKey(id: string): MpRootKeyRow | null {
    const row: any = this.db.prepare(`SELECT id, pubkey, label, created_at, revoked_at FROM mp_root_keys WHERE id = ?`).get(id);
    if (!row) return null;
    return { id: row.id, pubkey: asBytes(row.pubkey)!, label: row.label, createdAt: row.created_at, revokedAt: row.revoked_at };
  }

  listRootKeys(): MpRootKeyRow[] {
    return this.db.prepare(`SELECT id, pubkey, label, created_at, revoked_at FROM mp_root_keys ORDER BY created_at ASC`).all().map((row: any) => ({
      id: row.id, pubkey: asBytes(row.pubkey)!, label: row.label, createdAt: row.created_at, revokedAt: row.revoked_at,
    }));
  }

  getEncryptedRoot(id: string): { encryptedSeed: Uint8Array; encryptionMeta: Record<string, unknown> } | null {
    const row: any = this.db.prepare(`SELECT encrypted_seed, encryption_meta FROM mp_root_keys WHERE id = ?`).get(id);
    if (!row) return null;
    return { encryptedSeed: asBytes(row.encrypted_seed)!, encryptionMeta: JSON.parse(row.encryption_meta) };
  }

  // ---- device keys ----

  insertDeviceKey(input: {
    rootKeyId: string;
    pubkey: Uint8Array;
    encryptedPriv: Uint8Array;
    encryptionMeta: Record<string, unknown>;
    deviceName: string;
    certificateCbor: Uint8Array;
  }): MpDeviceKeyRow {
    const id = uuid("dev");
    this.db.prepare(`
      INSERT INTO mp_device_keys (id, root_key_id, pubkey, encrypted_priv, encryption_meta, device_name, certificate_cbor)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.rootKeyId, asBuf(input.pubkey), asBuf(input.encryptedPriv), JSON.stringify(input.encryptionMeta), input.deviceName, asBuf(input.certificateCbor));
    return this.getDeviceKey(id)!;
  }

  getDeviceKey(id: string): MpDeviceKeyRow | null {
    const row: any = this.db.prepare(`SELECT id, root_key_id, pubkey, device_name, certificate_cbor, created_at, revoked_at FROM mp_device_keys WHERE id = ?`).get(id);
    return row ? {
      id: row.id, rootKeyId: row.root_key_id, pubkey: asBytes(row.pubkey)!,
      deviceName: row.device_name, certificateCbor: asBytes(row.certificate_cbor)!,
      createdAt: row.created_at, revokedAt: row.revoked_at,
    } : null;
  }

  listDeviceKeys(rootKeyId?: string): MpDeviceKeyRow[] {
    const rows: any[] = rootKeyId
      ? this.db.prepare(`SELECT id, root_key_id, pubkey, device_name, certificate_cbor, created_at, revoked_at FROM mp_device_keys WHERE root_key_id = ? ORDER BY created_at ASC`).all(rootKeyId)
      : this.db.prepare(`SELECT id, root_key_id, pubkey, device_name, certificate_cbor, created_at, revoked_at FROM mp_device_keys ORDER BY created_at ASC`).all();
    return rows.map((row) => ({
      id: row.id, rootKeyId: row.root_key_id, pubkey: asBytes(row.pubkey)!,
      deviceName: row.device_name, certificateCbor: asBytes(row.certificate_cbor)!,
      createdAt: row.created_at, revokedAt: row.revoked_at,
    }));
  }

  getEncryptedDevice(id: string): { encryptedPriv: Uint8Array; encryptionMeta: Record<string, unknown> } | null {
    const row: any = this.db.prepare(`SELECT encrypted_priv, encryption_meta FROM mp_device_keys WHERE id = ?`).get(id);
    if (!row) return null;
    return { encryptedPriv: asBytes(row.encrypted_priv)!, encryptionMeta: JSON.parse(row.encryption_meta) };
  }

  // ---- role keys ----

  insertRoleKey(input: {
    rootKeyId: string;
    pubkey: Uint8Array;
    encryptedPriv: Uint8Array;
    encryptionMeta: Record<string, unknown>;
    roleName: string;
    vertical: string;
    certificateCbor: Uint8Array;
  }): MpRoleKeyRow {
    const id = uuid("role");
    this.db.prepare(`
      INSERT INTO mp_role_keys (id, root_key_id, pubkey, encrypted_priv, encryption_meta, role_name, vertical, certificate_cbor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.rootKeyId, asBuf(input.pubkey), asBuf(input.encryptedPriv), JSON.stringify(input.encryptionMeta), input.roleName, input.vertical, asBuf(input.certificateCbor));
    return this.getRoleKey(id)!;
  }

  getRoleKey(id: string): MpRoleKeyRow | null {
    const row: any = this.db.prepare(`SELECT id, root_key_id, pubkey, role_name, vertical, certificate_cbor, created_at, revoked_at FROM mp_role_keys WHERE id = ?`).get(id);
    return row ? {
      id: row.id, rootKeyId: row.root_key_id, pubkey: asBytes(row.pubkey)!,
      roleName: row.role_name, vertical: row.vertical, certificateCbor: asBytes(row.certificate_cbor)!,
      createdAt: row.created_at, revokedAt: row.revoked_at,
    } : null;
  }

  listRoleKeys(filter?: { rootKeyId?: string; vertical?: string }): MpRoleKeyRow[] {
    const clauses: string[] = []; const params: unknown[] = [];
    if (filter?.rootKeyId) { clauses.push("root_key_id = ?"); params.push(filter.rootKeyId); }
    if (filter?.vertical) { clauses.push("vertical = ?"); params.push(filter.vertical); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`SELECT id, root_key_id, pubkey, role_name, vertical, certificate_cbor, created_at, revoked_at FROM mp_role_keys ${where} ORDER BY created_at ASC`).all(...params).map((row: any) => ({
      id: row.id, rootKeyId: row.root_key_id, pubkey: asBytes(row.pubkey)!,
      roleName: row.role_name, vertical: row.vertical, certificateCbor: asBytes(row.certificate_cbor)!,
      createdAt: row.created_at, revokedAt: row.revoked_at,
    }));
  }

  getEncryptedRole(id: string): { encryptedPriv: Uint8Array; encryptionMeta: Record<string, unknown> } | null {
    const row: any = this.db.prepare(`SELECT encrypted_priv, encryption_meta FROM mp_role_keys WHERE id = ?`).get(id);
    if (!row) return null;
    return { encryptedPriv: asBytes(row.encrypted_priv)!, encryptionMeta: JSON.parse(row.encryption_meta) };
  }

  revokeRoleKey(id: string): void {
    this.db.prepare(`UPDATE mp_role_keys SET revoked_at = datetime('now') WHERE id = ?`).run(id);
  }
  revokeDeviceKey(id: string): void {
    this.db.prepare(`UPDATE mp_device_keys SET revoked_at = datetime('now') WHERE id = ?`).run(id);
  }

  // ---- intents ----

  insertIntent(input: Omit<MpIntentRow, "id" | "createdAt"> & { id?: string }): MpIntentRow {
    const id = input.id ?? uuid("int");
    this.db.prepare(`
      INSERT INTO mp_intents (
        id, intent_id_hash, side, role_key_id, ephemeral_pubkey, vertical,
        payload_json, payload_cbor, visibility_levels_json, reveal_keys_json,
        signature_role, signature_device, provenance, observed_source, observed_external_url,
        status, expires_at, published_at, withdrawn_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, asBuf(input.intentIdHash), input.side, input.roleKeyId ?? null,
      asBuf(input.ephemeralPubkey ?? null), input.vertical,
      JSON.stringify(input.payload), asBuf(input.payloadCbor),
      JSON.stringify(input.visibilityLevels),
      input.revealKeys ? JSON.stringify(input.revealKeys) : null,
      asBuf(input.signatureRole ?? null), asBuf(input.signatureDevice ?? null),
      input.provenance, input.observedSource ?? null, input.observedExternalUrl ?? null,
      input.status, input.expiresAt ?? null, input.publishedAt ?? null, input.withdrawnAt ?? null,
    );
    return this.getIntent(id)!;
  }

  upsertObservedIntent(input: Omit<MpIntentRow, "id" | "createdAt"> & { id?: string }): MpIntentRow {
    const existing = this.findIntentByHash(input.intentIdHash);
    if (existing) {
      this.db.prepare(`UPDATE mp_intents SET status = ?, payload_json = ?, payload_cbor = ? WHERE id = ?`).run(
        input.status, JSON.stringify(input.payload), asBuf(input.payloadCbor), existing.id,
      );
      return this.getIntent(existing.id)!;
    }
    return this.insertIntent(input);
  }

  findIntentByHash(hash: Uint8Array): MpIntentRow | null {
    const row: any = this.db.prepare(`SELECT * FROM mp_intents WHERE intent_id_hash = ?`).get(asBuf(hash));
    return row ? this.intentFromRow(row) : null;
  }

  getIntent(id: string): MpIntentRow | null {
    const row: any = this.db.prepare(`SELECT * FROM mp_intents WHERE id = ?`).get(id);
    return row ? this.intentFromRow(row) : null;
  }

  listIntents(filter?: {
    side?: "offer" | "want"; vertical?: string; status?: string;
    provenance?: "native" | "observed"; roleKeyId?: string; limit?: number;
  }): MpIntentRow[] {
    const clauses: string[] = []; const params: unknown[] = [];
    if (filter?.side) { clauses.push("side = ?"); params.push(filter.side); }
    if (filter?.vertical) { clauses.push("vertical = ?"); params.push(filter.vertical); }
    if (filter?.status) { clauses.push("status = ?"); params.push(filter.status); }
    if (filter?.provenance) { clauses.push("provenance = ?"); params.push(filter.provenance); }
    if (filter?.roleKeyId) { clauses.push("role_key_id = ?"); params.push(filter.roleKeyId); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = filter?.limit ?? 500;
    return this.db.prepare(`SELECT * FROM mp_intents ${where} ORDER BY created_at DESC LIMIT ?`).all(...params, limit).map((r: any) => this.intentFromRow(r));
  }

  updateIntentStatus(id: string, status: MpIntentRow["status"]): void {
    if (status === "withdrawn") {
      this.db.prepare(`UPDATE mp_intents SET status = 'withdrawn', withdrawn_at = datetime('now') WHERE id = ?`).run(id);
    } else if (status === "published") {
      this.db.prepare(`UPDATE mp_intents SET status = 'published', published_at = datetime('now') WHERE id = ?`).run(id);
    } else {
      this.db.prepare(`UPDATE mp_intents SET status = ? WHERE id = ?`).run(status, id);
    }
  }

  private intentFromRow(row: any): MpIntentRow {
    return {
      id: row.id, intentIdHash: asBytes(row.intent_id_hash)!, side: row.side,
      roleKeyId: row.role_key_id, ephemeralPubkey: asBytes(row.ephemeral_pubkey),
      vertical: row.vertical, payload: JSON.parse(row.payload_json),
      payloadCbor: asBytes(row.payload_cbor)!,
      visibilityLevels: JSON.parse(row.visibility_levels_json),
      revealKeys: row.reveal_keys_json ? JSON.parse(row.reveal_keys_json) : null,
      signatureRole: asBytes(row.signature_role),
      signatureDevice: asBytes(row.signature_device),
      provenance: row.provenance, observedSource: row.observed_source,
      observedExternalUrl: row.observed_external_url,
      status: row.status, expiresAt: row.expires_at, createdAt: row.created_at,
      publishedAt: row.published_at, withdrawnAt: row.withdrawn_at,
    };
  }

  recordObservation(input: {
    intentId: string;
    sourceLayer: "dht" | "broker" | "gossip" | "direct" | "local";
    sourceNode?: string;
    rawBlob?: Uint8Array;
  }): void {
    this.db.prepare(`
      INSERT INTO mp_intent_observations (id, intent_id, source_layer, source_node, raw_blob)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuid("obsmp"), input.intentId, input.sourceLayer, input.sourceNode ?? null, asBuf(input.rawBlob ?? null));
  }

  // ---- peer levels ----

  upsertPeerLevel(input: Omit<MpPeerLevelRow, "id" | "lastUpdatedAt"> & { id?: string }): MpPeerLevelRow {
    const existing: any = this.db.prepare(`
      SELECT id FROM mp_peer_levels
      WHERE my_role_key_id = ? AND peer_pubkey = ? AND COALESCE(intent_id,'') = COALESCE(?,'')
    `).get(input.myRoleKeyId, asBuf(input.peerPubkey), input.intentId ?? null);
    if (existing) {
      this.db.prepare(`
        UPDATE mp_peer_levels SET current_level = ?, proofs_json = ?, last_updated_at = datetime('now')
        WHERE id = ?
      `).run(input.currentLevel, input.proofs ? JSON.stringify(input.proofs) : null, existing.id);
      return this.getPeerLevel(existing.id)!;
    }
    const id = input.id ?? uuid("peer");
    this.db.prepare(`
      INSERT INTO mp_peer_levels (id, my_role_key_id, peer_pubkey, intent_id, current_level, proofs_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.myRoleKeyId, asBuf(input.peerPubkey), input.intentId ?? null, input.currentLevel, input.proofs ? JSON.stringify(input.proofs) : null);
    return this.getPeerLevel(id)!;
  }

  getPeerLevel(id: string): MpPeerLevelRow | null {
    const row: any = this.db.prepare(`SELECT * FROM mp_peer_levels WHERE id = ?`).get(id);
    return row ? {
      id: row.id, myRoleKeyId: row.my_role_key_id, peerPubkey: asBytes(row.peer_pubkey)!,
      intentId: row.intent_id, currentLevel: row.current_level,
      proofs: row.proofs_json ? JSON.parse(row.proofs_json) : null,
      lastUpdatedAt: row.last_updated_at,
    } : null;
  }

  listPeerLevels(filter?: { myRoleKeyId?: string; intentId?: string }): MpPeerLevelRow[] {
    const clauses: string[] = []; const params: unknown[] = [];
    if (filter?.myRoleKeyId) { clauses.push("my_role_key_id = ?"); params.push(filter.myRoleKeyId); }
    if (filter?.intentId) { clauses.push("intent_id = ?"); params.push(filter.intentId); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM mp_peer_levels ${where} ORDER BY last_updated_at DESC`).all(...params).map((r: any) => ({
      id: r.id, myRoleKeyId: r.my_role_key_id, peerPubkey: asBytes(r.peer_pubkey)!,
      intentId: r.intent_id, currentLevel: r.current_level,
      proofs: r.proofs_json ? JSON.parse(r.proofs_json) : null,
      lastUpdatedAt: r.last_updated_at,
    }));
  }

  // ---- mailbox ----

  recordInbound(input: Omit<MpInboundMessageRow, "id" | "receivedAt" | "readAt"> & { id?: string }): MpInboundMessageRow {
    const id = input.id ?? uuid("mbi");
    this.db.prepare(`
      INSERT INTO mp_inbound_messages (
        id, recipient_role_key_id, sender_pubkey, thread_id, in_reply_to,
        intent_id_ref, kind, plaintext_json, signature_blob, ttl_expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.recipientRoleKeyId, asBuf(input.senderPubkey),
      asBuf(input.threadId ?? null), asBuf(input.inReplyTo ?? null),
      input.intentIdRef ?? null, input.kind, JSON.stringify(input.plaintext),
      asBuf(input.signature ?? null), input.ttlExpiresAt ?? null,
    );
    return this.getInbound(id)!;
  }

  getInbound(id: string): MpInboundMessageRow | null {
    const row: any = this.db.prepare(`SELECT * FROM mp_inbound_messages WHERE id = ?`).get(id);
    return row ? this.inboundFromRow(row) : null;
  }

  listInbound(filter?: { recipientRoleKeyId?: string; threadId?: Uint8Array; intentIdRef?: string; limit?: number }): MpInboundMessageRow[] {
    const clauses: string[] = []; const params: unknown[] = [];
    if (filter?.recipientRoleKeyId) { clauses.push("recipient_role_key_id = ?"); params.push(filter.recipientRoleKeyId); }
    if (filter?.threadId) { clauses.push("thread_id = ?"); params.push(asBuf(filter.threadId)); }
    if (filter?.intentIdRef) { clauses.push("intent_id_ref = ?"); params.push(filter.intentIdRef); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = filter?.limit ?? 500;
    return this.db.prepare(`SELECT * FROM mp_inbound_messages ${where} ORDER BY received_at DESC LIMIT ?`).all(...params, limit).map((r: any) => this.inboundFromRow(r));
  }

  markInboundRead(id: string): void {
    this.db.prepare(`UPDATE mp_inbound_messages SET read_at = datetime('now') WHERE id = ?`).run(id);
  }

  private inboundFromRow(row: any): MpInboundMessageRow {
    return {
      id: row.id, recipientRoleKeyId: row.recipient_role_key_id,
      senderPubkey: asBytes(row.sender_pubkey)!, threadId: asBytes(row.thread_id),
      inReplyTo: asBytes(row.in_reply_to), intentIdRef: row.intent_id_ref,
      kind: row.kind, plaintext: JSON.parse(row.plaintext_json),
      signature: asBytes(row.signature_blob), ttlExpiresAt: row.ttl_expires_at,
      receivedAt: row.received_at, readAt: row.read_at,
    };
  }

  recordOutbound(input: Omit<MpOutboundMessageRow, "id" | "sentAt"> & { id?: string }): MpOutboundMessageRow {
    const id = input.id ?? uuid("mbo");
    this.db.prepare(`
      INSERT INTO mp_outbound_messages (
        id, sender_role_key_id, recipient_pubkey, thread_id, in_reply_to,
        intent_id_ref, kind, plaintext_json, ciphertext_blob, signature_blob, delivery_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.senderRoleKeyId, asBuf(input.recipientPubkey),
      asBuf(input.threadId ?? null), asBuf(input.inReplyTo ?? null),
      input.intentIdRef ?? null, input.kind, JSON.stringify(input.plaintext),
      asBuf(input.ciphertext ?? null), asBuf(input.signature ?? null), input.deliveryStatus,
    );
    return this.getOutbound(id)!;
  }

  getOutbound(id: string): MpOutboundMessageRow | null {
    const row: any = this.db.prepare(`SELECT * FROM mp_outbound_messages WHERE id = ?`).get(id);
    return row ? this.outboundFromRow(row) : null;
  }

  listOutbound(filter?: { senderRoleKeyId?: string; threadId?: Uint8Array; limit?: number }): MpOutboundMessageRow[] {
    const clauses: string[] = []; const params: unknown[] = [];
    if (filter?.senderRoleKeyId) { clauses.push("sender_role_key_id = ?"); params.push(filter.senderRoleKeyId); }
    if (filter?.threadId) { clauses.push("thread_id = ?"); params.push(asBuf(filter.threadId)); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = filter?.limit ?? 500;
    return this.db.prepare(`SELECT * FROM mp_outbound_messages ${where} ORDER BY sent_at DESC LIMIT ?`).all(...params, limit).map((r: any) => this.outboundFromRow(r));
  }

  private outboundFromRow(row: any): MpOutboundMessageRow {
    return {
      id: row.id, senderRoleKeyId: row.sender_role_key_id,
      recipientPubkey: asBytes(row.recipient_pubkey)!, threadId: asBytes(row.thread_id),
      inReplyTo: asBytes(row.in_reply_to), intentIdRef: row.intent_id_ref,
      kind: row.kind, plaintext: JSON.parse(row.plaintext_json),
      ciphertext: asBytes(row.ciphertext_blob), signature: asBytes(row.signature_blob),
      sentAt: row.sent_at, deliveryStatus: row.delivery_status,
    };
  }

  // ---- match receipts ----

  insertMatchReceipt(input: Omit<MpMatchReceiptRow, "id" | "proposedAt"> & { id?: string }): MpMatchReceiptRow {
    const id = input.id ?? uuid("rcpt");
    this.db.prepare(`
      INSERT INTO mp_match_receipts (
        id, receipt_hash, my_role_key_id, peer_role_pubkey, offer_intent_id, want_intent_id,
        reached_level, fields_revealed_json, contact_handover_json, my_signature, peer_signature,
        status, signed_at, rejected_at, payload_cbor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, asBuf(input.receiptHash), input.myRoleKeyId, asBuf(input.peerRolePubkey),
      input.offerIntentId ?? null, input.wantIntentId ?? null, input.reachedLevel,
      JSON.stringify(input.fieldsRevealed),
      input.contactHandover ? JSON.stringify(input.contactHandover) : null,
      asBuf(input.mySignature ?? null), asBuf(input.peerSignature ?? null),
      input.status, input.signedAt ?? null, input.rejectedAt ?? null,
      asBuf(input.payloadCbor),
    );
    return this.getMatchReceipt(id)!;
  }

  updateMatchReceipt(id: string, input: Partial<MpMatchReceiptRow>): MpMatchReceiptRow | null {
    const fields: string[] = []; const values: unknown[] = [];
    if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
    if (input.mySignature !== undefined) { fields.push("my_signature = ?"); values.push(asBuf(input.mySignature)); }
    if (input.peerSignature !== undefined) { fields.push("peer_signature = ?"); values.push(asBuf(input.peerSignature)); }
    if (input.signedAt !== undefined) { fields.push("signed_at = ?"); values.push(input.signedAt); }
    if (input.rejectedAt !== undefined) { fields.push("rejected_at = ?"); values.push(input.rejectedAt); }
    if (input.contactHandover !== undefined) { fields.push("contact_handover_json = ?"); values.push(input.contactHandover ? JSON.stringify(input.contactHandover) : null); }
    if (input.fieldsRevealed !== undefined) { fields.push("fields_revealed_json = ?"); values.push(JSON.stringify(input.fieldsRevealed)); }
    if (input.payloadCbor !== undefined) { fields.push("payload_cbor = ?"); values.push(asBuf(input.payloadCbor)); }
    if (input.receiptHash !== undefined) { fields.push("receipt_hash = ?"); values.push(asBuf(input.receiptHash)); }
    if (!fields.length) return this.getMatchReceipt(id);
    this.db.prepare(`UPDATE mp_match_receipts SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
    return this.getMatchReceipt(id);
  }

  getMatchReceipt(id: string): MpMatchReceiptRow | null {
    const row: any = this.db.prepare(`SELECT * FROM mp_match_receipts WHERE id = ?`).get(id);
    return row ? this.receiptFromRow(row) : null;
  }

  findMatchReceiptByHash(hash: Uint8Array): MpMatchReceiptRow | null {
    const row: any = this.db.prepare(`SELECT * FROM mp_match_receipts WHERE receipt_hash = ?`).get(asBuf(hash));
    return row ? this.receiptFromRow(row) : null;
  }

  listMatchReceipts(filter?: { myRoleKeyId?: string; status?: MpReceiptStatus; limit?: number }): MpMatchReceiptRow[] {
    const clauses: string[] = []; const params: unknown[] = [];
    if (filter?.myRoleKeyId) { clauses.push("my_role_key_id = ?"); params.push(filter.myRoleKeyId); }
    if (filter?.status) { clauses.push("status = ?"); params.push(filter.status); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = filter?.limit ?? 500;
    return this.db.prepare(`SELECT * FROM mp_match_receipts ${where} ORDER BY proposed_at DESC LIMIT ?`).all(...params, limit).map((r: any) => this.receiptFromRow(r));
  }

  private receiptFromRow(row: any): MpMatchReceiptRow {
    return {
      id: row.id, receiptHash: asBytes(row.receipt_hash)!,
      myRoleKeyId: row.my_role_key_id, peerRolePubkey: asBytes(row.peer_role_pubkey)!,
      offerIntentId: row.offer_intent_id, wantIntentId: row.want_intent_id,
      reachedLevel: row.reached_level, fieldsRevealed: JSON.parse(row.fields_revealed_json),
      contactHandover: row.contact_handover_json ? JSON.parse(row.contact_handover_json) : null,
      mySignature: asBytes(row.my_signature), peerSignature: asBytes(row.peer_signature),
      status: row.status, proposedAt: row.proposed_at, signedAt: row.signed_at,
      rejectedAt: row.rejected_at, payloadCbor: asBytes(row.payload_cbor)!,
    };
  }

  // ---- brokers ----

  upsertBroker(input: Omit<MpKnownBrokerRow, "id" | "lastSeenAt"> & { id?: string }): MpKnownBrokerRow {
    const existing: any = this.db.prepare(`SELECT id FROM mp_known_brokers WHERE broker_pubkey = ?`).get(asBuf(input.brokerPubkey));
    if (existing) {
      this.db.prepare(`
        UPDATE mp_known_brokers SET endpoints_json = ?, verticals_supported_json = ?, policies_json = ?, trust_local = ?, last_seen_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify(input.endpoints), JSON.stringify(input.verticalsSupported), input.policies ? JSON.stringify(input.policies) : null, input.trustLocal ? 1 : 0, existing.id);
      return this.getBroker(existing.id)!;
    }
    const id = input.id ?? uuid("brk");
    this.db.prepare(`
      INSERT INTO mp_known_brokers (id, broker_pubkey, endpoints_json, verticals_supported_json, policies_json, trust_local)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, asBuf(input.brokerPubkey), JSON.stringify(input.endpoints), JSON.stringify(input.verticalsSupported), input.policies ? JSON.stringify(input.policies) : null, input.trustLocal ? 1 : 0);
    return this.getBroker(id)!;
  }

  getBroker(id: string): MpKnownBrokerRow | null {
    const row: any = this.db.prepare(`SELECT * FROM mp_known_brokers WHERE id = ?`).get(id);
    return row ? {
      id: row.id, brokerPubkey: asBytes(row.broker_pubkey)!,
      endpoints: JSON.parse(row.endpoints_json), verticalsSupported: JSON.parse(row.verticals_supported_json),
      policies: row.policies_json ? JSON.parse(row.policies_json) : null,
      trustLocal: row.trust_local === 1, lastSeenAt: row.last_seen_at,
    } : null;
  }

  listBrokers(filter?: { vertical?: string }): MpKnownBrokerRow[] {
    const rows: any[] = this.db.prepare(`SELECT * FROM mp_known_brokers ORDER BY last_seen_at DESC`).all();
    const all = rows.map((row) => ({
      id: row.id, brokerPubkey: asBytes(row.broker_pubkey)!,
      endpoints: JSON.parse(row.endpoints_json), verticalsSupported: JSON.parse(row.verticals_supported_json),
      policies: row.policies_json ? JSON.parse(row.policies_json) : null,
      trustLocal: row.trust_local === 1, lastSeenAt: row.last_seen_at,
    }));
    return filter?.vertical
      ? all.filter((b) => b.verticalsSupported.includes(filter.vertical!))
      : all;
  }

  // ---- vouches and ratings ----

  insertVouchInbound(input: Omit<MpVouchInboundRow, "id" | "receivedAt"> & { id?: string }): MpVouchInboundRow {
    const id = input.id ?? uuid("vchi");
    this.db.prepare(`
      INSERT INTO mp_vouches_inbound (id, my_role_key_id, voucher_pubkey, context, text, signature_blob)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.myRoleKeyId, asBuf(input.voucherPubkey), input.context, input.text, asBuf(input.signature));
    const row: any = this.db.prepare(`SELECT * FROM mp_vouches_inbound WHERE id = ?`).get(id);
    return {
      id: row.id, myRoleKeyId: row.my_role_key_id, voucherPubkey: asBytes(row.voucher_pubkey)!,
      context: row.context, text: row.text, receivedAt: row.received_at, signature: asBytes(row.signature_blob)!,
    };
  }

  insertVouchOutbound(input: Omit<MpVouchOutboundRow, "id" | "signedAt"> & { id?: string }): MpVouchOutboundRow {
    const id = input.id ?? uuid("vcho");
    this.db.prepare(`
      INSERT INTO mp_vouches_outbound (id, voucher_role_key_id, vouchee_pubkey, context, text, expires_at, signature_blob)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.voucherRoleKeyId, asBuf(input.voucheePubkey), input.context, input.text, input.expiresAt ?? null, asBuf(input.signature));
    const row: any = this.db.prepare(`SELECT * FROM mp_vouches_outbound WHERE id = ?`).get(id);
    return {
      id: row.id, voucherRoleKeyId: row.voucher_role_key_id, voucheePubkey: asBytes(row.vouchee_pubkey)!,
      context: row.context, text: row.text, signedAt: row.signed_at, expiresAt: row.expires_at,
      signature: asBytes(row.signature_blob)!,
    };
  }

  insertRating(input: Omit<MpRatingRow, "id" | "signedAt"> & { id?: string }): MpRatingRow {
    const id = input.id ?? uuid("rate");
    this.db.prepare(`
      INSERT INTO mp_ratings (id, match_receipt_id, rater_role_pubkey, score, comment, signature_blob, countersignature_blob, mutual_consent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.matchReceiptId, asBuf(input.raterRolePubkey), input.score, input.comment ?? null, asBuf(input.signature), asBuf(input.countersignature ?? null), input.mutualConsent ? 1 : 0);
    const row: any = this.db.prepare(`SELECT * FROM mp_ratings WHERE id = ?`).get(id);
    return {
      id: row.id, matchReceiptId: row.match_receipt_id,
      raterRolePubkey: asBytes(row.rater_role_pubkey)!,
      score: row.score, comment: row.comment, signedAt: row.signed_at,
      signature: asBytes(row.signature_blob)!,
      countersignature: asBytes(row.countersignature_blob),
      mutualConsent: row.mutual_consent === 1,
    };
  }

  // ---- revocations ----

  insertRevocation(input: Omit<MpRevocationRow, "id" | "observedAt"> & { id?: string }): MpRevocationRow {
    const id = input.id ?? uuid("rvk");
    this.db.prepare(`
      INSERT OR REPLACE INTO mp_revocations (id, revoked_pubkey, revoked_kind, reason, signed_at, root_pubkey, root_signature)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, asBuf(input.revokedPubkey), input.revokedKind, input.reason ?? null, input.signedAt, asBuf(input.rootPubkey), asBuf(input.rootSignature));
    const row: any = this.db.prepare(`SELECT * FROM mp_revocations WHERE id = ?`).get(id);
    return {
      id: row.id, revokedPubkey: asBytes(row.revoked_pubkey)!, revokedKind: row.revoked_kind,
      reason: row.reason, signedAt: row.signed_at, rootPubkey: asBytes(row.root_pubkey)!,
      rootSignature: asBytes(row.root_signature)!, observedAt: row.observed_at,
    };
  }

  isRevoked(pubkey: Uint8Array): boolean {
    const row = this.db.prepare(`SELECT 1 FROM mp_revocations WHERE revoked_pubkey = ?`).get(asBuf(pubkey));
    return row != null;
  }
}
