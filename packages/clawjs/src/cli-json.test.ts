import assert from "node:assert/strict";
import { test } from "vitest";

import {
  CLI_JSON_ENVELOPE_MAX_BYTES,
  parseCliJsonEnvelope,
  stringifyCliJson,
  writeJsonError,
} from "./cli-json.ts";
import { CliHandledError, formatCliErrorText } from "./cli-errors.ts";

test("CLI JSON envelope parser accepts success and error envelopes", () => {
  const success = parseCliJsonEnvelope<{ value: number }>(stringifyCliJson({
    ok: true,
    data: { value: 1 },
    meta: { schemaVersion: 1, canonicalCommand: "inspect" },
  }));
  assert.equal(success.ok, true);
  if (success.ok) {
    assert.equal(success.envelope.ok, true);
    assert.equal(success.envelope.data?.value, 1);
    assert.equal(success.envelope.meta?.canonicalCommand, "inspect");
  }

  const failure = parseCliJsonEnvelope(stringifyCliJson({
    ok: false,
    error: { code: "bad_input", message: "Bad input" },
    meta: { schemaVersion: 1, canonicalCommand: "host" },
  }));
  assert.equal(failure.ok, true);
  if (failure.ok) assert.equal(failure.envelope.error?.code, "bad_input");
});

test("CLI JSON envelope parser returns stable errors for malformed, truncated and invalid envelopes", () => {
  const malformed = parseCliJsonEnvelope("{]");
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "cli_json_envelope_malformed");

  const truncated = parseCliJsonEnvelope(JSON.stringify({ ok: true, data: { value: 1 } }).slice(0, -1));
  assert.equal(truncated.ok, false);
  if (!truncated.ok) assert.equal(truncated.error.code, "cli_json_envelope_truncated");

  const invalid = parseCliJsonEnvelope(JSON.stringify({ data: { value: 1 } }));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.code, "cli_json_envelope_invalid");

  const partialError = parseCliJsonEnvelope(JSON.stringify({ ok: false, error: { code: "bad_input" } }));
  assert.equal(partialError.ok, false);
  if (!partialError.ok) assert.equal(partialError.error.code, "cli_json_envelope_invalid");
});

test("CLI JSON envelope parser enforces a declared stdout byte ceiling", () => {
  const result = parseCliJsonEnvelope(" ".repeat(CLI_JSON_ENVELOPE_MAX_BYTES + 1));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "cli_json_envelope_oversized");
    assert.equal(result.error.maxBytes, CLI_JSON_ENVELOPE_MAX_BYTES);
  }
});

test("CLI handled errors include actionable fields and redact sensitive details in JSON", () => {
  let output = "";
  const stream = { write: (chunk: string) => { output += chunk; return true; } } as NodeJS.WritableStream;
  writeJsonError(stream, new CliHandledError("host_bridge_unavailable", "Host bridge is not reachable.", {
    status: "BLOCKED",
    location: "host.bridge",
    suggestion: "Start the signed host before retrying.",
    safeNextStep: "Run claw host status --json.",
    details: {
      token: "sk-test-secret-123456",
      checkedPath: ".claw/bridge.sock",
    },
  }), { canonicalCommand: "host" });

  const parsed = parseCliJsonEnvelope(output);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.envelope.error?.code, "host_bridge_unavailable");
    assert.equal(parsed.envelope.error?.message, "Host bridge is not reachable.");
    assert.equal((parsed.envelope.error as { status?: string }).status, "BLOCKED");
    assert.equal((parsed.envelope.error as { location?: string }).location, "host.bridge");
    assert.equal((parsed.envelope.error as { suggestion?: string }).suggestion, "Start the signed host before retrying.");
    assert.equal((parsed.envelope.error as { safeNextStep?: string }).safeNextStep, "Run claw host status --json.");
  }
  assert.doesNotMatch(output, /sk-test-secret-123456/);
});

test("CLI handled errors synthesize actionable defaults for legacy code/message errors", () => {
  let output = "";
  const stream = { write: (chunk: string) => { output += chunk; return true; } } as NodeJS.WritableStream;
  writeJsonError(stream, new CliHandledError("usage_error", "Missing required argument.", 64), { canonicalCommand: "db" });

  const parsed = parseCliJsonEnvelope(output);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    const error = parsed.envelope.error as {
      code: string;
      message: string;
      status: string;
      location: string;
      suggestion: string;
      safeNextStep: string;
    };
    assert.equal(error.code, "usage_error");
    assert.equal(error.message, "Missing required argument.");
    assert.equal(error.status, "USAGE");
    assert.equal(error.location, "cli.argv");
    assert.match(error.suggestion, /required arguments/);
    assert.match(error.safeNextStep, /claw inspect commands --json/);
  }
});

test("CLI text errors include stable code, status, location, suggestion, and next step", () => {
  const text = formatCliErrorText(new CliHandledError("invalid_flag", "Unknown flag --wat. token: sk-test-secret-123456", {
    status: "USAGE",
    location: "/Users/example/private/argv.--wat",
    suggestion: "Use --json or --help to inspect supported flags.",
    safeNextStep: "Run claw inspect commands --json.",
  }));

  assert.match(text, /USAGE: Unknown flag --wat\. token: \[REDACTED\]/);
  assert.match(text, /code: invalid_flag/);
  assert.match(text, /location: ~\/private\/argv\.--wat/);
  assert.match(text, /suggestion: Use --json or --help to inspect supported flags\./);
  assert.match(text, /next: Run claw inspect commands --json\./);
  assert.doesNotMatch(text, /sk-test-secret-123456|\/Users\/example/);
});

test("CLI text errors include actionable defaults for legacy errors", () => {
  const text = formatCliErrorText(new CliHandledError("internal_error", "Unexpected runtime failure."));
  assert.match(text, /FAIL: Unexpected runtime failure\./);
  assert.match(text, /code: internal_error/);
  assert.match(text, /location: cli\.runtime/);
  assert.match(text, /suggestion: Inspect the command JSON error/);
  assert.match(text, /next: Rerun the same command with --json/);
});
