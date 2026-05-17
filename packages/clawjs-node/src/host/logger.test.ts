import { test } from "vitest";
import assert from "node:assert/strict";

import { MemoryStructuredLogSink, StructuredLogger, redactSecrets } from "./logger.ts";

test("redactSecrets masks sensitive keys recursively", () => {
  const redacted = redactSecrets({
    apiKey: "sk-12345678",
    nested: {
      authorization: "Bearer secret-token",
    },
    safe: "value",
  });

  assert.equal(redacted.apiKey, "*******5678");
  assert.equal((redacted.nested as { authorization: string }).authorization.includes("secret-token"), false);
  assert.equal(redacted.safe, "value");
});

test("redactSecrets preserves public catalog keys while still masking secret-looking values", () => {
  const redacted = redactSecrets({
    key: "health",
    domainSystemKey: "health",
    domainRoleKey: "health.patient",
    operationKey: "patient.timeline",
    apiKey: "sk-12345678",
    unsafe: { key: "secret-token-12345678" },
  });

  assert.equal(redacted.key, "health");
  assert.equal(redacted.domainSystemKey, "health");
  assert.equal(redacted.domainRoleKey, "health.patient");
  assert.equal(redacted.operationKey, "patient.timeline");
  assert.equal(redacted.apiKey, "*******5678");
  assert.equal((redacted.unsafe as { key: string }).key.includes("secret-token"), false);
});

test("redactSecrets masks inline secrets inside error and message strings", () => {
  const redacted = redactSecrets({
    error: "Gateway HTTP 401: Authorization: Bearer secret-token-12345678",
    message: "apiKey=sk-live-12345678",
  });

  assert.equal((redacted.error as string).includes("secret-token-12345678"), false);
  assert.equal((redacted.message as string).includes("sk-live-12345678"), false);
});

test("redactSecrets preserves safe secret metadata containers", () => {
  const redacted = redactSecrets({
    missingSecrets: [{ name: "namecheap_api_token", label: "Namecheap API token" }],
    requiredSecrets: [{ name: "namecheap_api_token" }],
    secretValue: "secret-token-12345678",
  });

  assert.equal((redacted.missingSecrets as Array<{ name: string }>)[0]?.name, "namecheap_api_token");
  assert.equal((redacted.requiredSecrets as Array<{ name: string }>)[0]?.name, "namecheap_api_token");
  assert.equal((redacted.secretValue as string).includes("secret-token"), false);
});

test("StructuredLogger writes sanitized structured entries", () => {
  const sink = new MemoryStructuredLogSink();
  const logger = new StructuredLogger(sink).child({ workspaceId: "demo" });

  logger.info("auth.saved", {
    provider: "openai",
    token: "secret-token-12345678",
  });

  assert.equal(sink.entries.length, 1);
  assert.equal(sink.entries[0]?.event, "auth.saved");
  assert.equal((sink.entries[0]?.detail as { token: string }).token.includes("secret-token"), false);
  assert.equal((sink.entries[0]?.detail as { workspaceId: string }).workspaceId, "demo");
});
