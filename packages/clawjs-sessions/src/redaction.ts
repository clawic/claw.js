const INDEXED_TEXT_REDACTIONS: Array<[RegExp, string]> = [
  [/\b(authorization)\s*[:=]\s*Bearer\s+[A-Za-z0-9._~+/-]+/gi, "$1=[REDACTED]"],
  [/\b(api[_-]?key|token|secret|password|passwd|pwd)\s*[:=]\s*["']?[^"'\s,;)}\]]+/gi, "$1=[REDACTED]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [REDACTED]"],
  [/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-[REDACTED]"],
];

export function redactIndexedText(text: string | null): string | null {
  if (!text) return null;
  let next = text;
  for (const [pattern, replacement] of INDEXED_TEXT_REDACTIONS) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

export function redactSearchableText(text: string): string {
  return redactIndexedText(text) ?? "";
}

export function indexedTextWasRedacted(original: string, redacted: string): boolean {
  return original !== redacted;
}
