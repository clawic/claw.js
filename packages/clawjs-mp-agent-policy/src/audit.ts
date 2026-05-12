// Append-only audit log for autonomous decisions.

import { randomBytes } from "node:crypto";

import type { AuditEntry, AutonomousAction, EvaluationResult } from "./types.ts";

export interface AuditLogStorage {
  append(entry: AuditEntry): void;
  recent(limit: number): AuditEntry[];
  forBlock(blockId: Uint8Array, limit?: number): AuditEntry[];
}

/** Trivial in-memory storage that the daemon can replace with a SQLite-backed one. */
export class InMemoryAuditStorage implements AuditLogStorage {
  private entries: AuditEntry[] = [];
  append(entry: AuditEntry): void { this.entries.push(entry); }
  recent(limit: number): AuditEntry[] { return this.entries.slice(-limit).reverse(); }
  forBlock(blockId: Uint8Array, limit?: number): AuditEntry[] {
    const sub = this.entries.filter((e) => bytesEqual(e.blockId, blockId));
    return (limit ? sub.slice(-limit) : sub).reverse();
  }
}

export function recordDecision(input: {
  storage: AuditLogStorage;
  action: AutonomousAction;
  blockId: Uint8Array;
  peerRootPubkey?: Uint8Array;
  result: EvaluationResult;
}): AuditEntry {
  const entry: AuditEntry = {
    id: randomHex(16),
    action: input.action,
    blockId: input.blockId,
    peerRootPubkey: input.peerRootPubkey,
    decidedAt: Math.floor(Date.now() / 1000),
    result: input.result.allowed ? "allowed" : "blocked",
    reasons: input.result.reasons,
  };
  input.storage.append(entry);
  return entry;
}

function randomHex(bytes: number): string {
  return Buffer.from(randomBytes(bytes)).toString("hex");
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
