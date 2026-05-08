// VaultSession holds the unlocked masterKey + auditMacKey for the running
// vault server. Lock zeroes both. A simple inactivity timer can re-lock
// after N minutes of no activity.

import { LockableSecret } from "./lockable-secret.ts";

export type SessionState =
  | { kind: "uninitialized" }
  | { kind: "locked" }
  | { kind: "unlocked"; tenantId: string; lastActivityMs: number };

export class VaultSession {
  private state: SessionState = { kind: "locked" };
  private masterKey: LockableSecret | null = null;
  private auditMacKey: LockableSecret | null = null;
  private autoLockMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(autoLockMinutes = 60) {
    this.autoLockMs = autoLockMinutes * 60 * 1000;
  }

  setUninitialized(): void {
    this.lock();
    this.state = { kind: "uninitialized" };
  }

  setUnlocked(input: { tenantId: string; masterKey: LockableSecret; auditMacKey: LockableSecret }): void {
    this.lock();
    this.masterKey = input.masterKey;
    this.auditMacKey = input.auditMacKey;
    this.state = { kind: "unlocked", tenantId: input.tenantId, lastActivityMs: Date.now() };
    this.scheduleAutoLock();
  }

  lock(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.masterKey?.zero();
    this.auditMacKey?.zero();
    this.masterKey = null;
    this.auditMacKey = null;
    this.state = { kind: "locked" };
  }

  touch(): void {
    if (this.state.kind !== "unlocked") return;
    this.state = { ...this.state, lastActivityMs: Date.now() };
    this.scheduleAutoLock();
  }

  getState(): SessionState {
    return this.state;
  }

  isUnlocked(): boolean {
    return this.state.kind === "unlocked";
  }

  requireKeys(tenantId?: string): { masterKey: LockableSecret; auditMacKey: LockableSecret; tenantId: string } {
    if (this.state.kind !== "unlocked") throw new Error("Vault is locked");
    if (tenantId && tenantId !== this.state.tenantId) {
      throw new Error(`Vault is unlocked for tenant ${this.state.tenantId}, not ${tenantId}`);
    }
    if (!this.masterKey || !this.auditMacKey) throw new Error("Vault session keys missing");
    this.touch();
    return { masterKey: this.masterKey, auditMacKey: this.auditMacKey, tenantId: this.state.tenantId };
  }

  private scheduleAutoLock(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.lock();
    }, this.autoLockMs);
  }
}
