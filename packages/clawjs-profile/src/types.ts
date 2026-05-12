// Core types for the Clawix Profile namespace.
//
// A Profile is a self-hosted namespace for one human. It lives entirely on
// devices owned by that person (no central server), references content stored
// in the local SQLite + blob storage, and is the unit that surfaces to the
// network as feed entries, marketplace listings, and chat endpoints.
//
// The data model is deliberately small: Profile, Block, Group, Capability,
// PeerDirectoryEntry. Each Block declares an `audience` (which groups can see
// it) and `fieldsPerLevel` (which fields are visible at which audience tier).

import type { CborValue } from "@clawjs/mp/cbor";
import type { CompoundSignature, KeyCertificate } from "@clawjs/mp/identity";
import type { Handle } from "@clawjs/mp/handles";

// ---- audience model ----

/**
 * Audience levels are ordered: a level always includes everyone at a wider
 * level. `public` is the widest, `inner-circle` the most restricted of the
 * defaults. `custom-*` IDs can shadow either tier — the owner decides where
 * they sit by the `groups` array on the block, not by the level constant.
 */
export type AudienceLevel =
  | "public"
  | "audience"
  | "friends"
  | "family"
  | "inner-circle";

export const BUILTIN_AUDIENCE_LEVELS: readonly AudienceLevel[] = Object.freeze([
  "public",
  "audience",
  "friends",
  "family",
  "inner-circle",
]);

/** Lower index = broader audience. */
export const AUDIENCE_BREADTH: Record<AudienceLevel, number> = Object.freeze({
  public: 0,
  audience: 1,
  friends: 2,
  family: 3,
  "inner-circle": 4,
});

export interface AudienceSpec {
  /**
   * Which groups can see this block. Built-in IDs are the AudienceLevel
   * values; custom group IDs (`custom-<slug>`) are allowed as long as the
   * Profile defines them.
   */
  groups: (AudienceLevel | string)[];
  /** Capabilities the owner has pre-issued for this block. */
  capabilities?: CapabilityRef[];
}

// ---- groups ----

export interface Group {
  id: AudienceLevel | string;        // built-in id or `custom-<slug>`
  label?: string;                    // optional human-friendly name
  members: Uint8Array[];             // root pubkeys (32 bytes each)
  inviteLink?: GroupInviteLink;      // optional auto-join link (used by `audience`)
  createdAt: number;
  updatedAt: number;
}

export interface GroupInviteLink {
  token: string;                     // opaque URL-safe token
  issuedAt: number;
  expiresAt: number;
  maxUses?: number;
  usedCount: number;
  signature?: Uint8Array;            // signed by the owner's RoleKey
}

// ---- capabilities ----

export interface CapabilityRef {
  capId: string;                     // base32 truncated blake3 of the canonical capability
  blockId: Uint8Array;               // 32 bytes
  level: string;                     // e.g. "interested-in-listing", "share-album-24h"
  issuedTo?: Uint8Array;             // root pubkey of the recipient (optional for one-shot)
  issuedAt: number;
  expiresAt: number;
  signature?: Uint8Array;            // RoleKey signature over canonical bytes
}

// ---- blocks ----

export type BlockArchetype = "tracked" | "standalone";

export interface TrackingRef {
  module: string;                    // e.g. "vehicle", "home", "possessions"
  recordId: string;                  // module-local record id
  snapshotHash?: Uint8Array;         // blake3 of the snapshot payload at publish time
}

export interface AgentPolicy {
  scope?: "block" | "group" | "global";
  autoPublish?: { allowed: boolean; conditions?: Record<string, CborValue> };
  autoRespond?: { allowed: boolean; templateId?: string; conditions?: Record<string, CborValue> };
  autoAcceptInterest?: { allowed: boolean; minReputation?: number; conditions?: Record<string, CborValue> };
  autoLowerPrice?: { allowed: boolean; capPercent?: number; frequencyDays?: number };
}

export interface Block {
  blockId: Uint8Array;                                  // 32-byte blake3 of canonical payload
  archetype: BlockArchetype;
  vertical: string;                                     // 'post' | 'item' | 'home' | 'vehicle' | 'real-estate/v1' | ...
  trackingRef?: TrackingRef;                            // archetype === 'tracked' only
  overlay?: Record<string, CborValue>;                  // commerce overlay over the tracked record
  content?: Record<string, CborValue>;                  // archetype === 'standalone' only
  audience: AudienceSpec;
  fieldsPerLevel: Record<string, AudienceLevel[]>;      // per-field min-level visibility list
  agentPolicy?: AgentPolicy;
  createdAt: number;
  updatedAt: number;
  version: number;
  rolePubkey?: Uint8Array;
  roleCertificate?: KeyCertificate;
  signature?: CompoundSignature;
}

// ---- profile manifest ----

export interface BlockRef {
  blockId: Uint8Array;
  vertical: string;
  archetype: BlockArchetype;
  updatedAt: number;
}

export interface Profile {
  rootPubkey: Uint8Array;
  handle: Handle;
  blocks: BlockRef[];
  groups: Group[];
  capabilitiesIssued: CapabilityRef[];
  version: number;
  updatedAt: number;
  signature?: CompoundSignature;
}

// ---- helpers consumers re-export ----

export type { Handle } from "@clawjs/mp/handles";
export type { CborValue } from "@clawjs/mp/cbor";
export type { CompoundSignature, KeyCertificate } from "@clawjs/mp/identity";
