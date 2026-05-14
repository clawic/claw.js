import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";

import { parseStyleMd, serializeStyleMd } from "./serializer.ts";
import type { StyleManifest } from "./schema.ts";

export function stylesRootDir(workspaceRoot: string): string {
  return resolveClawPersistentSurfacePath("claw.workspace.styles", workspaceRoot);
}

export function styleDir(workspaceRoot: string, styleId: string): string {
  return path.join(stylesRootDir(workspaceRoot), styleId);
}

export function styleManifestPath(workspaceRoot: string, styleId: string): string {
  return path.join(styleDir(workspaceRoot, styleId), "STYLE.md");
}

export function generateStyleId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "style";
  const suffix = randomBytes(2).toString("hex");
  return `${slug}-${suffix}`;
}

export function readStyle(workspaceRoot: string, styleId: string): StyleManifest {
  const filePath = styleManifestPath(workspaceRoot, styleId);
  if (!fs.existsSync(filePath)) throw new Error(`Style not found: ${styleId}`);
  const content = fs.readFileSync(filePath, "utf8");
  return parseStyleMd(content);
}

export function writeStyle(workspaceRoot: string, manifest: StyleManifest): { path: string } {
  const dir = styleDir(workspaceRoot, manifest.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "brand"), { recursive: true });
  fs.mkdirSync(path.join(dir, "imagery", "references"), { recursive: true });
  fs.mkdirSync(path.join(dir, "overrides"), { recursive: true });
  const filePath = styleManifestPath(workspaceRoot, manifest.id);
  const serialized = serializeStyleMd(manifest);
  fs.writeFileSync(filePath, serialized.full, "utf8");
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    `${JSON.stringify({ id: manifest.id, createdAt: manifest.createdAt, updatedAt: manifest.updatedAt, builtin: manifest.builtin ?? false, references: manifest.references ?? [] }, null, 2)}\n`,
    "utf8",
  );
  return { path: filePath };
}

export interface StyleSummary {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  builtin: boolean;
  updatedAt: string;
}

export function listStyles(workspaceRoot: string): StyleSummary[] {
  const root = stylesRootDir(workspaceRoot);
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const out: StyleSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(root, entry.name, "STYLE.md");
    if (!fs.existsSync(filePath)) continue;
    try {
      const manifest = parseStyleMd(fs.readFileSync(filePath, "utf8"));
      out.push({
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        tags: manifest.tags ?? [],
        builtin: manifest.builtin === true,
        updatedAt: manifest.updatedAt,
      });
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function exportStyle(workspaceRoot: string, styleId: string, destDir: string): { path: string } {
  const sourceDir = styleDir(workspaceRoot, styleId);
  if (!fs.existsSync(sourceDir)) throw new Error(`Style not found: ${styleId}`);
  const targetDir = path.resolve(destDir);
  copyDirectoryRecursive(sourceDir, targetDir);
  return { path: targetDir };
}

export function importStyle(workspaceRoot: string, sourceDir: string, opts: { overwrite?: boolean } = {}): { id: string; path: string } {
  const resolvedSource = path.resolve(sourceDir);
  const manifestPath = path.join(resolvedSource, "STYLE.md");
  if (!fs.existsSync(manifestPath)) throw new Error(`STYLE.md not found in ${sourceDir}`);
  const manifest = parseStyleMd(fs.readFileSync(manifestPath, "utf8"));
  const targetDir = styleDir(workspaceRoot, manifest.id);
  if (fs.existsSync(targetDir) && !opts.overwrite) {
    throw new Error(`Style already exists: ${manifest.id} (use --overwrite to replace)`);
  }
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
  copyDirectoryRecursive(resolvedSource, targetDir);
  return { id: manifest.id, path: styleManifestPath(workspaceRoot, manifest.id) };
}

function copyDirectoryRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
