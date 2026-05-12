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
  console.error("Usage: node scripts/verify-connector-runtime-coverage.mjs --catalog <catalog.json> [--report <report.json>]");
  process.exit(1);
}

const catalog = loadConnectorCatalogFromFile(catalogPath);

try {
  const report = verifyConnectorRuntimeCoverage(catalog, { allowUnsupportedReasons, evidenceRoot: rootDir });
  writeReportIfRequested({ catalog, report });
  console.error(summaryLine(report.summary));
  console.error("connector runtime coverage passed");
} catch (error) {
  if (error instanceof ConnectorRuntimeCoverageError) {
    writeReportIfRequested({ catalog, report: error.report });
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

function writeReportIfRequested({ catalog, report }) {
  if (typeof args.report !== "string" || !args.report.trim()) return;
  const reportPath = path.resolve(args.report);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(runtimeAuditReport(catalog, report), null, 2)}\n`);
}

function runtimeAuditReport(catalog, report) {
  return {
    summary: report.summary,
    errors: report.errors,
    providers: (catalog.apps ?? []).map((app) => {
      const entries = report.entries.filter((entry) => entry.appId === app.id);
      return {
        appId: app.id,
        name: app.name,
        summary: summarizeEntries(entries),
        operations: entries.map((entry) => ({
          operationId: entry.operationId,
          kind: entry.kind,
          status: entry.status,
          executorId: entry.executorId ?? null,
          offlineValidated: entry.offlineValidated,
          evidence: entry.evidence,
          fixtures: entry.fixtures,
          errors: report.errors.filter((error) => error.includes(entry.operationId)),
        })),
      };
    }),
  };
}

function summarizeEntries(entries) {
  return entries.reduce((summary, entry) => {
    summary.total += 1;
    summary[entry.status] += 1;
    if (entry.offlineValidated) summary.offlineValidated += 1;
    return summary;
  }, { total: 0, implemented: 0, unsupported: 0, missing: 0, offlineValidated: 0 });
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
