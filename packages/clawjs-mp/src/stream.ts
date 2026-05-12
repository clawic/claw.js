// Stream upgrade primitives for mp/1.0.0. Phase 4 will wire this up against
// Iroh bidirectional streams. For now we provide a structured invite/accept
// message pair so callers can move synchronous chats between mailboxes and
// streams without changing data shape.

import { encodeCanonicalCbor, decodeCanonicalCbor, type CborValue } from "./cbor.ts";

export interface StreamInvite {
  threadId: Uint8Array;
  irohNodeId: string;
  irohAlpns: string[];
  expiresAt: number;
}

export function encodeStreamInvite(input: StreamInvite): Uint8Array {
  return encodeCanonicalCbor({
    thread_id: input.threadId,
    iroh_node_id: input.irohNodeId,
    iroh_alpns: input.irohAlpns,
    expires_at: input.expiresAt,
  });
}

export function decodeStreamInvite(buf: Uint8Array): StreamInvite {
  const obj = decodeCanonicalCbor(buf) as Record<string, CborValue>;
  return {
    threadId: obj.thread_id as Uint8Array,
    irohNodeId: obj.iroh_node_id as string,
    irohAlpns: (obj.iroh_alpns as CborValue[]).map((v) => v as string),
    expiresAt: obj.expires_at as number,
  };
}

export interface StreamAccept {
  threadId: Uint8Array;
  irohNodeId: string;
}

export function encodeStreamAccept(input: StreamAccept): Uint8Array {
  return encodeCanonicalCbor({
    thread_id: input.threadId,
    iroh_node_id: input.irohNodeId,
  });
}

export function decodeStreamAccept(buf: Uint8Array): StreamAccept {
  const obj = decodeCanonicalCbor(buf) as Record<string, CborValue>;
  return {
    threadId: obj.thread_id as Uint8Array,
    irohNodeId: obj.iroh_node_id as string,
  };
}
