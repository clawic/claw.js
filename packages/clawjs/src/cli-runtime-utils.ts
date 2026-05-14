import fs from "fs";
import path from "path";

import type { RuntimeAdapterId } from "@clawjs/core";
import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { parseJsonFlag } from "./cli-flag-parsers.ts";
import { RUNTIME_ADAPTER_IDS } from "./cli-constants.ts";

export function pathSafeBasename(value: string): string {
  const normalized = value.replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "clawjs-workspace";
}

export function readJsonFile<TValue>(filePath: string, label: string): TValue {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as TValue;
  } catch (error) {
    throw new CliHandledError("invalid_json", `Invalid ${label}: ${error instanceof Error ? error.message : "parse error"}`, CLI_EXIT_USAGE);
  }
}

export function timelineRange(mode: "day" | "week", startValue?: string): { start: string; end: string } {
  const start = startValue ? new Date(startValue) : new Date();
  if (!Number.isFinite(start.getTime())) {
    throw new CliHandledError("usage_error", "Invalid --start value for timeline.", CLI_EXIT_USAGE);
  }
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (mode === "week" ? 7 : 1));
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function resolveRuntimeAdapterId(flags: Record<string, string>): RuntimeAdapterId {
  const runtime = flags.runtime?.trim() || "openclaw";
  if (!RUNTIME_ADAPTER_IDS.has(runtime)) {
    throw new CliHandledError("invalid_enum", `Invalid --runtime "${runtime}". Allowed values: ${Array.from(RUNTIME_ADAPTER_IDS).join(", ")}.`, CLI_EXIT_USAGE);
  }
  return runtime as RuntimeAdapterId;
}

export type GenerationCliMediaKind = "image" | "audio" | "video";

export function inferMimeTypeFromPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".txt":
      return "text/plain";
    case ".md":
      return "text/markdown";
    case ".json":
      return "application/json";
    case ".csv":
      return "text/csv";
    case ".pdf":
      return "application/pdf";
    case ".html":
    case ".htm":
      return "text/html";
    case ".png":
      return "image/png";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "application/octet-stream";
  }
}

export function inferAudioExtension(mimeType: string): string {
  switch (mimeType) {
    case "audio/mpeg":
      return ".mp3";
    case "audio/wav":
      return ".wav";
    default:
      return ".bin";
  }
}

export function parseInferenceMessages(
  flags: Record<string, string>,
): Array<{ role: "user" | "system" | "assistant" | "tool"; content: string }> | null {
  const parsed = parseJsonFlag<Array<{ role: "user" | "system" | "assistant" | "tool"; content: string }>>(flags["messages-json"], "--messages-json");
  if (parsed?.length) {
    return parsed;
  }
  const prompt = flags.prompt ?? flags.message ?? flags.text;
  if (!prompt?.trim()) {
    return null;
  }
  return [{ role: "user", content: prompt.trim() }];
}

export function parseContextBlock(value?: string): { title: string; content: string }[] | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const separatorIndex = trimmed.indexOf("::");
  if (separatorIndex === -1) {
    return [{ title: "Context", content: trimmed }];
  }
  return [{
    title: trimmed.slice(0, separatorIndex).trim() || "Context",
    content: trimmed.slice(separatorIndex + 2).trim(),
  }];
}
