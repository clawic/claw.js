#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const docsDir = path.join(rootDir, "docs");
const distDir = path.join(rootDir, "website", "dist");
const skipBuild = process.argv.includes("--skip-build");

function fail(message) {
  failures.push(message);
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

if (!skipBuild) {
  const build = spawnSync("npm", ["--prefix", "website", "run", "docs:build"], {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });
  if (build.status !== 0) {
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
    fail(`${sourceRelativePath} is missing`);
    continue;
  }

  const renderedPath = renderedPathForDocsFile(sourceRelativePath);
  if (!fs.existsSync(renderedPath)) {
    fail(`${sourceRelativePath} did not render to ${path.relative(rootDir, renderedPath)}`);
  }

  const text = fs.readFileSync(sourceAbsolutePath, "utf8");
  for (const target of markdownLinks(text)) {
    const resolved = resolveSourceTarget(sourceRelativePath, target);
    if (!resolved) continue;
    const absoluteResolved = path.join(rootDir, resolved);
    if (!fs.existsSync(absoluteResolved)) {
      fail(`${sourceRelativePath} links to missing source target ${target}`);
      continue;
    }
    if (resolved.startsWith("docs/") && resolved.endsWith(".md")) {
      const renderedTarget = renderedPathForDocsFile(resolved);
      if (!fs.existsSync(renderedTarget)) {
        fail(`${sourceRelativePath} links to ${target}, but ${resolved} has no rendered page`);
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
      fail(`${path.relative(rootDir, renderedPath)} has missing rendered link ${href}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Rendered docs link check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Rendered docs link check passed (${docsToCheck.length} canonical pages)`);
