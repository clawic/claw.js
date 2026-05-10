import test from "node:test";
import assert from "node:assert/strict";

import { generateSigningKeypair } from "./crypto.ts";
import {
  DEFAULT_REPLAY_WINDOW_MS,
  EnvelopeReplayCache,
  EnvelopeReplayError,
  EnvelopeSignatureError,
  envelopeFingerprint,
  signEnvelope,
  verifyEnvelope,
  __test_internal,
} from "./signed-envelope.ts";

test("signed envelope round-trips with verification", () => {
  const sender = generateSigningKeypair();
  const env = signEnvelope({
    senderId: "sender-1",
    signingPrivateKey: sender.privateKey,
    body: { kind: "ping", value: 42 },
  });
  const body = verifyEnvelope<{ kind: string; value: number }>({
    envelope: env,
    signingPublicKey: sender.publicKey,
  });
  assert.equal(body.kind, "ping");
  assert.equal(body.value, 42);
});

test("verify rejects mutated body", () => {
  const sender = generateSigningKeypair();
  const env = signEnvelope({
    senderId: "sender-1",
    signingPrivateKey: sender.privateKey,
    body: { v: 1 },
  });
  const tampered = { ...env, body: { v: 2 } };
  assert.throws(
    () =>
      verifyEnvelope({
        envelope: tampered,
        signingPublicKey: sender.publicKey,
      }),
    EnvelopeSignatureError,
  );
});

test("verify rejects sender id mismatch", () => {
  const sender = generateSigningKeypair();
  const env = signEnvelope({
    senderId: "sender-1",
    signingPrivateKey: sender.privateKey,
    body: {},
  });
  assert.throws(
    () =>
      verifyEnvelope({
        envelope: env,
        signingPublicKey: sender.publicKey,
        expectedSenderId: "other",
      }),
    EnvelopeSignatureError,
  );
});

test("verify enforces replay window when cache provided", () => {
  const sender = generateSigningKeypair();
  const cache = new EnvelopeReplayCache();
  const env = signEnvelope({
    senderId: "sender-1",
    signingPrivateKey: sender.privateKey,
    body: { v: 1 },
  });
  verifyEnvelope({
    envelope: env,
    signingPublicKey: sender.publicKey,
    replayCache: cache,
  });
  assert.throws(
    () =>
      verifyEnvelope({
        envelope: env,
        signingPublicKey: sender.publicKey,
        replayCache: cache,
      }),
    EnvelopeReplayError,
  );
});

test("replay cache rejects out-of-window timestamps", () => {
  const cache = new EnvelopeReplayCache(1000);
  assert.throws(
    () => cache.check("a", "n", 0, DEFAULT_REPLAY_WINDOW_MS + 10_000),
    EnvelopeReplayError,
  );
});

test("envelopeFingerprint includes sender id and nonce", () => {
  const sender = generateSigningKeypair();
  const env = signEnvelope({
    senderId: "sender-X",
    signingPrivateKey: sender.privateKey,
    body: {},
  });
  const fp = envelopeFingerprint(env);
  assert.ok(fp.startsWith("sender-X:"));
  assert.ok(fp.length > "sender-X:".length);
});

test("canonical stringify sorts keys deterministically", () => {
  const a = __test_internal.canonicalStringify({ b: 1, a: 2, c: { y: 1, x: 2 } });
  const b = __test_internal.canonicalStringify({ a: 2, c: { x: 2, y: 1 }, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":2,"b":1,"c":{"x":2,"y":1}}');
});
