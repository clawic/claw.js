// Profile and peer routes under the registered public API prefix.
//
// Mounted on the existing Fastify daemon. The route bundle takes a
// `ProfileDeps` object so it doesn't reach into `IndexStore` directly; that
// makes it trivial to swap the backing implementation (real ProfileStore vs
// fake test stub) and to keep the daemon module-agnostic.

import type { FastifyInstance } from "fastify";
import { clawPublicApiPrefix } from "@clawjs/core";

import type {
  Block, CapabilityRef, Group, Profile,
} from "@clawjs/profile";
import type { Handle } from "@clawjs/marketplace/handles";

const INDEX_API = clawPublicApiPrefix;

export interface ProfileDeps {
  init(input: { mnemonic?: string; passphrase?: string; alias: string }): Promise<{ profile: Profile; mnemonic: string }>;
  getProfile(): Profile | null;
  setHandle(alias: string): Profile;
  createBlock(input: { vertical: string; archetype: "tracked" | "standalone";
    content?: Record<string, unknown>; overlay?: Record<string, unknown>;
    audience: { groups: string[] };
    fieldsPerLevel: Record<string, string[]>;
    trackingRef?: { module: string; recordId: string };
  }): Block;
  updateBlock(blockId: string, patch: Partial<Block>): Block;
  deleteBlock(blockId: string): void;
  listBlocks(filter?: { vertical?: string }): Block[];
  getBlock(blockId: string): Block | null;

  listGroups(): Group[];
  createGroup(id: string, label?: string): Group;
  addGroupMember(id: string, rootPubkeyHex: string): Group;
  removeGroupMember(id: string, rootPubkeyHex: string): Group;
  issueInviteLink(id: string, ttlSeconds?: number, maxUses?: number): { token: string; expiresAt: number };

  issueCapability(input: { blockId: string; level: string; issuedToHex?: string; ttlSeconds?: number }): CapabilityRef;
  verifyCapability(capId: string): boolean;

  listPeers(): { handle: Handle; trustedLocally: boolean }[];
  pairByFingerprint(input: { pairingLink: string }): Handle;
}

const PROFILE_PREFIX = `${INDEX_API}/profile`;
const PEERS_PREFIX = `${INDEX_API}/peers`;

