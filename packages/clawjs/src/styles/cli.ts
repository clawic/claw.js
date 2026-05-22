import fs from "fs";
import path from "path";

import { resolveClawPersistentSurfacePath } from "@clawjs/core";

import { builtinStyleManifests } from "./builtins.ts";
import {
  exportStyle,
  generateStyleId,
  importStyle,
  listStyles,
  readStyle,
  styleDir,
  styleManifestPath,
  writeStyle,
} from "./storage.ts";
import { normalizeStyleManifest } from "./serializer.ts";
import type { StyleManifest } from "./schema.ts";
import { scheduleDesignResourcesSearchEvent } from "../cli-search-events.ts";

interface StyleCliContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
  binName: string;
}

export interface StyleCliOptions {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  workspaceRoot: string;
  wantsJson: boolean;
  context: StyleCliContext;
}

const STYLE_OK = 0;
const STYLE_FAILURE = 1;
const STYLE_USAGE = 64;

export async function runStyleCli(options: StyleCliOptions): Promise<number> {
  const [, command, target] = options.positionals;
  const { context, flags, workspaceRoot, wantsJson } = options;

  if (!command || command === "help") {
    writeUsage(context);
    return command ? STYLE_OK : STYLE_USAGE;
  }

  if (command === "list") {
    const styles = listStyles(workspaceRoot);
    writeOutput(options, { styles }, styles.map((s) => `${s.id}\t${s.name}${s.builtin ? "\t(builtin)" : ""}`).join("\n"));
    return STYLE_OK;
  }

  if (command === "get") {
    if (!target) {
      context.stderr.write(`Usage: ${context.binName} style get <id>\n`);
      return STYLE_USAGE;
    }
    const manifest = readStyle(workspaceRoot, target);
    writeOutput(options, manifest, `${manifest.id}\t${manifest.name}\n${manifest.description ?? ""}`);
    return STYLE_OK;
  }

  if (command === "create") {
    const name = joinedPositionals(options.positionals, 2) || flags.name;
    if (!name) {
      context.stderr.write(`Usage: ${context.binName} style create <name> [--from <styleId>] [--description TEXT]\n`);
      return STYLE_USAGE;
    }
    const fromId = flags.from;
    const seed = fromId
      ? readStyle(workspaceRoot, fromId)
      : builtinStyleManifests().find((s) => s.id === "claw") ?? builtinStyleManifests()[0];
    const id = flags.id ? flags.id : generateStyleId(name);
    const now = new Date().toISOString();
    const manifest: StyleManifest = normalizeStyleManifest({
      ...seed,
      id,
      name,
      description: flags.description ?? seed.description,
      tags: flags.tags ? flags.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      builtin: false,
      createdAt: now,
      updatedAt: now,
      references: [],
      examples: [],
    });
    const { path: filePath } = writeStyle(workspaceRoot, manifest);
    scheduleStyleSearchEvent(options, "upsert", manifest.id);
    writeOutput(options, { style: manifest, path: filePath }, filePath);
    return STYLE_OK;
  }

  if (command === "delete") {
    if (!target) {
      context.stderr.write(`Usage: ${context.binName} style delete <id>\n`);
      return STYLE_USAGE;
    }
    const dir = styleDir(workspaceRoot, target);
    if (!fs.existsSync(dir)) {
      context.stderr.write(`Style not found: ${target}\n`);
      return STYLE_FAILURE;
    }
    const manifest = readStyle(workspaceRoot, target);
    if (manifest.builtin && flags.force !== "true") {
      context.stderr.write(`Refusing to delete builtin style '${target}' without --force=true\n`);
      return STYLE_FAILURE;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    scheduleStyleSearchEvent(options, "delete", manifest.id);
    writeOutput(options, { deleted: target }, `Deleted ${target}`);
    return STYLE_OK;
  }

  if (command === "export") {
    if (!target || !flags.out) {
      context.stderr.write(`Usage: ${context.binName} style export <id> --out <dir>\n`);
      return STYLE_USAGE;
    }
    const { path: out } = exportStyle(workspaceRoot, target, path.resolve(context.cwd, flags.out));
    writeOutput(options, { exported: out }, out);
    return STYLE_OK;
  }

  if (command === "import") {
    const source = target || flags.from;
    if (!source) {
      context.stderr.write(`Usage: ${context.binName} style import <dir> [--overwrite]\n`);
      return STYLE_USAGE;
    }
    const overwrite = flags.overwrite === "true" || options.argv.includes("--overwrite");
    const result = importStyle(workspaceRoot, path.resolve(context.cwd, source), { overwrite });
    scheduleStyleSearchEvent(options, "upsert", result.id);
    writeOutput(options, { imported: result.id, path: result.path }, result.path);
    return STYLE_OK;
  }

  if (command === "install-builtins") {
    const overwrite = flags.overwrite === "true" || options.argv.includes("--overwrite");
    const installed: string[] = [];
    const skipped: string[] = [];
    for (const manifest of builtinStyleManifests()) {
      const target = styleManifestPath(workspaceRoot, manifest.id);
      if (fs.existsSync(target) && !overwrite) {
        skipped.push(manifest.id);
        continue;
      }
      writeStyle(workspaceRoot, manifest);
      scheduleStyleSearchEvent(options, "upsert", manifest.id);
      installed.push(manifest.id);
    }
    writeOutput(
      options,
      { installed, skipped, root: workspaceRoot },
      `Installed: ${installed.join(", ") || "(none)"}\nSkipped: ${skipped.join(", ") || "(none)"}`,
    );
    return STYLE_OK;
  }

  if (command === "builtins") {
    const manifests = builtinStyleManifests();
    writeOutput(options, { builtins: manifests.map((m) => ({ id: m.id, name: m.name, description: m.description })) }, manifests.map((m) => `${m.id}\t${m.name}`).join("\n"));
    return STYLE_OK;
  }

  context.stderr.write(`Unknown style command: ${command}\n`);
  writeUsage(context);
  return STYLE_USAGE;
}

function joinedPositionals(positionals: string[], from: number): string {
  return positionals.slice(from).filter(Boolean).join(" ").trim();
}

function writeOutput(options: StyleCliOptions, payload: unknown, text: string): void {
  if (options.wantsJson) {
    options.context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    options.context.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  }
}

function scheduleStyleSearchEvent(options: StyleCliOptions, operation: "upsert" | "delete", styleId: string): void {
  scheduleDesignResourcesSearchEvent({
    operation,
    resourceId: `style:${styleId}`,
    workspaceRoot: options.workspaceRoot,
    dataDir: searchEventDataDir(options),
    flags: options.flags,
  });
}

function searchEventDataDir(options: StyleCliOptions): string {
  return options.flags["data-dir"] ?? process.env.CLAW_DATA_DIR ?? resolveClawPersistentSurfacePath("claw.workspace.data", options.workspaceRoot);
}

function writeUsage(context: StyleCliContext): void {
  context.stdout.write(
    [
      `Usage: ${context.binName} style <command>`,
      "",
      "Commands:",
      "  list                              List styles in the workspace",
      "  get <id>                          Print STYLE.md for a style",
      "  create <name> [--from <id>]       Create a new style (defaults to 'claw' seed)",
      "  delete <id> [--force=true]        Delete a style (builtins require --force)",
      "  export <id> --out <dir>           Copy the style directory to <dir>",
      "  import <dir> [--overwrite]        Import a style directory into the workspace",
      "  install-builtins [--overwrite]    Install the 10 builtin styles",
      "  builtins                          List builtin style ids",
      "",
    ].join("\n"),
  );
}
