import { test } from "vitest";
import assert from "node:assert/strict";

import { scanText } from "./privacy-check.mjs";

test("flags telegram bot token shaped literals", () => {
  const token = ["1234567890", ":", "A".repeat(35)].join("");
  const findings = scanText(`const token = "${token}";`);
  assert.equal(findings.some((finding) => finding.rule === "telegram-token"), true);
});

test("flags blocked private literals", () => {
  const privateHost = ["mac-mini-de-", "kappa"].join("");
  const privateIp = ["100", ".98", ".141", ".3"].join("");
  const findings = scanText(`${privateHost}\n${privateIp}`);
  assert.equal(findings.length >= 2, true);
});

test("flags private public-boundary categories", () => {
  const privateUserPath = ["/Users", "trabajo", "Desktop", "Clawix"].join("/");
  const codexSessionPath = ["~", ".codex", "sessions", "session.jsonl"].join("/");
  const rolloutPath = [
    "rollout-2026-05-15T12-27-04-019e2b2c-ec6d-7ea0-943f-4cad5b2ad6a1.jsonl",
  ].join("");
  const codexThread = "sourceSession thread 019e2b2c-ec6d-7ea0-943f-7cad5b2ad6a1";
  const findings = scanText([
    privateUserPath,
    codexSessionPath,
    rolloutPath,
    codexThread,
    "DEVELOPMENT_TEAM = ABCDE12345",
    "bundle_id=com.private.app",
    "Apple Distribution: Private Org (ABCDE12345)",
    ["release", "output"].join("-"),
  ].join("\n"));
  for (const rule of [
    "private-user-path",
    "codex-private-path",
    "codex-rollout-session-id",
    "codex-context-session-uuid",
    "contextual-team-id",
    "private-bundle-id",
    "signing-identity",
    "release-output-reference",
  ]) {
    assert.equal(findings.some((finding) => finding.rule === rule), true, `expected ${rule}`);
  }
});

test("allows synthetic fixtures and redacted placeholders", () => {
  const findings = scanText([
    "test-account",
    "test_telegram_bot_token",
    "telegram_support_bot_token",
    "test-chat-001",
    "example.local",
    "/Users/example/private-agent",
    "/Users/demo/.claw",
    "/Users/me/code/foo",
    "/Users/tester/project",
    "/Users/alice/private.log",
    "/Users/person/Desktop/private-screenshot.png",
    "<private-root>",
    "<sessionId>",
    "private-session-not-published",
    "TEAM123",
    "TEAM-WRONG",
    "SKU123",
    "bundle_id=com.example.app",
  ].join("\n"));
  assert.equal(findings.length, 0);
});
