import fs from "fs";
import path from "path";

import type { RuntimeAdapterId } from "@clawjs/core";

import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeJson, writeJsonLine } from "./cli-json.ts";
import { createCliClaw } from "./cli-claw-factory.ts";
import { parseRuleHints } from "./cli-rule-utils.ts";
import { inferMimeTypeFromPath, parseContextBlock } from "./cli-runtime-utils.ts";

type CliContext = { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream; cwd: string };

export async function runFileSessionDocumentCli(input: {
  group: string | undefined; command: string | undefined; subcommand: string | undefined; flags: Record<string, string>; argv: string[]; context: CliContext; wantsJson: boolean; workspaceRoot: string; appId: string; workspaceId: string; agentId: string; runtimeAdapterId: RuntimeAdapterId;
}): Promise<number | null> {
  const { group, command, subcommand, flags, argv, context, wantsJson, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId } = input;
if (group === "files" && command === "diff") {
  const targetFile = flags.file;
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
    writeJson(context.stdout, diff);
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
    writeJson(context.stdout, result);
  } else {
    context.stdout.write(`${result.filter((entry) => entry.changed).length}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "files" && command === "read") {
  const targetFile = flags.file;
  if (!targetFile) {
    context.stderr.write("--file is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const content = claw.files.readWorkspaceFile(targetFile);
  if (wantsJson) {
    writeJson(context.stdout, { file: targetFile, content });
  } else {
    context.stdout.write(`${content ?? ""}`);
  }
  return content === null ? CLI_EXIT_FAILURE : CLI_EXIT_OK;
}

if (group === "files" && command === "write") {
  const targetFile = flags.file;
  const value = flags.value ?? "";
  if (!targetFile) {
    context.stderr.write("--file is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const result = claw.files.writeWorkspaceFile(targetFile, value);
  if (wantsJson) {
    writeJson(context.stdout, result);
  } else {
    context.stdout.write(`${result.filePath}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "files" && command === "inspect") {
  const targetFile = flags.file;
  if (!targetFile) {
    context.stderr.write("--file is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const inspection = claw.files.inspectWorkspaceFile(targetFile);
  if (wantsJson) {
    writeJson(context.stdout, inspection);
  } else {
    context.stdout.write(`${inspection.filePath}\n`);
  }
  return inspection.exists ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "files" && command === "sync") {
  const targetFile = flags.file;
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
    writeJson(context.stdout, syncResult);
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
    writeJson(context.stdout, session);
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
    writeJson(context.stdout, session);
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
    writeJson(context.stdout, { sessionId, title });
  } else {
    context.stdout.write(`${title}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "sessions" && command === "list") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const sessions = claw.sessions.listSessions();
  if (wantsJson) {
    writeJson(context.stdout, sessions);
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
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const results = await claw.sessions.searchSessions({
    query: query.trim(),
    strategy: (flags.strategy as "auto" | "local" | "openclaw-memory" | undefined) ?? "auto",
    ...(flags.limit ? { limit: Number(flags.limit) } : {}),
    ...(flags["min-score"] ? { minScore: Number(flags["min-score"]) } : {}),
    includeMessages: argv.includes("--no-messages") ? false : readBooleanFlag(argv, flags, "include-messages", true),
    fallbackToLocal: argv.includes("--no-local-fallback") ? false : readBooleanFlag(argv, flags, "fallback-to-local", true),
  });
  if (wantsJson) {
    writeJson(context.stdout, results);
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
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const transport = (flags.transport as "auto" | "gateway" | "cli" | undefined) ?? "auto";
  const baseInput = {
    sessionId,
    systemPrompt: flags["system-prompt"],
    contextBlocks: parseContextBlock(flags.context),
    ruleHints: parseRuleHints(flags),
    transport,
    ...(flags["chunk-size"] ? { chunkSize: Number(flags["chunk-size"]) } : {}),
    ...(flags["gateway-retries"] ? { gatewayRetries: Number(flags["gateway-retries"]) } : {}),
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
      writeJson(context.stdout, events);
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
    writeJson(context.stdout, {
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
    writeJson(context.stdout, documents);
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
    writeJson(context.stdout, document);
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
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const results = await claw.documents.search({
    query: query.trim(),
    ...(flags.limit ? { limit: Number(flags.limit) } : {}),
    ...(flags["session-id"] ? { sessionId: flags["session-id"] } : {}),
  });
  if (wantsJson) {
    writeJson(context.stdout, results);
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
  const filePath = path.resolve(context.cwd, sourceFile);
  const data = fs.readFileSync(filePath);
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const document = await claw.documents.upload({
    name: flags.name || path.basename(filePath),
    mimeType: flags["mime-type"] || inferMimeTypeFromPath(filePath),
    data: data.toString("base64"),
    ...(flags["session-id"] ? { sessionId: flags["session-id"] } : {}),
  });
  if (wantsJson) {
    writeJson(context.stdout, document);
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
  const filePath = path.resolve(context.cwd, sourceFile);
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const document = await claw.documents.register({
    filePath,
    ...(flags.name ? { name: flags.name } : {}),
    ...(flags["mime-type"] ? { mimeType: flags["mime-type"] } : {}),
    ...(flags["session-id"] ? { sessionId: flags["session-id"] } : {}),
  });
  if (wantsJson) {
    writeJson(context.stdout, document);
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
      writeJson(context.stdout, null);
    } else {
      context.stdout.write("missing\n");
    }
    return CLI_EXIT_FAILURE;
  }
  const outputPath = path.resolve(
    context.cwd,
    flags.out || flags.output || download.document.name,
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, download.buffer);
  if (wantsJson) {
    writeJson(context.stdout, {
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
