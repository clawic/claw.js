#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliBin = path.join(repoRoot, "packages/clawjs/bin/claw.mjs");
const SCRIPT_PATH = "scripts/inspectability-gate.mjs";
const forbiddenFragments = [
  "Cannot find module",
  "ERR_MODULE_NOT_FOUND",
  "module not found",
  "CLI dist not built",
  "no such column",
  "SQLITE_ERROR",
];

class GateFailure extends Error {
  constructor(diagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    runSelfTest();
    return;
  }
  if (args.length > 0) {
    printActionableFailureReport({
      title: "inspectability gate usage failed:",
      diagnostics: [
        createDiagnostic("inspectability_gate_usage_error", `Unknown option(s): ${args.join(" ")}`, {
          status: "USAGE",
          location: SCRIPT_PATH,
          suggestion: "Use --self-test or run the gate without arguments.",
          safeNextStep: `Run node ${SCRIPT_PATH}.`,
        }),
      ],
    });
    process.exit(64);
  }
  try {
    runGate();
  } catch (error) {
    printActionableFailureReport({
      title: "inspectability gate failed:",
      diagnostics: [diagnosticFromError(error)],
    });
    process.exit(1);
  }
}

function fail(code, message, options = {}) {
  throw new GateFailure(createDiagnostic(code, message, {
    location: options.location ?? SCRIPT_PATH,
    suggestion: options.suggestion ?? "Fix the named CLI envelope or schema contract before rerunning the gate.",
    safeNextStep: options.safeNextStep ?? `Rerun node ${SCRIPT_PATH} after the CLI command returns a valid JSON envelope.`,
  }));
}

function runCli(label, args) {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd: repoRoot,
    env: { ...process.env, FORCE_COLOR: "0" },
    encoding: "utf8",
  });
  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  for (const fragment of forbiddenFragments) {
    if (combinedOutput.toLowerCase().includes(fragment.toLowerCase())) {
      fail(
        "inspectability_gate_forbidden_cli_output",
        `${label} exposed a known inspectability failure fragment: ${fragment}`,
        {
          location: label,
          suggestion: "Fix the CLI command so it returns the common JSON error envelope instead of a raw runtime failure.",
        },
      );
    }
  }
  if (result.status !== 0) {
    fail("inspectability_gate_cli_nonzero", `${label} exited ${result.status ?? "without a status"}.`, {
      location: label,
      suggestion: "Run the named CLI command directly and fix the first structured diagnostic it returns.",
    });
  }
  const stdout = (result.stdout ?? "").trim();
  if (!stdout.startsWith("{")) {
    fail("inspectability_gate_json_envelope_missing", `${label} did not return a JSON object envelope.`, {
      location: label,
      suggestion: "Make the command write a JSON object to stdout when --json is present.",
    });
  }
  try {
    return JSON.parse(stdout);
  } catch (error) {
    fail("inspectability_gate_invalid_json", `${label} returned invalid JSON.`, {
      location: label,
      suggestion: "Keep human-readable diagnostics on stderr and valid JSON on stdout.",
      safeNextStep: `Run ${label} directly, repair stdout JSON formatting, then rerun node ${SCRIPT_PATH}.`,
    });
  }
}

function assertEnvelope(label, payload) {
  if (!payload || typeof payload !== "object") {
    fail("inspectability_gate_payload_not_object", `${label} returned a non-object payload.`, { location: label });
  }
  if (payload.ok !== true) {
    fail("inspectability_gate_payload_not_ok", `${label} returned ok=false.`, {
      location: label,
      suggestion: "Fix the command failure reported by its JSON envelope, then rerun this gate.",
    });
  }
  if (!payload.meta || payload.meta.schemaVersion !== 1) {
    fail("inspectability_gate_meta_missing", `${label} returned a payload without the common meta.schemaVersion envelope.`, {
      location: label,
      suggestion: "Attach meta.schemaVersion=1 to the CLI JSON envelope.",
    });
  }
}

