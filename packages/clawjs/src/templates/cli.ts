import fs from "fs";
import path from "path";

import { resolveClawPersistentSurfacePath } from "@clawjs/core";

import { builtinTemplateManifests } from "./builtins.ts";
import {
  generateTemplateId,
  listTemplates,
  readTemplate,
  templateCategoryOrThrow,
  templateDir,
  templateManifestPath,
  writeTemplate,
} from "./storage.ts";
import { normalizeTemplateManifest } from "./serializer.ts";
import type { TemplateAspect, TemplateManifest, TemplateOutputFormat } from "./schema.ts";
import { readStyle } from "../styles/storage.ts";
import { renderTemplate } from "./render/adapters.ts";
import { scheduleDesignResourcesSearchEvent } from "../cli-search-events.ts";

interface TemplateCliContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
  binName: string;
}

export interface TemplateCliOptions {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  workspaceRoot: string;
  wantsJson: boolean;
  context: TemplateCliContext;
}

const T_OK = 0;
const T_FAILURE = 1;
const T_USAGE = 64;

export async function runTemplateCli(options: TemplateCliOptions): Promise<number> {
  const [, command, target] = options.positionals;
  const { context, flags, workspaceRoot } = options;

  if (!command || command === "help") {
    writeUsage(context);
    return command ? T_OK : T_USAGE;
  }

  if (command === "list") {
    const filter: { category?: string } = {};
    if (flags.category) filter.category = templateCategoryOrThrow(flags.category);
    const templates = listTemplates(workspaceRoot, filter);
    writeOutput(options, { templates }, templates.map((t) => `${t.id}\t${t.category}\t${t.name}${t.builtin ? "\t(builtin)" : ""}`).join("\n"));
    return T_OK;
  }

  if (command === "get") {
    if (!target) {
      context.stderr.write(`Usage: ${context.binName} template get <id>\n`);
      return T_USAGE;
    }
    const manifest = readTemplate(workspaceRoot, target);
    writeOutput(options, manifest, `${manifest.id}\t${manifest.name}\t${manifest.slots.length} slots\t${manifest.variants.length} variants`);
    return T_OK;
  }

  if (command === "create") {
    const name = joinedPositionals(options.positionals, 2) || flags.name;
    if (!name || !flags.category) {
      context.stderr.write(`Usage: ${context.binName} template create <name> --category <cat> [--aspect 16:9|1:1|9:16|...] [--from <templateId>]\n`);
      return T_USAGE;
    }
    const category = templateCategoryOrThrow(flags.category);
    const fromId = flags.from;
    const seed = fromId ? readTemplate(workspaceRoot, fromId) : null;
    const aspectFlag = flags.aspect;
    const id = flags.id ? flags.id : generateTemplateId(category, name);
    const now = new Date().toISOString();
    const manifest = normalizeTemplateManifest({
      id,
      name,
      category,
      aspect: seed?.aspect ?? (aspectFlag as TemplateAspect | undefined) ?? "16:9",
      description: flags.description ?? seed?.description,
      tags: flags.tags ? flags.tags.split(",").map((t) => t.trim()).filter(Boolean) : seed?.tags ?? [],
      slots: seed?.slots ?? [],
      variants: seed?.variants ?? [{ id: "default", label: "Default" }],
      outputs: seed?.outputs ?? ["html", "pdf", "png"],
      defaultStyleId: flags["default-style"] ?? seed?.defaultStyleId,
      builtin: false,
      createdAt: now,
      updatedAt: now,
    });
    const { path: filePath } = writeTemplate(workspaceRoot, manifest, seed ? `# ${manifest.name}\n\n${manifest.description ?? ""}` : "");
    scheduleTemplateSearchEvent(options, "upsert", manifest.id);
    writeOutput(options, { template: manifest, path: filePath }, filePath);
    return T_OK;
  }

  if (command === "delete") {
    if (!target) {
      context.stderr.write(`Usage: ${context.binName} template delete <id>\n`);
      return T_USAGE;
    }
    const dir = templateDir(workspaceRoot, target);
    if (!fs.existsSync(dir)) {
      context.stderr.write(`Template not found: ${target}\n`);
      return T_FAILURE;
    }
    const manifest = readTemplate(workspaceRoot, target);
    if (manifest.builtin && flags.force !== "true") {
      context.stderr.write(`Refusing to delete builtin template '${target}' without --force=true\n`);
      return T_FAILURE;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    scheduleTemplateSearchEvent(options, "delete", manifest.id);
    writeOutput(options, { deleted: target }, `Deleted ${target}`);
    return T_OK;
  }

  if (command === "render") {
    if (!target) {
      context.stderr.write(`Usage: ${context.binName} template render <templateId> --style <styleId> [--data <file.json>] [--variant <id>] [--out <path>] [--format html]\n`);
      return T_USAGE;
    }
    if (!flags.style) {
      context.stderr.write(`Missing --style <styleId>\n`);
      return T_USAGE;
    }
    const template = readTemplate(workspaceRoot, target);
    const style = readStyle(workspaceRoot, flags.style);
    const data = flags.data ? readJson(path.resolve(context.cwd, flags.data)) : {};
    const formatFlag = (flags.format ?? "html").toLowerCase();
    const rawFormats = formatFlag.split(",").map((f) => f.trim()).filter(Boolean);
    const ALLOWED = new Set<TemplateOutputFormat>(["html", "pdf", "png", "svg", "pptx"]);
    for (const f of rawFormats) if (!ALLOWED.has(f as TemplateOutputFormat)) {
      context.stderr.write(`Unsupported render format: ${f}\n`);
      return T_USAGE;
    }
    const formats = rawFormats as TemplateOutputFormat[];
    const results: Array<{ format: string; outputPath: string; renderer: string; width: number; height: number }> = [];
    for (const format of formats) {
      const ext = format;
      let outPath: string;
      if (flags.out) {
        const resolved = path.resolve(context.cwd, flags.out);
        if (formats.length === 1) {
          outPath = resolved;
        } else {
          const dir = path.dirname(resolved);
          const base = path.basename(resolved).replace(/\.[^.]+$/, "");
          outPath = path.join(dir, `${base}.${ext}`);
        }
      } else {
        outPath = resolveClawPersistentSurfacePath(
          "claw.workspace.templates",
          workspaceRoot,
          template.id,
          "outputs",
          `${flags.style}-${flags.variant ?? "default"}.${ext}`,
        );
      }
      const result = await renderTemplate({ template, style, data, variantId: flags.variant, outPath, format });
      results.push({ format: result.format, outputPath: result.outPath, renderer: result.renderer, width: result.width, height: result.height });
    }
    writeOutput(options, { templateId: template.id, styleId: style.id, results }, results.map((r) => `${r.format}\t${r.outputPath}\t(${r.renderer})`).join("\n"));
    return T_OK;
  }

  if (command === "install-builtins") {
    const overwrite = flags.overwrite === "true" || options.argv.includes("--overwrite");
    const installed: string[] = [];
    const skipped: string[] = [];
    for (const manifest of builtinTemplateManifests()) {
      const target = templateManifestPath(workspaceRoot, manifest.id);
      if (fs.existsSync(target) && !overwrite) {
        skipped.push(manifest.id);
        continue;
      }
      writeTemplate(workspaceRoot, manifest, `# ${manifest.name}\n\n${manifest.description ?? ""}`);
      scheduleTemplateSearchEvent(options, "upsert", manifest.id);
      installed.push(manifest.id);
    }
    writeOutput(options, { installed, skipped }, `Installed: ${installed.length}\nSkipped: ${skipped.length}`);
    return T_OK;
  }

  if (command === "builtins") {
    const all = builtinTemplateManifests();
    const byCategory = new Map<string, TemplateManifest[]>();
    for (const m of all) {
      const list = byCategory.get(m.category) ?? [];
      list.push(m);
      byCategory.set(m.category, list);
    }
    if (options.wantsJson) {
      writeOutput(options, { builtins: all.map((m) => ({ id: m.id, name: m.name, category: m.category })), total: all.length }, "");
    } else {
      const lines: string[] = [];
      for (const [cat, list] of [...byCategory.entries()].sort()) {
        lines.push(`${cat} (${list.length}):`);
        for (const m of list) lines.push(`  ${m.id}\t${m.name}`);
      }
      lines.push(`Total: ${all.length}`);
      options.context.stdout.write(`${lines.join("\n")}\n`);
    }
    return T_OK;
  }

  context.stderr.write(`Unknown template command: ${command}\n`);
  writeUsage(context);
  return T_USAGE;
}

function joinedPositionals(positionals: string[], from: number): string {
  return positionals.slice(from).filter(Boolean).join(" ").trim();
}

function writeOutput(options: TemplateCliOptions, payload: unknown, text: string): void {
  if (options.wantsJson) {
    options.context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (text) {
    options.context.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  }
}

function scheduleTemplateSearchEvent(options: TemplateCliOptions, operation: "upsert" | "delete", templateId: string): void {
  scheduleDesignResourcesSearchEvent({
    operation,
    resourceId: `template:${templateId}`,
    workspaceRoot: options.workspaceRoot,
    dataDir: searchEventDataDir(options),
    flags: options.flags,
  });
}

function searchEventDataDir(options: TemplateCliOptions): string {
  return options.flags["data-dir"] ?? process.env.CLAW_DATA_DIR ?? resolveClawPersistentSurfacePath("claw.workspace.data", options.workspaceRoot);
}

function writeUsage(context: TemplateCliContext): void {
  context.stdout.write(
    [
      `Usage: ${context.binName} template <command>`,
      "",
      "Commands:",
      "  list [--category <cat>]            List templates in the workspace",
      "  get <id>                           Print the template manifest",
      "  create <name> --category <cat>     Create a template (optionally --from <id>)",
      "  delete <id> [--force=true]         Delete a template (builtins require --force)",
      "  render <id> --style <styleId>      Render a template using a style",
      "    [--data file.json] [--variant id] [--out path] [--format html,pdf,png,svg,pptx]",
      "  install-builtins [--overwrite]     Install the 30 builtin templates",
      "  builtins                           List builtin templates grouped by category",
      "",
    ].join("\n"),
  );
}

function readJson(filePath: string): Record<string, unknown> {
  const text = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Expected JSON object in ${filePath}`);
  }
  return parsed as Record<string, unknown>;
}
