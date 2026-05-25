import { TEMPLATE_SCHEMA_VERSION, type TemplateManifest } from "./schema.ts";
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
  if (!input || typeof input !== "object") throw new Error("Template manifest must be an object");
  if (!input.id) throw new Error("Template manifest missing 'id'");
  if (!input.name) throw new Error("Template manifest missing 'name'");
  if (!input.category) throw new Error("Template manifest missing 'category'");
  if (!input.aspect) throw new Error("Template manifest missing 'aspect'");
  return {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    category: input.category,
    aspect: input.aspect,
    description: input.description,
    tags: input.tags ?? [],
    slots: input.slots ?? [],
    variants: input.variants ?? [{ id: "default", label: "Default" }],
    outputs: input.outputs ?? ["html", "pdf", "png"],
    defaultStyleId: input.defaultStyleId,
    builtin: input.builtin === true,
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}
