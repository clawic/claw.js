#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

let buildConnectorOperationRuntimePlan;
let buildConnectorRuntimeAudit;
let buildConnectorRuntimeFetchRequest;
let buildOpenApiConnectorCatalog;
let ConnectorRuntimeCoverageError;
let createOpenApiConnectorRuntimeImplementations;
let findConnectorRuntimeImplementation;
let verifyConnectorRuntimeCoverage;
let verifyConnectorRuntimeOfflineExecutions;

const SCRIPT_PATH = "scripts/verify-openapi-runtime-coverage.mjs";
const VALID_OPTIONS = new Set([
  "spec",
  "app-id",
  "app-name",
  "description",
  "auth-field-name",
  "auth-placement",
  "auth-header-name",
  "auth-prefix",
  "base-url",
  "executor-id",
  "evidence",
  "fixtures",
  "generate-fixtures",
  "catalog-out",
  "report",
  "execute-offline",
  "self-test",
]);
const args = parseArgs(process.argv.slice(2));
const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

if (args["self-test"] === true) {
  runSelfTest();
  process.exit(0);
}

const usageDiagnostics = validateArgs(args);
if (usageDiagnostics.length > 0) {
  printActionableFailureReport({
    title: "openapi runtime coverage usage failed:",
    diagnostics: usageDiagnostics,
  });
  process.exit(64);
}

let activeCatalog;
try {
  await loadRuntimeOrThrow();
  activeCatalog = await runOpenApiCoverage();
} catch (error) {
  if (isRuntimeCoverageError(error)) {
    writeAuditIfRequested({ catalog: activeCatalog, report: error.report });
    printActionableFailureReport({
      title: "openapi runtime coverage failed:",
      diagnostics: error.report.errors.map(runtimeCoverageDiagnostic),
    });
    console.error(summaryLine(error.report.summary));
    console.error(`openapi runtime coverage failed with ${error.report.errors.length} error(s)`);
    process.exit(1);
  }
  printActionableFailureReport({
    title: "openapi runtime coverage failed:",
    diagnostics: [runtimeVerifierDiagnostic(error)],
  });
  process.exit(1);
}

async function runOpenApiCoverage() {
  const specPath = path.resolve(args.spec);
  const appId = stringArg(args["app-id"]);
  const evidence = stringListArg(args.evidence);
  const fixtureInput = readFixtures(args.fixtures);
  const generateFixturesDir = stringArg(args["generate-fixtures"]);
  const executeOffline = args["execute-offline"] === true || args["execute-offline"] === "true";
  const spec = readStructuredFile(specPath);
  let options = {
    appId,
    ...optionalString("appName", stringArg(args["app-name"])),
    ...optionalString("description", stringArg(args.description)),
    ...optionalString("authFieldName", stringArg(args["auth-field-name"])),
    ...optionalString("authPlacement", stringArg(args["auth-placement"])),
    ...optionalString("authHeaderName", stringArg(args["auth-header-name"])),
    ...optionalString("authPrefix", stringArg(args["auth-prefix"])),
    ...optionalString("baseUrl", stringArg(args["base-url"])),
    ...optionalString("executorId", stringArg(args["executor-id"])),
    evidence,
    fixtures: fixtureInput,
  };
  let catalog = buildOpenApiConnectorCatalog(spec, options);
  let registry = createOpenApiConnectorRuntimeImplementations(spec, options);

  if (generateFixturesDir) {
    const generatedFixtures = generateOpenApiRuntimeFixtures({
      catalog,
      registry,
      outputDir: generateFixturesDir,
    });
    options = {
      ...options,
      fixtures: mergeFixtures(fixtureInput, generatedFixtures),
    };
    catalog = buildOpenApiConnectorCatalog(spec, options);
    registry = createOpenApiConnectorRuntimeImplementations(spec, options);
    console.error(`generatedFixtures=${generatedFixtures.length}`);
  }

  writeJsonIfRequested(args["catalog-out"], catalog);
  const report = verifyConnectorRuntimeCoverage(catalog, { registry, evidenceRoot: rootDir });
  if (executeOffline) {
    const offlineReport = await verifyConnectorRuntimeOfflineExecutions(catalog, {
      registry,
      evidenceRoot: rootDir,
    });
    console.error(`offlineExecutions=${offlineReport.results.length}`);
    console.error("openapi runtime offline executions passed");
  }
  writeAuditIfRequested({ catalog, report });
  console.error(summaryLine(report.summary));
  console.error("openapi runtime coverage passed");
  return catalog;
}

function summaryLine(summary) {
  return `operations=${summary.total} implemented=${summary.implemented} unsupported=${summary.unsupported} missing=${summary.missing} offlineValidated=${summary.offlineValidated}`;
}

