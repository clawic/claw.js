import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";

import { REFERENCE_SCHEMA_VERSION, isReferenceType, type ReferenceManifest, type ReferenceType } from "./schema.ts";

const FRONTMATTER_OPEN = "---json";
const FRONTMATTER_CLOSE = "---";

function referencesRootDir(workspaceRoot: string): string {
  return resolveClawPersistentSurfacePath("claw.workspace.references", workspaceRoot);
}

export function referenceDir(workspaceRoot: string, referenceId: string): string {
  return path.join(referencesRootDir(workspaceRoot), referenceId);
}

function referenceManifestPath(workspaceRoot: string, referenceId: string): string {
  return path.join(referenceDir(workspaceRoot, referenceId), "REFERENCE.md");
}

export function generateReferenceId(type: ReferenceType, name?: string): string {
  const slug = (name ?? type)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || type;
  const suffix = randomBytes(2).toString("hex");
  return `${type}.${slug}-${suffix}`;
}

function serializeReferenceMd(manifest: ReferenceManifest, bodyMd: string = ""): string {
  const head: Record<string, unknown> = { ...manifest };
  for (const key of Object.keys(head)) if (head[key] === undefined) delete head[key];
  const frontmatter = `${FRONTMATTER_OPEN}\n${JSON.stringify(head, null, 2)}\n${FRONTMATTER_CLOSE}`;
  const body = bodyMd.trim() || `# ${manifest.name}\n\n${manifest.description ?? ""}`.trim();
  return `${frontmatter}\n\n${body}\n`;
}

function parseReferenceMd(content: string): ReferenceManifest {
  const trimmed = content.replace(/^﻿/, "");
  if (!trimmed.startsWith(FRONTMATTER_OPEN)) throw new Error(`REFERENCE.md must begin with '${FRONTMATTER_OPEN}'`);
  const afterOpen = trimmed.slice(FRONTMATTER_OPEN.length);
  const newline = afterOpen.indexOf("\n");
  if (newline < 0) throw new Error("REFERENCE.md frontmatter missing newline after open fence");
  const fromBody = afterOpen.slice(newline + 1);
  const closeIndex = fromBody.indexOf(`\n${FRONTMATTER_CLOSE}`);
  if (closeIndex < 0) throw new Error(`REFERENCE.md frontmatter missing closing '${FRONTMATTER_CLOSE}'`);
  const head = fromBody.slice(0, closeIndex);
  const parsed = JSON.parse(head) as Partial<ReferenceManifest>;
  return normalizeReferenceManifest(parsed);
}

export function normalizeReferenceManifest(input: Partial<ReferenceManifest>): ReferenceManifest {
  if (!input || typeof input !== "object") throw new Error("Reference manifest must be an object");
  if (!input.id) throw new Error("Reference manifest missing 'id'");
  if (!input.type || !isReferenceType(input.type)) throw new Error(`Reference manifest invalid type: ${String(input.type)}`);
  if (!input.name) throw new Error("Reference manifest missing 'name'");
  return {
    schemaVersion: REFERENCE_SCHEMA_VERSION,
    id: input.id,
    type: input.type,
    name: input.name,
    source: input.source,
    asset: input.asset,
    tags: input.tags ?? [],
    description: input.description,
    styleIds: input.styleIds ?? [],
    extractedStyle: input.extractedStyle,
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function readReference(workspaceRoot: string, referenceId: string): ReferenceManifest {
  const filePath = referenceManifestPath(workspaceRoot, referenceId);
  if (!fs.existsSync(filePath)) throw new Error(`Reference not found: ${referenceId}`);
  return parseReferenceMd(fs.readFileSync(filePath, "utf8"));
}

export function writeReference(workspaceRoot: string, manifest: ReferenceManifest, bodyMd: string = ""): { path: string } {
  const dir = referenceDir(workspaceRoot, manifest.id);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = referenceManifestPath(workspaceRoot, manifest.id);
  fs.writeFileSync(filePath, serializeReferenceMd(manifest, bodyMd), "utf8");
  return { path: filePath };
}

export function copyAssetIntoReference(workspaceRoot: string, referenceId: string, sourcePath: string): string {
  const dir = referenceDir(workspaceRoot, referenceId);
  fs.mkdirSync(dir, { recursive: true });
  const filename = path.basename(sourcePath);
  const dest = path.join(dir, filename);
  fs.copyFileSync(sourcePath, dest);
  return path.relative(dir, dest);
}

export interface ReferenceSummary {
  id: string;
  type: ReferenceType;
  name: string;
  tags: string[];
  styleIds: string[];
  updatedAt: string;
}

export function listReferences(workspaceRoot: string, filter: { tag?: string; type?: ReferenceType } = {}): ReferenceSummary[] {
  const root = referencesRootDir(workspaceRoot);
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const out: ReferenceSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(root, entry.name, "REFERENCE.md");
    if (!fs.existsSync(filePath)) continue;
    try {
      const manifest = parseReferenceMd(fs.readFileSync(filePath, "utf8"));
      if (filter.tag && !manifest.tags?.includes(filter.tag)) continue;
      if (filter.type && manifest.type !== filter.type) continue;
      out.push({
        id: manifest.id,
        type: manifest.type,
        name: manifest.name,
        tags: manifest.tags ?? [],
        styleIds: manifest.styleIds ?? [],
        updatedAt: manifest.updatedAt,
      });
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
