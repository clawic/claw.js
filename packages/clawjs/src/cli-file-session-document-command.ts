import fs from "fs";
import path from "path";

import type { RuntimeAdapterId } from "@clawjs/core";

import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk, writeJsonLine } from "./cli-json.ts";
import { createCliClaw } from "./cli-claw-factory.ts";
import { requireCliExportReview, writeCliLegalSidecar } from "./cli-export-review.ts";
import { parseRuleHints } from "./cli-rule-utils.ts";
import { inferMimeTypeFromPath, parseContextBlock } from "./cli-runtime-utils.ts";

type CliContext = { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream; cwd: string };

function requireWorkspaceRelativeFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (path.isAbsolute(filePath) || normalized.split("/").includes("..")) {
    throw new CliHandledError("invalid_workspace_file_path", "--file must be a workspace-relative path that stays inside the workspace.", CLI_EXIT_USAGE, {
      location: "cli.files.file",
      suggestion: "Use a path such as SOUL.md or notes/example.md, without absolute paths or .. segments.",
      safeNextStep: "Retry the files command with a workspace-relative --file value.",
    });
  }
  return filePath;
}

function requireReadableDocumentSourcePath(sourceFile: string, cwd: string): string {
  const filePath = path.resolve(cwd, sourceFile);
  let stats: fs.Stats;
  try {
    stats = fs.statSync(filePath);
  } catch {
    throw new CliHandledError("document_source_not_found", `Document source file does not exist: ${sourceFile}`, CLI_EXIT_USAGE, {
      location: "cli.documents.file",
      suggestion: "Check the --file path before uploading or registering a document.",
      safeNextStep: "Retry the documents command with a readable source file.",
      details: { file: sourceFile },
    });
  }
  if (!stats.isFile()) {
    throw new CliHandledError("invalid_document_source", `Document source is not a file: ${sourceFile}`, CLI_EXIT_USAGE, {
      location: "cli.documents.file",
      suggestion: "--file must point to a readable file, not a directory or special path.",
      safeNextStep: "Retry the documents command with a regular file path.",
      details: { file: sourceFile },
    });
  }
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch {
    throw new CliHandledError("document_source_unreadable", `Document source file is not readable: ${sourceFile}`, CLI_EXIT_USAGE, {
      location: "cli.documents.file",
      suggestion: "Check file permissions before uploading or registering a document.",
      safeNextStep: "Retry the documents command after making the source file readable.",
      details: { file: sourceFile },
    });
  }
  return filePath;
}

function resolveDocumentDownloadOutputPath(outputPath: string, workspaceRoot: string): string {
  const requested = outputPath.trim();
  if (!requested) {
    throw new CliHandledError("invalid_document_output_path", "--out must not be empty.", CLI_EXIT_USAGE, {
      location: "cli.documents.out",
      suggestion: "Use a workspace-relative output path such as brief.md.",
      safeNextStep: "Retry the documents download command with an output path inside the workspace.",
    });
  }
  const workspacePath = path.resolve(workspaceRoot);
  const resolvedOutputPath = path.isAbsolute(requested)
    ? path.resolve(requested)
    : path.resolve(workspacePath, requested);
  const relativePath = path.relative(workspacePath, resolvedOutputPath);
  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new CliHandledError("invalid_document_output_path", "--out must stay inside the workspace.", CLI_EXIT_USAGE, {
      location: "cli.documents.out",
      suggestion: "Use a workspace-relative output path such as exports/brief.md.",
      safeNextStep: "Retry the documents download command with an output path inside the workspace.",
      details: { outputPath },
    });
  }
  return resolvedOutputPath;
}

function readIntegerFlag(flags: Record<string, string>, name: string, options: {
  errorCode: string;
  min: number;
  location: string;
  message: string;
  suggestion: string;
}): number | undefined {
  const raw = flags[name];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < options.min) {
    throw new CliHandledError(options.errorCode, options.message, CLI_EXIT_USAGE, {
      location: options.location,
      suggestion: options.suggestion,
      safeNextStep: `Retry the command with a valid --${name} value.`,
    });
  }
  return value;
}

function readPositiveIntegerFlag(flags: Record<string, string>, name: string, location: string): number | undefined {
  return readIntegerFlag(flags, name, {
    errorCode: "invalid_limit",
    min: 1,
    location,
    message: `--${name} must be a positive integer.`,
    suggestion: `Use --${name} with a whole number greater than zero.`,
  });
}

