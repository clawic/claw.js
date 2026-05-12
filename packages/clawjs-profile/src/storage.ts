// SQLite-backed storage for the Clawix Profile.
//
// One Profile per database (per device). Multi-device sync (Capa 6 of the
// revamp) is the layer above this — storage stays single-writer and just keeps
// its own state in good order.
//
// Tables:
//   profiles            – the single Profile manifest row (`id=1`).
//   blocks              – one row per Block (encoded canonical bytes).
//   block_content_blobs – out-of-band blobs referenced by blocks (photos, etc.).
//   groups              – owner-driven groups.
//   group_members       – join table for groups ↔ root pubkeys.
//   capabilities        – issued capability tokens (and tokens we received).
//   peer_directory      – known peers (handle ↔ rootPubkey) with trust state.
//   custom_verticals    – JSON Schema definitions for user-defined verticals.

import Database from "better-sqlite3";

import { encodeCanonicalCbor, decodeCanonicalCbor, type CborValue } from "@clawjs/mp/cbor";
import type { Handle, PeerDirectoryEntry } from "@clawjs/mp/handles";

import type { Block, Profile, Group, CapabilityRef, BlockRef } from "./types.ts";
import { encodeBlock, decodeBlock } from "./blocks.ts";
import { encodeCapability, decodeCapability } from "./capabilities.ts";

export interface ProfileStoreOptions {
  databasePath: string;
}

export class ProfileStore {
  readonly db: Database.Database;

