import { CliHandledError } from "./cli-errors.ts";
import { resolveGeneratedCliCommand } from "./cli-surface.ts";

export type CliJsonMeta = Record<string, unknown> & {
  schemaVersion?: number;
  canonicalCommand?: string | null;
  actor?: unknown;
  guidance?: unknown[];
};

export const CLI_JSON_ENVELOPE_MAX_BYTES = 4 * 1024 * 1024;

export type CliJsonEnvelopeParseErrorCode =
  | "cli_json_envelope_oversized"
  | "cli_json_envelope_truncated"
  | "cli_json_envelope_malformed"
  | "cli_json_envelope_invalid";

export type CliJsonEnvelopeParseResult<TData = unknown> =
  | { ok: true; byteLength: number; envelope: { ok: boolean; data?: TData; error?: { code: string; message: string }; meta?: CliJsonMeta } }
  | { ok: false; byteLength: number; error: { code: CliJsonEnvelopeParseErrorCode; message: string; maxBytes?: number } };

let cliJsonMetaProvider: (() => CliJsonMeta) | null = null;

const SENSITIVE_KEY_PATTERN = /(key|token|secret|authorization|apiKey)/i;
const SAFE_SECRET_METADATA_KEYS = new Set(["missingSecrets", "requiredSecrets"]);
const SAFE_PUBLIC_CATALOG_KEY_FIELDS = new Set(["key", "metricKey", "decisionKey", "domainSystemKey", "domainRoleKey", "operationKey", "profileKind", "canonicalCommand", "mappedCommand", "collectionName"]);
const SAFE_PUBLIC_CATALOG_VALUE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,160}$/;
const UNSAFE_PUBLIC_CATALOG_VALUE_PATTERN = /(token|password|credential|authorization|bearer|sk-)/i;
const INLINE_SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+([A-Za-z0-9._-]{6,})/gi,
  /\b(sk-[A-Za-z0-9._-]{6,})\b/g,
  /\b(api[_ -]?key|token|secret)\b\s*[:=]\s*([^\s,;]+)/gi,
];

export function setCliJsonMetaProvider(provider: (() => CliJsonMeta) | null): void {
  cliJsonMetaProvider = provider;
}

function resolveCliJsonMeta(meta: CliJsonMeta = {}): CliJsonMeta {
  return {
    ...(cliJsonMetaProvider ? cliJsonMetaProvider() : {}),
    ...meta,
  };
}

function writeJson(stream: NodeJS.WritableStream, payload: unknown): void {
  stream.write(`${stringifyCliJson(payload)}\n`);
}

export function writeJsonLine(stream: NodeJS.WritableStream, payload: unknown): void {
  stream.write(`${JSON.stringify(redactSecrets(payload))}\n`);
}

export function stringifyCliJson(payload: unknown): string {
  return JSON.stringify(redactSecrets(payload), null, 2);
}

function cliJsonByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function normalizeCliJsonInput(input: string | Uint8Array): string {
  return typeof input === "string" ? input : new TextDecoder("utf8", { fatal: false }).decode(input);
}

function isCliJsonTruncationError(error: unknown, text: string): boolean {
  const trimmed = text.trim();
  const looksCutOff = (trimmed.startsWith("{") && !/[}\]]$/.test(trimmed))
    || (trimmed.startsWith("[") && !/[\]}]$/.test(trimmed));
  return error instanceof SyntaxError
    && (looksCutOff || /unexpected end|unterminated|end of json input|after property value in json|after array element in json/i.test(error.message));
}

function isCliJsonEnvelope(value: unknown): value is { ok: boolean; data?: unknown; error?: { code: string; message: string }; meta?: CliJsonMeta } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.ok !== "boolean") return false;
  if ("meta" in record && (record.meta === null || typeof record.meta !== "object" || Array.isArray(record.meta))) return false;
  if (record.ok === false) {
    if (!record.error || typeof record.error !== "object" || Array.isArray(record.error)) return false;
    const error = record.error as Record<string, unknown>;
    return typeof error.code === "string" && error.code.length > 0
      && typeof error.message === "string" && error.message.length > 0;
  }
  return true;
}

