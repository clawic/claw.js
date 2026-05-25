import { STYLE_SCHEMA_VERSION, type StyleManifest } from "./schema.ts";
import { CLI_EXIT_USAGE, CliHandledError } from "../cli-errors.ts";

const FRONTMATTER_OPEN = "---json";
const FRONTMATTER_CLOSE = "---";

interface SerializeOptions {
  voiceBody?: string;
  doDontBody?: string;
  imageryBody?: string;
}

export interface SerializedStyle {
  frontmatter: string;
  body: string;
  full: string;
}

export function serializeStyleMd(manifest: StyleManifest, options: SerializeOptions = {}): SerializedStyle {
  const head: Record<string, unknown> = {
    schemaVersion: manifest.schemaVersion ?? STYLE_SCHEMA_VERSION,
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    tags: manifest.tags,
    tokens: manifest.tokens,
    brand: extractBrandStructural(manifest),
    imagery: extractImageryStructural(manifest),
    overrides: manifest.overrides,
    references: manifest.references,
    examples: manifest.examples,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    builtin: manifest.builtin,
  };
  pruneUndefined(head);
  const frontmatter = `${FRONTMATTER_OPEN}\n${JSON.stringify(head, null, 2)}\n${FRONTMATTER_CLOSE}`;
  const sections: string[] = [];
  sections.push(`# ${manifest.name}`);
  if (manifest.description) sections.push(manifest.description);
  if (options.voiceBody ?? manifest.brand?.voice) {
    sections.push("## Voice");
    sections.push(options.voiceBody ?? manifest.brand?.voice ?? "");
  }
  if (options.doDontBody ?? manifest.brand?.do_dont) {
    sections.push("## Do / Don't");
    sections.push(options.doDontBody ?? manifest.brand?.do_dont ?? "");
  }
  if (options.imageryBody) {
    sections.push("## Imagery notes");
    sections.push(options.imageryBody);
  }
  if (manifest.brand?.glossary) {
    sections.push("## Glossary");
    sections.push(manifest.brand.glossary);
  }
  const body = sections.filter(Boolean).join("\n\n");
  return {
    frontmatter,
    body,
    full: `${frontmatter}\n\n${body}\n`,
  };
}

export function parseStyleMd(content: string): StyleManifest {
  const trimmed = content.replace(/^﻿/, "");
  if (!trimmed.startsWith(FRONTMATTER_OPEN)) {
    throw new Error(`STYLE.md must begin with '${FRONTMATTER_OPEN}'`);
  }
  const afterOpen = trimmed.slice(FRONTMATTER_OPEN.length);
  const newline = afterOpen.indexOf("\n");
  if (newline < 0) throw new Error("STYLE.md frontmatter missing newline after open fence");
  const fromBody = afterOpen.slice(newline + 1);
  const closeIndex = fromBody.indexOf(`\n${FRONTMATTER_CLOSE}`);
  if (closeIndex < 0) throw new Error(`STYLE.md frontmatter missing closing '${FRONTMATTER_CLOSE}'`);
  const head = fromBody.slice(0, closeIndex);
  const body = fromBody.slice(closeIndex + 1 + FRONTMATTER_CLOSE.length).replace(/^\s*\n/, "");
  const parsed = parseStyleFrontmatterJson(head);
  const manifest = normalizeStyleManifest(parsed);
  const sectionalised = applyBodyToBrand(manifest, body);
  return sectionalised;
}

function parseStyleFrontmatterJson(head: string): Partial<StyleManifest> {
  try {
    return JSON.parse(head) as Partial<StyleManifest>;
  } catch (error) {
    throw new CliHandledError(
      "invalid_style_frontmatter_json",
      `STYLE.md frontmatter must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      CLI_EXIT_USAGE,
      {
        location: "style.frontmatter",
        suggestion: "Fix the JSON block between the ---json and --- fences before importing the style.",
        safeNextStep: "Validate STYLE.md as JSON frontmatter, then rerun claw style import --json.",
      },
    );
  }
}

export function normalizeStyleManifest(input: Partial<StyleManifest>): StyleManifest {
  if (!input || typeof input !== "object") throw new Error("Style manifest must be an object");
  if (!input.id) throw new Error("Style manifest missing 'id'");
  if (!input.name) throw new Error("Style manifest missing 'name'");
  if (!input.tokens) throw new Error("Style manifest missing 'tokens'");
  return {
    schemaVersion: STYLE_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    description: input.description,
    tags: input.tags ?? [],
    tokens: input.tokens,
    brand: input.brand,
    imagery: input.imagery,
    overrides: input.overrides,
    references: input.references ?? [],
    examples: input.examples ?? [],
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    builtin: input.builtin === true,
  };
}

function extractBrandStructural(manifest: StyleManifest): StyleManifest["brand"] | undefined {
  if (!manifest.brand) return undefined;
  const { voice: _voice, do_dont: _dd, ...rest } = manifest.brand;
  return Object.keys(rest).length > 0 ? rest as StyleManifest["brand"] : undefined;
}

function extractImageryStructural(manifest: StyleManifest): StyleManifest["imagery"] | undefined {
  return manifest.imagery;
}

function applyBodyToBrand(manifest: StyleManifest, body: string): StyleManifest {
  const sections = parseMarkdownSections(body);
  const voice = sections.get("voice");
  const doDont = sections.get("do / don't") ?? sections.get("do/don't") ?? sections.get("do don't");
  const glossary = sections.get("glossary");
  if (!voice && !doDont && !glossary) return manifest;
  const brand = { ...(manifest.brand ?? {}) };
  if (voice) brand.voice = voice;
  if (doDont) brand.do_dont = doDont;
  if (glossary) brand.glossary = glossary;
  return { ...manifest, brand };
}

function parseMarkdownSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  if (!body.trim()) return sections;
  const lines = body.split(/\r?\n/);
  let currentTitle: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (currentTitle != null) {
      sections.set(currentTitle.trim().toLowerCase(), buffer.join("\n").trim());
    }
    buffer = [];
  };
  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.*)$/);
    if (headingMatch) {
      flush();
      currentTitle = headingMatch[1];
      continue;
    }
    if (currentTitle != null) buffer.push(line);
  }
  flush();
  return sections;
}

function pruneUndefined(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
}
