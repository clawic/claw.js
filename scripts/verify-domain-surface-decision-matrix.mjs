import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const matrixPath = path.join(rootDir, "docs", "governance", "domain-surface", "decision-matrix.md");
const text = fs.readFileSync(matrixPath, "utf8");

const requiredDecisionIds = Array.from({ length: 20 }, (_, index) => `DEC-${String(index + 1).padStart(3, "0")}`);
const failures = [];

if (!text.includes("source:domain-surface-registry")) {
  failures.push("matrix must cite the source conversation id");
}

for (const id of requiredDecisionIds) {
  const row = text.split("\n").find((line) => line.startsWith(`| ${id} |`));
  if (!row) {
    failures.push(`missing decision row ${id}`);
    continue;
  }
  if (!row.includes("| implemented |") && !row.includes("| pending |") && !row.includes("| external_pending |")) {
    failures.push(`${id}: invalid or missing status`);
  }
  const pathMatches = [...row.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  if (pathMatches.length === 0) failures.push(`${id}: missing evidence paths`);
  for (const evidencePath of pathMatches) {
    if (evidencePath.includes(" ")) continue;
    if (evidencePath.startsWith("npm ") || evidencePath.startsWith("claw ") || evidencePath.startsWith("DEC-")) continue;
    if (evidencePath.startsWith("@")) continue;
    if (evidencePath.includes(":") || evidencePath.includes("*")) continue;
    if (!evidencePath.includes("/") && !/\.(md|ts|mjs|json)$/.test(evidencePath)) continue;
    if (/^[a-z_]+$/.test(evidencePath)) continue;
    if (!fs.existsSync(path.join(rootDir, evidencePath))) {
      failures.push(`${id}: evidence path does not exist: ${evidencePath}`);
    }
  }
}

const privatePathPattern = /\/Users\/|\/home\/|~\//;
if (privatePathPattern.test(text)) {
  failures.push("matrix must not include private absolute paths");
}

if (failures.length > 0) {
  console.error("Domain surface decision matrix check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`domain surface decision matrix check passed (${requiredDecisionIds.length} decisions)`);