  constructor(opts: ProfileStoreOptions) {
    this.db = new Database(opts.databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  close(): void { this.db.close(); }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        root_pubkey BLOB NOT NULL,
        handle_alias TEXT NOT NULL,
        handle_fingerprint TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS blocks (
        block_id BLOB PRIMARY KEY,
        archetype TEXT NOT NULL,
        vertical TEXT NOT NULL,
        encoded BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        version INTEGER NOT NULL,
        owner_root_pubkey BLOB
      );
      CREATE INDEX IF NOT EXISTS idx_blocks_vertical ON blocks(vertical);
      CREATE INDEX IF NOT EXISTS idx_blocks_updated_at ON blocks(updated_at);

      CREATE TABLE IF NOT EXISTS block_content_blobs (
        hash BLOB PRIMARY KEY,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        bytes BLOB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS groups (
        group_id TEXT PRIMARY KEY,
        label TEXT,
        invite_link_token TEXT,
        invite_link_expires_at INTEGER,
        invite_link_max_uses INTEGER,
        invite_link_used_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL,
        root_pubkey BLOB NOT NULL,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (group_id, root_pubkey),
        FOREIGN KEY (group_id) REFERENCES groups(group_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS capabilities (
        cap_id TEXT PRIMARY KEY,
        block_id BLOB NOT NULL,
        level TEXT NOT NULL,
        issued_to BLOB,
        issued_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('issued', 'received')),
        encoded BLOB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_capabilities_block ON capabilities(block_id);

      CREATE TABLE IF NOT EXISTS peer_directory (
        root_pubkey BLOB PRIMARY KEY,
        alias TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        introduced_by BLOB,
        trusted_locally INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS custom_verticals (
        id TEXT PRIMARY KEY,
        schema_json TEXT NOT NULL,
        archetype TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  // ---- profile ----

  loadProfile(): Profile | null {
    const row = this.db.prepare(
      `SELECT root_pubkey, handle_alias, handle_fingerprint, version, updated_at FROM profiles WHERE id = 1`,
    ).get() as undefined | {
      root_pubkey: Buffer; handle_alias: string; handle_fingerprint: string; version: number; updated_at: number;
    };
    if (!row) return null;
    const handle: Handle = {
      alias: row.handle_alias,
      fingerprint: row.handle_fingerprint,
      rootPubkey: new Uint8Array(row.root_pubkey),
    };
    return {
      rootPubkey: handle.rootPubkey,
      handle,
      blocks: this.listBlockRefs(),
      groups: this.listGroups(),
      capabilitiesIssued: this.listCapabilities("issued"),
      version: row.version,
      updatedAt: row.updated_at,
    };
  }

  upsertProfile(input: { rootPubkey: Uint8Array; handle: Handle; version?: number }): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT INTO profiles (id, root_pubkey, handle_alias, handle_fingerprint, version, updated_at)
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        root_pubkey = excluded.root_pubkey,
        handle_alias = excluded.handle_alias,
        handle_fingerprint = excluded.handle_fingerprint,
        version = excluded.version,
        updated_at = excluded.updated_at
    `).run(
      Buffer.from(input.rootPubkey),
      input.handle.alias,
      input.handle.fingerprint,
      input.version ?? 1,
      now,
    );
  }

  // ---- blocks ----

  putBlock(block: Block, ownerRootPubkey: Uint8Array): void {
    const encoded = encodeBlock(block);
    this.db.prepare(`
      INSERT INTO blocks (block_id, archetype, vertical, encoded, created_at, updated_at, version, owner_root_pubkey)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(block_id) DO UPDATE SET
        encoded = excluded.encoded,
        updated_at = excluded.updated_at,
        version = excluded.version
    `).run(
      Buffer.from(block.blockId),
      block.archetype,
      block.vertical,
      Buffer.from(encoded),
      block.createdAt,
      block.updatedAt,
      block.version,
      Buffer.from(ownerRootPubkey),
    );
  }

  getBlock(blockId: Uint8Array): Block | null {
    const row = this.db.prepare(`SELECT encoded FROM blocks WHERE block_id = ?`)
      .get(Buffer.from(blockId)) as { encoded: Buffer } | undefined;
    if (!row) return null;
    return decodeBlock(new Uint8Array(row.encoded)).block;
  }

  deleteBlock(blockId: Uint8Array): void {
    this.db.prepare(`DELETE FROM blocks WHERE block_id = ?`).run(Buffer.from(blockId));
  }

  listBlockRefs(): BlockRef[] {
    const rows = this.db.prepare(
      `SELECT block_id, vertical, archetype, updated_at FROM blocks ORDER BY updated_at DESC`,
    ).all() as { block_id: Buffer; vertical: string; archetype: Block["archetype"]; updated_at: number }[];
    return rows.map((r) => ({
      blockId: new Uint8Array(r.block_id),
      vertical: r.vertical,
      archetype: r.archetype,
      updatedAt: r.updated_at,
    }));
  }

  listBlocks(filter?: { vertical?: string }): Block[] {
    const rows = filter?.vertical
      ? this.db.prepare(`SELECT encoded FROM blocks WHERE vertical = ? ORDER BY updated_at DESC`).all(filter.vertical)
      : this.db.prepare(`SELECT encoded FROM blocks ORDER BY updated_at DESC`).all();
    return (rows as { encoded: Buffer }[]).map((r) => decodeBlock(new Uint8Array(r.encoded)).block);
  }

  // ---- blob storage ----

  putBlob(input: { hash: Uint8Array; mime: string; bytes: Uint8Array }): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO block_content_blobs (hash, mime, size, bytes) VALUES (?, ?, ?, ?)
    `).run(Buffer.from(input.hash), input.mime, input.bytes.length, Buffer.from(input.bytes));
  }

  getBlob(hash: Uint8Array): { mime: string; bytes: Uint8Array } | null {
    const row = this.db.prepare(`SELECT mime, bytes FROM block_content_blobs WHERE hash = ?`)
      .get(Buffer.from(hash)) as { mime: string; bytes: Buffer } | undefined;
    return row ? { mime: row.mime, bytes: new Uint8Array(row.bytes) } : null;
  }

  // ---- groups ----

  putGroup(group: Group): void {
    this.db.prepare(`
      INSERT INTO groups (group_id, label, invite_link_token, invite_link_expires_at, invite_link_max_uses, invite_link_used_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(group_id) DO UPDATE SET
        label = excluded.label,
        invite_link_token = excluded.invite_link_token,
        invite_link_expires_at = excluded.invite_link_expires_at,
        invite_link_max_uses = excluded.invite_link_max_uses,
        invite_link_used_count = excluded.invite_link_used_count,
        updated_at = excluded.updated_at
    `).run(
      group.id,
      group.label ?? null,
      group.inviteLink?.token ?? null,
      group.inviteLink?.expiresAt ?? null,
      group.inviteLink?.maxUses ?? null,
      group.inviteLink?.usedCount ?? 0,
      group.createdAt,
      group.updatedAt,
    );
    const tx = this.db.transaction((members: Uint8Array[]) => {
      this.db.prepare(`DELETE FROM group_members WHERE group_id = ?`).run(group.id);
      const stmt = this.db.prepare(`INSERT INTO group_members (group_id, root_pubkey, added_at) VALUES (?, ?, ?)`);
      const now = Math.floor(Date.now() / 1000);
      for (const m of members) stmt.run(group.id, Buffer.from(m), now);
    });
    tx(group.members);
  }

  getGroup(id: string): Group | null {
    const row = this.db.prepare(`SELECT * FROM groups WHERE group_id = ?`).get(id) as {
      group_id: string; label: string | null;
      invite_link_token: string | null; invite_link_expires_at: number | null;
      invite_link_max_uses: number | null; invite_link_used_count: number | null;
      created_at: number; updated_at: number;
    } | undefined;
    if (!row) return null;
    const members = this.db.prepare(`SELECT root_pubkey FROM group_members WHERE group_id = ?`).all(id) as { root_pubkey: Buffer }[];
    return {
      id: row.group_id,
      label: row.label ?? undefined,
      members: members.map((m) => new Uint8Array(m.root_pubkey)),
      inviteLink: row.invite_link_token ? {
        token: row.invite_link_token,
        issuedAt: row.created_at,
        expiresAt: row.invite_link_expires_at ?? 0,
        maxUses: row.invite_link_max_uses ?? undefined,
        usedCount: row.invite_link_used_count ?? 0,
      } : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listGroups(): Group[] {
    const ids = (this.db.prepare(`SELECT group_id FROM groups`).all() as { group_id: string }[]).map((r) => r.group_id);
    return ids.map((id) => this.getGroup(id)).filter((g): g is Group => !!g);
  }

  deleteGroup(id: string): void {
    this.db.prepare(`DELETE FROM groups WHERE group_id = ?`).run(id);
  }

  // ---- capabilities ----

  putCapability(cap: CapabilityRef, direction: "issued" | "received"): void {
    const encoded = encodeCapability(cap);
    this.db.prepare(`
      INSERT INTO capabilities (cap_id, block_id, level, issued_to, issued_at, expires_at, direction, encoded)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cap_id) DO UPDATE SET
        expires_at = excluded.expires_at,
        encoded = excluded.encoded
    `).run(
      cap.capId,
      Buffer.from(cap.blockId),
      cap.level,
      cap.issuedTo ? Buffer.from(cap.issuedTo) : null,
      cap.issuedAt,
      cap.expiresAt,
      direction,
      Buffer.from(encoded),
    );
  }

  listCapabilities(direction?: "issued" | "received"): CapabilityRef[] {
    const rows = direction
      ? this.db.prepare(`SELECT encoded FROM capabilities WHERE direction = ?`).all(direction)
      : this.db.prepare(`SELECT encoded FROM capabilities`).all();
    return (rows as { encoded: Buffer }[]).map((r) => decodeCapability(new Uint8Array(r.encoded)));
  }

  getCapability(capId: string): CapabilityRef | null {
    const row = this.db.prepare(`SELECT encoded FROM capabilities WHERE cap_id = ?`).get(capId) as { encoded: Buffer } | undefined;
    return row ? decodeCapability(new Uint8Array(row.encoded)) : null;
  }

  deleteExpiredCapabilities(now: number = Math.floor(Date.now() / 1000)): number {
    const result = this.db.prepare(`DELETE FROM capabilities WHERE expires_at < ?`).run(now);
    return result.changes;
  }

  // ---- peer directory ----

  upsertPeer(input: { handle: Handle; introducedBy?: Uint8Array; trustedLocally?: boolean }): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT INTO peer_directory (root_pubkey, alias, fingerprint, first_seen_at, last_seen_at, introduced_by, trusted_locally)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(root_pubkey) DO UPDATE SET
        alias = excluded.alias,
        last_seen_at = excluded.last_seen_at,
        trusted_locally = COALESCE(excluded.trusted_locally, peer_directory.trusted_locally)
    `).run(
      Buffer.from(input.handle.rootPubkey),
      input.handle.alias,
      input.handle.fingerprint,
      now,
      now,
      input.introducedBy ? Buffer.from(input.introducedBy) : null,
      input.trustedLocally ? 1 : 0,
    );
  }

  listPeers(): PeerDirectoryEntry[] {
    const rows = this.db.prepare(`SELECT * FROM peer_directory`).all() as {
      root_pubkey: Buffer; alias: string; fingerprint: string;
      first_seen_at: number; last_seen_at: number;
      introduced_by: Buffer | null; trusted_locally: number;
    }[];
    return rows.map((r) => ({
      handle: { alias: r.alias, fingerprint: r.fingerprint, rootPubkey: new Uint8Array(r.root_pubkey) },
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
      introducedBy: r.introduced_by ? new Uint8Array(r.introduced_by) : undefined,
      trustedLocally: !!r.trusted_locally,
    }));
  }

  resolvePeerByFingerprint(fingerprint: string): PeerDirectoryEntry | null {
    const row = this.db.prepare(`SELECT * FROM peer_directory WHERE fingerprint = ?`).get(fingerprint) as {
      root_pubkey: Buffer; alias: string; fingerprint: string;
      first_seen_at: number; last_seen_at: number;
      introduced_by: Buffer | null; trusted_locally: number;
    } | undefined;
    if (!row) return null;
    return {
      handle: { alias: row.alias, fingerprint: row.fingerprint, rootPubkey: new Uint8Array(row.root_pubkey) },
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      introducedBy: row.introduced_by ? new Uint8Array(row.introduced_by) : undefined,
      trustedLocally: !!row.trusted_locally,
    };
  }

  // ---- custom verticals ----

  putCustomVertical(input: { id: string; schemaJson: string; archetype: "tracked" | "standalone" }): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT INTO custom_verticals (id, schema_json, archetype, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        schema_json = excluded.schema_json,
        archetype = excluded.archetype,
        updated_at = excluded.updated_at
    `).run(input.id, input.schemaJson, input.archetype, now, now);
  }

  getCustomVertical(id: string): { id: string; schemaJson: string; archetype: "tracked" | "standalone" } | null {
    const row = this.db.prepare(`SELECT id, schema_json, archetype FROM custom_verticals WHERE id = ?`).get(id) as {
      id: string; schema_json: string; archetype: "tracked" | "standalone";
    } | undefined;
    return row ? { id: row.id, schemaJson: row.schema_json, archetype: row.archetype } : null;
  }

  listCustomVerticals(): { id: string; schemaJson: string; archetype: "tracked" | "standalone" }[] {
    const rows = this.db.prepare(`SELECT id, schema_json, archetype FROM custom_verticals ORDER BY id`).all() as {
      id: string; schema_json: string; archetype: "tracked" | "standalone";
    }[];
    return rows.map((r) => ({ id: r.id, schemaJson: r.schema_json, archetype: r.archetype }));
  }
}

// ---- helpers ----

export function encodeProfileManifest(profile: Profile): Uint8Array {
  const out: Record<string, CborValue> = {
    root_pubkey: profile.rootPubkey,
    handle: {
      alias: profile.handle.alias,
      fingerprint: profile.handle.fingerprint,
      root_pubkey: profile.handle.rootPubkey,
    },
    blocks: profile.blocks.map((b) => ({
      block_id: b.blockId,
      vertical: b.vertical,
      archetype: b.archetype,
      updated_at: b.updatedAt,
    })),
    groups: profile.groups.map((g) => ({
      id: g.id,
      members: g.members,
      label: g.label ?? "",
      created_at: g.createdAt,
      updated_at: g.updatedAt,
    })),
    capabilities_issued: profile.capabilitiesIssued.map((c) => c.capId),
    version: profile.version,
    updated_at: profile.updatedAt,
  };
  return encodeCanonicalCbor(out);
}

export function decodeProfileManifest(buf: Uint8Array): Pick<Profile, "rootPubkey" | "handle" | "version" | "updatedAt"> {
  const obj = decodeCanonicalCbor(buf) as Record<string, CborValue>;
  const handleObj = obj.handle as Record<string, CborValue>;
  return {
    rootPubkey: obj.root_pubkey as Uint8Array,
    handle: {
      alias: handleObj.alias as string,
      fingerprint: handleObj.fingerprint as string,
      rootPubkey: handleObj.root_pubkey as Uint8Array,
    },
    version: obj.version as number,
    updatedAt: obj.updated_at as number,
  };
}
