import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const manifestPath = path.join(rootDir, "docs", "codebase-manifest.json");
const manifestRelativePath = "docs/codebase-manifest.json";
const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(["--self-test", "--write", "--check"]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".swift"]);
const TEST_PATTERNS = [".test.", ".spec.", "/__tests__/"];
const ENTRYPOINT_NAMES = new Set(["index.ts", "index.tsx", "index.js", "index.mjs", "main.swift", "App.swift"]);
const IGNORED_DIRS = new Set([
  ".build",
  ".claude",
  ".codex",
  ".git",
  ".next",
  ".tmp",
  ".turbo",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "output",
  "playwright-report",
  "test-results",
]);
const IGNORED_PATH_PARTS = [
  "/.data/",
  "/.tmp-pack-smoke/",
  "/docs/.vitepress/cache/",
  "/examples/showcase/.next",
  "/output/playwright/",
  "/Resources/web-dist/",
  "/vendor/",
];

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function shouldIgnore(relativePath, dirent) {
  const normalized = `/${toPosix(relativePath)}`;
  if (dirent.isDirectory() && IGNORED_DIRS.has(dirent.name)) return true;
  return IGNORED_PATH_PARTS.some((part) => normalized.includes(part));
}

function collectSourceFiles(scanRoot) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(scanRoot, absolutePath);
      if (shouldIgnore(relativePath, entry)) continue;
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(toPosix(relativePath));
      }
    }
  }
  walk(scanRoot);
  return files.sort();
}

function sourceLanguage(relativePath) {
  const ext = path.extname(relativePath);
  if (ext === ".swift") return "swift";
  if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") return "javascript";
  return "typescript";
}

function countLines(text) {
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
}

function isTestPath(relativePath) {
  return TEST_PATTERNS.some((pattern) => relativePath.includes(pattern));
}

function isEntrypoint(relativePath) {
  return ENTRYPOINT_NAMES.has(path.basename(relativePath));
}

function textOfName(name) {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText();
}

function hasExportModifier(node) {
  return !!node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function collectTsJsFacts(relativePath, text) {
  const extension = path.extname(relativePath);
  const scriptKind = extension === ".tsx" || extension === ".jsx"
    ? ts.ScriptKind.TSX
    : extension === ".js" || extension === ".mjs" || extension === ".cjs"
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true, scriptKind);
  const imports = new Set();
  const exports = new Set();
  const declarations = [];

  function addDeclaration(kind, name, exported) {
    if (!name) return;
    declarations.push({ kind, name, exported });
    if (exported) exports.add(name);
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.add(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.add(node.moduleSpecifier.text);
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) exports.add(element.name.text);
      } else if (!node.exportClause) {
        exports.add("*");
      }
    } else if (ts.isFunctionDeclaration(node)) {
      addDeclaration("function", textOfName(node.name), hasExportModifier(node));
    } else if (ts.isClassDeclaration(node)) {
      addDeclaration("class", textOfName(node.name), hasExportModifier(node));
    } else if (ts.isInterfaceDeclaration(node)) {
      addDeclaration("interface", textOfName(node.name), hasExportModifier(node));
    } else if (ts.isTypeAliasDeclaration(node)) {
      addDeclaration("type", textOfName(node.name), hasExportModifier(node));
    } else if (ts.isEnumDeclaration(node)) {
      addDeclaration("enum", textOfName(node.name), hasExportModifier(node));
    } else if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const declaration of node.declarationList.declarations) {
        const name = textOfName(declaration.name);
        addDeclaration("const", name, true);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return {
    imports: [...imports].sort(),
    exports: [...exports].sort(),
    declarations: declarations.sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name)),
  };
}

function collectSwiftFacts(text) {
  const imports = [...text.matchAll(/^\s*import\s+([A-Za-z0-9_]+)/gm)].map((match) => match[1]);
  const declarations = [];
  const declarationPattern = /^\s*(?:public|private|internal|fileprivate|open)?\s*(class|struct|enum|protocol|actor|extension|func)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  for (const match of text.matchAll(declarationPattern)) {
    declarations.push({ kind: match[1], name: match[2], exported: /\b(public|open)\b/.test(match[0]) });
  }
  return {
    imports: [...new Set(imports)].sort(),
    exports: declarations.filter((entry) => entry.exported).map((entry) => entry.name).sort(),
    declarations: declarations.sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name)),
  };
}

