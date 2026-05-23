import {
  clawDefaultStreamingBackpressurePolicy,
  clawSessionEvents,
  estimateUtf8Bytes,
} from "@clawjs/core";

import type {
  SessionEvent,
  SessionMessageRecord,
  SessionRecord,
} from "./types.ts";

export const SESSION_JSON_CONTRACT_VERSION = 1;
export const SESSION_DATABASE_JSON_MAX_BYTES = 4 * 1024 * 1024;
export const SESSION_MESSAGE_APPENDED_EVENT_MAX_BYTES = clawDefaultStreamingBackpressurePolicy.maxFrameBytes;

export type SessionJsonContractId = "claw.database.sessions" | "claw.event.sessions.message.appended";

export type SessionJsonContractErrorCode =
  | "sessions_json_payload_oversized"
  | "sessions_json_truncated"
  | "sessions_json_malformed"
  | "sessions_json_unknown_fields"
  | "sessions_json_schema_invalid";

export type SessionJsonParseResult<T> =
  | { ok: true; contractId: SessionJsonContractId; byteLength: number; value: T }
  | {
    ok: false;
    contractId: SessionJsonContractId;
    byteLength: number;
    error: {
      code: SessionJsonContractErrorCode;
      message: string;
      maxBytes?: number;
      fields?: string[];
      issues?: Array<{ path: string; message: string }>;
    };
  };

export interface SessionDatabaseJsonProjection {
  schemaVersion: typeof SESSION_JSON_CONTRACT_VERSION;
  session: SessionRecord;
  messages: SessionMessageRecord[];
  partialErrors?: Array<{ code: string; message: string; path?: string }>;
}

const textDecoder = new TextDecoder("utf8", { fatal: false });

function normalizeJsonInput(input: string | Uint8Array): string {
  return typeof input === "string" ? input : textDecoder.decode(input);
}

function isJsonTruncationError(error: unknown, text: string): boolean {
  const trimmed = text.trim();
  const looksCutOff = (trimmed.startsWith("{") && !/[}\]]$/.test(trimmed))
    || (trimmed.startsWith("[") && !/[\]}]$/.test(trimmed));
  return error instanceof SyntaxError
    && (looksCutOff || /unexpected end|unterminated|end of json input|after property value in json|after array element in json/i.test(error.message));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseSessionJsonContract<T>(
  input: string | Uint8Array,
  contractId: SessionJsonContractId,
  maxBytes: number,
  allowedTopLevelKeys: readonly string[],
  validate: (value: Record<string, unknown>) => T | Array<{ path: string; message: string }>,
): SessionJsonParseResult<T> {
  const text = normalizeJsonInput(input);
  const byteLength = estimateUtf8Bytes(text);
  if (byteLength > maxBytes) {
    return {
      ok: false,
      contractId,
      byteLength,
      error: {
        code: "sessions_json_payload_oversized",
        message: `${contractId} JSON payload exceeds ${maxBytes} bytes`,
        maxBytes,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      contractId,
      byteLength,
      error: {
        code: isJsonTruncationError(error, text) ? "sessions_json_truncated" : "sessions_json_malformed",
        message: error instanceof Error ? error.message : `${contractId} JSON payload is malformed`,
      },
    };
  }

  if (!isRecord(parsed)) {
    return schemaError(contractId, byteLength, [{ path: "", message: "payload must be an object" }]);
  }

  const allowed = new Set(allowedTopLevelKeys);
  const fields = Object.keys(parsed).filter((key) => !allowed.has(key));
  if (fields.length > 0) {
    return {
      ok: false,
      contractId,
      byteLength,
      error: {
        code: "sessions_json_unknown_fields",
        message: `${contractId} JSON payload contains unsupported top-level fields`,
        fields,
      },
    };
  }

  const validated = validate(parsed);
  if (Array.isArray(validated)) return schemaError(contractId, byteLength, validated);
  return { ok: true, contractId, byteLength, value: validated };
}

function schemaError<T>(
  contractId: SessionJsonContractId,
  byteLength: number,
  issues: Array<{ path: string; message: string }>,
): SessionJsonParseResult<T> {
  return {
    ok: false,
    contractId,
    byteLength,
    error: {
      code: "sessions_json_schema_invalid",
      message: `${contractId} JSON payload failed schema validation`,
      issues,
    },
  };
}

function issue(path: string, message: string): { path: string; message: string } {
  return { path, message };
}

function validateSessionRecord(value: unknown, path: string): Array<{ path: string; message: string }> {
  if (!isRecord(value)) return [issue(path, "session must be an object")];
  const issues: Array<{ path: string; message: string }> = [];
  for (const key of ["id", "agent", "title", "status"]) {
    if (typeof value[key] !== "string" || value[key] === "") issues.push(issue(`${path}.${key}`, "must be a non-empty string"));
  }
  for (const key of ["createdAt", "messageCount"]) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) issues.push(issue(`${path}.${key}`, "must be a finite number"));
  }
  for (const key of ["pinned", "archived", "sidebarVisible"]) {
    if (typeof value[key] !== "boolean") issues.push(issue(`${path}.${key}`, "must be a boolean"));
  }
  return issues;
}

