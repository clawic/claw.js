import assert from "node:assert/strict";
import { test } from "vitest";

import {
  SESSION_DATABASE_JSON_MAX_BYTES,
  SESSION_JSON_CONTRACT_VERSION,
  SESSION_MESSAGE_APPENDED_EVENT_MAX_BYTES,
  parseSessionDatabaseProjectionJson,
  parseSessionMessageAppendedEventJson,
} from "./json-contracts.ts";

const validSession = {
  id: "session.contract",
  agent: "codex",
  runtime: "local",
  machine: "mac",
  workspaceId: "workspace.local",
  projectId: "project.local",
  projectPath: "/tmp/project",
  runtimeAdapter: "codex",
  runtimeSessionId: "runtime.session",
  title: "Contract fixture",
  createdAt: 1,
  lastMessageAt: 2,
  messageCount: 1,
  pinned: false,
  archived: false,
  sidebarVisible: true,
  branch: "main",
  cwd: "/tmp/project",
  status: "active",
  customMetadata: null,
};

const validMessage = {
  id: "message.contract",
  sessionId: "session.contract",
  role: "assistant",
  contentText: "OK",
  contentBlocks: null,
  timestamp: 2,
  toolCalls: null,
  timeline: null,
  workSummary: null,
  streamingState: "complete",
  audioRef: null,
  attachments: null,
  sourceNativeId: null,
};

const validProjection = {
  schemaVersion: SESSION_JSON_CONTRACT_VERSION,
  session: validSession,
  messages: [validMessage],
};

const validMessageAppended = {
  schemaVersion: SESSION_JSON_CONTRACT_VERSION,
  type: "message.appended",
  sessionId: "session.contract",
  messageId: "message.contract",
  at: 2,
  payload: validMessage,
};

function encode(value: unknown): string {
  return JSON.stringify(value);
}

test("session database projection JSON contract covers valid, partial-error, and invalid fixtures", () => {
  const valid = parseSessionDatabaseProjectionJson(encode(validProjection));
  assert.equal(valid.ok, true);

  const partial = parseSessionDatabaseProjectionJson(encode({
    ...validProjection,
    partialErrors: [{ code: "source_line_skipped", message: "Skipped invalid source row.", path: "messages.1" }],
  }));
  assert.equal(partial.ok, true);

  const incomplete = parseSessionDatabaseProjectionJson(encode({
    ...validProjection,
    session: { ...validSession, id: "" },
  }));
  assert.equal(incomplete.ok, false);
  if (!incomplete.ok) {
    assert.equal(incomplete.error.code, "sessions_json_schema_invalid");
    assert.equal(incomplete.error.issues?.some((entry) => entry.path === "session.id"), true);
  }
});

test("session database projection JSON contract rejects version drift, extra fields, oversized, malformed, and truncated payloads", () => {
  const versioned = parseSessionDatabaseProjectionJson(encode({ ...validProjection, schemaVersion: 2 }));
  assert.equal(versioned.ok, false);
  if (!versioned.ok) assert.equal(versioned.error.code, "sessions_json_schema_invalid");

  const extra = parseSessionDatabaseProjectionJson(encode({ ...validProjection, ignoredByBridge: true }));
  assert.equal(extra.ok, false);
  if (!extra.ok) {
    assert.equal(extra.error.code, "sessions_json_unknown_fields");
    assert.deepEqual(extra.error.fields, ["ignoredByBridge"]);
  }

  const oversized = parseSessionDatabaseProjectionJson(" ".repeat(SESSION_DATABASE_JSON_MAX_BYTES + 1));
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.equal(oversized.error.code, "sessions_json_payload_oversized");

  const malformed = parseSessionDatabaseProjectionJson("{]");
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "sessions_json_malformed");

  const truncated = parseSessionDatabaseProjectionJson(encode(validProjection).slice(0, -1));
  assert.equal(truncated.ok, false);
  if (!truncated.ok) assert.equal(truncated.error.code, "sessions_json_truncated");
});

test("message.appended event JSON contract covers valid, partial-error, and invalid fixtures", () => {
  const valid = parseSessionMessageAppendedEventJson(encode(validMessageAppended));
  assert.equal(valid.ok, true);

  const partial = parseSessionMessageAppendedEventJson(encode({
    ...validMessageAppended,
    partialErrors: [{ code: "attachment_omitted", message: "Attachment metadata was omitted.", path: "payload.attachments" }],
  }));
  assert.equal(partial.ok, true);

  const incomplete = parseSessionMessageAppendedEventJson(encode({ ...validMessageAppended, messageId: "" }));
  assert.equal(incomplete.ok, false);
  if (!incomplete.ok) {
    assert.equal(incomplete.error.code, "sessions_json_schema_invalid");
    assert.equal(incomplete.error.issues?.some((entry) => entry.path === "messageId"), true);
  }
});

test("message.appended event JSON contract rejects version drift, extra fields, oversized, malformed, and truncated payloads", () => {
  const versioned = parseSessionMessageAppendedEventJson(encode({ ...validMessageAppended, schemaVersion: 2 }));
  assert.equal(versioned.ok, false);
  if (!versioned.ok) assert.equal(versioned.error.code, "sessions_json_schema_invalid");

  const extra = parseSessionMessageAppendedEventJson(encode({ ...validMessageAppended, ignoredByRelay: true }));
  assert.equal(extra.ok, false);
  if (!extra.ok) {
    assert.equal(extra.error.code, "sessions_json_unknown_fields");
    assert.deepEqual(extra.error.fields, ["ignoredByRelay"]);
  }

  const oversized = parseSessionMessageAppendedEventJson(" ".repeat(SESSION_MESSAGE_APPENDED_EVENT_MAX_BYTES + 1));
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.equal(oversized.error.code, "sessions_json_payload_oversized");

  const malformed = parseSessionMessageAppendedEventJson("{]");
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "sessions_json_malformed");

  const truncated = parseSessionMessageAppendedEventJson(encode(validMessageAppended).slice(0, -1));
  assert.equal(truncated.ok, false);
  if (!truncated.ok) assert.equal(truncated.error.code, "sessions_json_truncated");
});