export function parseCliJsonEnvelope<TData = unknown>(
  input: string | Uint8Array,
  maxBytes = CLI_JSON_ENVELOPE_MAX_BYTES,
): CliJsonEnvelopeParseResult<TData> {
  const text = normalizeCliJsonInput(input);
  const byteLength = cliJsonByteLength(text);
  if (byteLength > maxBytes) {
    return {
      ok: false,
      byteLength,
      error: {
        code: "cli_json_envelope_oversized",
        message: `CLI JSON envelope exceeds ${maxBytes} bytes`,
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
      byteLength,
      error: {
        code: isCliJsonTruncationError(error, text) ? "cli_json_envelope_truncated" : "cli_json_envelope_malformed",
        message: error instanceof Error ? error.message : "CLI JSON envelope is malformed",
      },
    };
  }

  if (!isCliJsonEnvelope(parsed)) {
    return {
      ok: false,
      byteLength,
      error: {
        code: "cli_json_envelope_invalid",
        message: "CLI JSON envelope must include ok and a parseable error object when ok is false",
      },
    };
  }

  return { ok: true, byteLength, envelope: parsed as { ok: boolean; data?: TData; error?: { code: string; message: string }; meta?: CliJsonMeta } };
}

function redactString(value: string): string {
  if (value.length <= 8) return "[REDACTED]";
  return `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

function redactSensitiveText(value: string): string {
  let redacted = value;
  redacted = redacted.replaceAll(INLINE_SECRET_PATTERNS[0], (_match, token: string) => `Bearer ${redactString(token)}`);
  redacted = redacted.replaceAll(INLINE_SECRET_PATTERNS[1], (match: string) => redactString(match));
  redacted = redacted.replaceAll(INLINE_SECRET_PATTERNS[2], (_match, label: string, secret: string) => `${label}: ${redactString(secret)}`);
  return redacted;
}

function redactSecrets<TValue>(value: TValue): TValue {
  if (typeof value === "string") return redactSensitiveText(value) as TValue;
  if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry)) as TValue;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) && !SAFE_SECRET_METADATA_KEYS.has(key) && !isSafePublicCatalogKey(key, entry)
          ? (typeof entry === "string" ? redactString(entry) : isPrimitiveSafeValue(entry) ? entry : "[REDACTED]")
          : redactSecrets(entry),
      ]),
    ) as TValue;
  }
  return value;
}

function isPrimitiveSafeValue(value: unknown): boolean {
  return value === null || typeof value === "boolean" || typeof value === "number";
}

function isSafePublicCatalogKey(key: string, value: unknown): boolean {
  return typeof value === "string"
    && SAFE_PUBLIC_CATALOG_KEY_FIELDS.has(key)
    && SAFE_PUBLIC_CATALOG_VALUE_PATTERN.test(value)
    && !UNSAFE_PUBLIC_CATALOG_VALUE_PATTERN.test(value)
    && redactSensitiveText(value) === value;
}

export function writeJsonOk(stream: NodeJS.WritableStream, data: unknown, meta: CliJsonMeta = {}): void {
  writeJson(stream, {
    ok: true,
    data,
    meta: resolveCliJsonMeta(meta),
  });
}

function writeJsonOkLine(stream: NodeJS.WritableStream, data: unknown, meta: CliJsonMeta = {}): void {
  writeJsonLine(stream, {
    ok: true,
    data,
    meta: resolveCliJsonMeta(meta),
  });
}

export function writeCommandJsonOk(stream: NodeJS.WritableStream, canonicalCommand: string, data: unknown, meta: CliJsonMeta = {}): void {
  const command = resolveGeneratedCliCommand(canonicalCommand);
  writeJsonOk(stream, data, {
    schemaVersion: command?.schemaVersion ?? 1,
    canonicalCommand,
    ...(command?.jsonSchemaId ? { jsonSchemaId: command.jsonSchemaId } : {}),
    ...meta,
  });
}

export function writeCommandJsonOkLine(stream: NodeJS.WritableStream, canonicalCommand: string, data: unknown, meta: CliJsonMeta = {}): void {
  const command = resolveGeneratedCliCommand(canonicalCommand);
  writeJsonOkLine(stream, data, {
    schemaVersion: command?.schemaVersion ?? 1,
    canonicalCommand,
    ...(command?.jsonSchemaId ? { jsonSchemaId: command.jsonSchemaId } : {}),
    ...meta,
  });
}

export function writeCommandJsonError(stream: NodeJS.WritableStream, canonicalCommand: string, error: unknown, meta: CliJsonMeta = {}): void {
  const command = resolveGeneratedCliCommand(canonicalCommand);
  writeJsonError(stream, error, {
    schemaVersion: command?.schemaVersion ?? 1,
    canonicalCommand,
    ...(command?.jsonSchemaId ? { jsonSchemaId: command.jsonSchemaId } : {}),
    ...meta,
  });
}

export function writeJsonError(stream: NodeJS.WritableStream, error: unknown, meta: CliJsonMeta = {}): void {
  const handled = error instanceof CliHandledError
    ? error
    : isHandledCliErrorLike(error)
      ? error
    : new CliHandledError("internal_error", error instanceof Error ? error.message : String(error));
  writeJson(stream, {
    ok: false,
    error: {
      code: handled.code,
      message: handled.message,
    },
    meta: resolveCliJsonMeta(meta),
  });
}

function isHandledCliErrorLike(error: unknown): error is { code: string; message: string } {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && typeof (error as { code?: unknown }).code === "string"
    && "message" in error
    && typeof (error as { message?: unknown }).message === "string";
}

export function cliErrorFromUnknown(error: unknown): CliHandledError {
  return error instanceof CliHandledError
    ? error
    : new CliHandledError("internal_error", error instanceof Error ? error.message : String(error));
}
