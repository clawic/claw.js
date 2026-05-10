import test from "node:test";
import assert from "node:assert/strict";

import {
  generateAgreementKeypair,
  generateSigningKeypair,
} from "./crypto.ts";
import {
  EnvelopeSignatureError,
  decryptEnvelope,
  encryptEnvelope,
} from "./signed-envelope.ts";

test("encrypted envelope round-trips between two peers", () => {
  const senderSign = generateSigningKeypair();
  const recipientAgree = generateAgreementKeypair();
  const env = encryptEnvelope({
    senderId: "sender-1",
    recipientId: "recipient-1",
    recipientAgreementPublicKey: recipientAgree.publicKey,
    signingPrivateKey: senderSign.privateKey,
    payload: { kind: "remote-job", cmd: "ls -la" },
  });
  const payload = decryptEnvelope<{ kind: string; cmd: string }>({
    envelope: env,
    recipientId: "recipient-1",
    recipientAgreementPrivateKey: recipientAgree.privateKey,
    senderSigningPublicKey: senderSign.publicKey,
  });
  assert.equal(payload.kind, "remote-job");
  assert.equal(payload.cmd, "ls -la");
});

test("decrypt rejects wrong recipient", () => {
  const senderSign = generateSigningKeypair();
  const recipientAgree = generateAgreementKeypair();
  const env = encryptEnvelope({
    senderId: "sender-1",
    recipientId: "recipient-1",
    recipientAgreementPublicKey: recipientAgree.publicKey,
    signingPrivateKey: senderSign.privateKey,
    payload: { x: 1 },
  });
  assert.throws(
    () =>
      decryptEnvelope({
        envelope: env,
        recipientId: "someone-else",
        recipientAgreementPrivateKey: recipientAgree.privateKey,
        senderSigningPublicKey: senderSign.publicKey,
      }),
    EnvelopeSignatureError,
  );
});

test("decrypt rejects tampered ciphertext", () => {
  const senderSign = generateSigningKeypair();
  const recipientAgree = generateAgreementKeypair();
  const env = encryptEnvelope({
    senderId: "sender-1",
    recipientId: "recipient-1",
    recipientAgreementPublicKey: recipientAgree.publicKey,
    signingPrivateKey: senderSign.privateKey,
    payload: { x: 1 },
  });
  const tampered = {
    ...env,
    ciphertext: env.ciphertext.replace(/.$/, "A"),
  };
  assert.throws(() =>
    decryptEnvelope({
      envelope: tampered,
      recipientId: "recipient-1",
      recipientAgreementPrivateKey: recipientAgree.privateKey,
      senderSigningPublicKey: senderSign.publicKey,
    }),
  );
});
