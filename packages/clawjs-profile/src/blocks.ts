// Block canonicalization, signing and verification.
//
// A Block's `blockId` is `blake3(canonical_payload)`. Two Blocks with the same
// observable state have the same `blockId`; mutating any field changes it.
// Signature is compound (RoleKey || DeviceKey) over the canonical payload.

import { encodeCanonicalCbor, decodeCanonicalCbor, type CborValue } from "@clawjs/mp/cbor";
import {
  blake3Hash, compoundSign, compoundVerify,
  encodeCertificate, decodeCertificate, verifyCertificate,
  type CompoundSignature, type KeyCertificate,
} from "@clawjs/mp/identity";

import type { Block, AudienceSpec, CapabilityRef, TrackingRef, AgentPolicy } from "./types.ts";

// ---- canonicalization ----

function audienceSpecToCbor(spec: AudienceSpec): CborValue {
  const out: Record<string, CborValue> = {
    groups: [...spec.groups],
  };
  if (spec.capabilities && spec.capabilities.length > 0) {
    out.capabilities = spec.capabilities.map(capabilityRefToCbor);
  }
  return out;
}

function audienceSpecFromCbor(value: CborValue): AudienceSpec {
  const obj = value as Record<string, CborValue>;
  const groups = (obj.groups as CborValue[] | undefined ?? []).map((v) => v as string);
  const capabilities = (obj.capabilities as CborValue[] | undefined ?? []).map(capabilityRefFromCbor);
  return { groups, capabilities };
}

function capabilityRefToCbor(c: CapabilityRef): CborValue {
  const out: Record<string, CborValue> = {
    cap_id: c.capId,
    block_id: c.blockId,
    level: c.level,
    issued_at: c.issuedAt,
    expires_at: c.expiresAt,
  };
  if (c.issuedTo) out.issued_to = c.issuedTo;
  if (c.signature) out.signature = c.signature;
  return out;
}

function capabilityRefFromCbor(value: CborValue): CapabilityRef {
  const obj = value as Record<string, CborValue>;
  return {
    capId: obj.cap_id as string,
    blockId: obj.block_id as Uint8Array,
    level: obj.level as string,
    issuedAt: obj.issued_at as number,
    expiresAt: obj.expires_at as number,
    issuedTo: obj.issued_to as Uint8Array | undefined,
    signature: obj.signature as Uint8Array | undefined,
  };
}

function trackingRefToCbor(t: TrackingRef): CborValue {
  const out: Record<string, CborValue> = { module: t.module, record_id: t.recordId };
  if (t.snapshotHash) out.snapshot_hash = t.snapshotHash;
  return out;
}

function trackingRefFromCbor(value: CborValue): TrackingRef {
  const obj = value as Record<string, CborValue>;
  return {
    module: obj.module as string,
    recordId: obj.record_id as string,
    snapshotHash: obj.snapshot_hash as Uint8Array | undefined,
  };
}

function agentPolicyToCbor(p: AgentPolicy): CborValue {
  const out: Record<string, CborValue> = {};
  if (p.scope) out.scope = p.scope;
  if (p.autoPublish) {
    const v: Record<string, CborValue> = { allowed: p.autoPublish.allowed };
    if (p.autoPublish.conditions) v.conditions = p.autoPublish.conditions;
    out.auto_publish = v;
  }
  if (p.autoRespond) {
    const v: Record<string, CborValue> = { allowed: p.autoRespond.allowed };
    if (p.autoRespond.templateId) v.template_id = p.autoRespond.templateId;
    if (p.autoRespond.conditions) v.conditions = p.autoRespond.conditions;
    out.auto_respond = v;
  }
  if (p.autoAcceptInterest) {
    const v: Record<string, CborValue> = { allowed: p.autoAcceptInterest.allowed };
    if (p.autoAcceptInterest.minReputation !== undefined) v.min_reputation = p.autoAcceptInterest.minReputation;
    if (p.autoAcceptInterest.conditions) v.conditions = p.autoAcceptInterest.conditions;
    out.auto_accept_interest = v;
  }
  if (p.autoLowerPrice) {
    const v: Record<string, CborValue> = { allowed: p.autoLowerPrice.allowed };
    if (p.autoLowerPrice.capPercent !== undefined) v.cap_percent = p.autoLowerPrice.capPercent;
    if (p.autoLowerPrice.frequencyDays !== undefined) v.frequency_days = p.autoLowerPrice.frequencyDays;
    out.auto_lower_price = v;
  }
  return out;
}

