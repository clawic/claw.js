import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { FrontmatterMap, FrontmatterValue } from "./types";

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function writeJsonFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function parseKeyValueFilters(values: string[]): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const value of values) {
    const separatorIndex = value.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`Invalid filter "${value}". Expected key=value.`);
    }
    const key = value.slice(0, separatorIndex).trim();
    const filterValue = value.slice(separatorIndex + 1).trim();
    if (!key || !filterValue) {
      throw new Error(`Invalid filter "${value}". Expected key=value.`);
    }
    filters[key] = filterValue;
  }
  return filters;
}

export function resolveWorkspaceRoot(startDir: string): string {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, ".memory"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("No .memory workspace found. Run memory init first.");
    }
    current = parent;
  }
}

export function listMarkdownFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

export function parseFrontmatterDocument(content: string): {
  frontmatter: FrontmatterMap;
  body: string;
} {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "---") {
    throw new Error("Markdown note must start with frontmatter");
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && (line === "---" || line === "..."));
  if (closingIndex === -1) {
    throw new Error("Markdown note frontmatter is not closed");
  }

  const frontmatterBlock = lines.slice(1, closingIndex).join("\n");
  const body = lines.slice(closingIndex + 1).join("\n").replace(/^\n/, "");
  const parsed = YAML.parse(frontmatterBlock, { schema: "core" });

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Markdown note frontmatter must be a mapping");
  }

  return {
    frontmatter: normalizeFrontmatterValue(parsed) as FrontmatterMap,
    body
  };
}

export function serializeFrontmatterDocument(frontmatter: FrontmatterMap, body: string): string {
  const frontmatterBlock = YAML.stringify(frontmatter, {
    lineWidth: 0,
    defaultStringType: "PLAIN",
    collectionStyle: "block",
    sortMapEntries: false
  }).trimEnd();

  const normalizedBody = body.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  return `---\n${frontmatterBlock}\n---\n\n${normalizedBody}\n`;
}

export function normalizeReference(reference: string): string {
  const trimmed = reference.trim();
  const wikiLinkMatch = trimmed.match(/^\[\[([^\]]+)\]\]$/);
  return (wikiLinkMatch ? wikiLinkMatch[1] : trimmed).trim();
}

export function normalizeIdentity(value: string): string {
  return normalizeReference(value).trim().normalize("NFC").toLowerCase();
}

export function hashString(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex");
}

export function sortScalarArray(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function sortFrontmatterMap(
  frontmatter: FrontmatterMap,
  preferredKeyOrder: string[]
): FrontmatterMap {
  const preferredPositions = new Map(preferredKeyOrder.map((key, index) => [key, index]));
  const keys = Object.keys(frontmatter).sort((left, right) => {
    const leftPosition = preferredPositions.get(left);
    const rightPosition = preferredPositions.get(right);
    if (leftPosition !== undefined || rightPosition !== undefined) {
      return (leftPosition ?? Number.MAX_SAFE_INTEGER) - (rightPosition ?? Number.MAX_SAFE_INTEGER);
    }
    return left.localeCompare(right);
  });

  const ordered: FrontmatterMap = {};
  for (const key of keys) {
    ordered[key] = sortFrontmatterValue(frontmatter[key]);
  }
  return ordered;
}

function sortFrontmatterValue(value: FrontmatterValue): FrontmatterValue {
  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry === "string")) {
      return sortScalarArray(value as string[]);
    }
    if (
      value.every(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          !Array.isArray(entry) &&
          typeof (entry as Record<string, FrontmatterValue>).target === "string"
      )
    ) {
      return [...value]
        .map((entry) => sortFrontmatterValue(entry) as FrontmatterValue)
        .sort((left, right) =>
          String((left as Record<string, FrontmatterValue>).target).localeCompare(
            String((right as Record<string, FrontmatterValue>).target)
          )
        );
    }
    return value.map((entry) => sortFrontmatterValue(entry));
  }

  if (value && typeof value === "object") {
    const ordered: Record<string, FrontmatterValue> = {};
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
      ordered[key] = sortFrontmatterValue((value as Record<string, FrontmatterValue>)[key]);
    }
    return ordered;
  }

  return value;
}

function normalizeFrontmatterValue(value: unknown): FrontmatterValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeFrontmatterValue(entry));
  }
  if (typeof value === "object") {
    const normalized: Record<string, FrontmatterValue> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      normalized[key] = normalizeFrontmatterValue(entryValue);
    }
    return normalized;
  }
  throw new Error("Unsupported YAML value in frontmatter");
}
