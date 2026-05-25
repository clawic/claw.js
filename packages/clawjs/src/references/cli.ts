import fs from "fs";
import path from "path";

import { resolveClawPersistentSurfacePath } from "@clawjs/core";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError, type CliHandledErrorOptions } from "../cli-errors.ts";
import { writeCommandJsonError } from "../cli-json.ts";
import { scheduleDesignResourcesSearchEvent } from "../cli-search-events.ts";
import { isReferenceType, type ReferenceType } from "./schema.ts";
import {
  copyAssetIntoReference,
  generateReferenceId,
  listReferences,
  normalizeReferenceManifest,
  readReference,
  referenceDir,
  writeReference,
} from "./storage.ts";

interface ReferenceCliContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
  binName: string;
}

export interface ReferenceCliOptions {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  workspaceRoot: string;
  wantsJson: boolean;
  context: ReferenceCliContext;
}

const REFERENCE_SUBCOMMANDS = ["list", "get", "add", "delete", "link"] as const;
const REFERENCE_TYPES = ["web", "pdf", "image", "video", "screenshot", "snippet"] as const;

export async function runReferenceCli(options: ReferenceCliOptions): Promise<number> {
  const [, command, target] = options.positionals;
  const { context, flags, workspaceRoot } = options;

  if (!command || command === "help") {
    if (!command && options.wantsJson) {
      return writeUsageError(options, missingReferenceSubcommandError());
    }
    writeUsage(context);
    return command ? CLI_EXIT_OK : CLI_EXIT_USAGE;
  }

  if (command === "list") {
    const filter: { tag?: string; type?: ReferenceType } = {};
    if (flags.tag) filter.tag = flags.tag;
    if (flags.type) {
      if (!isReferenceType(flags.type)) {
        return writeUsageError(options, invalidReferenceTypeError(flags.type, "list"));
      }
      filter.type = flags.type;
    }
    const refs = listReferences(workspaceRoot, filter);
    writeOutput(options, { references: refs }, refs.map((r) => `${r.id}\t${r.type}\t${r.name}`).join("\n"));
    return CLI_EXIT_OK;
  }

  if (command === "get") {
    if (!target) {
      return writeUsageError(options, missingReferenceIdError("get"));
    }
    const manifest = readReference(workspaceRoot, target);
    writeOutput(options, manifest, `${manifest.id}\t${manifest.type}\t${manifest.name}`);
    return CLI_EXIT_OK;
  }

  if (command === "add") {
    const type = flags.type;
    if (!type || !isReferenceType(type)) {
      return writeUsageError(options, invalidReferenceTypeError(type, "add"));
    }
    const source = flags.source;
    const name = flags.name ?? (source ? path.basename(source) : type);
    const id = flags.id ? flags.id : generateReferenceId(type, name);
    const tags = flags.tag ? flags.tag.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const now = new Date().toISOString();
    let asset: string | undefined;
    if (source && fs.existsSync(path.resolve(context.cwd, source))) {
      // Local file: copy into reference dir.
      const resolved = path.resolve(context.cwd, source);
      fs.mkdirSync(referenceDir(workspaceRoot, id), { recursive: true });
      asset = copyAssetIntoReference(workspaceRoot, id, resolved);
    }
    const manifest = normalizeReferenceManifest({
      id,
      type,
      name,
      source: asset ? undefined : source,
      asset,
      tags,
      description: flags.description,
      createdAt: now,
      updatedAt: now,
    });
    const { path: filePath } = writeReference(workspaceRoot, manifest, flags.notes ?? "");
    scheduleReferenceSearchEvent(options, "upsert", manifest.id);
    writeOutput(options, { reference: manifest, path: filePath }, filePath);
    return CLI_EXIT_OK;
  }

  if (command === "delete") {
    if (!target) {
      return writeUsageError(options, missingReferenceIdError("delete"));
    }
    const dir = referenceDir(workspaceRoot, target);
    if (!fs.existsSync(dir)) {
      context.stderr.write(`Reference not found: ${target}\n`);
      return CLI_EXIT_FAILURE;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    scheduleReferenceSearchEvent(options, "delete", target);
    writeOutput(options, { deleted: target }, `Deleted ${target}`);
    return CLI_EXIT_OK;
  }

  if (command === "link") {
    if (!target || !flags.style) {
      return writeUsageError(options, missingReferenceLinkInputError(target, flags.style));
    }
    const manifest = readReference(workspaceRoot, target);
    const set = new Set(manifest.styleIds ?? []);
    set.add(flags.style);
    manifest.styleIds = [...set];
    manifest.updatedAt = new Date().toISOString();
    writeReference(workspaceRoot, manifest);
    scheduleReferenceSearchEvent(options, "upsert", manifest.id);
    writeOutput(options, manifest, `linked ${target} -> ${flags.style}`);
    return CLI_EXIT_OK;
  }

  if (options.wantsJson) {
    return writeUsageError(options, unknownReferenceSubcommandError(command));
  }
  context.stderr.write(`Unknown ref command: ${command}\n`);
  writeUsage(context);
  return CLI_EXIT_USAGE;
}

function writeOutput(options: ReferenceCliOptions, payload: unknown, text: string): void {
  if (options.wantsJson) {
    options.context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (text) {
    options.context.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  }
}

function scheduleReferenceSearchEvent(options: ReferenceCliOptions, operation: "upsert" | "delete", referenceId: string): void {
  scheduleDesignResourcesSearchEvent({
    operation,
    resourceId: `reference:${referenceId}`,
    workspaceRoot: options.workspaceRoot,
    dataDir: searchEventDataDir(options),
    flags: options.flags,
  });
}

function searchEventDataDir(options: ReferenceCliOptions): string {
  return options.flags["data-dir"] ?? process.env.CLAW_DATA_DIR ?? resolveClawPersistentSurfacePath("claw.workspace.data", options.workspaceRoot);
}

function writeUsageError(options: ReferenceCliOptions, error: CliHandledError): number {
  if (options.wantsJson) {
    writeCommandJsonError(options.context.stdout, "references", error, {
      invokedCommand: options.positionals[0] ?? "references",
      subcommand: options.positionals[1] ?? null,
    });
  } else {
    options.context.stderr.write(`${error.message}\n`);
  }
  return error.exitCode;
}

function missingReferenceSubcommandError(): CliHandledError {
  return new CliHandledError(
    "missing_reference_subcommand",
    "Missing reference subcommand.",
    referenceUsageErrorOptions("cli.references.subcommand", { received: null }),
  );
}

function unknownReferenceSubcommandError(command: string): CliHandledError {
  return new CliHandledError(
    "unknown_reference_subcommand",
    `Unknown reference subcommand: ${command}`,
    referenceUsageErrorOptions("cli.references.subcommand", { received: command }),
  );
}

function invalidReferenceTypeError(type: string | undefined, subcommand: string): CliHandledError {
  return new CliHandledError(
    type ? "invalid_reference_type" : "missing_reference_type",
    type ? `Unknown reference type: ${type}` : "Missing required reference type.",
    referenceUsageErrorOptions(`cli.references.${subcommand}.type`, {
      received: type ?? null,
      validTypes: [...REFERENCE_TYPES],
    }),
  );
}

function missingReferenceIdError(subcommand: "get" | "delete"): CliHandledError {
  return new CliHandledError(
    "missing_reference_id",
    `Missing reference id for ${subcommand}.`,
    referenceUsageErrorOptions(`cli.references.${subcommand}.id`, { received: null }),
  );
}

function missingReferenceLinkInputError(target: string | undefined, styleId: string | undefined): CliHandledError {
  return new CliHandledError(
    "missing_reference_link_input",
    "Reference link requires a reference id and --style <styleId>.",
    referenceUsageErrorOptions("cli.references.link", {
      received: { referenceId: target ?? null, styleId: styleId ?? null },
    }),
  );
}

function referenceUsageErrorOptions(location: string, details: Record<string, unknown>): CliHandledErrorOptions {
  return {
    exitCode: CLI_EXIT_USAGE,
    location,
    safeNextStep: "Run claw references list --json to inspect saved references, or claw help references --json for the references command surface.",
    details: {
      ...details,
      validSubcommands: [...REFERENCE_SUBCOMMANDS],
    },
  };
}

function writeUsage(context: ReferenceCliContext): void {
  context.stdout.write(
    [
      `Usage: ${context.binName} ref <command>`,
      "",
      "Commands:",
      "  list [--tag <t>] [--type <type>]   List references",
      "  get <id>                            Print a reference manifest",
      "  add --type <type> --source <s>      Add a reference (web URL or local path)",
      "  delete <id>                         Delete a reference",
      "  link <refId> --style <styleId>      Link a reference to a style",
      "",
    ].join("\n"),
  );
}
