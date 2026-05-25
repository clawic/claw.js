import { isTemplateCategory, TEMPLATE_SCHEMA_VERSION, type TemplateAspect, type TemplateManifest, type TemplateOutputFormat, type TemplateSlot, type TemplateVariant } from "./schema.ts";
import { CLI_EXIT_USAGE, CliHandledError } from "../cli-errors.ts";

const FRONTMATTER_OPEN = "---json";
const FRONTMATTER_CLOSE = "---";

export interface SerializedTemplate {
  frontmatter: string;
  body: string;
  full: string;
}

export function serializeTemplateMd(manifest: TemplateManifest, bodyMd: string = ""): SerializedTemplate {
  const head: Record<string, unknown> = {
    schemaVersion: manifest.schemaVersion ?? TEMPLATE_SCHEMA_VERSION,
    id: manifest.id,
    name: manifest.name,
    category: manifest.category,
    aspect: manifest.aspect,
    description: manifest.description,
    tags: manifest.tags,
    slots: manifest.slots,
    variants: manifest.variants,
    outputs: manifest.outputs,
    defaultStyleId: manifest.defaultStyleId,
    builtin: manifest.builtin,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
  };
  for (const key of Object.keys(head)) {
    if (head[key] === undefined) delete head[key];
  }
  const frontmatter = `${FRONTMATTER_OPEN}\n${JSON.stringify(head, null, 2)}\n${FRONTMATTER_CLOSE}`;
  const body = bodyMd.trim() || `# ${manifest.name}\n\n${manifest.description ?? ""}`.trim();
  return {
    frontmatter,
    body,
    full: `${frontmatter}\n\n${body}\n`,
  };
}

export function parseTemplateMd(content: string): TemplateManifest {
  const trimmed = content.replace(/^﻿/, "");
  if (!trimmed.startsWith(FRONTMATTER_OPEN)) {
    throw new Error(`TEMPLATE.md must begin with '${FRONTMATTER_OPEN}'`);
  }
  const afterOpen = trimmed.slice(FRONTMATTER_OPEN.length);
  const newline = afterOpen.indexOf("\n");
  if (newline < 0) throw new Error("TEMPLATE.md frontmatter missing newline after open fence");
  const fromBody = afterOpen.slice(newline + 1);
  const closeIndex = fromBody.indexOf(`\n${FRONTMATTER_CLOSE}`);
  if (closeIndex < 0) throw new Error(`TEMPLATE.md frontmatter missing closing '${FRONTMATTER_CLOSE}'`);
  const head = fromBody.slice(0, closeIndex);
  const parsed = parseTemplateFrontmatterJson(head);
  return normalizeTemplateManifest(parsed);
}

function parseTemplateFrontmatterJson(head: string): Partial<TemplateManifest> {
  try {
    return JSON.parse(head) as Partial<TemplateManifest>;
  } catch (error) {
    throw new CliHandledError(
      "invalid_template_frontmatter_json",
      `TEMPLATE.md frontmatter must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      CLI_EXIT_USAGE,
      {
        location: "template.frontmatter",
        suggestion: "Fix the JSON block between the ---json and --- fences before reading the template.",
        safeNextStep: "Validate TEMPLATE.md as JSON frontmatter, then rerun the template command with --json.",
      },
    );
  }
}

export function normalizeTemplateManifest(input: Partial<TemplateManifest>): TemplateManifest {
  if (!input || typeof input !== "object") throw templateManifestUsageError("Template manifest must be an object");
  const id = requiredTemplateString(input.id, "id");
  const name = requiredTemplateString(input.name, "name");
  const category = requiredTemplateString(input.category, "category");
  if (!isTemplateCategory(category)) {
    throw templateManifestUsageError(`Template manifest field 'category' must be a supported template category, got '${category}'`);
  }
  const aspect = normalizeTemplateAspect(input.aspect);
  const tags = optionalTemplateStringArray(input.tags, "tags") ?? [];
  const slots = optionalTemplateObjectArray<TemplateSlot>(input.slots, "slots") ?? [];
  const variants = optionalTemplateObjectArray<TemplateVariant>(input.variants, "variants") ?? [{ id: "default", label: "Default" }];
  const outputs = normalizeTemplateOutputs(input.outputs);
  return {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    id,
    name,
    category,
    aspect,
    description: input.description,
    tags,
    slots,
    variants,
    outputs,
    defaultStyleId: input.defaultStyleId,
    builtin: input.builtin === true,
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

function templateManifestUsageError(message: string): CliHandledError {
  return new CliHandledError("invalid_template_manifest", message, CLI_EXIT_USAGE, {
    location: "template.manifest",
    suggestion: "Fix the TEMPLATE.md JSON manifest fields before reading or rendering the template.",
    safeNextStep: "Run the template command again after correcting the manifest field named in the error.",
  });
}

function requiredTemplateString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw templateManifestUsageError(`Template manifest missing or invalid '${field}'`);
  }
  return value;
}

function optionalTemplateStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw templateManifestUsageError(`Template manifest field '${field}' must be an array of strings`);
  }
  return value;
}

function optionalTemplateObjectArray<TValue extends object>(value: unknown, field: string): TValue[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw templateManifestUsageError(`Template manifest field '${field}' must be an array of objects`);
  }
  return value as TValue[];
}

function normalizeTemplateAspect(value: unknown): TemplateAspect {
  if (typeof value === "string") {
    if (TEMPLATE_ASPECTS.has(value)) return value as TemplateAspect;
    throw templateManifestUsageError(`Template manifest field 'aspect' must be a supported aspect, got '${value}'`);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as { width?: unknown; height?: unknown; unit?: unknown };
    if (
      typeof candidate.width === "number"
      && typeof candidate.height === "number"
      && Number.isFinite(candidate.width)
      && Number.isFinite(candidate.height)
      && candidate.width > 0
      && candidate.height > 0
      && (candidate.unit === "px" || candidate.unit === "mm")
    ) {
      return { width: candidate.width, height: candidate.height, unit: candidate.unit };
    }
  }
  throw templateManifestUsageError("Template manifest missing or invalid 'aspect'");
}

function normalizeTemplateOutputs(value: unknown): TemplateOutputFormat[] {
  if (value === undefined || value === null) return ["html", "pdf", "png"];
  if (!Array.isArray(value) || value.length === 0) {
    throw templateManifestUsageError("Template manifest field 'outputs' must be a non-empty array");
  }
  for (const output of value) {
    if (typeof output !== "string" || !TEMPLATE_OUTPUT_FORMATS.has(output)) {
      throw templateManifestUsageError(`Template manifest field 'outputs' contains unsupported format '${String(output)}'`);
    }
  }
  return value as TemplateOutputFormat[];
}

const TEMPLATE_ASPECTS = new Set([
  "16:9",
  "4:3",
  "1:1",
  "4:5",
  "9:16",
  "a4-portrait",
  "a4-landscape",
  "letter-portrait",
  "letter-landscape",
]);

const TEMPLATE_OUTPUT_FORMATS = new Set(["html", "pdf", "png", "svg", "pptx"]);