function agentPolicyFromCbor(value: CborValue): AgentPolicy {
  const obj = value as Record<string, CborValue>;
  const out: AgentPolicy = {};
  if (obj.scope) out.scope = obj.scope as AgentPolicy["scope"];
  if (obj.auto_publish) {
    const v = obj.auto_publish as Record<string, CborValue>;
    out.autoPublish = { allowed: !!v.allowed, conditions: v.conditions as Record<string, CborValue> | undefined };
  }
  if (obj.auto_respond) {
    const v = obj.auto_respond as Record<string, CborValue>;
    out.autoRespond = {
      allowed: !!v.allowed,
      templateId: v.template_id as string | undefined,
      conditions: v.conditions as Record<string, CborValue> | undefined,
    };
  }
  if (obj.auto_accept_interest) {
    const v = obj.auto_accept_interest as Record<string, CborValue>;
    out.autoAcceptInterest = {
      allowed: !!v.allowed,
      minReputation: v.min_reputation as number | undefined,
      conditions: v.conditions as Record<string, CborValue> | undefined,
    };
  }
  if (obj.auto_lower_price) {
    const v = obj.auto_lower_price as Record<string, CborValue>;
    out.autoLowerPrice = {
      allowed: !!v.allowed,
      capPercent: v.cap_percent as number | undefined,
      frequencyDays: v.frequency_days as number | undefined,
    };
  }
  return out;
}

function fieldsPerLevelToCbor(value: Block["fieldsPerLevel"]): CborValue {
  const out: Record<string, CborValue> = {};
  for (const [field, levels] of Object.entries(value)) out[field] = levels.map((v) => v as string);
  return out;
}

function fieldsPerLevelFromCbor(value: CborValue): Block["fieldsPerLevel"] {
  const obj = value as Record<string, CborValue>;
  const out: Block["fieldsPerLevel"] = {};
  for (const [field, levels] of Object.entries(obj)) {
    out[field] = ((levels as CborValue[]) ?? []).map((v) => v as Block["fieldsPerLevel"][string][number]);
  }
  return out;
}

function canonicalPayload(block: Omit<Block, "blockId" | "signature">): CborValue {
  const out: Record<string, CborValue> = {
    archetype: block.archetype,
    vertical: block.vertical,
    audience: audienceSpecToCbor(block.audience),
    fields_per_level: fieldsPerLevelToCbor(block.fieldsPerLevel),
    created_at: block.createdAt,
    updated_at: block.updatedAt,
    version: block.version,
  };
  if (block.trackingRef) out.tracking_ref = trackingRefToCbor(block.trackingRef);
  if (block.overlay) out.overlay = block.overlay;
  if (block.content) out.content = block.content;
  if (block.agentPolicy) out.agent_policy = agentPolicyToCbor(block.agentPolicy);
  if (block.rolePubkey) out.role_pubkey = block.rolePubkey;
  if (block.roleCertificate) out.role_attestation = encodeCertificate(block.roleCertificate);
  return out;
}

export function canonicalizeBlock(input: Omit<Block, "blockId" | "signature">): {
  block: Block; payloadCbor: Uint8Array;
} {
  const payload = canonicalPayload(input);
  const payloadCbor = encodeCanonicalCbor(payload);
  const blockId = blake3Hash(payloadCbor, 32);
  return {
    payloadCbor,
    block: { ...input, blockId },
  };
}

export function signBlock(input: {
  block: Block;
  payloadCbor: Uint8Array;
  rolePrivate: Uint8Array;
  devicePrivate: Uint8Array;
}): CompoundSignature {
  const signature = compoundSign({
    payload: input.payloadCbor,
    rolePrivate: input.rolePrivate,
    devicePrivate: input.devicePrivate,
  });
  input.block.signature = signature;
  return signature;
}