function runGate() {
  const schemas = runCli("claw inspect schemas --json", ["inspect", "schemas", "--json"]);
  assertEnvelope("claw inspect schemas --json", schemas);
  if (schemas.meta.canonicalCommand !== "inspect" || schemas.meta.subcommand !== "schemas") {
    fail("inspectability_gate_inspect_metadata_mismatch", "claw inspect schemas --json returned unexpected inspect metadata.", {
      location: "claw inspect schemas --json",
      suggestion: "Restore canonicalCommand=inspect and subcommand=schemas in the inspect JSON metadata.",
    });
  }
  if (!Array.isArray(schemas.data) || !schemas.data.some((entry) => entry?.id === "claw.contracts.schemas")) {
    fail("inspectability_gate_schema_root_missing", "claw inspect schemas --json did not include the canonical schema root.", {
      location: "claw.contracts.schemas",
      suggestion: "Restore the canonical schema root entry before rerunning the gate.",
    });
  }

  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-inspectability-"));
  try {
    const patientsSchema = runCli("claw collections patients schema --json", [
      "collections",
      "patients",
      "schema",
      "--workspace",
      workspaceRoot,
      "--json",
    ]);
    assertEnvelope("claw collections patients schema --json", patientsSchema);
    if (patientsSchema.data?.collection?.name !== "patients") {
      fail("inspectability_gate_patients_schema_missing", "claw collections patients schema --json did not return the patients schema.", {
        location: "collections.patients.schema",
        suggestion: "Restore the built-in patients collection schema response.",
      });
    }
    if (!patientsSchema.data.exists) {
      fail("inspectability_gate_patients_not_materialized", "claw collections patients schema --json did not materialize the built-in patients collection.", {
        location: "collections.patients.exists",
        suggestion: "Fix collection materialization for temporary workspaces.",
      });
    }
    if (!patientsSchema.data.collection.fields?.some((field) => field?.name === "displayName" && field?.required === true)) {
      fail("inspectability_gate_display_name_missing", "claw collections patients schema --json did not include the required displayName field.", {
        location: "collections.patients.fields.displayName",
        suggestion: "Restore displayName as a required field on the patients schema.",
      });
    }
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
  console.log("inspectability gate passed");
}

function diagnosticFromError(error) {
  if (error instanceof GateFailure) return error.diagnostic;
  const message = error instanceof Error ? error.message : String(error);
  return createDiagnostic("inspectability_gate_unhandled_failure", `Inspectability gate crashed: ${redactLocalPaths(message)}`, {
    location: SCRIPT_PATH,
    suggestion: "Fix the uncaught script error before evaluating CLI inspectability.",
    safeNextStep: `Rerun node ${SCRIPT_PATH} after the script-level crash is fixed.`,
  });
}

function redactLocalPaths(value) {
  return String(value).replace(/(?:^|[\s'"])(\/(?:[^/\s'"]+\/)+[^/\s'"]*)/g, (match) => {
    const prefix = /^[\s'"]/.test(match) ? match[0] : "";
    return `${prefix}<path>`;
  });
}

function runSelfTest() {
  const chunks = [];
  printActionableFailureReport({
    title: "inspectability gate failed for /Users/example/private",
    diagnostics: [
      diagnosticFromError(new GateFailure(createDiagnostic(
        "inspectability_gate_cli_nonzero",
        "claw inspect schemas --json exited 1 with token sk-test-secret-123456.",
        {
          location: "/Users/example/private/repo",
          suggestion: "Run the named CLI command directly and fix the first structured diagnostic it returns.",
          safeNextStep: `Rerun node ${SCRIPT_PATH}.`,
        },
      ))),
      diagnosticFromError(new Error("ENOENT: open /Users/example/private/sk-test-secret-123456/cache.db")),
    ],
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  if (!output.includes("code: inspectability_gate_cli_nonzero")) {
    throw new Error("self-test missing CLI diagnostic code");
  }
  if (!output.includes("code: inspectability_gate_unhandled_failure")) {
    throw new Error("self-test missing unhandled diagnostic code");
  }
  if (!output.includes("suggestion:") || !output.includes("next:")) {
    throw new Error("self-test missing operator guidance");
  }
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) {
    throw new Error("self-test leaked private data");
  }
  console.log("inspectability gate self-test passed");
}

main();
