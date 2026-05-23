import { test } from "vitest";
import assert from "node:assert/strict";

import { applyBaseline, scanText } from "./privacy-check.mjs";

test("flags chat bot token shaped literals", () => {
  const token = ["1234567890", ":", "A".repeat(35)].join("");
  const findings = scanText(`const token = "${token}";`);
  assert.equal(findings.some((finding) => finding.rule === [["tele", "gram"].join(""), "token"].join("-")), true);
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
  const privateSessionId = ["019e2b2c", "ec6d", "7ea0", "943f", "4cad5b2ad6a1"].join("-");
  const privateThreadId = ["019e2b2c", "ec6d", "7ea0", "943f", "7cad5b2ad6a1"].join("-");
  const privateToken = ["ghp", "123456789012345678901234567890123456"].join("_");
  const privateRuntimeAlias = ["private", "runtime", "conversation"].join("-") + ":system-telemetry";
  const privatePlaceholder = ["private", "session", "not", "published"].join("-");
  const currentThreadAlias = ["current", "thread", "2026", "05", "21"].join("-");
  const sourceSessionRef = ["source", "Session", "Ref"].join("");
  const privateCodename = ["Source Code Aging", "Program"].join(" ");
  const fixtureSecret = ["super", "secret", "value"].join("-");
  const rolloutPath = [
    "rollout",
    "2026-05-15T12-27-04",
    `${privateSessionId}.jsonl`,
  ].join("-");
  const codexThread = `sourceSession thread ${privateThreadId}`;
  const findings = scanText([
    privateUserPath,
    codexSessionPath,
    rolloutPath,
    codexThread,
    `Source conversation: ${privateSessionId}`,
    privateToken,
    `${["DEVELOPMENT", "TEAM"].join("_")} = ABCDE12345`,
    "bundle_id=com.private.app",
    `${[["App", "le"].join(""), "Distribution"].join(" ")}: Private Org (ABCDE12345)`,
    ["release", "output"].join("-"),
    privateRuntimeAlias,
    privatePlaceholder,
    currentThreadAlias,
    sourceSessionRef,
    privateCodename,
    fixtureSecret,
  ].join("\n"));
  for (const rule of [
    "private-user-path",
    "codex-private-path",
    "codex-rollout-session-id",
    "codex-context-session-uuid",
    "private-goal-or-session-id",
    "private-source-reference",
    "contextual-team-id",
    "secret-looking-literal",
    "private-bundle-id",
    "signing-identity",
    "release-artifact-output-reference",
    "private-runtime-source-alias",
    "private-session-placeholder",
    "current-thread-source-alias",
    "private-provenance-source-field",
    "private-codename",
    "fixture-secret-literal",
  ]) {
    assert.equal(findings.some((finding) => finding.rule === rule), true, `expected ${rule}`);
  }
});

test("baselines existing debt without allowing growth", () => {
  const findings = [
    { filePath: "docs/source.md", line: 1, rule: "private-source-reference", description: "private source reference" },
    { filePath: "docs/source.md", line: 2, rule: "private-source-reference", description: "private source reference" },
  ];
  assert.equal(applyBaseline(findings, { entries: [{ filePath: "docs/source.md", rule: "private-source-reference", count: 2 }] }).length, 0);
  assert.equal(applyBaseline(findings, { entries: [{ filePath: "docs/source.md", rule: "private-source-reference", count: 1 }] }).length, 1);
  assert.equal(applyBaseline(findings.slice(0, 1), { entries: [{ filePath: "docs/source.md", rule: "private-source-reference", count: 2 }] }).length, 1);
});

test("allows synthetic fixtures and redacted placeholders", () => {
  const syntheticAlicePath = ["/Users", "alice", "private.log"].join("/");
  const findings = scanText([
    "test-account",
    ["test", ["tele", "gram"].join(""), "bot", "token"].join("_"),
    [["tele", "gram"].join(""), "support", "bot", "token"].join("_"),
    "test-chat-001",
    "example.local",
    "/Users/example/private-agent",
    "/Users/demo/.claw",
    "/Users/me/code/foo",
    "/Users/tester/project",
    syntheticAlicePath,
    "/Users/person/Desktop/private-screenshot.png",
    "<private-root>",
    "<sessionId>",
    "<private-provenance-ledger>",
    "TEAM123",
    "TEAM-WRONG",
    "SKU123",
    "bundle_id=com.example.app",
  ].join("\n"));
  assert.equal(findings.length, 0);
});
