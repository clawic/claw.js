#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ConnectorRuntimeCoverageError,
  loadConnectorCatalogFromFile,
  verifyConnectorRuntimeCoverage,
} from "../packages/clawjs-integrations/dist/index.js";

const args = parseArgs(process.argv.slice(2));
const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const catalogPath = path.resolve(args.catalog ?? process.env.CLAWJS_CONNECTOR_CATALOG_PATH ?? "");
const allowUnsupportedReasons = args["allow-unsupported-runtime"] === true || args["allow-unsupported-runtime"] === "true";

if (!catalogPath || !fs.existsSync(catalogPath)) {
  console.error("Usage: node scripts/verify-connector-runtime-coverage.mjs --catalog <catalog.json>");
  process.exit(1);
}

try {
  const catalog = loadConnectorCatalogFromFile(catalogPath);
  const report = verifyConnectorRuntimeCoverage(catalog, { allowUnsupportedReasons, evidenceRoot: rootDir });
  console.error(summaryLine(report.summary));
  console.error("connector runtime coverage passed");
} catch (error) {
  if (error instanceof ConnectorRuntimeCoverageError) {
    for (const entry of error.report.errors) console.error(`FAIL ${entry}`);
    console.error(summaryLine(error.report.summary));
    console.error(`connector runtime coverage failed with ${error.report.errors.length} error(s)`);
    process.exit(1);
  }
  throw error;
}

function summaryLine(summary) {
  return `operations=${summary.total} implemented=${summary.implemented} unsupported=${summary.unsupported} missing=${summary.missing} offlineValidated=${summary.offlineValidated}`;
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
