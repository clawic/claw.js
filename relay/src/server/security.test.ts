import { test } from "vitest";
import assert from "node:assert/strict";

import { hashPassword, hashSha256Secret, verifyPasswordHash } from "./security.ts";

test("verifyPasswordHash accepts argon2id hashes", async () => {
  const hash = await hashPassword("relay-password");
  const result = await verifyPasswordHash(hash, "relay-password");
  assert.equal(result.valid, true);
  assert.equal(result.upgradedHash, undefined);
});

test("verifyPasswordHash upgrades sha256 hashes to argon2id", async () => {
  const sha256Hash = hashSha256Secret("relay-password");
  const result = await verifyPasswordHash(sha256Hash, "relay-password");
  assert.equal(result.valid, true);
  assert.ok(result.upgradedHash?.startsWith("$argon2id$"));
});
