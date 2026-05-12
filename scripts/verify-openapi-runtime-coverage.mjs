#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

import {
  buildConnectorRuntimeAudit,
  buildOpenApiConnectorCatalog,
  ConnectorRuntimeCoverageError,
  createOpenApiConnectorRuntimeImplementations,
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "../packages/clawjs-integrations/dist/index.js";

const args = parseArgs(process.argv.slice(2));
const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const specPath = path.resolve(args.spec ?? "");
const appId = stringArg(args["app-id"]);
const evidence = stringListArg(args.evidence);
const fixtures = readFixtures(args.fixtures);
const executeOffline = args["execute-offline"] === true || args["execute-offline"] === "true";

if (!specPath || !fs.existsSync(specPath) || !appId || evidence.length === 0) {
  console.error("Usage: node scripts/verify-openapi-runtime-coverage.mjs --spec <openapi.json|yaml> --app-id <id> --evidence <path[,path]> [--fixtures <fixtures.json|yaml>] [--catalog-out <catalog.json>] [--report <report.json>] [--execute-offline]");
  process.exit(1);
}

const spec = readStructuredFile(specPath);
const options = {
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
  fixtures,
};
const catalog = buildOpenApiConnectorCatalog(spec, options);
const registry = createOpenApiConnectorRuntimeImplementations(spec, options);

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
