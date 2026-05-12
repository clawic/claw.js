#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

import {
  buildConnectorOperationRuntimePlan,
  buildConnectorRuntimeAudit,
  buildConnectorRuntimeFetchRequest,
  buildOpenApiConnectorCatalog,
  ConnectorRuntimeCoverageError,
  createOpenApiConnectorRuntimeImplementations,
  findConnectorRuntimeImplementation,
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "../packages/clawjs-integrations/dist/index.js";

const args = parseArgs(process.argv.slice(2));
const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const specPath = path.resolve(args.spec ?? "");
const appId = stringArg(args["app-id"]);
const evidence = stringListArg(args.evidence);
const fixtureInput = readFixtures(args.fixtures);
const generateFixturesDir = stringArg(args["generate-fixtures"]);
const executeOffline = args["execute-offline"] === true || args["execute-offline"] === "true";

if (!specPath || !fs.existsSync(specPath) || !appId || evidence.length === 0) {
  console.error("Usage: node scripts/verify-openapi-runtime-coverage.mjs --spec <openapi.json|yaml> --app-id <id> --evidence <path[,path]> [--fixtures <fixtures.json|yaml>] [--generate-fixtures <dir>] [--catalog-out <catalog.json>] [--report <report.json>] [--execute-offline]");
  process.exit(1);
}

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

try {
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
} catch (error) {
  if (error instanceof ConnectorRuntimeCoverageError) {
    writeAuditIfRequested({ catalog, report: error.report });
    for (const entry of error.report.errors) console.error(`FAIL ${entry}`);
    console.error(summaryLine(error.report.summary));
    console.error(`openapi runtime coverage failed with ${error.report.errors.length} error(s)`);
    process.exit(1);
  }
  throw error;
}

function summaryLine(summary) {
  return `operations=${summary.total} implemented=${summary.implemented} unsupported=${summary.unsupported} missing=${summary.missing} offlineValidated=${summary.offlineValidated}`;
}

function writeAuditIfRequested({ catalog, report }) {
  if (typeof args.report !== "string" || !args.report.trim()) return;
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

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      parsed[token.slice(2)] = value;
      index += 1;
    } else {
      parsed[token.slice(2)] = true;
    }
  }
  return parsed;
}