function validateSessionMessage(value: unknown, path: string): Array<{ path: string; message: string }> {
  if (!isRecord(value)) return [issue(path, "message must be an object")];
  const issues: Array<{ path: string; message: string }> = [];
  for (const key of ["id", "sessionId", "role", "contentText"]) {
    if (typeof value[key] !== "string" || value[key] === "") issues.push(issue(`${path}.${key}`, "must be a non-empty string"));
  }
  if (typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp)) issues.push(issue(`${path}.timestamp`, "must be a finite number"));
  return issues;
}

function validatePartialErrors(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((entry) => (
    isRecord(entry)
    && typeof entry.code === "string"
    && typeof entry.message === "string"
    && (entry.path === undefined || typeof entry.path === "string")
  )));
}

function validateSessionDatabaseProjection(value: Record<string, unknown>): SessionDatabaseJsonProjection | Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  if (value.schemaVersion !== SESSION_JSON_CONTRACT_VERSION) issues.push(issue("schemaVersion", "must be 1"));
  issues.push(...validateSessionRecord(value.session, "session"));
  if (!Array.isArray(value.messages)) {
    issues.push(issue("messages", "must be an array"));
  } else {
    value.messages.forEach((message, index) => issues.push(...validateSessionMessage(message, `messages.${index}`)));
  }
  if (!validatePartialErrors(value.partialErrors)) issues.push(issue("partialErrors", "must contain parseable error records"));
  if (issues.length > 0) return issues;
  return value as unknown as SessionDatabaseJsonProjection;
}

function validateSessionServiceEvent(value: Record<string, unknown>): SessionEvent | Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  if (value.schemaVersion !== SESSION_JSON_CONTRACT_VERSION) issues.push(issue("schemaVersion", "must be 1"));
  if (typeof value.type !== "string" || value.type === "") issues.push(issue("type", "must be a non-empty string"));
  if (typeof value.at !== "number" || !Number.isFinite(value.at)) issues.push(issue("at", "must be a finite number"));
  if (!("payload" in value)) issues.push(issue("payload", "is required"));
  if (!validatePartialErrors(value.partialErrors)) issues.push(issue("partialErrors", "must contain parseable error records"));
  if (value.type === clawSessionEvents.messageAppended) {
    if (typeof value.sessionId !== "string" || value.sessionId === "") issues.push(issue("sessionId", "must be a non-empty string"));
    if (typeof value.messageId !== "string" || value.messageId === "") issues.push(issue("messageId", "must be a non-empty string"));
    issues.push(...validateSessionMessage(value.payload, "payload"));
  }
  if (issues.length > 0) return issues;
  return value as unknown as SessionEvent;
}

export function parseSessionDatabaseProjectionJson(input: string | Uint8Array): SessionJsonParseResult<SessionDatabaseJsonProjection> {
  return parseSessionJsonContract(input, "claw.database.sessions", SESSION_DATABASE_JSON_MAX_BYTES, [
    "schemaVersion",
    "session",
    "messages",
    "partialErrors",
  ], validateSessionDatabaseProjection);
}

export function parseSessionServiceEventJson(input: string | Uint8Array): SessionJsonParseResult<SessionEvent> {
  return parseSessionJsonContract(input, "claw.event.sessions.message.appended", SESSION_MESSAGE_APPENDED_EVENT_MAX_BYTES, [
    "schemaVersion",
    "type",
    "sessionId",
    "projectId",
    "messageId",
    "at",
    "payload",
    "partialErrors",
  ], validateSessionServiceEvent);
}

export function parseSessionMessageAppendedEventJson(input: string | Uint8Array): SessionJsonParseResult<SessionEvent> {
  const result = parseSessionServiceEventJson(input);
  if (!result.ok) return result;
  if (result.value.type !== clawSessionEvents.messageAppended) {
    return schemaError("claw.event.sessions.message.appended", result.byteLength, [
      issue("type", `must be ${clawSessionEvents.messageAppended}`),
    ]);
  }
  return result;
}
