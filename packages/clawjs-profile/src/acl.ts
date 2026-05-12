// Visibility resolution: given a viewer (Root pubkey) and the owner's groups,
// decide which fields of a Block the viewer is allowed to read.
//
// Two checks:
//   1. Group membership — is the viewer in any of the block's `audience.groups`?
//      If not, no fields are visible at all.
//   2. Per-field level — for each field, the block declares which audience
//      levels can read it. If the viewer's set of "memberships" intersects the
//      field's allowed levels, the field is visible.

import type { Block, Group, AudienceLevel, CapabilityRef } from "./types.ts";
import { AUDIENCE_BREADTH, BUILTIN_AUDIENCE_LEVELS } from "./types.ts";

export interface AclQuery {
  viewerRootPubkey: Uint8Array;
  block: Block;
  ownerGroups: Group[];
  /** Optional capability tokens the viewer presented. */
  presentedCapabilities?: CapabilityRef[];
  /** When evaluating for the owner themselves (full access). */
  isOwner?: boolean;
  now?: number;
}

export interface AclResult {
  /** True if the viewer can see *anything* on the block (membership match). */
  canRead: boolean;
  /** Effective audience levels the viewer holds toward this owner. */
  effectiveLevels: AudienceLevel[];
  /** Allowed field names. */
  allowedFields: string[];
  /** Denied field names (declared on the block but not granted to this viewer). */
  deniedFields: string[];
  /** Audience levels granted via capabilities, if any. */
  capabilityLevels: string[];
}

export function resolveAcl(query: AclQuery): AclResult {
  const block = query.block;
  const now = query.now ?? Math.floor(Date.now() / 1000);
  if (query.isOwner) {
    const all = Object.keys(block.fieldsPerLevel);
    return {
      canRead: true,
      effectiveLevels: [...BUILTIN_AUDIENCE_LEVELS],
      allowedFields: all,
      deniedFields: [],
      capabilityLevels: [],
    };
  }
  const viewerLevels = membershipsForViewer(query.viewerRootPubkey, query.ownerGroups);
  const isInAudience = block.audience.groups.some((g) =>
    g === "public" || viewerLevels.has(g),
  );
  // Capability checks: any matching, non-expired, recipient-bound capability counts.
  const validCaps = (query.presentedCapabilities ?? []).filter((c) =>
    bytesEqual(c.blockId, block.blockId) &&
    c.expiresAt >= now &&
    (!c.issuedTo || bytesEqual(c.issuedTo, query.viewerRootPubkey)),
  );
  const capabilityLevels = validCaps.map((c) => c.level);
  if (!isInAudience && validCaps.length === 0) {
    return {
      canRead: false,
      effectiveLevels: [],
      allowedFields: [],
      deniedFields: Object.keys(block.fieldsPerLevel),
      capabilityLevels,
    };
  }
  // Public viewer => only the public level applies. Otherwise add public for
  // breadth coverage.
  const effectiveSet = new Set<AudienceLevel>(["public"]);
  for (const lvl of viewerLevels) {
    if (BUILTIN_AUDIENCE_LEVELS.includes(lvl as AudienceLevel)) {
      effectiveSet.add(lvl as AudienceLevel);
    }
  }
  const effectiveLevels = [...effectiveSet];
  const allowed: string[] = [];
  const denied: string[] = [];
  for (const [field, levels] of Object.entries(block.fieldsPerLevel)) {
    const fieldLevels = new Set<string>(levels);
    const granted = effectiveLevels.some((l) => fieldLevels.has(l)) ||
                    capabilityLevels.some((l) => fieldLevels.has(l));
    if (granted) allowed.push(field);
    else denied.push(field);
  }
  return {
    canRead: true,
    effectiveLevels,
    allowedFields: allowed,
    deniedFields: denied,
    capabilityLevels,
  };
}

/** Project a Block into the subset of fields a viewer is allowed to see. */
export function projectBlock(query: AclQuery): { block: Block; acl: AclResult } {
  const acl = resolveAcl(query);
  const filterRecord = <V>(rec: Record<string, V> | undefined): Record<string, V> | undefined => {
    if (!rec) return undefined;
    const out: Record<string, V> = {};
    for (const f of acl.allowedFields) {
      if (f in rec) out[f] = rec[f];
    }
    return Object.keys(out).length === 0 ? undefined : out;
  };
  const block = query.block;
  return {
    acl,
    block: {
      ...block,
      overlay: filterRecord(block.overlay),
      content: filterRecord(block.content),
    },
  };
}

// ---- membership ----

function membershipsForViewer(viewerRootPubkey: Uint8Array, groups: Group[]): Set<string> {
  const out = new Set<string>();
  out.add("public");
  for (const g of groups) {
    if (g.members.some((m) => bytesEqual(m, viewerRootPubkey))) {
      out.add(g.id);
    }
  }
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Re-export for caller convenience.
export { AUDIENCE_BREADTH };
