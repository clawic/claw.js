import { argon2id } from "@noble/hashes/argon2";

// Argon2id parameters. `t` = time cost (iterations), `m` = memory cost (KiB),
// `p` = parallelism. Defaults follow OWASP recommendations for interactive
// auth (target ~250 ms on a modern laptop).
export interface Argon2Params {
  t: number;
  m: number;
  p: number;
}

export const ARGON2_DEFAULT_PARAMS: Argon2Params = {
  t: 3,
  m: 64 * 1024, // 64 MiB
  p: 1,
};

// Minimal params used in tests and dummy mode where speed beats security.
export const ARGON2_FAST_PARAMS: Argon2Params = {
  t: 1,
  m: 8 * 1024, // 8 MiB
  p: 1,
};

interface CalibrateOpts {
  targetMs?: number;
  minMemoryKiB?: number;
  maxMemoryKiB?: number;
  parallelism?: number;
  timeCost?: number;
  fast?: boolean;
}

// Probes Argon2id with growing memory cost until a single derivation hits the
// target time. Falls back to `ARGON2_DEFAULT_PARAMS` if the probe fails.
export function calibrateArgon2(opts: CalibrateOpts = {}): Argon2Params {
  if (opts.fast) return ARGON2_FAST_PARAMS;

  const targetMs = opts.targetMs ?? 250;
  const minMemoryKiB = opts.minMemoryKiB ?? 16 * 1024;
  const maxMemoryKiB = opts.maxMemoryKiB ?? 256 * 1024;
  const parallelism = opts.parallelism ?? 1;
  const timeCost = opts.timeCost ?? 3;

  const password = new Uint8Array(16);
  const salt = new Uint8Array(32);

  let memoryKiB = minMemoryKiB;
  let lastDuration = 0;

  try {
    while (memoryKiB <= maxMemoryKiB) {
      const start = performance.now();
      argon2id(password, salt, { t: timeCost, m: memoryKiB, p: parallelism, dkLen: 32 });
      lastDuration = performance.now() - start;

      if (lastDuration >= targetMs) {
        return { t: timeCost, m: memoryKiB, p: parallelism };
      }

      memoryKiB = Math.min(memoryKiB * 2, maxMemoryKiB);
      if (memoryKiB === maxMemoryKiB && lastDuration < targetMs) {
        return { t: timeCost, m: memoryKiB, p: parallelism };
      }
    }
  } catch {
    return ARGON2_DEFAULT_PARAMS;
  }

  return ARGON2_DEFAULT_PARAMS;
}
