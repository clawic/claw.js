// Bidirectional stream between two marketplace/* peers.
//
// In production this is an Iroh QUIC stream. For tests and small footprints
// we ship two implementations: an in-memory loopback and a generic adapter
// that wraps any `{ send, onMessage }` object (Iroh, raw TCP, WebSocket, ...).

import { encodeCanonicalCbor, decodeCanonicalCbor, type CborValue } from "./../cbor.ts";

export interface StreamMessage {
  kind: string;
  payload: CborValue;
}

export interface PeerStream {
  send(message: StreamMessage): Promise<void>;
  onMessage(handler: (message: StreamMessage) => void): () => void;
  close(): Promise<void>;
}

// ---- in-memory loopback ----

export interface LoopbackPair { a: PeerStream; b: PeerStream }

export function createLoopbackPair(): LoopbackPair {
  let aListeners: Array<(m: StreamMessage) => void> = [];
  let bListeners: Array<(m: StreamMessage) => void> = [];
  const closed = { v: false };
  const a: PeerStream = {
    async send(message) {
      if (closed.v) throw new Error("stream: closed");
      const buf = encodeCanonicalCbor({ kind: message.kind, payload: message.payload });
      const decoded = decodeCanonicalCbor(buf) as Record<string, CborValue>;
      for (const l of bListeners) l({ kind: decoded.kind as string, payload: decoded.payload });
    },
    onMessage(handler) { aListeners.push(handler); return () => { aListeners = aListeners.filter((h) => h !== handler); }; },
    async close() { closed.v = true; aListeners = []; bListeners = []; },
  };
  const b: PeerStream = {
    async send(message) {
      if (closed.v) throw new Error("stream: closed");
      const buf = encodeCanonicalCbor({ kind: message.kind, payload: message.payload });
      const decoded = decodeCanonicalCbor(buf) as Record<string, CborValue>;
      for (const l of aListeners) l({ kind: decoded.kind as string, payload: decoded.payload });
    },
    onMessage(handler) { bListeners.push(handler); return () => { bListeners = bListeners.filter((h) => h !== handler); }; },
    async close() { closed.v = true; aListeners = []; bListeners = []; },
  };
  return { a, b };
}

// ---- generic transport adapter ----

export interface TransportLike {
  send(bytes: Uint8Array): Promise<void> | void;
  onBytes(handler: (bytes: Uint8Array) => void): () => void;
  close?(): Promise<void> | void;
}

export function streamFromTransport(transport: TransportLike): PeerStream {
  const listeners: Array<(m: StreamMessage) => void> = [];
  const off = transport.onBytes((bytes) => {
    try {
      const decoded = decodeCanonicalCbor(bytes) as Record<string, CborValue>;
      for (const l of listeners) l({ kind: decoded.kind as string, payload: decoded.payload });
    } catch {
      /* malformed frame; drop */
    }
  });
  return {
    async send(message) {
      const buf = encodeCanonicalCbor({ kind: message.kind, payload: message.payload });
      await transport.send(buf);
    },
    onMessage(handler) { listeners.push(handler); return () => listeners.splice(listeners.indexOf(handler), 1); },
    async close() { off(); await transport.close?.(); },
  };
}
