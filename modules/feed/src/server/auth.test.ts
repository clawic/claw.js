import assert from "node:assert/strict";
import { test } from "node:test";

import { FeedAuthService, hashSecret } from "./auth.ts";

test("feed auth issues and verifies admin tokens", async () => {
  const auth = new FeedAuthService("feed-test-secret-feed-test-secret");
  const token = await auth.issueAdminToken({ adminId: "admin", email: "admin@example.test" });

  const principal = await auth.verifyAdminToken(token);

  assert.deepEqual(principal, {
    kind: "admin",
    adminId: "admin",
    email: "admin@example.test",
  });
  assert.equal(await auth.verifyAdminToken("not-a-token"), null);
});

test("feed hashSecret is deterministic", () => {
  assert.equal(hashSecret("admin"), hashSecret("admin"));
  assert.notEqual(hashSecret("admin"), hashSecret("other"));
});
