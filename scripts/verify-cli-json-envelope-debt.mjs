import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(rootDir, "packages", "clawjs", "src");
const debtPath = path.join(rootDir, "qa", "cli-json-envelope-debt.json");
const debt = JSON.parse(fs.readFileSync(debtPath, "utf8"));

function listFiles(targetPath) {
  return fs.readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    if (entry.isFile() && entry.name.endsWith(".ts")) return [fullPath];
    return [];
  });
}

function countRawJsonWriters(filePath) {
  if (filePath.endsWith(`${path.sep}cli-json.ts`)) return 0;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  let count = 0;
  for (const line of lines) {
    if (/\b(?:function|export function)\s+writeJson\b/.test(line)) continue;
    count += line.match(/\bwriteJson\s*\(/g)?.length ?? 0;
  }
  return count;
}

const actual = {};
for (const file of listFiles(sourceRoot)) {
  const count = countRawJsonWriters(file);
  if (count === 0) continue;
  actual[path.relative(rootDir, file)] = count;
}

const failures = [];
const baseline = debt.files ?? {};
for (const [file, count] of Object.entries(actual)) {
  const allowed = baseline[file];
  if (allowed === undefined) failures.push(`${file}: new raw writeJson debt (${count})`);
  else if (count > allowed) failures.push(`${file}: raw writeJson debt increased from ${allowed} to ${count}`);
}
for (const [file, allowed] of Object.entries(baseline)) {
  const count = actual[file] ?? 0;
  if (count < allowed) failures.push(`${file}: raw writeJson debt decreased from ${allowed} to ${count}; update ${path.relative(rootDir, debtPath)}`);
}

if (failures.length > 0) {
  console.error("CLI JSON envelope debt check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const total = Object.values(actual).reduce((sum, count) => sum + count, 0);
console.log(`cli json envelope debt check passed (${total} raw writers tracked)`);
