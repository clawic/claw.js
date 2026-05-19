import fs from "fs";
import path from "path";

import type { ClawInstance, VoiceNoteStatus } from "@clawjs/claw";
import type { MediaDirection, MediaKind, MediaListInput, MediaOrigin, RuntimeAdapterId } from "@clawjs/core";

import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { parseCsvFlag, parseJsonFlag, readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";
import { createCliClaw } from "./cli-claw-factory.ts";
import { scheduleGenerationArtifactSearchEvent, scheduleImageDerivedSearchEvent, scheduleMediaAssetSearchEvent } from "./cli-search-events.ts";
import { parseRuleHints } from "./cli-rule-utils.ts";
import { parseImageOperation, parseImageProvenance, parseImageType } from "./cli-image-parsers.ts";
import { buildImageSharedInput, buildMediaListInput, buildMediaMetadata } from "./cli-media-utils.ts";
import { inferAudioExtension, inferMimeTypeFromPath, parseContextBlock, parseInferenceMessages, type GenerationCliMediaKind } from "./cli-runtime-utils.ts";

type CliContext = { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream; cwd: string };
type CliMediaShare = { id: string; url: string };
type CliMediaClaw = ClawInstance & {
  media: {
    register(input: { name?: string; mimeType?: string; kind?: MediaKind; filePath?: string; sourceText?: string; origin?: MediaOrigin; direction?: MediaDirection; agentId?: string; workspaceId?: string; projectId?: string; metadata?: Record<string, unknown> }): { mediaId: string; kind: string; name: string };
    list(input?: MediaListInput): Array<{ mediaId: string; kind: string; name: string }>;
    search(input: MediaListInput & { query: string }): Array<{ mediaId: string; kind: string; name: string }>;
    get(mediaId: string): { name: string } | null;
    download(mediaId: string): { media: { name: string }; buffer: Buffer } | null;
    share: {
      create(input: { mediaId?: string; label?: string; filters?: MediaListInput; expiresAt?: string | null; ttlMs?: number }): Promise<CliMediaShare>;
      list(): CliMediaShare[];
      revoke(id: string): Promise<boolean>;
      resolveGallery(id: string): { items: Array<{ mediaId: string; name: string }> } | null;
    };
  };
};

function searchEventDataDir(workspaceRoot: string, flags: Record<string, string>): string {
  return path.resolve(flags["data-dir"] ?? path.join(workspaceRoot, ".claw", "data"));
}

function scheduleImageRecordSearchEvent(input: {
  operation: "upsert" | "delete";
  imageId: string;
  workspaceRoot: string;
  flags: Record<string, string>;
}): void {
  scheduleImageDerivedSearchEvent({
    operation: input.operation,
    imageId: input.imageId,
    dataDir: searchEventDataDir(input.workspaceRoot, input.flags),
    flags: input.flags,
  });
}

function scheduleGenerationRecordSearchEvent(input: {
  operation: "upsert" | "delete";
  generationId: string;
  workspaceRoot: string;
  flags: Record<string, string>;
  mediaIds?: string[];
}): void {
  const dataDir = searchEventDataDir(input.workspaceRoot, input.flags);
  scheduleGenerationArtifactSearchEvent({
    operation: input.operation,
    generationId: input.generationId,
    dataDir,
    flags: input.flags,
  });
  const mediaIds = input.mediaIds ?? mediaIdsForGeneration(input.workspaceRoot, input.generationId);
  for (const mediaId of mediaIds) {
    scheduleMediaAssetSearchEvent({
      operation: input.operation,
      mediaId,
      dataDir,
      flags: input.flags,
    });
  }
}

function mediaIdsForGeneration(workspaceRoot: string, generationId: string): string[] {
  const dir = path.join(workspaceRoot, ".claw", "data", "collections", "media");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, entry.name), "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const record = parsed as Record<string, unknown>;
      if (record.sourceId !== generationId) continue;
      if (typeof record.mediaId === "string" && record.mediaId) ids.push(record.mediaId);
    } catch {
      continue;
    }
  }
  return ids.sort();
}

function resolveMediaCanonicalCommand(group: string | undefined, mediaGroup: GenerationCliMediaKind | null): string {
  if (mediaGroup === "image") return "images";
  if (mediaGroup === "audio" || mediaGroup === "video") return mediaGroup;
  return group ?? "media";
}

