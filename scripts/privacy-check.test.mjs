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

test("allows synthetic telegram fixtures", () => {
  const findings = scanText([
    "test-account",
    "test_telegram_bot_token",
    "telegram_support_bot_token",
    "test-chat-001",
    "example.local",
  ].join("\n"));
  assert.equal(findings.length, 0);
});
