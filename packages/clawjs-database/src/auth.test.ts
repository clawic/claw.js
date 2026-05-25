import assert from "node:assert/strict";
import { createSecretKey } from "node:crypto";
import { test } from "vitest";

import { SignJWT } from "jose";

import { DatabaseAuthService } from "./auth.ts";

test("admin JWT verification accepts only the issued signing algorithm", async () => {
  const secret = "database-auth-test-secret";
  const auth = new DatabaseAuthService(secret);
  const principal = await auth.verifyAdminToken(
    await new SignJWT({
      kind: "admin",
      email: "admin@example.test",
    })
      .setProtectedHeader({ alg: "HS512" })
      .setSubject("admin-1")
      .setIssuedAt()
      .setExpirationTime("12h")
      .sign(createSecretKey(Buffer.from(secret)).export()),
  );

  assert.equal(principal, null);
});
