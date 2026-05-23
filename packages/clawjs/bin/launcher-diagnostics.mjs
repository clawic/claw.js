const SECRET_TEXT_PATTERNS = [
  /\bBearer\s+([A-Za-z0-9._-]{6,})/gi,
  /\b(sk-[A-Za-z0-9._-]{6,})\b/g,
  /\b(api[_ -]?key|token|secret)\b\s*[:=]\s*([^\s,;]+)/gi,
  /\/Users\/[^/\s]+/g,
];

export function createLauncherDiagnostic(code, message, options = {}) {
  return {
    code,
    status: options.status ?? "FAIL",
    message,
    location: options.location ?? "claw.open.launcher",
    suggestion: options.suggestion ?? "Inspect the named launcher dependency before retrying.",
    safeNextStep: options.safeNextStep ?? "Fix the reported launcher input or build artifact, then rerun the same claw open command.",
  };
}

export function printLauncherFailure(title, diagnostics, stream = process.stderr) {
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
  return {
    code: redactSensitiveText(String(diagnostic.code || "claw_open_launcher_failed")),
    status: redactSensitiveText(String(diagnostic.status || "FAIL")),
    message: redactSensitiveText(String(diagnostic.message || "Launcher failed.")),
    location: redactSensitiveText(String(diagnostic.location || "claw.open.launcher")),
    suggestion: redactSensitiveText(String(diagnostic.suggestion || "Inspect the named launcher dependency before retrying.")),
    safeNextStep: redactSensitiveText(String(diagnostic.safeNextStep || "Fix the reported launcher input or build artifact, then rerun the same claw open command.")),
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
  printLauncherFailure("claw open launcher failed for /Users/example/private", [
    createLauncherDiagnostic("claw_open_launcher_entry_missing", "token: sk-test-secret-123456", {
      location: "/Users/example/private/repo/packages/clawjs/bin",
      suggestion: "Build the package that provides the server entrypoint.",
      safeNextStep: "Run npm --workspace @clawjs/secrets run build, then rerun claw open secrets.",
    }),
  ], { write: (chunk) => chunks.push(chunk) });
  const output = chunks.join("");
  if (!output.includes("code: claw_open_launcher_entry_missing")) throw new Error("self-test missing stable code");
  if (!output.includes("suggestion: Build the package that provides the server entrypoint.")) throw new Error("self-test missing suggestion");
  if (!output.includes("next: Run npm --workspace @clawjs/secrets run build, then rerun claw open secrets.")) throw new Error("self-test missing next step");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
  console.log("launcher diagnostics self-test passed");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else {
    printLauncherFailure("launcher diagnostics usage failed:", [
      createLauncherDiagnostic("claw_open_launcher_diagnostics_usage", "Use --self-test or import this helper from a launcher.", {
        status: "USAGE",
        location: "packages/clawjs/bin/launcher-diagnostics.mjs",
        suggestion: "Import createLauncherDiagnostic and printLauncherFailure from launcher scripts.",
        safeNextStep: "Run node packages/clawjs/bin/launcher-diagnostics.mjs --self-test.",
      }),
    ]);
    process.exit(64);
  }
}