export function verifyBlock(input: {
  block: Block;
  payloadCbor: Uint8Array;
  rolePub: Uint8Array;
  devicePub: Uint8Array;
}): boolean {
  if (!input.block.signature) return false;
  if (input.block.roleCertificate && !verifyCertificate(input.block.roleCertificate)) return false;
  return compoundVerify({
    payload: input.payloadCbor,
    rolePub: input.rolePub,
    devicePub: input.devicePub,
    signature: input.block.signature,
  });
}

// ---- encode / decode for storage and transport ----

export function encodeBlock(block: Block): Uint8Array {
  const out: Record<string, CborValue> = {
    block_id: block.blockId,
    archetype: block.archetype,
    vertical: block.vertical,
    audience: audienceSpecToCbor(block.audience),
    fields_per_level: fieldsPerLevelToCbor(block.fieldsPerLevel),
    created_at: block.createdAt,
    updated_at: block.updatedAt,
    version: block.version,
  };
  if (block.trackingRef) out.tracking_ref = trackingRefToCbor(block.trackingRef);
  if (block.overlay) out.overlay = block.overlay;
  if (block.content) out.content = block.content;
  if (block.agentPolicy) out.agent_policy = agentPolicyToCbor(block.agentPolicy);
  if (block.rolePubkey) out.role_pubkey = block.rolePubkey;
  if (block.roleCertificate) out.role_attestation = encodeCertificate(block.roleCertificate);
  if (block.signature) {
    out.signature = block.signature.role;
    out.device_signature = block.signature.device;
  }
  return encodeCanonicalCbor(out);
}

export function decodeBlock(buf: Uint8Array): { block: Block; payloadCbor: Uint8Array } {
  const obj = decodeCanonicalCbor(buf) as Record<string, CborValue>;
  const roleCertificate = obj.role_attestation
    ? decodeCertificate(obj.role_attestation as Uint8Array)
    : undefined;
  const audience = audienceSpecFromCbor(obj.audience as CborValue);
  const fieldsPerLevel = fieldsPerLevelFromCbor(obj.fields_per_level as CborValue);
  const trackingRef = obj.tracking_ref ? trackingRefFromCbor(obj.tracking_ref) : undefined;
  const agentPolicy = obj.agent_policy ? agentPolicyFromCbor(obj.agent_policy) : undefined;
  const block: Block = {
    blockId: obj.block_id as Uint8Array,
    archetype: obj.archetype as Block["archetype"],
    vertical: obj.vertical as string,
    audience,
    fieldsPerLevel,
    createdAt: obj.created_at as number,
    updatedAt: obj.updated_at as number,
    version: obj.version as number,
    trackingRef,
    overlay: obj.overlay as Record<string, CborValue> | undefined,
    content: obj.content as Record<string, CborValue> | undefined,
    agentPolicy,
    rolePubkey: obj.role_pubkey as Uint8Array | undefined,
    roleCertificate,
  };
  if (obj.signature && obj.device_signature) {
    block.signature = {
      role: obj.signature as Uint8Array,
      device: obj.device_signature as Uint8Array,
    };
  }
  const { payloadCbor } = canonicalizeBlock(block);
  // Validate that block_id is consistent with the canonical payload.
  const a = block.blockId; const b = blake3Hash(payloadCbor, 32);
  if (a.length !== b.length || !a.every((v, i) => v === b[i])) {
    throw new Error("blocks: block_id mismatch on decode (canonicalization drift)");
  }
  return { block, payloadCbor };
}

// ---- helpers ----

export function newBlock(input: Omit<Block, "blockId" | "createdAt" | "updatedAt" | "version" | "signature"> & {
  createdAt?: number; updatedAt?: number; version?: number;
}): { block: Block; payloadCbor: Uint8Array } {
  const now = Math.floor(Date.now() / 1000);
  return canonicalizeBlock({
    ...input,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    version: input.version ?? 1,
  });
}

export function bumpBlockVersion(block: Block, patch: Partial<Block>): { block: Block; payloadCbor: Uint8Array } {
  const updated: Block = {
    ...block,
    ...patch,
    updatedAt: Math.floor(Date.now() / 1000),
    version: block.version + 1,
  };
  // Drop the previous signature; the caller must re-sign.
  delete (updated as { signature?: CompoundSignature }).signature;
  const { block: rebuilt, payloadCbor } = canonicalizeBlock(updated);
  return { block: rebuilt, payloadCbor };
}
