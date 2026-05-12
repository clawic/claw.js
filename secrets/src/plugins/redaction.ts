// Post-response redaction. Walks the body+headers of a response and
// substitutes any secret value found by `[REDACTED]`. Defense-in-depth
// against APIs that echo tokens in error bodies, redirect URLs, etc.

export function redactString(input: string, secrets: Iterable<string>): string {
  let out = input;
  for (const secret of secrets) {
    if (!secret) continue;
    if (secret.length < 6) continue; // skip too-short values to avoid false positives
    out = out.split(secret).join("[REDACTED]");
  }
  return out;
}

export function redactHeaders(headers: Record<string, string>, secrets: Iterable<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = redactString(value, secrets);
  }
  return out;
}
