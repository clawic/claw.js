import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const blockedLiterals = [
  ["ka", "ppa"].join(""),
  ["mac-mini-de-", "kappa"].join(""),
  ["100", ".98", ".141", ".3"].join(""),
  ["clawjs", "_telegram", "_bot", "_token"].join(""),
  ["341", "492", "970"].join(""),
  ["878", "529", "3015"].join(""),
  ["ivan", "gonzalez", "davila"].join(""),
  ["xe", "roy"].join(""),
];

const patterns = [
  {
    id: "telegram-token",
    description: "Telegram bot token shape",
    regex: /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g,
  },
  ...blockedLiterals.map((literal) => ({
    id: `blocked:${literal}`,
    description: `blocked private literal ${literal}`,
    regex: new RegExp(`\\b${literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"),
  })),
];

const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sh",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

function isTextFile(filePath) {
  return textExtensions.has(path.extname(filePath).toLowerCase());
}

export function scanText(text, filePath = "<input>") {
  const findings = [];
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    for (const match of text.matchAll(pattern.regex)) {
      const index = match.index ?? 0;
      const line = text.slice(0, index).split(/\r?\n/).length;
      findings.push({
        filePath,
        line,
        rule: pattern.id,
        description: pattern.description,
      });
    }
  }
  return findings;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--modified", "--others", "--exclude-standard"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !["scripts/privacy-check.mjs", "scripts/privacy-check.test.mjs"].includes(entry))
    .filter(isTextFile);
}

export function scanRepository() {
  const findings = [];
  for (const relativePath of trackedFiles()) {
    const absolutePath = path.join(repoRoot, relativePath);
    let text = "";
    try {
      text = fs.readFileSync(absolutePath, "utf8");
    } catch {
      continue;
    }
    findings.push(...scanText(text, relativePath));
  }
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = scanRepository();
  if (findings.length > 0) {
    console.error("Privacy check failed. Replace real/private data with synthetic fixtures:");
    for (const finding of findings) {
      console.error(`${finding.filePath}:${finding.line} ${finding.rule}`);
    }
    process.exit(1);
  }
  console.log("Privacy check passed.");
}
