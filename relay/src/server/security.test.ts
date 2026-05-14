import { test } from "vitest";
import assert from "node:assert/strict";

import { hashLegacySecret, hashPassword, verifyPasswordHash } from "./security.ts";

test("verifyPasswordHash accepts argon2id hashes", async () => {
  const hash = await hashPassword("relay-password");
  const result = await verifyPasswordHash(hash, "relay-password");
  assert.equal(result.valid, true);
  assert.equal(result.upgradedHash, undefined);
});

test("verifyPasswordHash upgrades legacy sha256 hashes to argon2id", async () => {
  const legacyHash = hashLegacySecret("relay-password");
  const result = await verifyPasswordHash(legacyHash, "relay-password");
  assert.equal(result.valid, true);
  assert.ok(result.upgradedHash?.startsWith("$argon2id$"));
});
