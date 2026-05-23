#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const SCRIPT_PATH = "scripts/verify-connector-runtime-coverage.mjs";
const VALID_OPTIONS = new Set(["catalog", "report", "execute-offline", "allow-unsupported-runtime", "self-test"]);
let buildConnectorRuntimeAudit;
let ConnectorRuntimeCoverageError;
let loadConnectorCatalogFromFile;
let verifyStableConnectorCatalog;
let verifyConnectorRuntimeCoverage;
let verifyConnectorRuntimeOfflineExecutions;

const args = parseArgs(process.argv.slice(2));
const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const allowUnsupportedReasons = args["allow-unsupported-runtime"] === true || args["allow-unsupported-runtime"] === "true";
const executeOffline = args["execute-offline"] === true || args["execute-offline"] === "true";
let activeCatalog;

if (args["self-test"] === true) {
  runSelfTest();
  process.exit(0);
}

const usageDiagnostics = validateArgs(args);
if (usageDiagnostics.length > 0) {
  printActionableFailureReport({
    title: "connector runtime coverage usage failed:",
    diagnostics: usageDiagnostics,
  });
  process.exit(64);
}

try {
  await loadRuntimeOrThrow();
  const catalogPath = path.resolve(args.catalog ?? process.env.CLAW_CONNECTOR_CATALOG_PATH);
  activeCatalog = loadConnectorCatalogFromFile(catalogPath);
  const stableReport = verifyStableConnectorCatalog(activeCatalog, { evidenceRoot: rootDir });
  const report = verifyConnectorRuntimeCoverage(activeCatalog, { allowUnsupportedReasons, evidenceRoot: rootDir });
  if (executeOffline) {
    const offlineReport = await verifyConnectorRuntimeOfflineExecutions(activeCatalog, {
      allowUnsupportedReasons,
      evidenceRoot: rootDir,
    });
    console.error(`offlineExecutions=${offlineReport.results.length}`);
    console.error("connector runtime offline executions passed");
  }
  writeReportIfRequested({ catalog: activeCatalog, report });
  console.error(`stableOperations=${stableReport.stableOperations} completeExternalSchemas=${stableReport.completeExternalSchemas}`);
  console.error(summaryLine(report.summary));
  console.error("connector runtime coverage passed");
} catch (error) {
  if (isRuntimeCoverageError(error)) {
    writeReportIfRequested({ catalog: activeCatalog, report: error.report });
    printActionableFailureReport({
      title: "connector runtime coverage failed:",
      diagnostics: error.report.errors.map(runtimeCoverageDiagnostic),
    });
    console.error(summaryLine(error.report.summary));
    console.error(`connector runtime coverage failed with ${error.report.errors.length} error(s)`);
    process.exit(1);
  }
  printActionableFailureReport({
    title: "connector runtime coverage failed:",
    diagnostics: [runtimeVerifierDiagnostic(error)],
  });
  process.exit(1);
}

function summaryLine(summary) {
  return `operations=${summary.total} implemented=${summary.implemented} unsupported=${summary.unsupported} missing=${summary.missing} offlineValidated=${summary.offlineValidated}`;
}

async function loadRuntimeOrThrow() {
  try {
    ({
      buildConnectorRuntimeAudit,
      ConnectorRuntimeCoverageError,
      loadConnectorCatalogFromFile,
      verifyStableConnectorCatalog,
      verifyConnectorRuntimeCoverage,
      verifyConnectorRuntimeOfflineExecutions,
    } = await import("../packages/clawjs-integrations/dist/index.js"));
  } catch (error) {
    throw Object.assign(new Error("Could not load @clawjs/integrations dist runtime."), {
      code: "CONNECTOR_RUNTIME_DIST_LOAD_FAILED",
      cause: error,
    });
  }
}

function isRuntimeCoverageError(error) {
  return typeof ConnectorRuntimeCoverageError === "function" && error instanceof ConnectorRuntimeCoverageError;
}

function validateArgs(parsed) {
  const diagnostics = [];
  for (const message of parsed.__errors ?? []) {
    diagnostics.push(createDiagnostic("connector_runtime_coverage_usage_error", message, {
      status: "USAGE",
      location: SCRIPT_PATH,
      suggestion: "Use only --catalog, --report, --execute-offline, --allow-unsupported-runtime, or --self-test.",
      safeNextStep: `Run node ${SCRIPT_PATH} --catalog <catalog.json>.`,
    }));
  }
  const catalogValue = parsed.catalog ?? process.env.CLAW_CONNECTOR_CATALOG_PATH;
  const resolvedCatalog = catalogValue ? path.resolve(catalogValue) : "";
  if (!catalogValue || !fs.existsSync(resolvedCatalog)) {
    diagnostics.push(createDiagnostic("connector_runtime_coverage_catalog_missing", "Catalog JSON does not exist or is not readable.", {
      status: "USAGE",
      location: "--catalog",
      suggestion: "Pass a generated connector catalog JSON file or set CLAW_CONNECTOR_CATALOG_PATH.",
      safeNextStep: "Generate the catalog, then rerun node scripts/verify-connector-runtime-coverage.mjs --catalog <catalog.json>.",
    }));
  }
  return diagnostics;
}

