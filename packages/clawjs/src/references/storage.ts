import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";

import { CLI_EXIT_USAGE, CliHandledError } from "../cli-errors.ts";
import { REFERENCE_SCHEMA_VERSION, isReferenceType, type ReferenceManifest, type ReferenceType } from "./schema.ts";

const FRONTMATTER_OPEN = "---json";
const FRONTMATTER_CLOSE = "---";

function referencesRootDir(workspaceRoot: string): string {
  return resolveClawPersistentSurfacePath("claw.workspace.references", workspaceRoot);
}

function validateReferenceId(referenceId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(referenceId) || referenceId === "." || referenceId === "..") {
    throw new CliHandledError("invalid_reference_id", `Invalid reference id: ${referenceId}`, CLI_EXIT_USAGE, {
      location: "reference.id",
      suggestion: "Use a reference id made of letters, numbers, dots, underscores, or dashes.",
      safeNextStep: "Retry with an id like image.brand-reference-1234.",
    });
  }
  return referenceId;
}

export function referenceDir(workspaceRoot: string, referenceId: string): string {
  return path.join(referencesRootDir(workspaceRoot), validateReferenceId(referenceId));
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
  const parsed = parseReferenceFrontmatterJson(head);
  return normalizeReferenceManifest(parsed);
}

function parseReferenceFrontmatterJson(head: string): Partial<ReferenceManifest> {
  try {
    return JSON.parse(head) as Partial<ReferenceManifest>;
  } catch (error) {
    throw new CliHandledError(
      "invalid_reference_frontmatter_json",
      `REFERENCE.md frontmatter must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      CLI_EXIT_USAGE,
      {
        location: "reference.frontmatter",
        suggestion: "Fix the JSON block between the ---json and --- fences before reading the reference.",
        safeNextStep: "Validate REFERENCE.md as JSON frontmatter, then rerun claw ref get --json.",
      },
    );
  }
}

export function normalizeReferenceManifest(input: Partial<ReferenceManifest>): ReferenceManifest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw referenceManifestUsageError("Reference manifest must be an object");
  }
  const id = requiredReferenceString(input.id, "id");
  const type = requiredReferenceString(input.type, "type");
  if (!isReferenceType(type)) throw referenceManifestUsageError(`Reference manifest invalid type: ${type}`);
  const name = requiredReferenceString(input.name, "name");
  return {
    schemaVersion: REFERENCE_SCHEMA_VERSION,
    id,
    type,
    name,
    source: optionalReferenceString(input.source, "source"),
    asset: optionalReferenceString(input.asset, "asset"),
    tags: optionalReferenceStringArray(input.tags, "tags") ?? [],
    description: optionalReferenceString(input.description, "description"),
    styleIds: optionalReferenceStringArray(input.styleIds, "styleIds") ?? [],
    extractedStyle: optionalReferenceObject(input.extractedStyle, "extractedStyle"),
    createdAt: optionalReferenceString(input.createdAt, "createdAt") ?? new Date().toISOString(),
    updatedAt: optionalReferenceString(input.updatedAt, "updatedAt") ?? new Date().toISOString(),
  };
}

function referenceManifestUsageError(message: string): CliHandledError {
  return new CliHandledError("invalid_reference_manifest", message, CLI_EXIT_USAGE, {
    location: "reference.manifest",
    suggestion: "Fix the REFERENCE.md JSON manifest fields before reading or linking the reference.",
    safeNextStep: "Run the reference command again after correcting the manifest field named in the error.",
  });
}

function requiredReferenceString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw referenceManifestUsageError(`Reference manifest missing or invalid '${field}'`);
  }
  return value;
}

function optionalReferenceString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw referenceManifestUsageError(`Reference manifest field '${field}' must be a string`);
  }
  return value;
}

function optionalReferenceStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw referenceManifestUsageError(`Reference manifest field '${field}' must be an array of strings`);
  }
  return value;
}

function optionalReferenceObject<TValue extends object>(value: TValue | undefined, field: string): TValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw referenceManifestUsageError(`Reference manifest field '${field}' must be an object`);
  }
  return value;
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