export async function runMediaGenerationCli(input: {
  group: string | undefined; command: string | undefined; subcommand: string | undefined; flags: Record<string, string>; argv: string[]; context: CliContext; wantsJson: boolean; workspaceRoot: string; appId: string; workspaceId: string; agentId: string; runtimeAdapterId: RuntimeAdapterId; mediaGroup: GenerationCliMediaKind | null;
}): Promise<number | null> {
  const { group, command, subcommand, flags, argv, context, wantsJson, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId, mediaGroup } = input;
  const writeMediaJson = (payload: unknown) => {
    const canonicalCommand = resolveMediaCanonicalCommand(group, mediaGroup);
    writeCommandJsonOk(context.stdout, canonicalCommand, payload, {
      invokedCommand: group ?? canonicalCommand,
      subcommand: command ?? null,
      ...(subcommand ? { operation: subcommand } : {}),
    });
  };
async function getTypedGenerationFacade(kind: GenerationCliMediaKind) {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
  switch (kind) {
    case "image":
      return { claw, media: claw.image };
    case "audio":
      return { claw, media: claw.audio };
    case "video":
      return { claw, media: claw.video };
  }
}

async function getImageGenerationFacade(): Promise<{ claw: ClawInstance; media: ClawInstance["image"] }> {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
  return { claw, media: claw.image };
}

if (group === "media" && command === "list") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
  const media = claw.media.list(buildMediaListInput(flags));
  if (wantsJson) {
    writeMediaJson(media);
  } else {
    context.stdout.write(`${media.map((entry) => `${entry.mediaId} ${entry.kind} ${entry.name}`).join("\n")}\n`);
  }
  return media.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "media" && command === "search") {
  const query = flags.query || subcommand;
  if (!query?.trim()) {
    context.stderr.write("--query is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
  const results = claw.media.search({
    ...buildMediaListInput(flags),
    query: query.trim(),
  });
  if (wantsJson) {
    writeMediaJson(results);
  } else {
    context.stdout.write(`${results.map((entry) => `${entry.mediaId} ${entry.kind} ${entry.name}`).join("\n")}\n`);
  }
  return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "media" && command === "read") {
  const mediaId = flags["media-id"] ?? flags.id;
  if (!mediaId) {
    context.stderr.write("--media-id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
  const media = claw.media.get(mediaId);
  if (wantsJson) {
    writeMediaJson(media);
  } else {
    context.stdout.write(`${media?.name ?? "missing"}\n`);
  }
  return media ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "media" && command === "download") {
  const mediaId = flags["media-id"] ?? flags.id;
  if (!mediaId) {
    context.stderr.write("--media-id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
  const download = claw.media.download(mediaId);
  if (!download) {
    if (wantsJson) writeMediaJson(null);
    else context.stdout.write("missing\n");
    return CLI_EXIT_FAILURE;
  }
  const outputPath = path.resolve(context.cwd, flags.out || flags.output || download.media.name);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, download.buffer);
  if (wantsJson) {
    writeMediaJson({
      media: download.media,
      outputPath,
      sizeBytes: download.buffer.length,
    });
  } else {
    context.stdout.write(`${outputPath}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "media" && command === "share" && subcommand === "create") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
  const share = await claw.media.share.create({
    mediaId: flags["media-id"] ?? flags.id,
    label: flags.label,
    legalLabel: flags["legal-label"],
    approvalId: flags["approval-id"] ?? flags["host-approval-id"],
    filters: flags["media-id"] || flags.id ? undefined : buildMediaListInput(flags),
    expiresAt: flags["expires-at"],
    ...(flags["ttl-ms"] ? { ttlMs: Number(flags["ttl-ms"]) } : {}),
  });
  if (wantsJson) {
    writeMediaJson(share);
  } else {
    context.stdout.write(`${share.url}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "media" && command === "share" && subcommand === "list") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
  const shares = claw.media.share.list();
  if (wantsJson) {
    writeMediaJson(shares);
  } else {
    context.stdout.write(`${shares.map((share) => `${share.id} ${share.url}`).join("\n")}\n`);
  }
  return shares.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "media" && command === "share" && subcommand === "revoke") {
  const id = flags["share-id"] ?? flags.id;
  if (!id) {
    context.stderr.write("--share-id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
  const revoked = await claw.media.share.revoke(id);
  if (wantsJson) {
    writeMediaJson({ revoked, id });
  } else {
    context.stdout.write(`${revoked}\n`);
  }
  return revoked ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "media" && command === "share" && subcommand === "resolve") {
  const id = flags["share-id"] ?? flags.id;
  if (!id) {
    context.stderr.write("--share-id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
  const resolved = claw.media.share.resolveGallery(id);
  if (wantsJson) {
    writeMediaJson(resolved);
  } else {
    context.stdout.write(`${resolved?.items.map((entry) => `${entry.mediaId} ${entry.name}`).join("\n") ?? "missing"}\n`);
  }
  return resolved ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "inference" && command === "generate-text") {
  const messages = parseInferenceMessages(flags);
  if (!messages) {
    context.stderr.write("--prompt, --message, --text, or --messages-json is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const result = await claw.inference.generateText({
    messages,
    sessionId: flags["session-id"],
    systemPrompt: flags["system-prompt"],
    contextBlocks: parseContextBlock(flags.context),
    ruleHints: parseRuleHints(flags),
    transport: (flags.transport as "auto" | "gateway" | "cli" | undefined) ?? "auto",
    ...(flags.model ? { model: flags.model } : {}),
    ...(flags["chunk-size"] ? { chunkSize: Number(flags["chunk-size"]) } : {}),
    ...(flags["gateway-retries"] ? { gatewayRetries: Number(flags["gateway-retries"]) } : {}),
  });
  if (wantsJson) {
    writeMediaJson(result);
  } else {
    context.stdout.write(`${result.text}\n`);
  }
  return result.text ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "tts" && command === "providers") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const providers = claw.tts.providers();
  if (wantsJson) {
    writeMediaJson(providers);
  } else {
    context.stdout.write(`${providers.map((provider) => provider.id).join("\n")}\n`);
  }
  return providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "tts" && command === "catalog") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const catalog = claw.tts.catalog();
  if (wantsJson) {
    writeMediaJson(catalog);
  } else {
    context.stdout.write(`${catalog.providers.map((provider) => provider.id).join("\n")}\n`);
  }
  return catalog.providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "tts" && command === "config") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const config = claw.tts.config();
  if (wantsJson) {
    writeMediaJson(config);
  } else {
    context.stdout.write(`${config.provider ?? "local"}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "tts" && command === "set-config") {
  const config = parseJsonFlag<Record<string, unknown>>(flags["config-json"], "--config-json") ?? {
    ...(flags.provider ? { provider: flags.provider } : {}),
    ...(flags.enabled !== undefined || argv.includes("--enabled") ? { enabled: readBooleanFlag(argv, flags, "enabled", false) } : {}),
    ...(flags["auto-read"] !== undefined || argv.includes("--auto-read") ? { autoRead: readBooleanFlag(argv, flags, "auto-read", false) } : {}),
    ...(flags["api-key"] ? { apiKey: flags["api-key"] } : {}),
    ...(flags.voice ? { voice: flags.voice } : {}),
    ...(flags.model ? { model: flags.model } : {}),
    ...(flags.speed ? { speed: Number(flags.speed) } : {}),
    ...(flags.stability ? { stability: Number(flags.stability) } : {}),
    ...(flags["similarity-boost"] ? { similarityBoost: Number(flags["similarity-boost"]) } : {}),
  };
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const next = claw.tts.setConfig(config);
  if (wantsJson) {
    writeMediaJson(next);
  } else {
    context.stdout.write(`${next.provider ?? "local"}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "tts" && command === "synthesize") {
  const text = flags.text ?? flags.prompt ?? subcommand;
  if (!text?.trim()) {
    context.stderr.write("--text is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const result = await claw.tts.synthesize({
    text: text.trim(),
    ...(flags.lang ? { lang: flags.lang } : {}),
    ...(flags.provider ? { provider: flags.provider as "local" | "openai" | "elevenlabs" | "deepgram" } : {}),
    ...(flags["api-key"] ? { apiKey: flags["api-key"] } : {}),
    ...(flags.voice ? { voice: flags.voice } : {}),
    ...(flags.model ? { model: flags.model } : {}),
    ...(flags.speed ? { speed: Number(flags.speed) } : {}),
    ...(flags.stability ? { stability: Number(flags.stability) } : {}),
    ...(flags["similarity-boost"] ? { similarityBoost: Number(flags["similarity-boost"]) } : {}),
  });
  const outputPath = path.resolve(
    context.cwd,
    flags.out || flags.output || `tts-${Date.now()}${inferAudioExtension(result.mimeType)}`,
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, result.audio);
  if (wantsJson) {
    writeMediaJson({
      outputPath,
      mimeType: result.mimeType,
      sizeBytes: result.audio.length,
    });
  } else {
    context.stdout.write(`${outputPath}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "stt" && command === "providers") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const providers = claw.stt.providers();
  if (wantsJson) {
    writeMediaJson(providers);
  } else {
    context.stdout.write(`${providers.map((provider) => provider.id).join("\n")}\n`);
  }
  return providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "stt" && command === "config") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const config = claw.stt.config();
  if (wantsJson) {
    writeMediaJson(config);
  } else {
    context.stdout.write(`${config.provider ?? "local-whisper"}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "stt" && command === "set-config") {
  const config = parseJsonFlag<Record<string, unknown>>(flags["config-json"], "--config-json") ?? {
    provider: "local-whisper",
    ...(flags.enabled !== undefined || argv.includes("--enabled") ? { enabled: readBooleanFlag(argv, flags, "enabled", false) } : {}),
    ...(flags["binary-path"] ? { binaryPath: flags["binary-path"] } : {}),
    ...(flags["ffmpeg-path"] ? { ffmpegPath: flags["ffmpeg-path"] } : {}),
    ...(flags["model-path"] ? { modelPath: flags["model-path"] } : {}),
    ...(flags.language || flags.lang ? { language: flags.language ?? flags.lang } : {}),
    ...(flags.translate !== undefined || argv.includes("--translate") ? { translate: readBooleanFlag(argv, flags, "translate", false) } : {}),
    ...(flags.threads ? { threads: Number(flags.threads) } : {}),
  };
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const next = claw.stt.setConfig(config);
  if (wantsJson) {
    writeMediaJson(next);
  } else {
    context.stdout.write(`${next.provider ?? "local-whisper"}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "stt" && command === "transcribe") {
  const filePath = flags.file || flags.input || subcommand;
  if (!filePath?.trim()) {
    context.stderr.write("--file is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const result = await claw.stt.transcribe({
    filePath: path.resolve(context.cwd, filePath),
    provider: "local-whisper",
    ...(flags["binary-path"] ? { binaryPath: flags["binary-path"] } : {}),
    ...(flags["ffmpeg-path"] ? { ffmpegPath: flags["ffmpeg-path"] } : {}),
    ...(flags["model-path"] ? { modelPath: flags["model-path"] } : {}),
    ...(flags.language || flags.lang ? { language: flags.language ?? flags.lang } : {}),
    ...(flags.translate !== undefined || argv.includes("--translate") ? { translate: readBooleanFlag(argv, flags, "translate", false) } : {}),
    ...(flags.threads ? { threads: Number(flags.threads) } : {}),
  });
  if (wantsJson) {
    writeMediaJson(result);
  } else {
    context.stdout.write(`${result.text}\n`);
  }
  return result.text ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "voice-notes" && (command === "add" || command === "create")) {
  const filePath = flags.file || flags.input || subcommand;
  if (!filePath?.trim()) {
    context.stderr.write("--file is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const note = claw.voiceNotes.registerPath({
    filePath: path.resolve(context.cwd, filePath),
    mimeType: flags["mime-type"] || inferMimeTypeFromPath(filePath),
    fileName: flags.name,
    durationSeconds: flags.duration ? Number(flags.duration) : undefined,
    source: {
      origin: flags.origin || "cli",
      provider: flags.provider,
      accountId: flags.account,
      targetId: flags["target-id"],
      threadId: flags["thread-id"],
      providerMessageId: flags["message-id"],
      senderId: flags["sender-id"],
      senderLabel: flags["sender-label"],
      metadata: parseJsonFlag<Record<string, unknown>>(flags["metadata-json"], "--metadata-json") ?? undefined,
    },
    tags: parseCsvFlag(flags.tags),
  });
  if (wantsJson) {
    writeMediaJson(note);
  } else {
    context.stdout.write(`${note.id}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "voice-notes" && command === "list") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const notes = claw.voiceNotes.list({
    origin: flags.origin,
    provider: flags.provider,
    accountId: flags.account,
    targetId: flags["target-id"],
    threadId: flags["thread-id"],
    status: flags.status as VoiceNoteStatus | undefined,
    query: flags.query,
    limit: flags.limit ? Number(flags.limit) : undefined,
  });
  if (wantsJson) {
    writeMediaJson(notes);
  } else {
    context.stdout.write(`${notes.map((note) => `${note.id}\t${note.status}\t${note.source.origin}\t${note.transcript?.text ?? ""}`).join("\n")}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "voice-notes" && (command === "get" || command === "read" || command === "inspect")) {
  const id = subcommand || flags.id;
  if (!id) {
    context.stderr.write("voice note id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const note = claw.voiceNotes.get(id);
  if (!note) {
    context.stderr.write(`voice note not found: ${id}\n`);
    return CLI_EXIT_DEGRADED;
  }
  if (wantsJson) {
    writeMediaJson(note);
  } else {
    context.stdout.write(`${note.transcript?.text ?? note.id}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "voice-notes" && command === "transcribe") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const id = subcommand || flags.id;
  if (!id && !(flags.file || flags.input)) {
    context.stderr.write("voice note id or --file is required\n");
    return CLI_EXIT_USAGE;
  }
  const note = id
    ? await claw.voiceNotes.transcribe(id, {
      provider: "local-whisper",
      ...(flags["binary-path"] ? { binaryPath: flags["binary-path"] } : {}),
      ...(flags["ffmpeg-path"] ? { ffmpegPath: flags["ffmpeg-path"] } : {}),
      ...(flags["model-path"] ? { modelPath: flags["model-path"] } : {}),
      ...(flags.language || flags.lang ? { language: flags.language ?? flags.lang } : {}),
      ...(flags.translate !== undefined || argv.includes("--translate") ? { translate: readBooleanFlag(argv, flags, "translate", false) } : {}),
      ...(flags.threads ? { threads: Number(flags.threads) } : {}),
    })
    : await (async () => {
      const created = claw.voiceNotes.registerPath({
        filePath: path.resolve(context.cwd, flags.file || flags.input),
        mimeType: flags["mime-type"] || inferMimeTypeFromPath(flags.file || flags.input),
        source: { origin: flags.origin || "cli", provider: flags.provider },
      });
      return claw.voiceNotes.transcribe(created.id, {
        provider: "local-whisper",
        ...(flags["binary-path"] ? { binaryPath: flags["binary-path"] } : {}),
        ...(flags["ffmpeg-path"] ? { ffmpegPath: flags["ffmpeg-path"] } : {}),
        ...(flags["model-path"] ? { modelPath: flags["model-path"] } : {}),
        ...(flags.language || flags.lang ? { language: flags.language ?? flags.lang } : {}),
        ...(flags.translate !== undefined || argv.includes("--translate") ? { translate: readBooleanFlag(argv, flags, "translate", false) } : {}),
        ...(flags.threads ? { threads: Number(flags.threads) } : {}),
      });
    })();
  if (wantsJson) {
    writeMediaJson(note);
  } else {
    context.stdout.write(`${note.transcript?.text ?? ""}\n`);
  }
  return note.status === "transcribed" ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "generations" && command === "backends") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const backends = claw.generations.backends();
  if (wantsJson) {
    writeMediaJson(backends);
  } else {
    context.stdout.write(`${backends.map((backend) => {
      const prefix = backend.available ? "*" : "-";
      const kinds = backend.supportedKinds.length > 0 ? ` ${backend.supportedKinds.join(",")}` : "";
      const reason = backend.reason ? ` ${backend.reason}` : "";
      return `${prefix} ${backend.id} [${backend.source}]${kinds}${reason}`;
    }).join("\n")}\n`);
  }
  return backends.some((backend) => backend.available) ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (mediaGroup && command === "backends") {
  const { media } = await getTypedGenerationFacade(mediaGroup);
  const backends = media.backends();
  if (wantsJson) {
    writeMediaJson(backends);
  } else {
    context.stdout.write(`${backends.map((backend: { available: boolean; reason?: string; id: string; source: string }) => {
      const prefix = backend.available ? "*" : "-";
      const reason = backend.reason ? ` ${backend.reason}` : "";
      return `${prefix} ${backend.id} [${backend.source}]${reason}`;
    }).join("\n")}\n`);
  }
  return backends.some((backend: { available: boolean }) => backend.available) ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "image" && command === "create") {
  const prompt = flags.prompt;
  if (!prompt) {
    context.stderr.write("--prompt is required\n");
    return CLI_EXIT_USAGE;
  }
  const { media } = await getImageGenerationFacade();
  const record = await media.generate({
    prompt,
    ...buildImageSharedInput(flags),
    backendId: flags.backend,
    command: flags.command,
    args: parseJsonFlag<string[]>(flags["args-json"], "--args-json"),
    cwd: flags.cwd,
    env: parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json"),
    outputExtension: flags.ext,
    mimeType: flags["mime-type"],
    allowEnvCredentials: readBooleanFlag(argv, flags, "allow-env-credentials", false),
  });
  scheduleImageRecordSearchEvent({ operation: "upsert", imageId: record.id, workspaceRoot, flags });
  if (wantsJson) {
    writeMediaJson(record);
  } else {
    context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
  }
  return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "image" && command === "edit") {
  const prompt = flags.prompt;
  const parentId = flags.id || flags["parent-id"];
  if (!prompt || !parentId) {
    context.stderr.write("--id and --prompt are required\n");
    return CLI_EXIT_USAGE;
  }
  const { media } = await getImageGenerationFacade();
  const record = await media.edit({
    parentId,
    prompt,
    ...buildImageSharedInput(flags),
    sourceImageIds: parseCsvFlag(flags["source-image-ids"]),
    backendId: flags.backend,
    command: flags.command,
    args: parseJsonFlag<string[]>(flags["args-json"], "--args-json"),
    cwd: flags.cwd,
    env: parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json"),
    outputExtension: flags.ext,
    mimeType: flags["mime-type"],
    allowEnvCredentials: readBooleanFlag(argv, flags, "allow-env-credentials", false),
  });
  scheduleImageRecordSearchEvent({ operation: "upsert", imageId: record.id, workspaceRoot, flags });
  if (wantsJson) {
    writeMediaJson(record);
  } else {
    context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
  }
  return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "image" && command === "import") {
  const filePath = flags.file || flags.path;
  if (!filePath) {
    context.stderr.write("--file is required\n");
    return CLI_EXIT_USAGE;
  }
  const { media } = await getImageGenerationFacade();
  const record = media.import({
    filePath,
    prompt: flags.prompt,
    ...buildImageSharedInput(flags),
    provider: flags.provider,
    requestId: flags["request-id"],
    parentId: flags["parent-id"],
    sourceImageIds: parseCsvFlag(flags["source-image-ids"]),
    provenance: (flags.provenance as "generated-by-system" | "imported-codex" | "imported-chatgpt" | "imported-manual" | "command-backend" | "custom" | undefined) ?? "imported-manual",
    externalGenerator: flags["external-generator"],
    backendId: flags.backend,
    backendLabel: flags["backend-label"],
  });
  scheduleImageRecordSearchEvent({ operation: "upsert", imageId: record.id, workspaceRoot, flags });
  if (wantsJson) {
    writeMediaJson(record);
  } else {
    context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "image" && command === "show") {
  const id = flags.id;
  if (!id) {
    context.stderr.write("--id is required\n");
    return CLI_EXIT_USAGE;
  }
  const { media } = await getImageGenerationFacade();
  const record = media.get(id);
  if (wantsJson) {
    writeMediaJson(record);
  } else {
    context.stdout.write(`${record?.output?.filePath ?? "missing"}\n`);
  }
  return record ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (mediaGroup && command === "generate") {
  const prompt = flags.prompt;
  if (!prompt) {
    context.stderr.write("--prompt is required\n");
    return CLI_EXIT_USAGE;
  }
  if (mediaGroup === "image") {
    const { media } = await getImageGenerationFacade();
    const record = await media.generate({
      prompt,
      ...buildImageSharedInput(flags),
      backendId: flags.backend,
      command: flags.command,
      args: parseJsonFlag<string[]>(flags["args-json"], "--args-json"),
      cwd: flags.cwd,
      env: parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json"),
      outputExtension: flags.ext,
      mimeType: flags["mime-type"],
      allowEnvCredentials: readBooleanFlag(argv, flags, "allow-env-credentials", false),
    });
    scheduleImageRecordSearchEvent({ operation: "upsert", imageId: record.id, workspaceRoot, flags });
    if (wantsJson) {
      writeMediaJson(record);
    } else {
      context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
    }
    return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }
  const metadata = buildMediaMetadata(
    mediaGroup,
    flags,
    parseJsonFlag<Record<string, unknown>>(flags["metadata-json"], "--metadata-json"),
  );
  const { media } = await getTypedGenerationFacade(mediaGroup);
  const record = await media.generate({
    prompt,
    title: flags.title,
    backendId: flags.backend,
    model: flags.model,
    metadata,
    command: flags.command,
    args: parseJsonFlag<string[]>(flags["args-json"], "--args-json"),
    cwd: flags.cwd,
    env: parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json"),
    outputExtension: flags.ext,
    mimeType: flags["mime-type"],
  });
  scheduleGenerationRecordSearchEvent({ operation: "upsert", generationId: record.id, workspaceRoot, flags });
  if (wantsJson) {
    writeMediaJson(record);
  } else {
    context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
  }
  return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (mediaGroup && command === "list") {
  if (mediaGroup === "image") {
    const { media } = await getImageGenerationFacade();
    const records = media.list({
      ...(flags.backend ? { backendId: flags.backend } : {}),
      ...(flags.status ? { status: flags.status as "succeeded" | "failed" } : {}),
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      ...(flags.query ? { query: flags.query } : {}),
      ...(parseImageType(flags.type) ? { imageType: parseImageType(flags.type) } : {}),
      ...(flags.project ? { project: flags.project } : {}),
      ...(flags.provider ? { provider: flags.provider } : {}),
      ...(flags.model ? { model: flags.model } : {}),
      ...(parseImageProvenance(flags.provenance) ? { provenance: parseImageProvenance(flags.provenance) } : {}),
      ...(flags.tag ? { tag: flags.tag } : {}),
      ...(parseImageOperation(flags.operation) ? { operation: parseImageOperation(flags.operation) } : {}),
    });
    if (wantsJson) {
      writeMediaJson(records);
    } else {
      context.stdout.write(`${records.map((record: { id: string; status: string; title: string }) => `${record.id} ${record.status} ${record.title}`).join("\n")}\n`);
    }
    return records.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }
  const { media } = await getTypedGenerationFacade(mediaGroup);
  const records = media.list({
    ...(flags.backend ? { backendId: flags.backend } : {}),
    ...(flags.status ? { status: flags.status as "succeeded" | "failed" } : {}),
    ...(flags.limit ? { limit: Number(flags.limit) } : {}),
  });
  if (wantsJson) {
    writeMediaJson(records);
  } else {
    context.stdout.write(`${records.map((record: { id: string; status: string; title: string }) => `${record.id} ${record.status} ${record.title}`).join("\n")}\n`);
  }
  return records.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (mediaGroup && command === "read") {
  const id = flags.id;
  if (!id) {
    context.stderr.write("--id is required\n");
    return CLI_EXIT_USAGE;
  }
  const { media } = await getTypedGenerationFacade(mediaGroup);
  const record = media.get(id);
  if (wantsJson) {
    writeMediaJson(record);
  } else {
    context.stdout.write(`${record?.output?.filePath ?? "missing"}\n`);
  }
  return record ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (mediaGroup && command === "delete") {
  const id = flags.id;
  if (!id) {
    context.stderr.write("--id is required\n");
    return CLI_EXIT_USAGE;
  }
  const { media } = await getTypedGenerationFacade(mediaGroup);
  const mediaIds = mediaGroup === "image" ? [] : mediaIdsForGeneration(workspaceRoot, id);
  const removed = media.remove(id);
  if (removed) {
    if (mediaGroup === "image") {
      scheduleImageRecordSearchEvent({ operation: "delete", imageId: id, workspaceRoot, flags });
    } else {
      scheduleGenerationRecordSearchEvent({ operation: "delete", generationId: id, workspaceRoot, flags, mediaIds });
    }
  }
  if (wantsJson) {
    writeMediaJson({ removed, id });
  } else {
    context.stdout.write(`${removed}\n`);
  }
  return removed ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "generations" && command === "register-command") {
  const id = flags.id;
  const commandValue = flags.command;
  if (!id || !commandValue) {
    context.stderr.write("--id and --command are required\n");
    return CLI_EXIT_USAGE;
  }
  const kinds = parseCsvFlag(flags.kinds);
  if (kinds.length === 0) {
    context.stderr.write("--kinds is required\n");
    return CLI_EXIT_USAGE;
  }
  const args = parseJsonFlag<string[]>(flags["args-json"], "--args-json") ?? [];
  const env = parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json");
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const backend = claw.generations.registerCommandBackend({
    id,
    label: flags.label || id,
    supportedKinds: kinds as Array<"image" | "video" | "audio" | "document">,
    command: commandValue,
    args,
    cwd: flags.cwd,
    env,
    outputExtension: flags.ext,
    mimeType: flags["mime-type"],
  });
  if (wantsJson) {
    writeMediaJson(backend);
  } else {
    context.stdout.write(`${backend.id}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "generations" && command === "remove-backend") {
  const id = flags.id;
  if (!id) {
    context.stderr.write("--id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const removed = claw.generations.removeBackend(id);
  if (wantsJson) {
    writeMediaJson({ removed, id });
  } else {
    context.stdout.write(`${removed}\n`);
  }
  return removed ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "generations" && command === "create") {
  const kind = (flags.kind as "image" | "video" | "audio" | "document" | undefined) ?? "image";
  const prompt = flags.prompt;
  if (!prompt) {
    context.stderr.write("--prompt is required\n");
    return CLI_EXIT_USAGE;
  }
  const args = parseJsonFlag<string[]>(flags["args-json"], "--args-json");
  const env = parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json");
  const metadata = parseJsonFlag<Record<string, unknown>>(flags["metadata-json"], "--metadata-json");
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const record = await claw.generations.create({
    kind,
    prompt,
    title: flags.title,
    backendId: flags.backend,
    model: flags.model,
    metadata,
    command: flags.command,
    args,
    cwd: flags.cwd,
    env,
    outputExtension: flags.ext,
    mimeType: flags["mime-type"],
  });
  scheduleGenerationRecordSearchEvent({ operation: "upsert", generationId: record.id, workspaceRoot, flags });
  if (wantsJson) {
    writeMediaJson(record);
  } else {
    context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
  }
  return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "generations" && command === "list") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const records = claw.generations.list({
    ...(flags.kind ? { kind: flags.kind as "image" | "video" | "audio" | "document" } : {}),
    ...(flags.backend ? { backendId: flags.backend } : {}),
    ...(flags.status ? { status: flags.status as "succeeded" | "failed" } : {}),
    ...(flags.limit ? { limit: Number(flags.limit) } : {}),
  });
  if (wantsJson) {
    writeMediaJson(records);
  } else {
    context.stdout.write(`${records.map((record) => `${record.id} ${record.kind} ${record.status} ${record.title}`).join("\n")}\n`);
  }
  return records.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "generations" && command === "read") {
  const id = flags.id;
  if (!id) {
    context.stderr.write("--id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const record = claw.generations.get(id);
  if (wantsJson) {
    writeMediaJson(record);
  } else {
    context.stdout.write(`${record?.output?.filePath ?? "missing"}\n`);
  }
  return record ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "generations" && command === "delete") {
  const id = flags.id;
  if (!id) {
    context.stderr.write("--id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const mediaIds = mediaIdsForGeneration(workspaceRoot, id);
  const removed = claw.generations.remove(id);
  if (removed) {
    scheduleGenerationRecordSearchEvent({ operation: "delete", generationId: id, workspaceRoot, flags, mediaIds });
  }
  if (wantsJson) {
    writeMediaJson({ removed, id });
  } else {
    context.stdout.write(`${removed}\n`);
  }
  return removed ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}
  return null;
}
