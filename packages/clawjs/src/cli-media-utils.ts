import type { MediaDirection, MediaKind, MediaListInput, MediaOrigin } from "@clawjs/core";

import { parseCsvFlag, parseJsonFlag } from "./cli-flag-parsers.ts";
import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import type { GenerationCliMediaKind } from "./cli-runtime-utils.ts";

export function buildMediaListInput(flags: Record<string, string>): MediaListInput {
  const limit = parseMediaLimit(flags.limit);
  return {
    ...(flags.query ? { query: flags.query } : {}),
    ...(flags.kind ? { kind: flags.kind as MediaKind } : {}),
    ...(flags.type ? { kind: flags.type as MediaKind } : {}),
    ...(flags.direction ? { direction: flags.direction as MediaDirection } : {}),
    ...(flags.origin ? { origin: flags.origin as MediaOrigin } : {}),
    ...(flags.agent ? { agentId: flags.agent } : {}),
    ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
    ...(flags["workspace-id"] ? { workspaceId: flags["workspace-id"] } : {}),
    ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
    ...(flags["session-id"] ? { sessionId: flags["session-id"] } : {}),
    ...(flags.provider ? { provider: flags.provider } : {}),
    ...(flags.channel ? { provider: flags.channel } : {}),
    ...(flags.account ? { accountId: flags.account } : {}),
    ...(flags["target-id"] ? { targetId: flags["target-id"] } : {}),
    ...(flags["chat-id"] ? { targetId: flags["chat-id"] } : {}),
    ...(flags["thread-id"] ? { threadId: flags["thread-id"] } : {}),
    ...(flags.from ? { from: flags.from } : {}),
    ...(flags.to ? { to: flags.to } : {}),
    ...(limit ? { limit } : {}),
  };
}

export function parseMediaLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const isCanonicalPositiveDecimal = /^[1-9][0-9]*$/.test(value);
  const limit = Number(value);
  if (!isCanonicalPositiveDecimal || !Number.isSafeInteger(limit)) {
    throw new CliHandledError("invalid_media_limit", "--limit must be a positive integer.", CLI_EXIT_USAGE, {
      location: "cli.media.limit",
    });
  }
  return limit;
}

export function buildMediaMetadata(
  kind: GenerationCliMediaKind,
  flags: Record<string, string>,
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = { ...(metadata ?? {}) };

  if (kind === "image") {
    if (flags.size) merged.size = flags.size;
    if (flags.quality) merged.quality = flags.quality;
    if (flags.background) merged.background = flags.background;
    if (flags["output-format"]) merged.outputFormat = flags["output-format"];
    if (flags.style) merged.style = flags.style;
    if (flags.resolution) merged.resolution = flags.resolution;
    if (flags["aspect-ratio"]) merged.aspectRatio = flags["aspect-ratio"];
    const inputImages = parseCsvFlag(flags["input-images"]);
    if (inputImages.length > 0) merged.inputImages = inputImages;
  }

  if (kind === "audio" && flags.voice) {
    merged.voice = flags.voice;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildImageMetadata(flags: Record<string, string>): Record<string, unknown> | undefined {
  return buildMediaMetadata("image", flags, parseJsonFlag<Record<string, unknown>>(flags["metadata-json"], "--metadata-json"));
}

export function buildImageSharedInput(flags: Record<string, string>) {
  return {
    title: flags.title,
    model: flags.model,
    profileId: flags.profile,
    secretRef: flags["secret-ref"],
    openaiBaseUrl: flags["openai-base-url"],
    negativePrompt: flags["negative-prompt"],
    imageType: flags.type as "logo" | "icon" | "illustration" | "photo" | "mockup" | "diagram" | "texture" | "screenshot" | "avatar" | "other" | undefined,
    tags: parseCsvFlag(flags.tags),
    collections: parseCsvFlag(flags.collections),
    project: flags.project,
    topic: flags.topic,
    metadata: buildImageMetadata(flags),
  };
}
