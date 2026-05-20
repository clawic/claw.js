import fs from "node:fs";
import path from "node:path";

export type ClawRepositoryDetectedBy = "root" | "ancestor" | "sibling" | "nested" | "fallback";

export interface ClawRepositoryRoot {
  repo: string;
  rootDir: string;
  detectedBy: ClawRepositoryDetectedBy;
}

export interface ClawRepositoryDiscoveryOptions {
  includeFallback?: boolean;
}

export function detectClawPublicRepositories(startDir: string, options: ClawRepositoryDiscoveryOptions = {}): ClawRepositoryRoot[] {
  const start = path.resolve(startDir);
  const repositories: ClawRepositoryRoot[] = [];
  const clawjsRoot = findAncestor(start, isClawjsRoot);
  const clawixRoot = findAncestor(start, isClawixRoot);

  if (clawjsRoot) {
    repositories.push({ repo: "clawjs", rootDir: clawjsRoot, detectedBy: clawjsRoot === start ? "root" : "ancestor" });
    const siblingClawix = path.resolve(clawjsRoot, "../Clawix/clawix");
    if (isClawixRoot(siblingClawix)) repositories.push({ repo: "clawix", rootDir: siblingClawix, detectedBy: "sibling" });
  } else if (clawixRoot) {
    const siblingClawjs = path.resolve(clawixRoot, "../../../clawjs");
    if (isClawjsRoot(siblingClawjs)) repositories.push({ repo: "clawjs", rootDir: siblingClawjs, detectedBy: "sibling" });
    repositories.push({ repo: "clawix", rootDir: clawixRoot, detectedBy: clawixRoot === start ? "root" : "ancestor" });
  } else {
    const overlayRoot = findAncestor(start, isClawixOverlayRoot);
    if (overlayRoot) {
      const siblingClawjs = path.resolve(overlayRoot, "../clawjs");
      if (isClawjsRoot(siblingClawjs)) repositories.push({ repo: "clawjs", rootDir: siblingClawjs, detectedBy: "sibling" });
      const nestedClawix = path.join(overlayRoot, "clawix");
      if (isClawixRoot(nestedClawix)) repositories.push({ repo: "clawix", rootDir: nestedClawix, detectedBy: "nested" });
    }
  }

  if (repositories.length === 0 && options.includeFallback) {
    repositories.push({ repo: inferClawRepoName(start), rootDir: start, detectedBy: "fallback" });
  }

  return dedupeClawRepositories(repositories);
}

export function isClawjsRoot(candidate: string): boolean {
  return fs.existsSync(path.join(candidate, "package.json"))
    && fs.existsSync(path.join(candidate, "packages", "clawjs-core"))
    && fs.existsSync(path.join(candidate, "docs", "decision-map.md"));
}

export function isClawixRoot(candidate: string): boolean {
  return fs.existsSync(path.join(candidate, "AGENTS.md"))
    && fs.existsSync(path.join(candidate, "docs", "decision-map.md"))
    && (fs.existsSync(path.join(candidate, "macos")) || fs.existsSync(path.join(candidate, "STYLE.md")) || path.basename(candidate).toLowerCase() === "clawix");
}

export function inferClawRepoName(rootDir: string): string {
  const base = path.basename(rootDir).toLowerCase();
  if (base === "clawix") return "clawix";
  if (base === "clawjs") return "clawjs";
  return base || "workspace";
}

export function dedupeClawRepositories(repositories: ClawRepositoryRoot[]): ClawRepositoryRoot[] {
  return [...new Map(repositories.map((repo) => [`${repo.repo}:${repo.rootDir}`, repo])).values()];
}

function findAncestor(startDir: string, predicate: (candidate: string) => boolean): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (predicate(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function isClawixOverlayRoot(candidate: string): boolean {
  return fs.existsSync(path.join(candidate, "AGENTS.md")) && isClawixRoot(path.join(candidate, "clawix"));
}
