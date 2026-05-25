import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";

import { parseTemplateMd, serializeTemplateMd } from "./serializer.ts";
import { CLI_EXIT_USAGE, CliHandledError } from "../cli-errors.ts";
import { isTemplateCategory, TEMPLATE_CATEGORIES, type TemplateCategory, type TemplateManifest } from "./schema.ts";

function templatesRootDir(workspaceRoot: string): string {
  return resolveClawPersistentSurfacePath("claw.workspace.templates", workspaceRoot);
}

function validateTemplateId(templateId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(templateId) || templateId === "." || templateId === "..") {
    throw new CliHandledError("invalid_template_id", `Invalid template id: ${templateId}`, CLI_EXIT_USAGE, {
      location: "template.id",
      suggestion: "Use a template id made of letters, numbers, dots, underscores, or dashes.",
      safeNextStep: "Retry with an id like report.foo-1234.",
    });
  }
  return templateId;
}

export function templateDir(workspaceRoot: string, templateId: string): string {
  return path.join(templatesRootDir(workspaceRoot), validateTemplateId(templateId));
}

export function templateManifestPath(workspaceRoot: string, templateId: string): string {
  return path.join(templateDir(workspaceRoot, templateId), "TEMPLATE.md");
}

export function generateTemplateId(category: TemplateCategory, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "template";
  const suffix = randomBytes(2).toString("hex");
  return `${category}.${slug}-${suffix}`;
}

export function readTemplate(workspaceRoot: string, templateId: string): TemplateManifest {
  const filePath = templateManifestPath(workspaceRoot, templateId);
  if (!fs.existsSync(filePath)) throw new Error(`Template not found: ${templateId}`);
  const content = fs.readFileSync(filePath, "utf8");
  return parseTemplateMd(content);
}

export function writeTemplate(workspaceRoot: string, manifest: TemplateManifest, bodyMd: string = ""): { path: string } {
  const dir = templateDir(workspaceRoot, manifest.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "variants"), { recursive: true });
  const filePath = templateManifestPath(workspaceRoot, manifest.id);
  const serialized = serializeTemplateMd(manifest, bodyMd);
  fs.writeFileSync(filePath, serialized.full, "utf8");
  return { path: filePath };
}

export interface TemplateSummary {
  id: string;
  name: string;
  category: TemplateCategory;
  description?: string;
  tags: string[];
  variants: number;
  builtin: boolean;
}

export function listTemplates(workspaceRoot: string, filter: { category?: string } = {}): TemplateSummary[] {
  const root = templatesRootDir(workspaceRoot);
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const out: TemplateSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(root, entry.name, "TEMPLATE.md");
    if (!fs.existsSync(filePath)) continue;
    try {
      const manifest = parseTemplateMd(fs.readFileSync(filePath, "utf8"));
      if (filter.category && manifest.category !== filter.category) continue;
      out.push({
        id: manifest.id,
        name: manifest.name,
        category: manifest.category,
        description: manifest.description,
        tags: manifest.tags ?? [],
        variants: manifest.variants.length,
        builtin: manifest.builtin === true,
      });
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => (a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
}

export function templateCategoryOrThrow(value: string): TemplateCategory {
  if (!isTemplateCategory(value)) {
    throw new CliHandledError("invalid_template_category", `Invalid template category: ${value}`, CLI_EXIT_USAGE, {
      location: "template.category",
      suggestion: `Use one of: ${TEMPLATE_CATEGORIES.join(", ")}.`,
      safeNextStep: "Retry the template command with --category set to a supported template category.",
      details: {
        category: value,
        allowedCategories: TEMPLATE_CATEGORIES,
      },
    });
  }
  return value;
}
