// LockableSecret approximates the Swift `LockableSecret` from Clawix:
// a buffer that callers can read inside a closure and that gets zeroed on
// release. Node.js does not expose explicit memory control, so this is
// best-effort: bytes are wiped synchronously when `zero()` is called and
// when the FinalizationRegistry triggers (GC, opportunistic).

const finalizationRegistry =
  typeof FinalizationRegistry !== "undefined"
    ? new FinalizationRegistry<Uint8Array>((buf) => {
        buf.fill(0);
      })
    : null;

export class LockableSecret {
  private readonly buffer: Uint8Array;
  private zeroed = false;

  private constructor(buffer: Uint8Array) {
    this.buffer = buffer;
    finalizationRegistry?.register(this, buffer, this);
  }

  static fromBytes(bytes: Uint8Array): LockableSecret {
    const owned = new Uint8Array(bytes.length);
    owned.set(bytes);
    return new LockableSecret(owned);
  }

  static allocate(length: number): LockableSecret {
    return new LockableSecret(new Uint8Array(length));
  }

  get length(): number {
    return this.buffer.length;
  }

  get isZeroed(): boolean {
    return this.zeroed;
  }

  withBytes<T>(fn: (bytes: Uint8Array) => T): T {
    if (this.zeroed) throw new Error("LockableSecret has been zeroed");
    return fn(this.buffer);
  }

  // Returns a copy. Caller is responsible for handling the bytes safely.
  copyBytes(): Uint8Array {
    if (this.zeroed) throw new Error("LockableSecret has been zeroed");
    return new Uint8Array(this.buffer);
  }

  zero(): void {
    if (this.zeroed) return;
    this.buffer.fill(0);
    this.zeroed = true;
    finalizationRegistry?.unregister(this);
  }
}
