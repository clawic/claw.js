// Minimal canonical CBOR encoder/decoder for the marketplace/1.0.0 wire format.
//
// This is NOT a full CBOR implementation. It supports exactly the types we
// need for the protocol: unsigned ints, signed ints (small range), text
// strings, byte strings, arrays, maps and booleans/null. Map keys are sorted
// byte-ascending so the output is deterministic.
//
// Supported major types:
//   0: uint (0..2^53-1)
//   1: sint (negative, 0..-2^53)
//   2: bytes (Uint8Array)
//   3: text (string, UTF-8)
//   4: array
//   5: map
//   7: simple (false=0xf4, true=0xf5, null=0xf6)
//
// Floats are not used in the wire schema; an attempt to encode one throws.

export type CborValue =
  | null
  | boolean
  | number
  | bigint
  | string
  | Uint8Array
  | CborValue[]
  | { [key: string]: CborValue };

function writeHead(major: number, value: number, out: number[]): void {
  const m = (major & 0x07) << 5;
  if (value < 24) {
    out.push(m | value);
  } else if (value < 0x100) {
    out.push(m | 24, value);
  } else if (value < 0x10000) {
    out.push(m | 25, (value >>> 8) & 0xff, value & 0xff);
  } else if (value < 0x100000000) {
    out.push(m | 26,
      (value >>> 24) & 0xff, (value >>> 16) & 0xff,
      (value >>> 8) & 0xff, value & 0xff);
  } else {
    const hi = Math.floor(value / 0x100000000);
    const lo = value % 0x100000000;
    out.push(m | 27,
      (hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff,
      (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);
  }
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = a[i] - b[i];
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

function encodeInto(value: CborValue, out: number[]): void {
  if (value === null) { out.push(0xf6); return; }
  if (value === true) { out.push(0xf5); return; }
  if (value === false) { out.push(0xf4); return; }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error("cbor: float not supported in wire schema");
    if (value >= 0) writeHead(0, value, out);
    else writeHead(1, -value - 1, out);
    return;
  }
  if (typeof value === "bigint") {
    if (value >= 0n) {
      if (value > 0xffffffffffffffffn) throw new Error("cbor: bigint > u64 not supported");
      const v = Number(value);
      writeHead(0, v, out);
    } else {
      const positive = -value - 1n;
      if (positive > 0xffffffffffffffffn) throw new Error("cbor: bigint < -u64-1 not supported");
      writeHead(1, Number(positive), out);
    }
    return;
  }
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    writeHead(3, bytes.length, out);
    for (const b of bytes) out.push(b);
    return;
  }
  if (value instanceof Uint8Array) {
    writeHead(2, value.length, out);
    for (const b of value) out.push(b);
    return;
  }
  if (Array.isArray(value)) {
    writeHead(4, value.length, out);
    for (const item of value) encodeInto(item, out);
    return;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, CborValue>;
    const keys = Object.keys(obj);
    const encodedKeys: { key: Uint8Array; original: string }[] = keys.map((k) => {
      const tmp: number[] = [];
      encodeInto(k, tmp);
      return { key: new Uint8Array(tmp), original: k };
    });
    encodedKeys.sort((a, b) => compareBytes(a.key, b.key));
    writeHead(5, encodedKeys.length, out);
    for (const { key, original } of encodedKeys) {
      for (const b of key) out.push(b);
      encodeInto(obj[original], out);
    }
    return;
  }
  throw new Error(`cbor: unsupported value type ${typeof value}`);
}

export function encodeCanonicalCbor(value: CborValue): Uint8Array {
  const out: number[] = [];
  encodeInto(value, out);
  return new Uint8Array(out);
}

// Decoder ---------------------------------------------------------------------
//
// Reads enough CBOR to round-trip what `encodeInto` produces. Not a full
// decoder.

class Reader {
  private readonly buf: Uint8Array;
  private off: number;
  constructor(buf: Uint8Array, off = 0) {
    this.buf = buf;
    this.off = off;
  }
  remaining(): number { return this.buf.length - this.off; }
  u8(): number {
    if (this.off >= this.buf.length) throw new Error("cbor: short read");
    return this.buf[this.off++];
  }
  bytes(n: number): Uint8Array {
    if (this.off + n > this.buf.length) throw new Error("cbor: short read");
    const out = this.buf.slice(this.off, this.off + n);
    this.off += n;
    return out;
  }
  readArg(minor: number): number {
    if (minor < 24) return minor;
    if (minor === 24) return this.u8();
    if (minor === 25) return (this.u8() << 8) | this.u8();
    if (minor === 26) {
      return ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8();
    }
    if (minor === 27) {
      const hi = ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8();
      const lo = ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8();
      return hi * 0x100000000 + lo;
    }
    throw new Error(`cbor: indefinite-length not supported (minor=${minor})`);
  }
  readValue(): CborValue {
    const initial = this.u8();
    const major = initial >> 5;
    const minor = initial & 0x1f;
    if (major === 0) return this.readArg(minor);
    if (major === 1) return -this.readArg(minor) - 1;
    if (major === 2) return this.bytes(this.readArg(minor));
    if (major === 3) return new TextDecoder().decode(this.bytes(this.readArg(minor)));
    if (major === 4) {
      const len = this.readArg(minor);
      const out: CborValue[] = new Array(len);
      for (let i = 0; i < len; i++) out[i] = this.readValue();
      return out;
    }
    if (major === 5) {
      const len = this.readArg(minor);
      const out: Record<string, CborValue> = {};
      for (let i = 0; i < len; i++) {
        const k = this.readValue();
        if (typeof k !== "string") throw new Error("cbor: non-string map key");
        out[k] = this.readValue();
      }
      return out;
    }
    if (major === 7) {
      if (minor === 20) return false;
      if (minor === 21) return true;
      if (minor === 22) return null;
      if (minor === 23) return null;
      throw new Error(`cbor: simple value ${minor} not supported`);
    }
    throw new Error(`cbor: major ${major} not supported`);
  }
}

export function decodeCanonicalCbor(buf: Uint8Array): CborValue {
  const reader = new Reader(buf);
  const out = reader.readValue();
  if (reader.remaining() !== 0) throw new Error("cbor: trailing bytes");
  return out;
}