function readNonNegativeIntegerFlag(flags: Record<string, string>, name: string, location: string, errorCode: string): number | undefined {
  return readIntegerFlag(flags, name, {
    errorCode,
    min: 0,
    location,
    message: `--${name} must be a non-negative integer.`,
    suggestion: `Use --${name} with zero or a whole number greater than zero.`,
  });
}

function readNonNegativeNumberFlag(flags: Record<string, string>, name: string, location: string): number | undefined {
  const raw = flags[name];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new CliHandledError("invalid_min_score", `--${name} must be a non-negative number.`, CLI_EXIT_USAGE, {
      location,
      suggestion: `Use --${name} with zero or a positive number.`,
      safeNextStep: `Retry the command with a valid --${name} value.`,
    });
  }
  return value;
}

export async function runFileSessionDocumentCli(input: {
  group: string | undefined; command: string | undefined; subcommand: string | undefined; flags: Record<string, string>; argv: string[]; context: CliContext; wantsJson: boolean; workspaceRoot: string; appId: string; workspaceId: string; agentId: string; runtimeAdapterId: RuntimeAdapterId;
}): Promise<number | null> {
  const { group, command, subcommand, flags, argv, context, wantsJson, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId } = input;
  const writeSurfaceJson = (data: unknown) => {
    const canonicalCommand = group === "files" || group === "sessions" || group === "documents" ? group : "open";
    writeCommandJsonOk(context.stdout, canonicalCommand, data, {
      invokedCommand: group ?? canonicalCommand,
      subcommand: command ?? null,
      ...(subcommand ? { operation: subcommand } : {}),
    });
  };
if (group === "files" && command === "diff") {
  const targetFile = flags.file ? requireWorkspaceRelativeFilePath(flags.file) : undefined;
  const blockId = flags["block-id"];
  const settingsKey = flags.key || "value";
  const value = flags.value ?? "";
  if (!targetFile || !blockId) {
    context.stderr.write("--file and --block-id are required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const diff = claw.files.diffBinding({
    id: `${targetFile}:${blockId}`,
    targetFile,
    mode: "managed_block",
    blockId,
    settingsPath: settingsKey,
  }, { [settingsKey]: value }, (settings) => `${settingsKey}=${String((settings as Record<string, unknown>)[settingsKey] ?? "")}`);
  if (wantsJson) {
    writeSurfaceJson(diff);
  } else {
    context.stdout.write(`${diff.changed}\n`);
  }
  return diff.changed ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "files" && command === "apply-template-pack") {
  const templatePackPath = flags["template-pack"];
  if (!templatePackPath) {
    context.stderr.write("--template-pack is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const result = await claw.files.applyTemplatePack(templatePackPath);
  if (wantsJson) {
    writeSurfaceJson(result);
  } else {
    context.stdout.write(`${result.filter((entry) => entry.changed).length}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "files" && command === "read") {
  const targetFile = flags.file ? requireWorkspaceRelativeFilePath(flags.file) : undefined;
  if (!targetFile) {
    context.stderr.write("--file is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const content = claw.files.readWorkspaceFile(targetFile);
  if (wantsJson) {
    writeSurfaceJson({ file: targetFile, content });
  } else {
    context.stdout.write(`${content ?? ""}`);
  }
  return content === null ? CLI_EXIT_FAILURE : CLI_EXIT_OK;
}

if (group === "files" && command === "write") {
  const targetFile = flags.file ? requireWorkspaceRelativeFilePath(flags.file) : undefined;
  const value = flags.value ?? "";
  if (!targetFile) {
    context.stderr.write("--file is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const result = claw.files.writeWorkspaceFile(targetFile, value);
  if (wantsJson) {
    writeSurfaceJson(result);
  } else {
    context.stdout.write(`${result.filePath}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "files" && command === "inspect") {
  const targetFile = flags.file ? requireWorkspaceRelativeFilePath(flags.file) : undefined;
  if (!targetFile) {
    context.stderr.write("--file is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const inspection = claw.files.inspectWorkspaceFile(targetFile);
  if (wantsJson) {
    writeSurfaceJson(inspection);
  } else {
    context.stdout.write(`${inspection.filePath}\n`);
  }
  return inspection.exists ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "files" && command === "sync") {
  const targetFile = flags.file ? requireWorkspaceRelativeFilePath(flags.file) : undefined;
  const blockId = flags["block-id"];
  const settingsKey = flags.key || "value";
  const value = flags.value ?? "";
  if (!targetFile || !blockId) {
    context.stderr.write("--file and --block-id are required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const syncResult = claw.files.syncBinding({
    id: `${targetFile}:${blockId}`,
    targetFile,
    mode: "managed_block",
    blockId,
    settingsPath: settingsKey,
  }, { [settingsKey]: value }, (settings) => `${settingsKey}=${String((settings as Record<string, unknown>)[settingsKey] ?? "")}`);
  if (wantsJson) {
    writeSurfaceJson(syncResult);
  } else {
    context.stdout.write(`${syncResult.filePath}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "sessions" && command === "create") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const title = flags.title;
  const session = claw.sessions.createSession(title);
  if (wantsJson) {
    writeSurfaceJson(session);
  } else {
    context.stdout.write(`${session.sessionId}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "sessions" && command === "read") {
  const sessionId = flags["session-id"];
  if (!sessionId) {
    context.stderr.write("--session-id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const session = claw.sessions.getSession(sessionId);
  if (wantsJson) {
    writeSurfaceJson(session);
  } else {
    context.stdout.write(`${session?.title ?? "missing"}\n`);
  }
  return session ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "sessions" && command === "generate-title") {
  const sessionId = flags["session-id"];
  if (!sessionId) {
    context.stderr.write("--session-id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const title = await claw.sessions.generateTitle({
    sessionId,
    transport: (flags.transport as "auto" | "gateway" | "cli" | undefined) ?? "auto",
  });
  if (wantsJson) {
    writeSurfaceJson({ sessionId, title });
  } else {
    context.stdout.write(`${title}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "sessions" && command === "list") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const sessions = claw.sessions.listSessions();
  if (wantsJson) {
    writeSurfaceJson(sessions);
  } else {
    context.stdout.write(`${sessions.map((session) => `${session.sessionId} ${session.title}`).join("\n")}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "sessions" && command === "search") {
  const query = flags.query || subcommand;
  if (!query?.trim()) {
    context.stderr.write("--query is required\n");
    return CLI_EXIT_USAGE;
  }
  const limit = readPositiveIntegerFlag(flags, "limit", "cli.sessions.limit");
  const minScore = readNonNegativeNumberFlag(flags, "min-score", "cli.sessions.min-score");
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const results = await claw.sessions.searchSessions({
    query: query.trim(),
    strategy: (flags.strategy as "auto" | "local" | "openclaw-memory" | undefined) ?? "auto",
    ...(limit ? { limit } : {}),
    ...(minScore !== undefined ? { minScore } : {}),
    includeMessages: argv.includes("--no-messages") ? false : readBooleanFlag(argv, flags, "include-messages", true),
    fallbackToLocal: argv.includes("--no-local-fallback") ? false : readBooleanFlag(argv, flags, "fallback-to-local", true),
  });
  if (wantsJson) {
    writeSurfaceJson(results);
  } else {
    context.stdout.write(`${results.map((result) => `${result.sessionId} ${result.title}`).join("\n")}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "sessions" && command === "stream") {
  const sessionId = flags["session-id"];
  if (!sessionId) {
    context.stderr.write("--session-id is required\n");
    return CLI_EXIT_USAGE;
  }
  const transport = (flags.transport as "auto" | "gateway" | "cli" | undefined) ?? "auto";
  const chunkSize = readIntegerFlag(flags, "chunk-size", {
    errorCode: "invalid_chunk_size",
    min: 1,
    location: "cli.sessions.chunk-size",
    message: "--chunk-size must be a positive integer.",
    suggestion: "Use --chunk-size with a whole number greater than zero.",
  });
  const gatewayRetries = readNonNegativeIntegerFlag(flags, "gateway-retries", "cli.sessions.gateway-retries", "invalid_gateway_retries");
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const baseInput = {
    sessionId,
    systemPrompt: flags["system-prompt"],
    contextBlocks: parseContextBlock(flags.context),
    ruleHints: parseRuleHints(flags),
    transport,
    ...(chunkSize !== undefined ? { chunkSize } : {}),
    ...(gatewayRetries !== undefined ? { gatewayRetries } : {}),
  };

  if (argv.includes("--events")) {
    const events: unknown[] = [];
    let exitCode = 0;
    for await (const event of claw.sessions.streamAssistantReplyEvents(baseInput)) {
      if (event.type === "error" || event.type === "aborted") {
        exitCode = 1;
      }
      if (wantsJson) {
        events.push(event.type === "error" ? { ...event, error: event.error.message } : event);
        continue;
      }
      if (event.type === "chunk") {
        context.stdout.write(event.chunk.delta);
        continue;
      }
      writeJsonLine(context.stdout, event.type === "error" ? { ...event, error: event.error.message } : event);
    }
    if (wantsJson) {
      writeSurfaceJson(events);
    }
    return exitCode;
  }

  const chunks: string[] = [];
  for await (const chunk of claw.sessions.streamAssistantReply(baseInput)) {
    if (chunk.done) continue;
    chunks.push(chunk.delta);
    if (!wantsJson) {
      context.stdout.write(chunk.delta);
    }
  }

  if (wantsJson) {
    writeSurfaceJson({
      sessionId,
      text: chunks.join(""),
      chunks,
    });
  }
  return CLI_EXIT_OK;
}

if (group === "documents" && command === "list") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const documents = await claw.documents.list(flags["session-id"] ? { sessionId: flags["session-id"] } : undefined);
  if (wantsJson) {
    writeSurfaceJson(documents);
  } else {
    context.stdout.write(`${documents.map((document) => `${document.documentId} ${document.name}`).join("\n")}\n`);
  }
  return documents.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "documents" && command === "read") {
  const documentId = flags["document-id"] ?? flags.id;
  if (!documentId) {
    context.stderr.write("--document-id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const document = await claw.documents.get(documentId);
  if (wantsJson) {
    writeSurfaceJson(document);
  } else {
    context.stdout.write(`${document?.name ?? "missing"}\n`);
  }
  return document ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "documents" && command === "search") {
  const query = flags.query || subcommand;
  if (!query?.trim()) {
    context.stderr.write("--query is required\n");
    return CLI_EXIT_USAGE;
  }
  const limit = readPositiveIntegerFlag(flags, "limit", "cli.documents.limit");
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const results = await claw.documents.search({
    query: query.trim(),
    ...(limit ? { limit } : {}),
    ...(flags["session-id"] ? { sessionId: flags["session-id"] } : {}),
  });
  if (wantsJson) {
    writeSurfaceJson(results);
  } else {
    context.stdout.write(`${results.map((document) => `${document.documentId} ${document.name}`).join("\n")}\n`);
  }
  return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "documents" && command === "upload") {
  const sourceFile = flags.file;
  if (!sourceFile) {
    context.stderr.write("--file is required\n");
    return CLI_EXIT_USAGE;
  }
  const filePath = requireReadableDocumentSourcePath(sourceFile, context.cwd);
  const data = fs.readFileSync(filePath);
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const document = await claw.documents.upload({
    name: flags.name || path.basename(filePath),
    mimeType: flags["mime-type"] || inferMimeTypeFromPath(filePath),
    data: data.toString("base64"),
    ...(flags["session-id"] ? { sessionId: flags["session-id"] } : {}),
  });
  if (wantsJson) {
    writeSurfaceJson(document);
  } else {
    context.stdout.write(`${document.documentId}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "documents" && command === "register") {
  const sourceFile = flags.file;
  if (!sourceFile) {
    context.stderr.write("--file is required\n");
    return CLI_EXIT_USAGE;
  }
  const filePath = requireReadableDocumentSourcePath(sourceFile, context.cwd);
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const document = await claw.documents.register({
    filePath,
    ...(flags.name ? { name: flags.name } : {}),
    ...(flags["mime-type"] ? { mimeType: flags["mime-type"] } : {}),
    ...(flags["session-id"] ? { sessionId: flags["session-id"] } : {}),
  });
  if (wantsJson) {
    writeSurfaceJson(document);
  } else {
    context.stdout.write(`${document.documentId}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "documents" && command === "download") {
  const documentId = flags["document-id"] ?? flags.id;
  if (!documentId) {
    context.stderr.write("--document-id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const download = await claw.documents.download(documentId);
  if (!download) {
    if (wantsJson) {
      writeSurfaceJson(null);
    } else {
      context.stdout.write("missing\n");
    }
    return CLI_EXIT_FAILURE;
  }
  const outputPath = resolveDocumentDownloadOutputPath(flags.out || flags.output || download.document.name, workspaceRoot);
  const review = requireCliExportReview({ argv, flags, operation: "documents download" });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, download.buffer);
  writeCliLegalSidecar({
    outputPath,
    review,
    kind: "claw.documents.download.legal",
    source: {
      documentId,
      name: download.document.name,
    },
  });
  if (wantsJson) {
    writeSurfaceJson({
      document: download.document,
      outputPath,
      sizeBytes: download.buffer.length,
    });
  } else {
    context.stdout.write(`${outputPath}\n`);
  }
  return CLI_EXIT_OK;
}
  return null;
}
