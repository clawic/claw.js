import {
  AEAD_NONCE_LENGTH,
  aeadDecrypt,
  aeadEncrypt,
  agree,
  bytesEqualConstantTime,
  deriveSessionKey,
  fromBase64Url,
  generateAgreementKeypair,
  randomBytes,
  sign,
  toBase64Url,
  utf8,
  utf8Decode,
  verify,
} from "./crypto.ts";

export const ENVELOPE_VERSION = 1;
export const ENVELOPE_ALG_SIGN = "ed25519";
export const ENVELOPE_ALG_ENCRYPT = "x25519-xchacha20poly1305";

export const DEFAULT_REPLAY_WINDOW_MS = 5 * 60 * 1000;
export const ENVELOPE_NONCE_LENGTH = 16;

export interface SignedEnvelope<TBody = unknown> {
  v: number;
  alg: typeof ENVELOPE_ALG_SIGN;
  senderId: string;
  ts: string;
  nonce: string;
  body: TBody;
  sig: string;
}

export interface EncryptedEnvelope {
  v: number;
  alg: typeof ENVELOPE_ALG_ENCRYPT;
  senderId: string;
  recipientId: string;
  ts: string;
  nonce: string;
  ephemeralPublicKey: string;
  ciphertext: string;
  aeadNonce: string;
  sig: string;
}

export class EnvelopeReplayCache {
  private readonly seen = new Map<string, number>();
  private readonly windowMs: number;

  constructor(windowMs: number = DEFAULT_REPLAY_WINDOW_MS) {
    this.windowMs = windowMs;
  }

  check(senderId: string, nonce: string, tsMs: number, now: number): void {
    const drift = now - tsMs;
    if (drift > this.windowMs || drift < -this.windowMs) {
      throw new EnvelopeReplayError("envelope timestamp outside replay window");
    }
    this.gc(now);
    const key = `${senderId}:${nonce}`;
    if (this.seen.has(key)) {
      throw new EnvelopeReplayError("envelope nonce already seen");
    }
    this.seen.set(key, tsMs);
  }

  private gc(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [key, ts] of this.seen) {
      if (ts < cutoff) this.seen.delete(key);
    }
  }
}

export class EnvelopeReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeReplayError";
  }
}

export class EnvelopeSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeSignatureError";
  }
}

export interface SignParams<TBody> {
  senderId: string;
  signingPrivateKey: Uint8Array;
  body: TBody;
  now?: Date;
}

export function signEnvelope<TBody>(
  params: SignParams<TBody>,
): SignedEnvelope<TBody> {
  const ts = (params.now ?? new Date()).toISOString();
  const nonce = toBase64Url(randomBytes(ENVELOPE_NONCE_LENGTH));
  const base = {
    v: ENVELOPE_VERSION,
    alg: ENVELOPE_ALG_SIGN,
    senderId: params.senderId,
    ts,
    nonce,
    body: params.body,
  } as const;
  const message = canonicalEncode(base);
  const sig = toBase64Url(sign(params.signingPrivateKey, message));
  return { ...base, sig };
}

export interface VerifyParams<TBody> {
  envelope: SignedEnvelope<TBody>;
  signingPublicKey: Uint8Array;
  expectedSenderId?: string;
  replayCache?: EnvelopeReplayCache;
  now?: Date;
}

export function verifyEnvelope<TBody>(params: VerifyParams<TBody>): TBody {
  const env = params.envelope;
  if (env.v !== ENVELOPE_VERSION) {
    throw new EnvelopeSignatureError(
      `unsupported envelope version: ${env.v}`,
    );
  }
  if (env.alg !== ENVELOPE_ALG_SIGN) {
    throw new EnvelopeSignatureError(`unsupported alg: ${env.alg}`);
  }
  if (params.expectedSenderId && env.senderId !== params.expectedSenderId) {
    throw new EnvelopeSignatureError("sender id mismatch");
  }
  const message = canonicalEncode({
    v: env.v,
    alg: env.alg,
    senderId: env.senderId,
    ts: env.ts,
    nonce: env.nonce,
    body: env.body,
  });
  if (!verify(params.signingPublicKey, message, fromBase64Url(env.sig))) {
    throw new EnvelopeSignatureError("invalid signature");
  }
  if (params.replayCache) {
    const tsMs = Date.parse(env.ts);
    if (Number.isNaN(tsMs)) {
      throw new EnvelopeSignatureError("invalid timestamp");
    }
    params.replayCache.check(
      env.senderId,
      env.nonce,
      tsMs,
      (params.now ?? new Date()).getTime(),
    );
  }
  return env.body;
}

export interface EncryptParams {
  senderId: string;
  recipientId: string;
  recipientAgreementPublicKey: Uint8Array;
  signingPrivateKey: Uint8Array;
  payload: unknown;
  now?: Date;
}

