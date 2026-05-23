import assert from "node:assert/strict";
import { TextEncoder } from "node:util";
import { test } from "vitest";

import {
  SESSION_RENDER_TRUNCATION_MARKER,
  capSessionRenderDetailPayload,
  capSessionRenderDetailText,
  capSessionRenderPreview,
  capSessionRenderText,
  isSessionStructuredEventKind,
  sessionRenderCapPolicyFor,
  stringifySessionRenderPayload,
} from "./render-caps.ts";
import { sessionRenderMatrixRows } from "./render-matrix.ts";

const encoder = new TextEncoder();

test("session render cap policy follows matrix caps and falls back unknown event kinds", () => {
  assert.equal(isSessionStructuredEventKind("tool_output"), true);
  assert.equal(isSessionStructuredEventKind("provider_custom_delta"), false);

  const toolOutput = sessionRenderCapPolicyFor("tool_output");
  assert.equal(toolOutput.eventKind, "tool_output");
  assert.equal(toolOutput.usedUnknownFallback, false);
  assert.equal(toolOutput.maxPreviewChars, 280);
  assert.equal(toolOutput.maxDetailBytes, 64 * 1024);

  const unknown = sessionRenderCapPolicyFor("provider_custom_delta");
  assert.equal(unknown.eventKind, "unknown");
  assert.equal(unknown.usedUnknownFallback, true);
  assert.equal(unknown.maxPreviewChars, 180);
  assert.equal(unknown.maxDetailBytes, 16 * 1024);
});

test("preview caps stay inside per-event matrix limits and report omitted characters", () => {
  for (const row of sessionRenderMatrixRows) {
    const result = capSessionRenderPreview(row.eventKind, `${row.eventKind}: ${"x".repeat(row.maxPreviewChars * 2)}`);
    assert.equal(result.truncated, true, `${row.eventKind} preview should truncate`);
    assert.ok(result.text.length <= row.maxPreviewChars, `${row.eventKind} preview must stay capped`);
    assert.ok(result.text.includes(SESSION_RENDER_TRUNCATION_MARKER), `${row.eventKind} preview needs truncation marker`);
    assert.ok(result.omittedChars > 0, `${row.eventKind} preview needs omitted count`);
  }
});

test("text caps preserve uncapped text and reject invalid limits", () => {
  const uncapped = capSessionRenderText("short", 12);
  assert.equal(uncapped.text, "short");
  assert.equal(uncapped.truncated, false);
  assert.equal(uncapped.omittedChars, 0);

  assert.throws(() => capSessionRenderText("x", 0), RangeError);
  assert.throws(() => capSessionRenderDetailText("x", -1), RangeError);
});

test("detail payload caps serialize safely without mutating the canonical payload", () => {
  const payload: Record<string, unknown> = {
    status: "ok",
    output: "y".repeat(80 * 1024),
    count: 12n,
  };
  payload.self = payload;

  const beforeKeys = Object.keys(payload).sort();
  const result = capSessionRenderDetailPayload("tool_output", payload);

  assert.equal(result.truncated, true);
  assert.ok(encoder.encode(result.text).byteLength <= result.maxBytes);
  assert.ok(result.text.includes(SESSION_RENDER_TRUNCATION_MARKER));
  assert.ok(result.omittedBytes > 0);
  assert.deepEqual(Object.keys(payload).sort(), beforeKeys);
  assert.equal(payload.self, payload);
});

test("detail caps handle multibyte text without exceeding byte limits", () => {
  const result = capSessionRenderDetailText("á".repeat(1000), 111);
  assert.equal(result.truncated, true);
  assert.ok(encoder.encode(result.text).byteLength <= 111);
  assert.ok(result.omittedBytes > 0);
});

test("payload stringification handles unsupported JSON values deterministically", () => {
  const symbol = Symbol("session");
  const text = stringifySessionRenderPayload({
    fn: () => "ignored",
    symbol,
    nested: { ok: true },
  });

  assert.match(text, /"\[Function\]"/u);
  assert.match(text, /"Symbol\(session\)"/u);
  assert.match(text, /"ok": true/u);
});