function runtimeCoverageDiagnostic(error) {
  if (error.includes("missing runtime implementation")) {
    return createDiagnostic("connector_runtime_coverage_missing_implementation", error, {
      location: "connector runtime registry",
      suggestion: "Add a runtime implementation or mark the operation with an explicit unsupported reason.",
      safeNextStep: `Update the connector runtime registry, then rerun node ${SCRIPT_PATH} --catalog <catalog.json>.`,
    });
  }
  if (error.includes("unsupported")) {
    return createDiagnostic("connector_runtime_coverage_unsupported_operation", error, {
      location: "connector catalog runtime metadata",
      suggestion: "Add evidence for the unsupported reason or remove the unsupported runtime gap.",
      safeNextStep: `Review the operation runtime metadata, then rerun node ${SCRIPT_PATH} --catalog <catalog.json>.`,
    });
  }
  if (error.includes("fixture") || error.includes("offline")) {
    return createDiagnostic("connector_runtime_coverage_offline_fixture_invalid", error, {
      location: "connector runtime fixtures",
      suggestion: "Regenerate or repair the offline fixture evidence for this operation.",
      safeNextStep: `Fix the fixture evidence, then rerun node ${SCRIPT_PATH} --catalog <catalog.json> --execute-offline.`,
    });
  }
  return createDiagnostic("connector_runtime_coverage_invalid", error, {
    location: "connector runtime coverage",
    suggestion: "Fix the named connector operation, runtime metadata, or evidence path before trusting coverage.",
    safeNextStep: `Fix the reported operation, then rerun node ${SCRIPT_PATH} --catalog <catalog.json>.`,
  });
}

function runtimeVerifierDiagnostic(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error?.code === "CONNECTOR_RUNTIME_DIST_LOAD_FAILED") {
    return createDiagnostic("connector_runtime_coverage_dist_load_failed", "Could not load @clawjs/integrations dist runtime.", {
      location: "packages/clawjs-integrations/dist/index.js",
      suggestion: "Rebuild the integrations package before running connector runtime coverage.",
      safeNextStep: "Run npm --workspace @clawjs/integrations run build, then rerun node scripts/verify-connector-runtime-coverage.mjs.",
    });
  }
  return createDiagnostic("connector_runtime_coverage_verifier_failed", `Connector runtime verifier crashed: ${message}`, {
    location: SCRIPT_PATH,
    suggestion: "Fix the verifier crash before trusting runtime coverage.",
    safeNextStep: `Rerun node ${SCRIPT_PATH} after the script-level crash is fixed.`,
  });
}

function writeReportIfRequested({ catalog, report }) {
  if (typeof args.report !== "string" || !args.report.trim() || !buildConnectorRuntimeAudit || !catalog) return;
  const reportPath = path.resolve(args.report);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(buildConnectorRuntimeAudit(catalog, report), null, 2)}\n`);
}

function runSelfTest() {
  const parsed = parseArgs([
    "--bad-token",
    "sk-test-secret-123456",
    "--catalog",
    "/Users/example/private/catalog.json",
  ]);
  const chunks = [];
  printActionableFailureReport({
    title: "connector runtime coverage failed for /Users/example/private",
    diagnostics: [
      ...validateArgs(parsed),
      runtimeCoverageDiagnostic("missing runtime implementation for demo.action.run token sk-test-secret-123456"),
      runtimeCoverageDiagnostic("offline fixture /Users/example/private/fixture.json is invalid"),
      runtimeVerifierDiagnostic(Object.assign(new Error("boom"), { code: "CONNECTOR_RUNTIME_DIST_LOAD_FAILED" })),
    ],
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  for (const code of [
    "connector_runtime_coverage_usage_error",
    "connector_runtime_coverage_catalog_missing",
    "connector_runtime_coverage_missing_implementation",
    "connector_runtime_coverage_offline_fixture_invalid",
    "connector_runtime_coverage_dist_load_failed",
  ]) {
    if (!output.includes(`code: ${code}`)) throw new Error(`self-test missing ${code}`);
  }
  if (!output.includes("suggestion:") || !output.includes("next:")) throw new Error("self-test missing guidance");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
  console.log("connector runtime coverage self-test passed");
}

function parseArgs(argv) {
  const parsed = { __errors: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      parsed.__errors.push(`Unexpected positional argument: ${token ?? "<empty>"}`);
      continue;
    }
    const key = token.slice(2);
    if (!VALID_OPTIONS.has(key)) {
      parsed.__errors.push(`Unknown option: --${key}`);
      const maybeValue = argv[index + 1];
      if (maybeValue && !maybeValue.startsWith("--")) index += 1;
      continue;
    }
    if (key === "execute-offline" || key === "allow-unsupported-runtime" || key === "self-test") {
      parsed[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      parsed.__errors.push(`Missing value for --${key}`);
      continue;
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}
