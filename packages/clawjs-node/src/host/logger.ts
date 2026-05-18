import { maskCredential } from "@clawjs/core";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  detail?: Record<string, unknown>;
}

export interface StructuredLogSink {
  write(entry: StructuredLogEntry): void;
}

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

function redactString(value: string): string {
  const masked = maskCredential(value);
  return masked ?? "[REDACTED]";
}

function redactSensitiveText(value: string): string {
  let redacted = value;

  redacted = redacted.replaceAll(INLINE_SECRET_PATTERNS[0], (_match, token: string) => `Bearer ${redactString(token)}`);
  redacted = redacted.replaceAll(INLINE_SECRET_PATTERNS[1], (match: string) => redactString(match));
  redacted = redacted.replaceAll(
    INLINE_SECRET_PATTERNS[2],
    (_match, label: string, secret: string) => `${label}: ${redactString(secret)}`,
  );

  return redacted;
}

export function redactSecrets<TValue>(value: TValue): TValue {
  if (typeof value === "string") {
    return redactSensitiveText(value) as TValue;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactSecrets(entry)) as TValue;
  }
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

export class MemoryStructuredLogSink implements StructuredLogSink {
  readonly entries: StructuredLogEntry[] = [];

  write(entry: StructuredLogEntry): void {
    this.entries.push(entry);
  }
}

export class StructuredLogger {
  private readonly sink: StructuredLogSink;
  private readonly baseDetail: Record<string, unknown>;

  constructor(
    sink: StructuredLogSink = { write: () => {} },
    baseDetail: Record<string, unknown> = {},
  ) {
    this.sink = sink;
    this.baseDetail = baseDetail;
  }

  child(detail: Record<string, unknown>): StructuredLogger {
    return new StructuredLogger(this.sink, {
      ...this.baseDetail,
      ...detail,
    });
  }

  log(level: LogLevel, event: string, detail?: Record<string, unknown>): StructuredLogEntry {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...(detail || Object.keys(this.baseDetail).length > 0
        ? { detail: redactSecrets({ ...this.baseDetail, ...(detail ?? {}) }) }
        : {}),
    };
    this.sink.write(entry);
    return entry;
  }

  debug(event: string, detail?: Record<string, unknown>): StructuredLogEntry {
    return this.log("debug", event, detail);
  }

  info(event: string, detail?: Record<string, unknown>): StructuredLogEntry {
    return this.log("info", event, detail);
  }

  warn(event: string, detail?: Record<string, unknown>): StructuredLogEntry {
    return this.log("warn", event, detail);
  }

  error(event: string, detail?: Record<string, unknown>): StructuredLogEntry {
    return this.log("error", event, detail);
  }
}
