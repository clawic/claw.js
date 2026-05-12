// Group management for the Clawix Profile.
//
// Groups are owner-driven: only the Profile owner can add or remove members.
// The built-in groups `family`, `friends`, `inner-circle` are private (no
// invite link, members are added manually after pairing). `audience` accepts a
// public invite link so anyone with the link can opt-in. `custom-<slug>` is a
// user-defined bucket that follows the same private semantics as `family`.

import { randomBytes } from "node:crypto";

import { blake3Hash } from "@clawjs/mp/identity";

import type { Group, GroupInviteLink, AudienceLevel } from "./types.ts";
import { BUILTIN_AUDIENCE_LEVELS } from "./types.ts";

const CUSTOM_GROUP_RE = /^custom-[a-z0-9][a-z0-9_-]{0,31}$/;

export function isBuiltinGroupId(id: string): id is AudienceLevel {
  return (BUILTIN_AUDIENCE_LEVELS as readonly string[]).includes(id);
}

export function isValidGroupId(id: string): boolean {
  if (isBuiltinGroupId(id)) return true;
  return CUSTOM_GROUP_RE.test(id);
}

export function createGroup(input: { id: AudienceLevel | string; label?: string }): Group {
  if (!isValidGroupId(input.id)) {
    throw new Error(`groups: invalid group id "${input.id}" (built-in or custom-<slug>)`);
  }
  const now = Math.floor(Date.now() / 1000);
  return { id: input.id, label: input.label, members: [], createdAt: now, updatedAt: now };
}

export function addMember(group: Group, rootPubkey: Uint8Array): Group {
  if (rootPubkey.length !== 32) throw new Error("groups: rootPubkey must be 32 bytes");
  const exists = group.members.some((m) => bytesEqual(m, rootPubkey));
  if (exists) return group;
  return {
    ...group,
    members: [...group.members, rootPubkey],
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

export function removeMember(group: Group, rootPubkey: Uint8Array): Group {
  return {
    ...group,
    members: group.members.filter((m) => !bytesEqual(m, rootPubkey)),
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

export function isMember(group: Group, rootPubkey: Uint8Array): boolean {
  return group.members.some((m) => bytesEqual(m, rootPubkey));
}

// ---- invite links ----

export interface IssueInviteLinkInput {
  group: Group;
  ttlSeconds?: number;
  maxUses?: number;
}

export function issueInviteLink(input: IssueInviteLinkInput): GroupInviteLink {
  if (input.group.id !== "audience" && !input.group.id.startsWith("custom-")) {
    throw new Error("groups: invite links only allowed for 'audience' and custom groups");
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + (input.ttlSeconds ?? 60 * 60 * 24 * 30); // 30 days default
  const tokenBytes = randomBytes(24);
  return {
    token: base64Url(tokenBytes),
    issuedAt,
    expiresAt,
    maxUses: input.maxUses,
    usedCount: 0,
  };
}

export function consumeInviteLink(link: GroupInviteLink): GroupInviteLink {
  if (Math.floor(Date.now() / 1000) > link.expiresAt) {
    throw new Error("groups: invite link expired");
  }
  if (link.maxUses && link.usedCount >= link.maxUses) {
    throw new Error("groups: invite link exhausted");
  }
  return { ...link, usedCount: link.usedCount + 1 };
}

export function inviteLinkFingerprint(link: GroupInviteLink): string {
  // Short identifier suitable for logs / UI badges. Don't use as a security token.
  const tokenBytes = fromBase64Url(link.token);
  const fp = blake3Hash(tokenBytes, 6);
  return base64Url(fp);
}

// ---- bytes helpers ----

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function base64Url(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return new Uint8Array(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64"));
}
