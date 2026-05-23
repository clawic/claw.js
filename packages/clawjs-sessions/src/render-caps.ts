import { TextEncoder } from "node:util";

import { sessionRenderMatrix, sessionRenderMatrixRowFor } from "./render-matrix.ts";
import type { SessionStructuredEventKind } from "./types.ts";

export const SESSION_RENDER_TRUNCATION_MARKER = "... [truncated]";

export interface SessionRenderCapPolicy {
  eventKind: SessionStructuredEventKind;
  maxPreviewChars: number;
  maxDetailBytes: number;
  usedUnknownFallback: boolean;
}

export interface SessionRenderTextCap {
  text: string;
  originalChars: number;
  omittedChars: number;
  maxChars: number;
  truncated: boolean;
}

export interface SessionRenderDetailCap {
  text: string;
  originalBytes: number;
  omittedBytes: number;
  maxBytes: number;
  truncated: boolean;
}

const encoder = new TextEncoder();

export function isSessionStructuredEventKind(value: unknown): value is SessionStructuredEventKind {
  return typeof value === "string" && value in sessionRenderMatrix;
}

export function sessionRenderCapPolicyFor(eventKind: string | null | undefined): SessionRenderCapPolicy {
  const normalizedKind = isSessionStructuredEventKind(eventKind) ? eventKind : "unknown";
  const row = sessionRenderMatrixRowFor(normalizedKind);
  return {
    eventKind: normalizedKind,
    maxPreviewChars: row.maxPreviewChars,
    maxDetailBytes: row.maxDetailBytes,
    usedUnknownFallback: normalizedKind !== eventKind,
  };
}

export function capSessionRenderPreview(
  eventKind: string | null | undefined,
  text: string | null | undefined,
): SessionRenderTextCap {
  const policy = sessionRenderCapPolicyFor(eventKind);
  return capSessionRenderText(text ?? "", policy.maxPreviewChars);
}

export function capSessionRenderText(text: string, maxChars: number): SessionRenderTextCap {
  if (!Number.isSafeInteger(maxChars) || maxChars <= 0) {
    throw new RangeError("maxChars must be a positive safe integer");
  }

  const chars = Array.from(text);
  if (chars.length <= maxChars) {
    return {
      text,
      originalChars: chars.length,
      omittedChars: 0,
      maxChars,
      truncated: false,
    };
  }

  const suffixFor = (omitted: number) => `${SESSION_RENDER_TRUNCATION_MARKER}: ${omitted} chars omitted`;
  let suffix = suffixFor(chars.length);
  if (suffix.length >= maxChars) {
    return {
      text: suffix.slice(0, maxChars),
      originalChars: chars.length,
      omittedChars: chars.length,
      maxChars,
      truncated: true,
    };
  }

  let prefixChars = Math.max(0, maxChars - suffix.length);
  let omittedChars = chars.length - prefixChars;
  suffix = suffixFor(omittedChars);
  prefixChars = Math.max(0, maxChars - suffix.length);
  omittedChars = chars.length - prefixChars;

  return {
    text: `${chars.slice(0, prefixChars).join("")}${suffixFor(omittedChars)}`,
    originalChars: chars.length,
    omittedChars,
    maxChars,
    truncated: true,
  };
}

export function stringifySessionRenderPayload(payload: unknown): string {
  const seen = new WeakSet<object>();
  const text = JSON.stringify(payload, (_key, value: unknown) => {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "function") return "[Function]";
    if (typeof value === "symbol") return value.toString();
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  }, 2);
  return text ?? "null";
}

export function capSessionRenderDetailPayload(
  eventKind: string | null | undefined,
  payload: unknown,
): SessionRenderDetailCap {
  const policy = sessionRenderCapPolicyFor(eventKind);
  return capSessionRenderDetailText(stringifySessionRenderPayload(payload), policy.maxDetailBytes);
}

export function capSessionRenderDetailText(text: string, maxBytes: number): SessionRenderDetailCap {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }

  const originalBytes = byteLength(text);
  if (originalBytes <= maxBytes) {
    return {
      text,
      originalBytes,
      omittedBytes: 0,
      maxBytes,
      truncated: false,
    };
  }

  const suffixFor = (omitted: number) => `\n${SESSION_RENDER_TRUNCATION_MARKER}: ${omitted} bytes omitted`;
  let suffix = suffixFor(originalBytes);
  let suffixBytes = byteLength(suffix);
  if (suffixBytes >= maxBytes) {
    const text = prefixByUtf8Bytes(suffix, maxBytes);
    return {
      text,
      originalBytes,
      omittedBytes: originalBytes,
      maxBytes,
      truncated: true,
    };
  }

  let prefix = prefixByUtf8Bytes(text, maxBytes - suffixBytes);
  let omittedBytes = originalBytes - byteLength(prefix);
  suffix = suffixFor(omittedBytes);
  suffixBytes = byteLength(suffix);
  prefix = prefixByUtf8Bytes(text, maxBytes - suffixBytes);
  omittedBytes = originalBytes - byteLength(prefix);

  return {
    text: `${prefix}${suffixFor(omittedBytes)}`,
    originalBytes,
    omittedBytes,
    maxBytes,
    truncated: true,
  };
}

function byteLength(text: string): number {
  return encoder.encode(text).byteLength;
}

function prefixByUtf8Bytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  if (byteLength(text) <= maxBytes) return text;
  const chars: string[] = [];
  let usedBytes = 0;
  for (const char of text) {
    const nextBytes = byteLength(char);
    if (usedBytes + nextBytes > maxBytes) break;
    chars.push(char);
    usedBytes += nextBytes;
  }
  return chars.join("");
}
