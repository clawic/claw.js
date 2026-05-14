import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);

const rules = [
  {
    id: "ts.direct-database-path",
    extensions: [".ts", ".tsx", ".js", ".mjs"],
    pattern: /new\s+Database\s*\([^;\n]*(?:path\.join|join)\s*\(/,
    message: "database paths must be produced by persistent surface builders",
  },
  {
    id: "ts.direct-claw-path",
    extensions: [".ts", ".tsx", ".js", ".mjs"],
    pattern: /(?:path\.join|join)\s*\([^;\n]*(["'`])(?:\.claw|\.clawix|\.clawjs|~\/\.claw|~\/\.clawix)/,
    message: "durable Claw paths must be registered through persistent surface builders",
  },
  {
    id: "ts.local-storage-literal",
    extensions: [".ts", ".tsx", ".js", ".mjs"],
    pattern: /localStorage\.(?:getItem|setItem|removeItem)\(\s*(["'`])[^"'`]+\1/,
    message: "browser storage keys must be registered as browserStorageKey surfaces",
  },
  {
    id: "ts.ddl-literal",
    extensions: [".ts", ".tsx", ".js", ".mjs", ".sql"],
    pattern: /\bCREATE\s+(?:TABLE|INDEX)\b/i,
    message: "DDL tables and indexes must be registered as table/index surfaces",
  },
  {
    id: "swift.user-defaults-literal",
    extensions: [".swift"],
    pattern: /UserDefaults(?:\.standard)?\.(?:set|string|stringArray|bool|object|integer|double|data|dictionary|removeObject)\([^;\n]*forKey:\s*"[^"]+"/,
    message: "UserDefaults keys must be registered as preferenceKey surfaces",
  },
  {
    id: "swift.user-defaults-suite-literal",
    extensions: [".swift"],
    pattern: /UserDefaults\s*\(\s*suiteName:\s*"[^"]+"/,
    message: "UserDefaults suite names must be registered as preferenceKey surfaces",
  },
  {
    id: "swift.sidebar-prefs-literal",
    extensions: [".swift"],
    pattern: /SidebarPrefs\.(?:bool|store\.set|store\.bool)\([^;\n]*forKey:\s*"[^"]+"/,
    message: "SidebarPrefs keys must be registered as preferenceKey surfaces",
  },
  {
    id: "swift.app-storage-literal",
    extensions: [".swift"],
    pattern: /@AppStorage\("[^"]+"/,
    message: "AppStorage keys must be registered as appStorageKey surfaces",
  },
  {
    id: "swift.database-queue-path",
    extensions: [".swift"],
    pattern: /DatabaseQueue\s*\(\s*path:/,
    message: "GRDB database paths must be registered as database surfaces",
  },
  {
    id: "swift.persistent-path-component",
    extensions: [".swift"],
    pattern: /appendingPathComponent\("[^"]*(?:Clawix|\.clawix|\.claw|\.sqlite|bridge-status|dictation-audio)[^"]*"/,
    message: "durable Swift path components must be registered through persistent surface builders",
  },
];

function isBuilderFile(filePath, body) {
  return /(?:clawPersistentSurface|ClawixPersistentSurface|PersistentSurfaceRegistry)/.test(body)
    || filePath.endsWith("persistent-surface-guard.mjs");
}

function lineNumber(body, index) {
  return body.slice(0, index).split("\n").length;
}

function enclosingSwiftType(body, index) {
  const prefix = body.slice(0, index);
  const matches = [...prefix.matchAll(/\b(?:enum|struct|class|actor)\s+([A-Za-z_][A-Za-z0-9_]*)/g)];
  return matches.at(-1)?.[1];
}

function isLikelyPersistentSwiftKey(value) {
  return /^(?:clawix|Clawix|dictation|quickAsk|FeatureFlags|Sidebar|Terminal|Life|provider|feature)\b/.test(value)
    || /(?:\.v\d+|Defaults|Storage|Panel|Mode|Key|Enabled|Disabled|Expanded|Visible|Hidden|Width|Height|TTL|URL|Path|Port|Token|Bearer)/.test(value);
}

function swiftRegisteredKeyFindings(filePath, body, registryBody) {
  if (path.extname(filePath) !== ".swift" || !registryBody) return [];
  const findings = [];
  const pattern = /\b(?:private\s+|nonisolated\s+|static\s+|public\s+|internal\s+|fileprivate\s+)*let\s+([A-Za-z_][A-Za-z0-9_]*(?:Key|StorageKey|DefaultsKey|Suite|SuiteName|suiteName|defaultsKey|storageKey))\s*=\s*"([^"]+)"/g;
  for (const match of body.matchAll(pattern)) {
    const [, name, value] = match;
    if (!isLikelyPersistentSwiftKey(value)) continue;
    const typeName = enclosingSwiftType(body, match.index);
    const qualified = typeName ? `${typeName}.${name}` : name;
    if (!registryBody.includes(qualified) && !registryBody.includes(`.${name}`) && !registryBody.includes(value)) {
      findings.push({
        file: path.relative(rootDir, filePath),
        line: lineNumber(body, match.index),
        rule: "swift.unregistered-persistent-key",
        message: "persistent Swift key constants must be registered in PersistentSurfaceRegistry",
      });
    }
  }
  return findings;
}

function scanFile(filePath, registryBody = "") {
  const ext = path.extname(filePath);
  const body = fs.readFileSync(filePath, "utf8");
  if (isBuilderFile(filePath, body)) return [];

  const findings = [];
  for (const rule of rules) {
    if (!rule.extensions.includes(ext)) continue;
    const match = rule.pattern.exec(body);
    if (!match) continue;
    findings.push({
      file: path.relative(rootDir, filePath),
      line: lineNumber(body, match.index),
      rule: rule.id,
      message: rule.message,
    });
  }
  findings.push(...swiftRegisteredKeyFindings(filePath, body, registryBody));
  return findings;
}

function listFiles(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];
  return fs.readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "dist", ".git", ".build", "build"].includes(entry.name)) return [];
    const next = path.join(targetPath, entry.name);
    return entry.isDirectory() ? listFiles(next) : [next];
  });
}

function runSelfTest() {
  const tempRoot = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "persistent-surface-guard-"));
  const badTs = path.join(tempRoot, "bad.ts");
  const badSwift = path.join(tempRoot, "Bad.swift");
  const builderSwift = path.join(tempRoot, "PersistentSurfaceRegistry.swift");
  fs.writeFileSync(badTs, [
    "const db = new Database(path.join(home, '.claw', 'data', 'core.sqlite'));",
    "localStorage.setItem('clawix.panel', 'open');",
    "db.exec('CREATE TABLE direct_table (id TEXT PRIMARY KEY)');",
  ].join("\n"));
  fs.writeFileSync(badSwift, [
    "@AppStorage(\"SidebarViewMode\") var mode = \"all\"",
    "UserDefaults.standard.set(true, forKey: \"DictationEnabled\")",
    "let bridgeDefaults = UserDefaults(suiteName: \"clawix.bridge\")",
    "SidebarPrefs.store.set(true, forKey: \"TerminalPanelOpen\")",
    "static let missingKey = \"quickAsk.missing\"",
    "let db = try DatabaseQueue(path: url.path)",
  ].join("\n"));
  fs.writeFileSync(builderSwift, "enum ClawixPersistentSurfaceRegistry { static let nodes: [String] = [] }\n");

  const findings = [...scanFile(badTs), ...scanFile(badSwift, "registeredKey"), ...scanFile(builderSwift)];
  const foundRules = new Set(findings.map((finding) => finding.rule));
  for (const expected of ["ts.direct-database-path", "ts.local-storage-literal", "ts.ddl-literal", "swift.app-storage-literal", "swift.user-defaults-literal", "swift.user-defaults-suite-literal", "swift.sidebar-prefs-literal", "swift.unregistered-persistent-key", "swift.database-queue-path"]) {
    if (!foundRules.has(expected)) {
      throw new Error(`self-test did not trigger ${expected}`);
    }
  }
  if (findings.some((finding) => finding.file.endsWith("PersistentSurfaceRegistry.swift"))) {
    throw new Error("self-test incorrectly flagged builder registry file");
  }
  const summary = summarizeFindings(findings);
  if (summary.total < 9 || summary.byRule["swift.database-queue-path"] !== 1) {
    throw new Error("self-test summary did not count expected findings");
  }
  console.log("persistent surface guard self-test passed");
}

function summarizeFindings(findings) {
  const byRule = {};
  const byFile = {};
  for (const finding of findings) {
    byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1;
    byFile[finding.file] = (byFile[finding.file] ?? 0) + 1;
  }
  return {
    total: findings.length,
    byRule,
    byFile,
  };
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const wantsReport = process.argv.includes("--report");
const wantsJson = process.argv.includes("--json");
const targets = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (targets.length === 0) {
  console.error("Usage: node scripts/persistent-surface-guard.mjs --self-test | [--report] [--json] <file-or-dir>...");
  process.exit(64);
}

const allFiles = targets.flatMap((target) => listFiles(path.resolve(rootDir, target)));
const registryBody = allFiles
  .filter((filePath) => filePath.endsWith("PersistentSurfaceRegistry.swift"))
  .map((filePath) => fs.readFileSync(filePath, "utf8"))
  .join("\n");
const findings = allFiles.flatMap((filePath) => scanFile(filePath, registryBody));
if (wantsJson) {
  console.log(JSON.stringify({ ok: findings.length === 0, summary: summarizeFindings(findings), findings }, null, 2));
  process.exit(wantsReport || findings.length === 0 ? 0 : 1);
}
if (wantsReport) {
  const summary = summarizeFindings(findings);
  console.log(`persistent surface guard report: ${summary.total} finding(s)`);
  for (const [rule, count] of Object.entries(summary.byRule).sort()) {
    console.log(`- ${rule}: ${count}`);
  }
  process.exit(0);
}
if (findings.length > 0) {
  console.error("persistent surface guard failed:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.rule}: ${finding.message}`);
  }
  process.exit(1);
}

console.log("persistent surface guard passed");
