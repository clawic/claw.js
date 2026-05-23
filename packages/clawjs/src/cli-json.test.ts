import assert from "node:assert/strict";
import { test } from "vitest";

import {
  CLI_JSON_ENVELOPE_MAX_BYTES,
  parseCliJsonEnvelope,
  stringifyCliJson,
} from "./cli-json.ts";

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
