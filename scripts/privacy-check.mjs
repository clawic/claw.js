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

const allowedSyntheticUsernames = new Set(["alice", "demo", "example", "me", "person", "tester"]);

function escapeRegex(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function allowedSyntheticUserPath(match) {
  const username = match.match(/\/Users\/([^/\s"'`<>]+)/u)?.[1] ?? "";
  return allowedSyntheticUsernames.has(username);
}

const patterns = [
  {
    id: "telegram-token",
    description: "Telegram bot token shape",
    regex: /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g,
  },
  {
    id: "private-user-path",
    description: "private local user path",
    regex: /(?:file:\/\/)?\/Users\/[A-Za-z0-9._-]+(?=\/|\b)/g,
    allow: allowedSyntheticUserPath,
  },
  {
    id: "codex-private-path",
    description: "private Codex session or goal path",
    regex: /(?:~|\/[A-Za-z0-9._-]+|\/Users\/[A-Za-z0-9._-]+)\/\.codex\/(?:sessions|goals)\b/g,
  },
  {
    id: "codex-rollout-session-id",
    description: "private Codex rollout session identifier",
    regex: /\brollout-\d{4}-\d{2}-\d{2}T\d{2}[-:]\d{2}[-:]\d{2}(?:-\d{3})?-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl\b/gi,
  },
  {
    id: "codex-context-session-uuid",
    description: "private session UUID in Codex context",
    regex: /\b(?:codex|rollout|session|sourceSession|thread)[^\n]{0,100}\b[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  },
  {
    id: "contextual-team-id",
    description: "private Team ID in signing or release context",
    regex: /\b(?:DEVELOPMENT_TEAM|TEAM_ID|team_id|teamId|Team ID|team identifier)\b[^\n]{0,60}\b[A-Z0-9]{10}\b/g,
  },
  {
    id: "private-bundle-id",
    description: "private bundle identifier in app/release context",
    regex: /\b(?:bundle_id|bundleId|bundle identifier|withBundleIdentifier)\b[^\n]{0,80}\bcom\.(?!example\b)[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+\b/gi,
  },
  {
    id: "signing-identity",
    description: "private Apple signing identity",
    regex: /\b(?:Apple Development|Apple Distribution|Developer ID Application):[^\n"']+/g,
    allow: (match) => /:\s*Example\b/u.test(match),
  },
  {
    id: "release-output-reference",
    description: "private release output reference",
    regex: /(^|[/"'`\s])release-output([/"'`\s]|$)/g,
  },
  ...blockedLiterals.map((literal, index) => ({
    id: `blocked-private-literal-${index + 1}`,
    description: "blocked private literal",
    regex: new RegExp(`\\b${escapeRegex(literal)}\\b`, "gi"),
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
      if (pattern.allow?.(match[0], text)) continue;
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
