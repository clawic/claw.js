import fs from "fs";
import path from "path";

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
import { scheduleDesignResourcesSearchEvent } from "../cli-search-events.ts";

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

const R_OK = 0;
const R_FAILURE = 1;
const R_USAGE = 64;

export async function runReferenceCli(options: ReferenceCliOptions): Promise<number> {
  const [, command, target] = options.positionals;
  const { context, flags, workspaceRoot } = options;

  if (!command || command === "help") {
    writeUsage(context);
    return command ? R_OK : R_USAGE;
  }

  if (command === "list") {
    const filter: { tag?: string; type?: ReferenceType } = {};
    if (flags.tag) filter.tag = flags.tag;
    if (flags.type) {
      if (!isReferenceType(flags.type)) {
        context.stderr.write(`Unknown reference type: ${flags.type}\n`);
        return R_USAGE;
      }
      filter.type = flags.type;
    }
    const refs = listReferences(workspaceRoot, filter);
    writeOutput(options, { references: refs }, refs.map((r) => `${r.id}\t${r.type}\t${r.name}`).join("\n"));
    return R_OK;
  }

  if (command === "get") {
    if (!target) {
      context.stderr.write(`Usage: ${context.binName} ref get <id>\n`);
      return R_USAGE;
    }
    const manifest = readReference(workspaceRoot, target);
    writeOutput(options, manifest, `${manifest.id}\t${manifest.type}\t${manifest.name}`);
    return R_OK;
  }

  if (command === "add") {
    const type = flags.type;
    if (!type || !isReferenceType(type)) {
      context.stderr.write(`Usage: ${context.binName} ref add --type <web|pdf|image|video|screenshot|snippet> [--source URL|PATH] [--name NAME] [--tag a,b]\n`);
      return R_USAGE;
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
    return R_OK;
  }

  if (command === "delete") {
    if (!target) {
      context.stderr.write(`Usage: ${context.binName} ref delete <id>\n`);
      return R_USAGE;
    }
    const dir = referenceDir(workspaceRoot, target);
    if (!fs.existsSync(dir)) {
      context.stderr.write(`Reference not found: ${target}\n`);
      return R_FAILURE;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    scheduleReferenceSearchEvent(options, "delete", target);
    writeOutput(options, { deleted: target }, `Deleted ${target}`);
    return R_OK;
  }

  if (command === "link") {
    if (!target || !flags.style) {
      context.stderr.write(`Usage: ${context.binName} ref link <refId> --style <styleId>\n`);
      return R_USAGE;
    }
    const manifest = readReference(workspaceRoot, target);
    const set = new Set(manifest.styleIds ?? []);
    set.add(flags.style);
    manifest.styleIds = [...set];
    manifest.updatedAt = new Date().toISOString();
    writeReference(workspaceRoot, manifest);
    scheduleReferenceSearchEvent(options, "upsert", manifest.id);
    writeOutput(options, manifest, `linked ${target} -> ${flags.style}`);
    return R_OK;
  }

  context.stderr.write(`Unknown ref command: ${command}\n`);
  writeUsage(context);
  return R_USAGE;
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
  return options.flags["data-dir"] ?? process.env.CLAW_DATA_DIR ?? path.join(options.workspaceRoot, ".claw", "data");
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
