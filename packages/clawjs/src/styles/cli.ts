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
import { CliHandledError } from "../cli-errors.ts";
import { writeCommandJsonError } from "../cli-json.ts";
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
const STYLE_SUBCOMMANDS = ["list", "get", "create", "delete", "export", "import", "install-builtins", "builtins"] as const;

export async function runStyleCli(options: StyleCliOptions): Promise<number> {
  const [, command, target] = options.positionals;
  const { context, flags, workspaceRoot, wantsJson } = options;

  if (!command) {
    return writeStyleUsageError(options, "missing_style_subcommand", `Usage: ${context.binName} style <command>`, {
      safeNextStep: `Run ${context.binName} style list --json to inspect installed styles, or ${context.binName} help styles --json for the styles command surface.`,
    });
  }

  if (command === "help") {
    writeUsage(context);
    return STYLE_OK;
  }

  if (command === "list") {
    const styles = listStyles(workspaceRoot);
    writeOutput(options, { styles }, styles.map((s) => `${s.id}\t${s.name}${s.builtin ? "\t(builtin)" : ""}`).join("\n"));
    return STYLE_OK;
  }

  if (command === "get") {
    if (!target) {
      return writeStyleUsageError(options, "missing_style_id", `Usage: ${context.binName} style get <id>`, {
        safeNextStep: `Run ${context.binName} style list --json to choose a style id, then rerun ${context.binName} style get <id> --json.`,
      });
    }
    const manifest = readStyle(workspaceRoot, target);
    writeOutput(options, manifest, `${manifest.id}\t${manifest.name}\n${manifest.description ?? ""}`);
    return STYLE_OK;
  }

  if (command === "create") {
    const name = joinedPositionals(options.positionals, 2) || flags.name;
    if (!name) {
      return writeStyleUsageError(options, "missing_style_name", `Usage: ${context.binName} style create <name> [--from <styleId>] [--description TEXT]`, {
        safeNextStep: `Rerun ${context.binName} style create <name> --json with a human-readable style name.`,
      });
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
      return writeStyleUsageError(options, "missing_style_id", `Usage: ${context.binName} style delete <id>`, {
        safeNextStep: `Run ${context.binName} style list --json to choose a style id, then rerun ${context.binName} style delete <id> --json.`,
      });
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
      return writeStyleUsageError(options, "invalid_style_export_usage", `Usage: ${context.binName} style export <id> --out <dir>`, {
        safeNextStep: `Run ${context.binName} style list --json to choose a style id, then rerun ${context.binName} style export <id> --out <dir> --json.`,
      });
    }
    const { path: out } = exportStyle(workspaceRoot, target, path.resolve(context.cwd, flags.out));
    writeOutput(options, { exported: out }, out);
    return STYLE_OK;
  }

  if (command === "import") {
    const source = target || flags.from;
    if (!source) {
      return writeStyleUsageError(options, "missing_style_import_source", `Usage: ${context.binName} style import <dir> [--overwrite]`, {
        safeNextStep: `Rerun ${context.binName} style import <dir> --json with the style directory to import.`,
      });
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

  return writeStyleUsageError(options, "unknown_style_subcommand", `Unknown style subcommand: ${command}.`, {
    safeNextStep: `Run ${context.binName} style list --json to inspect installed styles, or ${context.binName} help styles --json for the styles command surface.`,
  });
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

function writeStyleUsageError(
  options: StyleCliOptions,
  code: string,
  message: string,
  extra: { safeNextStep: string },
): number {
  if (options.wantsJson) {
    const subcommand = options.positionals[1] ?? null;
    writeCommandJsonError(options.context.stdout, "styles", new CliHandledError(code, message, STYLE_USAGE, {
      location: "cli.styles.subcommand",
      suggestion: "Use one of the registered style subcommands and provide its required arguments.",
      safeNextStep: extra.safeNextStep,
      details: {
        received: subcommand,
        validSubcommands: [...STYLE_SUBCOMMANDS],
      },
    }), {
      invokedCommand: options.argv[0] ?? options.positionals[0] ?? "style",
      subcommand,
      ...(options.positionals[2] ? { operation: options.positionals[2] } : {}),
    });
    return STYLE_USAGE;
  }

  options.context.stderr.write(`${message}\n`);
  if (code === "unknown_style_subcommand") writeUsage(options.context);
  return STYLE_USAGE;
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