async function loadRuntimeOrThrow() {
  try {
    ({
      buildConnectorOperationRuntimePlan,
      buildConnectorRuntimeAudit,
      buildConnectorRuntimeFetchRequest,
      buildOpenApiConnectorCatalog,
      ConnectorRuntimeCoverageError,
      createOpenApiConnectorRuntimeImplementations,
      findConnectorRuntimeImplementation,
      verifyConnectorRuntimeCoverage,
      verifyConnectorRuntimeOfflineExecutions,
    } = await import("../packages/clawjs-integrations/dist/index.js"));
  } catch (error) {
    throw Object.assign(new Error("Could not load @clawjs/integrations dist runtime."), {
      code: "OPENAPI_RUNTIME_DIST_LOAD_FAILED",
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
    diagnostics.push(createDiagnostic("openapi_runtime_coverage_usage_error", message, {
      status: "USAGE",
      location: SCRIPT_PATH,
      suggestion: "Use only supported OpenAPI runtime coverage flags.",
      safeNextStep: `Run node ${SCRIPT_PATH} --spec <openapi.json|yaml> --app-id <id> --evidence <path[,path]>.`,
    }));
  }
  const specValue = parsed.spec;
  const specPath = specValue ? path.resolve(specValue) : "";
  if (!specValue || !fs.existsSync(specPath)) {
    diagnostics.push(createDiagnostic("openapi_runtime_coverage_spec_missing", "OpenAPI spec does not exist or is not readable.", {
      status: "USAGE",
      location: "--spec",
      suggestion: "Pass a readable OpenAPI JSON or YAML file.",
      safeNextStep: `Rerun node ${SCRIPT_PATH} --spec <openapi.json|yaml> --app-id <id> --evidence <path[,path]>.`,
    }));
  }
  if (!stringArg(parsed["app-id"])) {
    diagnostics.push(createDiagnostic("openapi_runtime_coverage_app_id_missing", "Missing --app-id <id>.", {
      status: "USAGE",
      location: "--app-id",
      suggestion: "Pass the stable app id to use when generating connector operation ids.",
      safeNextStep: `Rerun node ${SCRIPT_PATH} with --app-id <id>.`,
    }));
  }
  if (stringListArg(parsed.evidence).length === 0) {
    diagnostics.push(createDiagnostic("openapi_runtime_coverage_evidence_missing", "Missing --evidence <path[,path]>.", {
      status: "USAGE",
      location: "--evidence",
      suggestion: "Attach local runtime implementation evidence paths for generated operations.",
      safeNextStep: `Rerun node ${SCRIPT_PATH} with --evidence <path[,path]>.`,
    }));
  }
  if (typeof parsed.fixtures === "string" && !fs.existsSync(path.resolve(parsed.fixtures))) {
    diagnostics.push(createDiagnostic("openapi_runtime_coverage_fixtures_missing", "Fixtures file does not exist or is not readable.", {
      status: "USAGE",
      location: "--fixtures",
      suggestion: "Pass an existing JSON/YAML fixtures file or omit --fixtures.",
      safeNextStep: `Fix --fixtures, then rerun node ${SCRIPT_PATH}.`,
    }));
  }
  return diagnostics;
}

function runtimeCoverageDiagnostic(error) {
  if (error.includes("missing runtime implementation")) {
    return createDiagnostic("openapi_runtime_coverage_missing_implementation", error, {
      location: "openapi runtime registry",
      suggestion: "Add generated runtime implementation evidence or adjust the OpenAPI operation mapping.",
      safeNextStep: `Update runtime evidence, then rerun node ${SCRIPT_PATH}.`,
    });
  }
  if (error.includes("fixture") || error.includes("offline")) {
    return createDiagnostic("openapi_runtime_coverage_offline_fixture_invalid", error, {
      location: "openapi runtime fixtures",
      suggestion: "Regenerate or repair the generated OpenAPI runtime fixtures.",
      safeNextStep: `Fix fixtures, then rerun node ${SCRIPT_PATH} --execute-offline.`,
    });
  }
  return createDiagnostic("openapi_runtime_coverage_invalid", error, {
    location: "openapi runtime coverage",
    suggestion: "Fix the named OpenAPI operation, runtime metadata, or evidence path before trusting coverage.",
    safeNextStep: `Fix the reported operation, then rerun node ${SCRIPT_PATH}.`,
  });
}

function runtimeVerifierDiagnostic(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error?.code === "OPENAPI_RUNTIME_DIST_LOAD_FAILED") {
    return createDiagnostic("openapi_runtime_coverage_dist_load_failed", "Could not load @clawjs/integrations dist runtime.", {
      location: "packages/clawjs-integrations/dist/index.js",
      suggestion: "Rebuild the integrations package before running OpenAPI runtime coverage.",
      safeNextStep: "Run npm --workspace @clawjs/integrations run build, then rerun node scripts/verify-openapi-runtime-coverage.mjs.",
    });
  }
  if (message.includes("--fixtures must point to a JSON array")) {
    return createDiagnostic("openapi_runtime_coverage_fixtures_invalid", "--fixtures must point to a JSON array.", {
      location: "--fixtures",
      suggestion: "Use an array of fixture descriptors or regenerate fixtures with --generate-fixtures.",
      safeNextStep: `Fix the fixtures file, then rerun node ${SCRIPT_PATH}.`,
    });
  }
  return createDiagnostic("openapi_runtime_coverage_verifier_failed", `OpenAPI runtime verifier crashed: ${message}`, {
    location: SCRIPT_PATH,
    suggestion: "Fix the verifier crash before trusting runtime coverage.",
    safeNextStep: `Rerun node ${SCRIPT_PATH} after the script-level crash is fixed.`,
  });
}

function writeAuditIfRequested({ catalog, report }) {
  if (typeof args.report !== "string" || !args.report.trim() || !buildConnectorRuntimeAudit || !catalog) return;
  writeJson(args.report, buildConnectorRuntimeAudit(catalog, report));
}

function writeJsonIfRequested(filePath, value) {
  if (typeof filePath !== "string" || !filePath.trim()) return;
  writeJson(filePath, value);
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`);
}

function generateOpenApiRuntimeFixtures({ catalog, registry, outputDir }) {
  const resolvedOutputDir = path.resolve(outputDir);
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
  const generated = [];

  for (const app of catalog.apps) {
    for (const operation of app.operations) {
      const implementation = findConnectorRuntimeImplementation(operation, registry);
      if (!implementation) continue;
      const values = sampleValuesForOperation(operation);
      const secrets = sampleSecretsForOperation(operation);
      const details = buildConnectorOperationRuntimePlan(operation, values, { registry });

      if (details.requestPlan) {
        const requestPath = path.join(resolvedOutputDir, `${safeFileName(operation.id)}-request.json`);
        const request = buildConnectorRuntimeFetchRequest({
          baseUrl: implementation.baseUrl,
          plan: details.requestPlan,
          secrets,
        });
        writeJson(requestPath, requestFixtureBody(request));
        generated.push({
          kind: "request",
          operationId: operation.id,
          path: fixtureReferencePath(requestPath),
        });
      }

      if (operation.kind === "action" && details.requestPlan) {
        const responsePath = path.join(resolvedOutputDir, `${safeFileName(operation.id)}-response.json`);
        writeJson(responsePath, responseFixtureBody(details.requestPlan));
        generated.push({
          kind: "response",
          operationId: operation.id,
          path: fixtureReferencePath(responsePath),
        });
      }

      if (operation.kind === "source" && details.sourcePlan) {
        const sourcePath = path.join(resolvedOutputDir, `${safeFileName(operation.id)}-source-event.json`);
        writeJson(sourcePath, sourceEventFixtureBody(details.sourcePlan));
        generated.push({
          kind: "source_event",
          operationId: operation.id,
          path: fixtureReferencePath(sourcePath),
        });
      }
    }
  }

  writeJson(path.join(resolvedOutputDir, "fixtures.json"), generated);
  return generated;
}

function requestFixtureBody(request) {
  const body = request.init.body;
  return {
    method: request.init.method ?? "GET",
    url: request.url,
    ...headersObject(request.init.headers),
    ...(body === undefined || isFormDataBody(body) ? {} : { body: parseGeneratedBody(body) }),
  };
}

function headersObject(headersInit) {
  const headers = {};
  new Headers(headersInit).forEach((value, key) => {
    headers[key] = value;
  });
  return Object.keys(headers).length > 0 ? { headers } : {};
}

function parseGeneratedBody(body) {
  const text = String(body);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isFormDataBody(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function responseFixtureBody(requestPlan) {
  const value = sampleValueForRuntimeType(requestPlan.responseSchema?.type ?? "object");
  for (const requiredPath of requestPlan.responseSchema?.requiredPaths ?? []) {
    assignRuntimePath(value, requiredPath, sampleValueForPath(requiredPath));
  }
  if (requestPlan.pagination?.itemsPath) {
    assignRuntimePath(value, requestPlan.pagination.itemsPath, []);
  }
  if (requestPlan.pagination?.nextCursorPath) {
    assignRuntimePath(value, requestPlan.pagination.nextCursorPath, null);
  }
  if (requestPlan.pagination?.nextUrlPath) {
    assignRuntimePath(value, requestPlan.pagination.nextUrlPath, null);
  }
  return value;
}

function sourceEventFixtureBody(sourcePlan) {
  const event = { id: "evt_sample" };
  if (!sourcePlan.eventsPath) return event;
  const value = {};
  assignRuntimePath(value, sourcePlan.eventsPath, [event]);
  return value;
}

function sampleValuesForOperation(operation) {
  const values = {};
  for (const field of operation.fields) {
    if (field.managed || field.secret) continue;
    values[field.name] = sampleValueForField(field);
  }
  return values;
}

function sampleSecretsForOperation(operation) {
  return Object.fromEntries(operation.authFieldNames.map((field) => [field, `offline-${field}-secret`]));
}

function sampleValueForField(field) {
  if (field.default !== undefined) return field.default;
  if (field.options?.length) return field.options[0].value;
  if (field.type === "boolean") return false;
  if (field.type === "integer" || field.type === "number") return field.min ?? 1;
  if (field.type === "array") return [];
  if (field.type === "object") return {};
  if (field.name === "mediaType") return "Document/Image";
  if (field.name === "media") return "https://example.invalid/media";
  return "sample";
}

function sampleValueForRuntimeType(type) {
  switch (type) {
    case "array":
      return [];
    case "string":
      return "sample";
    case "number":
      return 1;
    case "boolean":
      return false;
    case "null":
      return null;
    case "object":
    default:
      return {};
  }
}

function sampleValueForPath(runtimePath) {
  const segment = runtimePath.split(".").at(-1)?.toLowerCase() ?? "";
  if (segment.endsWith("id") || segment === "id") return "sample";
  if (segment.startsWith("is") || segment.startsWith("has")) return false;
  if (segment.includes("count") || segment.includes("total") || segment.includes("number")) return 1;
  return "sample";
}

function assignRuntimePath(target, runtimePath, value) {
  if (!target || typeof target !== "object" || Array.isArray(target)) return;
  const parts = runtimePath.split(".").filter(Boolean);
  let current = target;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      current[part] = {};
    }
    current = current[part];
  }
  const leaf = parts.at(-1);
  if (leaf) current[leaf] = value;
}

function fixtureReferencePath(filePath) {
  const relative = path.relative(rootDir, filePath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) return slashPath(relative);
  return filePath;
}

function safeFileName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "operation";
}

function slashPath(value) {
  return value.split(path.sep).join("/");
}

function mergeFixtures(explicitFixtures, generatedFixtures) {
  const explicitKeys = new Set(explicitFixtures.map(fixtureKey));
  return [
    ...explicitFixtures,
    ...generatedFixtures.filter((fixture) => !explicitKeys.has(fixtureKey(fixture))),
  ];
}

function fixtureKey(fixture) {
  return `${fixture.operationId ?? "*"}:${fixture.kind}`;
}

function readFixtures(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) return [];
  const resolved = path.resolve(filePath);
  const value = readStructuredFile(resolved);
  if (!Array.isArray(value)) throw new Error("--fixtures must point to a JSON array.");
  return value;
}

function readStructuredFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return isYamlPath(filePath) ? yaml.load(text) : JSON.parse(text);
}

function isYamlPath(filePath) {
  return /\.ya?ml$/i.test(filePath);
}

function stringArg(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringListArg(value) {
  const raw = stringArg(value);
  return raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function optionalString(key, value) {
  return value ? { [key]: value } : {};
}

function runSelfTest() {
  const parsed = parseArgs([
    "--bad-token",
    "sk-test-secret-123456",
    "--spec",
    "/Users/example/private/openapi.yaml",
    "--app-id",
    "",
  ]);
  const chunks = [];
  printActionableFailureReport({
    title: "openapi runtime coverage failed for /Users/example/private",
    diagnostics: [
      ...validateArgs(parsed),
      runtimeCoverageDiagnostic("missing runtime implementation for demo.action.getUser token sk-test-secret-123456"),
      runtimeCoverageDiagnostic("offline fixture /Users/example/private/fixture.json is invalid"),
      runtimeVerifierDiagnostic(Object.assign(new Error("boom"), { code: "OPENAPI_RUNTIME_DIST_LOAD_FAILED" })),
      runtimeVerifierDiagnostic(new Error("--fixtures must point to a JSON array.")),
    ],
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  for (const code of [
    "openapi_runtime_coverage_usage_error",
    "openapi_runtime_coverage_spec_missing",
    "openapi_runtime_coverage_app_id_missing",
    "openapi_runtime_coverage_evidence_missing",
    "openapi_runtime_coverage_missing_implementation",
    "openapi_runtime_coverage_offline_fixture_invalid",
    "openapi_runtime_coverage_dist_load_failed",
    "openapi_runtime_coverage_fixtures_invalid",
  ]) {
    if (!output.includes(`code: ${code}`)) throw new Error(`self-test missing ${code}`);
  }
  if (!output.includes("suggestion:") || !output.includes("next:")) throw new Error("self-test missing guidance");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
  console.log("openapi runtime coverage self-test passed");
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
    if (key === "execute-offline" || key === "self-test") {
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
