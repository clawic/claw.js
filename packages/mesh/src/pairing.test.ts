import { test } from "vitest";
import assert from "node:assert/strict";

import {
  BEARER_TOKEN_BYTES,
  SHORT_CODE_ALPHABET,
  compareBearerTokensConstantTime,
  compareShortCodesConstantTime,
  decodePairingPayload,
  encodePairingPayload,
  generateBearerToken,
  generateShortCode,
  isValidShortCode,
  normalizeShortCode,
  PairingAcceptRequestSchema,
} from "./pairing.ts";
import { fromBase64Url } from "./crypto.ts";

test("generateShortCode produces 9 chars in the safe alphabet plus 2 dashes", () => {
  for (let i = 0; i < 100; i++) {
    const code = generateShortCode();
    assert.equal(code.length, 11);
    assert.equal(code[3], "-");
    assert.equal(code[7], "-");
    const raw = code.replace(/-/g, "");
    for (const ch of raw) {
      assert.ok(
        SHORT_CODE_ALPHABET.includes(ch),
        `unexpected char in short code: ${ch} (${code})`,
      );
    }
  }
});

test("generateShortCode excludes visually ambiguous letters (I, L, O, U)", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateShortCode();
    for (const banned of ["I", "L", "O", "U"]) {
      assert.ok(!code.includes(banned), `banned letter ${banned} in ${code}`);
    }
  }
});

test("isValidShortCode accepts well-formed codes and rejects malformed", () => {
  assert.equal(isValidShortCode(generateShortCode()), true);
  assert.equal(isValidShortCode("ABCDEFGHJ"), false); // missing dashes
  assert.equal(isValidShortCode("ABC-DEF-GH"), false); // wrong length
  assert.equal(isValidShortCode("ABC-DEF-GHJK"), false); // too long
  assert.equal(isValidShortCode("IAB-CDE-FGH"), false); // banned char (I)
  assert.equal(isValidShortCode("ABC-DEF GHJ"), false); // space instead of dash
});

test("normalizeShortCode strips spaces and dashes and uppercases", () => {
  assert.equal(normalizeShortCode("abc-def-ghj"), "ABCDEFGHJ");
  assert.equal(normalizeShortCode("  abc def ghj  "), "ABCDEFGHJ");
});

test("compareShortCodesConstantTime is case and dash insensitive", () => {
  assert.equal(compareShortCodesConstantTime("abc-def-ghj", "ABCDEFGHJ"), true);
  assert.equal(compareShortCodesConstantTime("abc-def-ghj", "ABC-DEF-GHK"), false);
});

test("generateBearerToken returns 32 url-safe bytes", () => {
  const token = generateBearerToken();
  assert.ok(!token.includes("="));
  assert.ok(!token.includes("+"));
  assert.ok(!token.includes("/"));
  assert.equal(fromBase64Url(token).length, BEARER_TOKEN_BYTES);
});

test("compareBearerTokensConstantTime detects mismatches", () => {
  const a = generateBearerToken();
  const b = generateBearerToken();
  assert.equal(compareBearerTokensConstantTime(a, a), true);
  assert.equal(compareBearerTokensConstantTime(a, b), false);
});

test("pairing payload encodes and decodes round-trip", () => {
  const payload = {
    v: 1 as const,
    host: "192.168.1.10",
    port: 24180,
    token: generateBearerToken(),
    shortCode: generateShortCode(),
    hostDisplayName: "Studio Mac",
    tailscaleHost: "100.64.0.10",
    nodeId: "node-1",
    signingPublicKey: "sk-pub",
    agreementPublicKey: "ak-pub",
  };
  const text = encodePairingPayload(payload);
  const decoded = decodePairingPayload(text);
  assert.deepEqual(decoded, payload);
});

test("decodePairingPayload throws on invalid json", () => {
  assert.throws(() => decodePairingPayload("not json"));
});

test("decodePairingPayload throws on schema mismatch", () => {
  assert.throws(() =>
    decodePairingPayload(
      JSON.stringify({
        v: 1,
        host: "h",
        port: 99999,
        token: "t",
        shortCode: "s",
        hostDisplayName: "m",
      }),
    ),
  );
});

test("PairingAcceptRequestSchema separates client role from platform", () => {
  const parsed = PairingAcceptRequestSchema.parse({
    v: 1,
    token: "token-x",
    clientNodeId: "ios-client-1",
    clientDisplayName: "iPhone",
    clientSigningPublicKey: "ios-sk",
    clientAgreementPublicKey: "ios-ak",
    clientKind: "companion",
    platform: "ios",
  });
  assert.equal(parsed.clientKind, "companion");
  assert.equal(parsed.platform, "ios");
  const platformAsKind = "ios";
  assert.throws(() =>
    PairingAcceptRequestSchema.parse({
      v: 1,
      token: "token-x",
      clientNodeId: "ios-client-1",
      clientDisplayName: "iPhone",
      clientSigningPublicKey: "ios-sk",
      clientAgreementPublicKey: "ios-ak",
      clientKind: platformAsKind,
      platform: "ios",
    }),
  );
});