export function registerProfileRoutes(app: FastifyInstance, deps: ProfileDeps): void {
  app.post(`${PROFILE_PREFIX}/init`, async (req, reply) => {
    const body = (req.body ?? {}) as { mnemonic?: string; passphrase?: string; alias?: string };
    if (!body.alias) return reply.code(400).send({ error: "alias required" });
    const { profile, mnemonic } = await deps.init({ mnemonic: body.mnemonic, passphrase: body.passphrase, alias: body.alias });
    return { profile: serializeProfile(profile), mnemonic };
  });

  app.get(`${PROFILE_PREFIX}/me`, async () => {
    const p = deps.getProfile();
    return p ? { profile: serializeProfile(p) } : { profile: null };
  });

  app.post(`${PROFILE_PREFIX}/handle`, async (req, reply) => {
    const body = (req.body ?? {}) as { alias?: string };
    if (!body.alias) return reply.code(400).send({ error: "alias required" });
    const profile = deps.setHandle(body.alias);
    return { profile: serializeProfile(profile) };
  });

  // ---- blocks ----

  app.get(`${PROFILE_PREFIX}/blocks`, async (req) => {
    const query = (req.query ?? {}) as { vertical?: string };
    return { blocks: deps.listBlocks(query.vertical ? { vertical: query.vertical } : undefined).map(serializeBlock) };
  });

  app.post(`${PROFILE_PREFIX}/blocks`, async (req, reply) => {
    const body = (req.body ?? {}) as Parameters<ProfileDeps["createBlock"]>[0];
    if (!body.vertical) return reply.code(400).send({ error: "vertical required" });
    if (!body.archetype) return reply.code(400).send({ error: "archetype required" });
    if (!body.audience) return reply.code(400).send({ error: "audience required" });
    if (!body.fieldsPerLevel) return reply.code(400).send({ error: "fieldsPerLevel required" });
    const block = deps.createBlock(body);
    return { block: serializeBlock(block) };
  });

  app.get(`${PROFILE_PREFIX}/blocks/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const block = deps.getBlock(id);
    if (!block) return reply.code(404).send({ error: "not found" });
    return { block: serializeBlock(block) };
  });

  app.patch(`${PROFILE_PREFIX}/blocks/:id`, async (req) => {
    const { id } = req.params as { id: string };
    const patch = (req.body ?? {}) as Partial<Block>;
    const block = deps.updateBlock(id, patch);
    return { block: serializeBlock(block) };
  });

  app.delete(`${PROFILE_PREFIX}/blocks/:id`, async (req) => {
    const { id } = req.params as { id: string };
    deps.deleteBlock(id);
    return { ok: true };
  });

  // ---- groups ----

  app.get(`${PROFILE_PREFIX}/groups`, async () => ({
    groups: deps.listGroups().map(serializeGroup),
  }));

  app.post(`${PROFILE_PREFIX}/groups`, async (req, reply) => {
    const body = (req.body ?? {}) as { id?: string; label?: string };
    if (!body.id) return reply.code(400).send({ error: "id required" });
    return { group: serializeGroup(deps.createGroup(body.id, body.label)) };
  });

  app.post(`${PROFILE_PREFIX}/groups/:id/members`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { rootPubkey?: string };
    if (!body.rootPubkey) return reply.code(400).send({ error: "rootPubkey required" });
    return { group: serializeGroup(deps.addGroupMember(id, body.rootPubkey)) };
  });

  app.delete(`${PROFILE_PREFIX}/groups/:id/members/:pubkey`, async (req) => {
    const { id, pubkey } = req.params as { id: string; pubkey: string };
    return { group: serializeGroup(deps.removeGroupMember(id, pubkey)) };
  });

  app.post(`${PROFILE_PREFIX}/groups/:id/invite-link`, async (req) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { ttlSeconds?: number; maxUses?: number };
    const link = deps.issueInviteLink(id, body.ttlSeconds, body.maxUses);
    return { link };
  });

  app.post(`${PROFILE_PREFIX}/invite-link/accept`, async (req, reply) => {
    const body = (req.body ?? {}) as { pairingLink?: string };
    if (!body.pairingLink) return reply.code(400).send({ error: "pairingLink required" });
    const handle = deps.pairByFingerprint({ pairingLink: body.pairingLink });
    return { handle: serializeHandle(handle) };
  });

  // ---- capabilities ----

  app.post(`${PROFILE_PREFIX}/capabilities/issue`, async (req, reply) => {
    const body = (req.body ?? {}) as { blockId?: string; level?: string; issuedToHex?: string; ttlSeconds?: number };
    if (!body.blockId || !body.level) return reply.code(400).send({ error: "blockId and level required" });
    const cap = deps.issueCapability({
      blockId: body.blockId, level: body.level, issuedToHex: body.issuedToHex, ttlSeconds: body.ttlSeconds,
    });
    return { capability: serializeCapability(cap) };
  });

  app.post(`${PROFILE_PREFIX}/capabilities/verify`, async (req, reply) => {
    const body = (req.body ?? {}) as { capId?: string };
    if (!body.capId) return reply.code(400).send({ error: "capId required" });
    return { ok: deps.verifyCapability(body.capId) };
  });

  // ---- peers ----

  app.get(`${PEERS_PREFIX}/directory`, async () => ({
    peers: deps.listPeers().map((p) => ({ handle: serializeHandle(p.handle), trustedLocally: p.trustedLocally })),
  }));

  app.post(`${PEERS_PREFIX}/pair-by-fingerprint`, async (req, reply) => {
    const body = (req.body ?? {}) as { pairingLink?: string };
    if (!body.pairingLink) return reply.code(400).send({ error: "pairingLink required" });
    const handle = deps.pairByFingerprint({ pairingLink: body.pairingLink });
    return { handle: serializeHandle(handle) };
  });
}

// ---- serialisation ----

function toHex(buf: Uint8Array | undefined): string | undefined {
  if (!buf) return undefined;
  return Buffer.from(buf).toString("hex");
}

function serializeProfile(p: Profile): Record<string, unknown> {
  return {
    rootPubkey: toHex(p.rootPubkey),
    handle: serializeHandle(p.handle),
    blocks: p.blocks.map((b) => ({
      blockId: toHex(b.blockId), vertical: b.vertical, archetype: b.archetype, updatedAt: b.updatedAt,
    })),
    groups: p.groups.map(serializeGroup),
    version: p.version,
    updatedAt: p.updatedAt,
  };
}

function serializeBlock(b: Block): Record<string, unknown> {
  return {
    blockId: toHex(b.blockId),
    archetype: b.archetype,
    vertical: b.vertical,
    audience: { groups: b.audience.groups },
    fieldsPerLevel: b.fieldsPerLevel,
    trackingRef: b.trackingRef,
    overlay: b.overlay,
    content: b.content,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    version: b.version,
  };
}

function serializeGroup(g: Group): Record<string, unknown> {
  return {
    id: g.id,
    label: g.label,
    members: g.members.map((m) => toHex(m)),
    inviteLink: g.inviteLink,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

function serializeCapability(c: CapabilityRef): Record<string, unknown> {
  return {
    capId: c.capId,
    blockId: toHex(c.blockId),
    level: c.level,
    issuedTo: toHex(c.issuedTo),
    issuedAt: c.issuedAt,
    expiresAt: c.expiresAt,
  };
}

function serializeHandle(h: Handle): Record<string, unknown> {
  return { alias: h.alias, fingerprint: h.fingerprint, rootPubkey: toHex(h.rootPubkey) };
}
