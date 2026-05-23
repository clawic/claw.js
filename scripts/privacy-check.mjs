import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedArgs = new Set(["--self-test"]);

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
    id: "private-goal-or-session-id",
    description: "private goal or session identifier",
    regex: /\b019e[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-plan)?\b/gi,
  },
  {
    id: "private-source-reference",
    description: "private source conversation or plan reference",
    regex: /\b(?:Source conversation|sourceConversationId|conversationId|sourcePlanId|planId|Reference plan item|Binding plan item|Plan item|source session|sourceSession)[^\n]{0,160}\b019e[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-plan)?\b/gi,
  },
  {
    id: "private-runtime-source-alias",
    description: "private runtime conversation or plan alias",
    regex: /\bprivate-runtime-(?:conversation|plan):[A-Za-z0-9._:-]+\b/g,
  },
  {
    id: "private-session-placeholder",
    description: "private session placeholder that has no public value",
    regex: /\bprivate-session-not-published\b|\bprivate session,\s*not published\b/gi,
  },
  {
    id: "current-thread-source-alias",
    description: "private current-thread source alias",
    regex: /\bcurrent-thread-20\d{2}-\d{2}-\d{2}\b/g,
  },
  {
    id: "private-provenance-source-field",
    description: "private source-session provenance field in public artifact",
    regex: /\bsourceSession(?:Ref|Alias)\b/g,
  },
  {
    id: "private-codename",
    description: "private internal codename",
    regex: /\b(?:Source Code Aging Program|Provocation Not Publish)\b/g,
  },
  {
    id: "contextual-team-id",
    description: "private Team ID in signing or release context",
    regex: /\b(?:DEVELOPMENT_TEAM|TEAM_ID|team_id|teamId|Team ID|team identifier)\b[^\n]{0,60}\b[A-Z0-9]{10}\b/g,
  },
  {
    id: "secret-looking-literal",
    description: "secret-looking literal",
    regex: /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g,
  },
  {
    id: "fixture-secret-literal",
    description: "unredacted fixture secret literal",
    regex: /\b(?:super-secret(?:-[A-Za-z0-9]+)*|p@ss|ghp-extra-value|secret-arg-value)\b/g,
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
    id: "release-artifact-output-reference",
    description: "private release output reference",
    regex: new RegExp(`(^|[/"'\`\\s])${["release", "output"].join("-")}([/"'\`\\s]|$)`, "g"),
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

function readBaseline() {
  const baselinePath = path.join(repoRoot, "docs/privacy-check-baseline.json");
  if (!fs.existsSync(baselinePath)) return { entries: [] };
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function findingKey(finding) {
  return `${finding.filePath}\0${finding.rule}`;
}

export function applyBaseline(findings, baseline = readBaseline()) {
  const allowedCounts = new Map();
  for (const entry of baseline.entries ?? []) {
    allowedCounts.set(`${entry.filePath}\0${entry.rule}`, entry.count ?? 0);
  }
  const seenCounts = new Map();
  const unbaselined = [];
  for (const finding of findings) {
    const key = findingKey(finding);
    const count = (seenCounts.get(key) ?? 0) + 1;
    seenCounts.set(key, count);
    if (count > (allowedCounts.get(key) ?? 0)) unbaselined.push(finding);
  }
  for (const [key, allowedCount] of allowedCounts) {
    const seenCount = seenCounts.get(key) ?? 0;
    if (seenCount > allowedCount) continue;
    if (seenCount < allowedCount) {
      const [filePath, rule] = key.split("\0");
      unbaselined.push({
        filePath,
        line: 0,
        rule,
        description: `baseline expected ${allowedCount} finding(s), found ${seenCount}`,
      });
    }
  }
  return unbaselined;
}

function privacyDiagnostic(item) {
  if (typeof item === "string" && item.startsWith("unknown argument")) {
    return createDiagnostic("privacy_check_usage_error", item, {
      status: "USAGE",
      location: "scripts/privacy-check.mjs",
      suggestion: "Use --self-test or no arguments.",
      safeNextStep: "Rerun node scripts/privacy-check.mjs with a supported argument.",
    });
  }
  const finding = typeof item === "string"
    ? { filePath: "scripts/privacy-check.mjs", line: 1, rule: "privacy", description: item }
    : item;
  const location = `${finding.filePath}:${finding.line}`;
  if (finding.description?.startsWith("baseline expected")) {
    return createDiagnostic("privacy_baseline_drift", `${finding.rule}: ${finding.description}`, {
      location,
      suggestion: "Refresh the privacy baseline only after confirming the removed or changed finding is intentional and public-safe.",
      safeNextStep: "Inspect the named baseline entry, update docs/privacy-check-baseline.json if appropriate, then rerun this check.",
    });
  }
  if (finding.rule === "private-user-path" || finding.rule === "codex-private-path") {
    return createDiagnostic("privacy_private_path_detected", finding.description, {
      location,
      suggestion: "Replace private local paths with synthetic paths such as /Users/example or documented placeholders.",
      safeNextStep: "Edit the named file to remove the private path, then rerun node scripts/privacy-check.mjs.",
    });
  }
  if (finding.rule?.includes("session") || finding.rule?.includes("goal") || finding.rule?.includes("source")) {
    return createDiagnostic("privacy_private_provenance_detected", finding.description, {
      location,
      suggestion: "Replace private session, source, or goal identifiers with public-safe aliases.",
      safeNextStep: "Remove the private provenance reference, then rerun node scripts/privacy-check.mjs.",
    });
  }
  if (finding.rule?.includes("token") || finding.rule?.includes("secret") || finding.rule?.includes("signing") || finding.rule?.includes("team")) {
    return createDiagnostic("privacy_secret_literal_detected", finding.description, {
      location,
      suggestion: "Replace secret-like values with synthetic fixtures and keep real credentials outside public repos.",
      safeNextStep: "Remove the secret-like literal, then rerun node scripts/privacy-check.mjs.",
    });
  }
  if (finding.rule === "private-bundle-id") {
    return createDiagnostic("privacy_private_bundle_id_detected", finding.description, {
      location,
      suggestion: "Use com.example placeholders or public-safe bundle identifiers in public artifacts.",
      safeNextStep: "Replace the private bundle identifier, then rerun node scripts/privacy-check.mjs.",
    });
  }
  return createDiagnostic("privacy_private_literal_detected", finding.description, {
    location,
    suggestion: "Replace private literals with synthetic fixtures or remove the public artifact reference.",
    safeNextStep: "Fix the named file, then rerun node scripts/privacy-check.mjs.",
  });
}

function printFindings(items, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "Privacy check failed:",
    diagnostics: items.map(privacyDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function runSelfTest() {
  const findings = scanText([
    "path=/Users/privateperson/project",
    "token=sk-test-secret-12345678901234567890",
    "sourceConversationId 019e1234-1234-7abc-8abc-123456789abc",
    "bundle identifier com.private.app",
  ].join("\n"), "/Users/example/private-fixture.md");
  if (!findings.some((finding) => finding.rule === "private-user-path")) throw new Error("self-test missing private path finding");
  if (!findings.some((finding) => finding.rule === "secret-looking-literal")) throw new Error("self-test missing secret finding");
  const baselineDrift = applyBaseline([], { entries: [{ filePath: "docs/example.md", rule: "private-user-path", count: 1 }] });
  if (!baselineDrift.some((finding) => finding.description.startsWith("baseline expected"))) throw new Error("self-test missing baseline drift");
  const chunks = [];
  printFindings([
    "unknown argument --bad-token-sk-test-secret-12345678901234567890",
    ...findings,
    ...baselineDrift,
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  for (const code of [
    "privacy_check_usage_error",
    "privacy_private_path_detected",
    "privacy_secret_literal_detected",
    "privacy_private_provenance_detected",
    "privacy_private_bundle_id_detected",
    "privacy_baseline_drift",
  ]) {
    if (!output.includes(`code: ${code}`)) throw new Error(`self-test missing ${code}`);
  }
  if (!output.includes("suggestion: Replace secret-like values")) throw new Error("self-test missing actionable suggestion");
  if (output.includes("/Users/example") || output.includes("sk-test-secret")) throw new Error("self-test leaked private data");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (!allowedArgs.has(arg)) {
      printFindings([`unknown argument ${arg}`]);
      process.exit(64);
    }
  }
  if (args.includes("--self-test")) {
    runSelfTest();
    console.log("Privacy check self-test passed.");
    process.exit(0);
  }
  const findings = applyBaseline(scanRepository());
  if (findings.length > 0) {
    printFindings(findings);
    process.exit(1);
  }
  console.log("Privacy check passed.");
}
