#!/usr/bin/env node

const SECRET_TEXT_PATTERNS = [
  /\bBearer\s+([A-Za-z0-9._-]{6,})/gi,
  /\b(sk-[A-Za-z0-9._-]{6,})\b/g,
  /\b(api[_ -]?key|token|secret)\b\s*[:=]\s*([^\s,;]+)/gi,
  /\/Users\/[^/\s]+/g,
];

export function createDiagnostic(code, message, options = {}) {
  return {
    code,
    status: options.status ?? "FAIL",
    message,
    location: options.location ?? "script.runtime",
    suggestion: options.suggestion ?? "Inspect the named file or command output before retrying.",
    safeNextStep: options.safeNextStep ?? "Fix the reported input or baseline, then rerun the same script.",
  };
}

export function printActionableFailureReport({ title, diagnostics, stream = process.stderr }) {
  stream.write(`${redactSensitiveText(title)}\n`);
  for (const diagnostic of diagnostics.map(normalizeDiagnostic)) {
    stream.write(`- [${diagnostic.status}] ${diagnostic.message}\n`);
    stream.write(`  code: ${diagnostic.code}\n`);
    stream.write(`  location: ${diagnostic.location}\n`);
    stream.write(`  suggestion: ${diagnostic.suggestion}\n`);
    stream.write(`  next: ${diagnostic.safeNextStep}\n`);
  }
}

export function normalizeDiagnostic(diagnostic) {
  if (typeof diagnostic === "string") return createDiagnostic("script_check_failed", redactSensitiveText(diagnostic));
  return {
    code: redactSensitiveText(String(diagnostic.code || "script_check_failed")),
    status: redactSensitiveText(String(diagnostic.status || "FAIL")),
    message: redactSensitiveText(String(diagnostic.message || "Script check failed.")),
    location: redactSensitiveText(String(diagnostic.location || "script.runtime")),
    suggestion: redactSensitiveText(String(diagnostic.suggestion || "Inspect the named file or command output before retrying.")),
    safeNextStep: redactSensitiveText(String(diagnostic.safeNextStep || "Fix the reported input or baseline, then rerun the same script.")),
  };
}

export function redactSensitiveText(value) {
  let redacted = String(value);
  redacted = redacted.replaceAll(SECRET_TEXT_PATTERNS[0], "Bearer [REDACTED]");
  redacted = redacted.replaceAll(SECRET_TEXT_PATTERNS[1], "[REDACTED]");
  redacted = redacted.replaceAll(SECRET_TEXT_PATTERNS[2], (_match, label) => `${label}: [REDACTED]`);
  redacted = redacted.replaceAll(SECRET_TEXT_PATTERNS[3], "~");
  return redacted;
}

function runSelfTest() {
  const chunks = [];
  printActionableFailureReport({
    title: "Example script failed for /Users/example/private",
    diagnostics: [
      createDiagnostic("example_failure", "token: sk-test-secret-123456", {
        location: "/Users/example/private/repo/file.json",
        suggestion: "Use synthetic fixtures.",
        safeNextStep: "Rerun node scripts/actionable-error.mjs --self-test.",
      }),
    ],
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  if (!output.includes("code: example_failure")) throw new Error("self-test missing stable code");
  if (!output.includes("location: ~/private/repo/file.json")) throw new Error("self-test missing redacted location");
  if (!output.includes("next: Rerun node scripts/actionable-error.mjs --self-test.")) throw new Error("self-test missing next step");
  if (output.includes("sk-test-secret-123456") || output.includes("/Users/example")) throw new Error("self-test leaked private data");
  console.log("actionable error helper self-test passed");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else {
    printActionableFailureReport({
      title: "actionable error helper usage error:",
      diagnostics: [
        createDiagnostic("usage_error", "Use --self-test or import this helper from a script.", {
          status: "USAGE",
          location: "scripts/actionable-error.mjs",
          suggestion: "Import createDiagnostic and printActionableFailureReport from Node guard scripts.",
          safeNextStep: "Run node scripts/actionable-error.mjs --self-test.",
        }),
      ],
    });
    process.exit(64);
  }
}