export function encryptEnvelope(params: EncryptParams): EncryptedEnvelope {
  const ts = (params.now ?? new Date()).toISOString();
  const nonce = toBase64Url(randomBytes(ENVELOPE_NONCE_LENGTH));
  const ephemeral = generateAgreementKeypair();
  const sharedSecret = agree(
    ephemeral.privateKey,
    params.recipientAgreementPublicKey,
  );
  const info = `mesh:envelope:${params.senderId}->${params.recipientId}:${ts}`;
  const sessionKey = deriveSessionKey(sharedSecret, info);
  const ad = utf8(
    `${params.senderId}|${params.recipientId}|${ts}|${nonce}`,
  );
  const plaintext = utf8(JSON.stringify(params.payload));
  const { ciphertext, nonce: aeadNonce } = aeadEncrypt(
    sessionKey,
    plaintext,
    ad,
  );
  const base = {
    v: ENVELOPE_VERSION,
    alg: ENVELOPE_ALG_ENCRYPT,
    senderId: params.senderId,
    recipientId: params.recipientId,
    ts,
    nonce,
    ephemeralPublicKey: toBase64Url(ephemeral.publicKey),
    ciphertext: toBase64Url(ciphertext),
    aeadNonce: toBase64Url(aeadNonce),
  } as const;
  const message = canonicalEncode(base);
  const sig = toBase64Url(sign(params.signingPrivateKey, message));
  return { ...base, sig };
}

export interface DecryptParams<TPayload> {
  envelope: EncryptedEnvelope;
  recipientId: string;
  recipientAgreementPrivateKey: Uint8Array;
  senderSigningPublicKey: Uint8Array;
  expectedSenderId?: string;
  replayCache?: EnvelopeReplayCache;
  now?: Date;
}

export function decryptEnvelope<TPayload = unknown>(
  params: DecryptParams<TPayload>,
): TPayload {
  const env = params.envelope;
  if (env.v !== ENVELOPE_VERSION) {
    throw new EnvelopeSignatureError(`unsupported version: ${env.v}`);
  }
  if (env.alg !== ENVELOPE_ALG_ENCRYPT) {
    throw new EnvelopeSignatureError(`unsupported alg: ${env.alg}`);
  }
  if (env.recipientId !== params.recipientId) {
    throw new EnvelopeSignatureError("recipient id mismatch");
  }
  if (params.expectedSenderId && env.senderId !== params.expectedSenderId) {
    throw new EnvelopeSignatureError("sender id mismatch");
  }
  const baseForSig = {
    v: env.v,
    alg: env.alg,
    senderId: env.senderId,
    recipientId: env.recipientId,
    ts: env.ts,
    nonce: env.nonce,
    ephemeralPublicKey: env.ephemeralPublicKey,
    ciphertext: env.ciphertext,
    aeadNonce: env.aeadNonce,
  };
  const message = canonicalEncode(baseForSig);
  if (
    !verify(params.senderSigningPublicKey, message, fromBase64Url(env.sig))
  ) {
    throw new EnvelopeSignatureError("invalid signature");
  }
  if (params.replayCache) {
    const tsMs = Date.parse(env.ts);
    if (Number.isNaN(tsMs)) {
      throw new EnvelopeSignatureError("invalid timestamp");
    }
    params.replayCache.check(
      env.senderId,
      env.nonce,
      tsMs,
      (params.now ?? new Date()).getTime(),
    );
  }
  const sharedSecret = agree(
    params.recipientAgreementPrivateKey,
    fromBase64Url(env.ephemeralPublicKey),
  );
  const info = `mesh:envelope:${env.senderId}->${env.recipientId}:${env.ts}`;
  const sessionKey = deriveSessionKey(sharedSecret, info);
  const ad = utf8(
    `${env.senderId}|${env.recipientId}|${env.ts}|${env.nonce}`,
  );
  const aeadNonce = fromBase64Url(env.aeadNonce);
  if (aeadNonce.length !== AEAD_NONCE_LENGTH) {
    throw new EnvelopeSignatureError("invalid aead nonce length");
  }
  const plaintext = aeadDecrypt(
    sessionKey,
    fromBase64Url(env.ciphertext),
    aeadNonce,
    ad,
  );
  return JSON.parse(utf8Decode(plaintext)) as TPayload;
}

export function envelopeFingerprint(env: SignedEnvelope | EncryptedEnvelope): string {
  return `${env.senderId}:${env.nonce}`;
}

function canonicalEncode(value: unknown): Uint8Array {
  return utf8(canonicalStringify(value));
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .map(
      (k) =>
        `${JSON.stringify(k)}:${canonicalStringify(
          (value as Record<string, unknown>)[k],
        )}`,
    );
  return `{${parts.join(",")}}`;
}

export const __test_internal = {
  canonicalStringify,
  canonicalEncode,
  bytesEqualConstantTime,
};