export function buildCodebaseManifest(scanRoot = rootDir) {
  const files = [];
  const summary = {
    files: 0,
    tests: 0,
    entrypoints: 0,
    languages: {
      typescript: 0,
      javascript: 0,
      swift: 0,
    },
  };

  for (const relativePath of collectSourceFiles(scanRoot)) {
    const absolutePath = path.join(scanRoot, relativePath);
    const text = fs.readFileSync(absolutePath, "utf8");
    const language = sourceLanguage(relativePath);
    const facts = language === "swift" ? collectSwiftFacts(text) : collectTsJsFacts(relativePath, text);
    const record = {
      path: relativePath,
      language,
      lines: countLines(text),
      test: isTestPath(relativePath),
      entrypoint: isEntrypoint(relativePath),
      imports: facts.imports,
      exports: facts.exports,
      declarations: facts.declarations,
    };
    files.push(record);
    summary.files += 1;
    summary.languages[language] += 1;
    if (record.test) summary.tests += 1;
    if (record.entrypoint) summary.entrypoints += 1;
  }

  return {
    schemaVersion: 1,
    root: ".",
    scope: "repository",
    astCoverage: {
      typescript: "typescript-compiler-api",
      javascript: "typescript-compiler-api",
      swift: "structural-regex",
    },
    exclusions: {
      directories: [...IGNORED_DIRS].sort(),
      pathParts: [...IGNORED_PATH_PARTS].sort(),
    },
    summary,
    files,
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function validateManifest(manifest) {
  const failures = [];
  if (manifest.schemaVersion !== 1) failures.push("schemaVersion must be 1");
  if (manifest.root !== ".") failures.push("root must be '.'");
  if (manifest.scope !== "repository") failures.push("scope must be 'repository'");
  if (!manifest.summary || typeof manifest.summary !== "object") failures.push("summary must be an object");
  if (!Array.isArray(manifest.files)) failures.push("files must be an array");
  if (failures.length) return failures;

  const paths = new Set();
  const languages = { typescript: 0, javascript: 0, swift: 0 };
  let tests = 0;
  let entrypoints = 0;
  let previousPath = "";

  for (const file of manifest.files) {
    if (!file || typeof file !== "object") {
      failures.push("each file record must be an object");
      continue;
    }
    if (typeof file.path !== "string" || file.path.length === 0) {
      failures.push("each file record needs a path");
      continue;
    }
    if (file.path < previousPath) failures.push(`files are not sorted near ${file.path}`);
    previousPath = file.path;
    if (paths.has(file.path)) failures.push(`duplicate file path ${file.path}`);
    paths.add(file.path);
    if (!SOURCE_EXTENSIONS.has(path.extname(file.path))) failures.push(`unexpected source extension: ${file.path}`);
    if (!(file.language in languages)) failures.push(`unexpected language for ${file.path}: ${file.language}`);
    else languages[file.language] += 1;
    if (!Number.isInteger(file.lines) || file.lines < 0) failures.push(`invalid line count for ${file.path}`);
    if (file.test === true) tests += 1;
    if (file.entrypoint === true) entrypoints += 1;
    for (const key of ["imports", "exports", "declarations"]) {
      if (!Array.isArray(file[key])) failures.push(`${file.path} ${key} must be an array`);
    }
  }

  if (manifest.summary.files !== manifest.files.length) failures.push("summary.files does not match files length");
  if (manifest.summary.tests !== tests) failures.push("summary.tests does not match files");
  if (manifest.summary.entrypoints !== entrypoints) failures.push("summary.entrypoints does not match files");
  for (const language of Object.keys(languages)) {
    if (manifest.summary.languages?.[language] !== languages[language]) {
      failures.push(`summary.languages.${language} does not match files`);
    }
  }
  return failures;
}

function manifestDiagnostic(failure) {
  if (failure.startsWith("unknown argument")) {
    return createDiagnostic("codebase_manifest_usage_error", failure, {
      status: "USAGE",
      location: "scripts/codebase-manifest.mjs",
      suggestion: "Use --self-test, --write, --check, or no arguments.",
      safeNextStep: "Rerun node scripts/codebase-manifest.mjs with a supported argument.",
    });
  }
  if (failure.startsWith("summary.")) {
    return createDiagnostic("codebase_manifest_summary_mismatch", failure, {
      location: manifestRelativePath,
      suggestion: "Regenerate the manifest after source files change so summary counts match the file inventory.",
      safeNextStep: "Run node scripts/codebase-manifest.mjs --write, review docs/codebase-manifest.json, then rerun --check.",
    });
  }
  if (failure.startsWith("files are not sorted") || failure.startsWith("duplicate file path")) {
    return createDiagnostic("codebase_manifest_order_invalid", failure, {
      location: manifestRelativePath,
      suggestion: "Keep file records sorted by path and remove duplicate entries.",
      safeNextStep: "Regenerate with node scripts/codebase-manifest.mjs --write, then rerun --check.",
    });
  }
  if (failure.includes("file record") || failure.includes("source extension") || failure.includes("language") || failure.includes("line count") || failure.includes("must be an array")) {
    return createDiagnostic("codebase_manifest_file_record_invalid", failure, {
      location: manifestRelativePath,
      suggestion: "Fix the named file record shape or regenerate the manifest from source.",
      safeNextStep: "Run node scripts/codebase-manifest.mjs --write, review the named record, then rerun --check.",
    });
  }
  return createDiagnostic("codebase_manifest_schema_invalid", failure, {
    location: manifestRelativePath,
    suggestion: "Restore the manifest schema fields expected by the codebase inventory check.",
    safeNextStep: "Fix docs/codebase-manifest.json or regenerate it, then rerun node scripts/codebase-manifest.mjs --check.",
  });
}

function printFailures(failures, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "codebase manifest check failed:",
    diagnostics: failures.map(manifestDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function runSelfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-codebase-manifest-"));
  try {
    fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, "src", "index.ts"), "import x from 'x';\nexport function run() { return x; }\n");
    fs.writeFileSync(path.join(tempRoot, "src", "View.swift"), "import SwiftUI\npublic struct ViewModel {}\n");
    fs.writeFileSync(path.join(tempRoot, "node_modules", "pkg", "ignored.ts"), "export const ignored = true;\n");
    const manifest = buildCodebaseManifest(tempRoot);
    if (manifest.summary.files !== 2) throw new Error(`expected 2 files, got ${manifest.summary.files}`);
    if (!manifest.files.some((file) => file.path === "src/index.ts" && file.exports.includes("run"))) {
      throw new Error("expected TypeScript export inventory");
    }
    if (!manifest.files.some((file) => file.path === "src/View.swift" && file.exports.includes("ViewModel"))) {
      throw new Error("expected Swift declaration inventory");
    }
    const chunks = [];
    printFailures([
      "unknown argument --bad-token-sk-test-secret-123456",
      "summary.files does not match files length",
      "files are not sorted near /Users/example/private/src/index.ts",
      "src/index.ts imports must be an array",
      "schemaVersion must be 1",
    ], { stream: { write: (chunk) => chunks.push(chunk) } });
    const output = chunks.join("");
    if (!output.includes("code: codebase_manifest_usage_error")) throw new Error("self-test missing usage code");
    if (!output.includes("code: codebase_manifest_summary_mismatch")) throw new Error("self-test missing summary code");
    if (!output.includes("code: codebase_manifest_order_invalid")) throw new Error("self-test missing order code");
    if (!output.includes("code: codebase_manifest_file_record_invalid")) throw new Error("self-test missing record code");
    if (!output.includes("code: codebase_manifest_schema_invalid")) throw new Error("self-test missing schema code");
    if (!output.includes("suggestion: Regenerate the manifest")) throw new Error("self-test missing actionable suggestion");
    if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

for (const arg of args) {
  if (!allowedArgs.has(arg)) {
    printFailures([`unknown argument ${arg}`]);
    process.exit(64);
  }
}

if (args.has("--self-test")) {
  runSelfTest();
  console.log("codebase manifest self-test passed");
  process.exit(0);
}

const manifest = buildCodebaseManifest(rootDir);
const generated = stableJson(manifest);

if (args.has("--write")) {
  fs.writeFileSync(manifestPath, generated);
  console.log(`wrote ${path.relative(rootDir, manifestPath)}`);
  process.exit(0);
}

if (args.has("--check")) {
  const failures = validateManifest(manifest);
  if (failures.length) {
    printFailures(failures);
    process.exit(1);
  }
  console.log(`codebase manifest check passed (${manifest.summary.files} files)`);
  process.exit(0);
}

process.stdout.write(generated);
