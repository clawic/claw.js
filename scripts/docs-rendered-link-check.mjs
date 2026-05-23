#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const docsDir = path.join(rootDir, "docs");
const distDir = path.join(rootDir, "website", "dist");
const skipBuild = process.argv.includes("--skip-build");

function fail(code, message, options = {}) {
  failures.push(createDiagnostic(code, message, {
    location: options.location ?? "docs",
    suggestion: options.suggestion ?? "Fix the referenced docs source or rendered route before retrying.",
    safeNextStep: options.safeNextStep ?? "Rerun node scripts/docs-rendered-link-check.mjs after fixing the reported docs link.",
  }));
}

function listMarkdownFiles(relativeDir) {
  const absoluteDir = path.join(rootDir, relativeDir);
  const files = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relativePath);
    }
  }
  return files;
}

function stripMarkdownCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
}

function markdownLinks(text) {
  const links = [];
  const stripped = stripMarkdownCode(text);
  for (const match of stripped.matchAll(/!?\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    if (match[0].startsWith("![")) continue;
    links.push(match[1]);
  }
  for (const match of stripped.matchAll(/href=["']([^"']+)["']/g)) {
    links.push(match[1]);
  }
  return links;
}

function isExternal(target) {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(target) ||
    /^(?:mailto|tel|javascript):/i.test(target);
}

function splitTarget(target) {
  const withoutFragment = target.split("#")[0] ?? "";
  return withoutFragment.split("?")[0] ?? "";
}

function renderedPathForDocsFile(relativePath) {
  const parsed = path.parse(path.relative("docs", relativePath));
  if (parsed.name === "index") {
    return path.join(distDir, parsed.dir, "index.html");
  }
  return path.join(distDir, parsed.dir, `${parsed.name}.html`);
}

function renderedPathForCleanRoute(routePath, currentHtmlPath = "") {
  let clean = splitTarget(routePath);
  if (!clean || clean === "#") return null;
  if (isExternal(clean)) return null;
  if (clean.startsWith("/")) {
    clean = clean.slice(1);
  } else {
    clean = path.posix.normalize(path.posix.join(path.posix.dirname(currentHtmlPath), clean));
  }
  clean = clean.replace(/^\.?\//, "");
  if (!clean || clean === ".") return path.join(distDir, "index.html");
  if (clean.endsWith("/")) return path.join(distDir, clean, "index.html");
  if (path.extname(clean) === ".html") return path.join(distDir, clean);
  if (path.extname(clean)) return null;
  return path.join(distDir, `${clean}.html`);
}

function resolveSourceTarget(sourceRelativePath, target) {
  const clean = splitTarget(target);
  if (!clean || clean.startsWith("#") || isExternal(clean)) return null;
  if (clean.startsWith("/")) {
    const route = clean.slice(1);
    if (!route) return "docs/index.md";
    if (route.endsWith("/")) return path.join("docs", route, "index.md");
    return path.join("docs", `${route}.md`);
  }
  const resolved = path.normalize(path.join(path.dirname(sourceRelativePath), clean));
  if (path.extname(resolved)) return resolved;
  if (fs.existsSync(path.join(rootDir, `${resolved}.md`))) return `${resolved}.md`;
  return path.join(resolved, "index.md");
}

function relativeHtmlPathForDocsFile(relativePath) {
  return path.relative(distDir, renderedPathForDocsFile(relativePath)).split(path.sep).join("/");
}

const failures = [];

function runSelfTest() {
  const chunks = [];
  printActionableFailureReport({
    title: "Rendered docs link check failed for /Users/example/private:",
    diagnostics: [
      createDiagnostic("docs_rendered_source_link_missing", "docs/decision-map.md links to missing source target token: sk-test-secret-123456", {
        location: "/Users/example/private/docs/decision-map.md",
        suggestion: "Update or remove the broken markdown link.",
        safeNextStep: "Fix docs/decision-map.md, then rerun node scripts/docs-rendered-link-check.mjs.",
      }),
      createDiagnostic("docs_rendered_html_link_missing", "website/dist/docs.html has missing rendered link /missing", {
        location: "website/dist/docs.html",
        suggestion: "Ensure the linked page renders or update the route.",
        safeNextStep: "Run npm --prefix website run docs:build, then rerun node scripts/docs-rendered-link-check.mjs.",
      }),
    ],
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  assert.match(output, /code: docs_rendered_source_link_missing/);
  assert.match(output, /code: docs_rendered_html_link_missing/);
  assert.match(output, /location: ~\/private\/docs\/decision-map\.md/);
  assert.match(output, /suggestion: Update or remove the broken markdown link/);
  assert.match(output, /next: Run npm --prefix website run docs:build/);
  assert.doesNotMatch(output, /\/Users\/example/);
  assert.doesNotMatch(output, /sk-test-secret-123456/);
  console.log("rendered docs link check self-test passed");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

if (!skipBuild) {
  const build = spawnSync("npm", ["--prefix", "website", "run", "docs:build"], {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });
  if (build.status !== 0) {
    printActionableFailureReport({
      title: "Rendered docs link check failed:",
      diagnostics: [
        createDiagnostic("docs_rendered_build_failed", `npm --prefix website run docs:build failed with exit status ${build.status ?? "unknown"}`, {
          location: "website",
          suggestion: "Fix the docs build output before checking rendered links.",
          safeNextStep: "Run npm --prefix website run docs:build, fix the reported error, then rerun node scripts/docs-rendered-link-check.mjs.",
        }),
      ],
    });
    process.exit(build.status ?? 1);
  }
}

const docsToCheck = [
  "docs/decision-map.md",
  ...listMarkdownFiles("docs/adr").sort(),
];

for (const sourceRelativePath of docsToCheck) {
  const sourceAbsolutePath = path.join(rootDir, sourceRelativePath);
  if (!fs.existsSync(sourceAbsolutePath)) {
    fail("docs_rendered_source_missing", `${sourceRelativePath} is missing`, {
      location: sourceRelativePath,
      suggestion: "Restore the canonical docs source or remove it from the rendered docs check.",
      safeNextStep: `Restore ${sourceRelativePath}, then rerun node scripts/docs-rendered-link-check.mjs.`,
    });
    continue;
  }

  const renderedPath = renderedPathForDocsFile(sourceRelativePath);
  if (!fs.existsSync(renderedPath)) {
    fail("docs_rendered_page_missing", `${sourceRelativePath} did not render to ${path.relative(rootDir, renderedPath)}`, {
      location: sourceRelativePath,
      suggestion: "Ensure the docs builder emits a rendered page for this canonical source.",
      safeNextStep: "Run npm --prefix website run docs:build, inspect the missing output, then rerun node scripts/docs-rendered-link-check.mjs.",
    });
  }

  const text = fs.readFileSync(sourceAbsolutePath, "utf8");
  for (const target of markdownLinks(text)) {
    const resolved = resolveSourceTarget(sourceRelativePath, target);
    if (!resolved) continue;
    const absoluteResolved = path.join(rootDir, resolved);
    if (!fs.existsSync(absoluteResolved)) {
      fail("docs_rendered_source_link_missing", `${sourceRelativePath} links to missing source target ${target}`, {
        location: sourceRelativePath,
        suggestion: "Update or remove the broken markdown link.",
        safeNextStep: `Fix the link target ${target} in ${sourceRelativePath}, then rerun node scripts/docs-rendered-link-check.mjs.`,
      });
      continue;
    }
    if (resolved.startsWith("docs/") && resolved.endsWith(".md")) {
      const renderedTarget = renderedPathForDocsFile(resolved);
      if (!fs.existsSync(renderedTarget)) {
        fail("docs_rendered_target_page_missing", `${sourceRelativePath} links to ${target}, but ${resolved} has no rendered page`, {
          location: sourceRelativePath,
          suggestion: "Ensure linked markdown pages are part of the rendered docs output.",
          safeNextStep: "Add the linked page to the docs renderer or update the link, then rerun node scripts/docs-rendered-link-check.mjs.",
        });
      }
    }
  }

  if (!fs.existsSync(renderedPath)) continue;
  const renderedHtml = fs.readFileSync(renderedPath, "utf8");
  const currentHtmlPath = relativeHtmlPathForDocsFile(sourceRelativePath);
  for (const match of renderedHtml.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (!href || href.startsWith("#") || isExternal(href)) continue;
    const renderedTarget = renderedPathForCleanRoute(href, currentHtmlPath);
    if (renderedTarget && !fs.existsSync(renderedTarget)) {
      fail("docs_rendered_html_link_missing", `${path.relative(rootDir, renderedPath)} has missing rendered link ${href}`, {
        location: path.relative(rootDir, renderedPath),
        suggestion: "Ensure the linked page renders or update the route.",
        safeNextStep: "Run npm --prefix website run docs:build, then rerun node scripts/docs-rendered-link-check.mjs.",
      });
    }
  }
}

if (failures.length > 0) {
  printActionableFailureReport({
    title: "Rendered docs link check failed:",
    diagnostics: failures,
  });
  process.exit(1);
}

console.log(`Rendered docs link check passed (${docsToCheck.length} canonical pages)`);
