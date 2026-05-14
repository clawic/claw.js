import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { createLocalGuidanceStore } from "./guidance/store.ts";
import { createLocalResourceRegistryStore } from "./resources/store.ts";
import { signActorAssertion, verifyActorAssertion, untrustedActor } from "./actor/assertions.ts";

test("guidance matcher returns compact hints across command, cwd, resource and actor inputs", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-guidance-store-"));
  const store = createLocalGuidanceStore({ rootDir });
  const record = store.create({
    id: "server-write-policy",
    title: "Server write policy",
    capsule: "Use the deployment runbook before writing to this server.",
    details: "Longer instructions stay behind claw guidance show.",
    severity: "warning",
    resourceIds: ["res_server123"],
    applyWhen: {
      commands: ["resources register"],
      cwdPrefixes: [rootDir],
      resourceIds: ["res_server123"],
      actorKinds: ["agent"],
      riskClasses: ["write"],
    },
  });

  const result = store.match({
    command: "resources register",
    cwd: path.join(rootDir, "project"),
    resourceIds: ["res_server123"],
    actorKind: "agent",
    riskClass: "write",
  });

  assert.equal(result.hints.length, 1);
  assert.equal(result.hints[0]?.id, record.id);
  assert.equal(result.hints[0]?.capsule, "Use the deployment runbook before writing to this server.");
  assert.deepEqual(result.hints[0]?.resourceIds, ["res_server123"]);
});

test("resource registry uses opaque ids and mutable locators without global scanning", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-resource-store-"));
  const filePath = path.join(rootDir, "instruction.md");
  fs.writeFileSync(filePath, "read me\n", "utf8");
  const store = createLocalResourceRegistryStore({ rootDir: path.join(rootDir, "registry") });

  const resource = store.register({
    kind: "instruction",
    locator: { kind: "path", value: filePath },
    label: "Instruction",
  });

  assert.match(resource.id, /^res_[a-z0-9]+$/);
  assert.equal(resource.status, "active");
  assert.equal(store.read(resource.id).content, "read me\n");
  fs.unlinkSync(filePath);
  assert.equal(store.status(resource.id).status, "missing");
});

test("actor assertions verify signatures, expiry, scope and untrusted hints", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const now = new Date("2026-05-14T12:00:00.000Z");
  const assertion = signActorAssertion({
    schemaVersion: 1,
    actorKind: "agent",
    actorId: "agent-1",
    hostId: "host-1",
    issuedAt: "2026-05-14T11:59:00.000Z",
    expiresAt: "2026-05-14T12:10:00.000Z",
    scope: ["cli"],
    trustSource: "agent-runtime",
    issuer: "runtime",
    keyId: "test-key",
  }, privateKeyPem);

  const trustedKeys = [{ keyId: "test-key", publicKeyPem, trustSource: "agent-runtime" as const, issuer: "runtime" }];
  assert.equal(verifyActorAssertion({ assertion, trustedKeys, requiredScope: "cli", now }).ok, true);
  assert.equal(verifyActorAssertion({ assertion, trustedKeys, requiredScope: "other", now }).reason, "scope_mismatch");
  assert.equal(verifyActorAssertion({ assertion, trustedKeys, now: new Date("2026-05-14T12:11:00.000Z") }).reason, "expired_assertion");
  assert.equal(verifyActorAssertion({ assertion: { ...assertion, signature: "bad" }, trustedKeys, now }).reason, "invalid_signature");
  assert.equal(verifyActorAssertion({ assertion, trustedKeys: [], now }).reason, "unknown_trusted_key");
  assert.equal(untrustedActor({ actorKind: "human", actorId: "u1" }).trustSource, "untrusted");
});
