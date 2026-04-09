import type { Message, PromptContextBlock } from "@clawjs/core";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function renderContextBlocks(blocks: PromptContextBlock[] = []): string {
  return blocks
    .filter((block) => normalizeWhitespace(block.title) && normalizeWhitespace(block.content))
    .map((block) => `## ${normalizeWhitespace(block.title)}\n${block.content.trim()}`)
    .join("\n\n");
}

export function buildSystemPromptWithContext(systemPrompt?: string, contextBlocks: PromptContextBlock[] = []): string {
  const sections = [
    systemPrompt?.trim() || "",
    renderContextBlocks(contextBlocks),
  ].filter(Boolean);

  return sections.join("\n\n").trim();
}

export function formatOpenClawConversation(messages: Array<Pick<Message, "role" | "content" | "attachments" | "documents" | "contextChips">>): string {
  return messages
    .map((message) => {
      const lines = [`${message.role.toUpperCase()}: ${message.content.trim()}`];
      if (message.contextChips?.length) {
        lines.push(`Context: ${message.contextChips.map((chip) => chip.label).join(", ")}`);
      }
      const documentNames = message.documents?.map((document) => document.name)
        ?? message.attachments?.map((attachment) => attachment.name)
        ?? [];
      if (documentNames.length > 0) {
        lines.push(`Attachments: ${documentNames.join(", ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildOpenClawCliPrompt(input: {
  systemPrompt?: string;
  contextBlocks?: PromptContextBlock[];
  messages: Array<Pick<Message, "role" | "content" | "attachments" | "documents" | "contextChips">>;
}): string {
  const mergedSystemPrompt = buildSystemPromptWithContext(input.systemPrompt, input.contextBlocks);
  const sections = [
    mergedSystemPrompt ? `SYSTEM PROMPT:\n${mergedSystemPrompt}` : "",
    `SESSION:\n${formatOpenClawConversation(input.messages)}`,
    "Reply only as the assistant to the current session.",
  ].filter(Boolean);

  return sections.join("\n\n").trim();
}

type OpenAIMessagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenAIResponseContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "input_file"; filename: string; file_data: string };

export interface OpenAIResponseInputMessage {
  type: "message";
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenAIResponseContentPart[];
}

export interface ResolvedSessionAsset {
  name: string;
  mimeType: string;
  data: string;
}

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenAIMessagePart[];
}

export function toBase64Payload(data: string): string {
  const trimmed = data.trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("data:")) return trimmed;
  const [, base64Data = ""] = trimmed.split(",", 2);
  return base64Data.trim();
}

export function toDataUrl(data: string, mimeType: string): string {
  const trimmed = data.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("data:")
    ? trimmed
    : `data:${mimeType};base64,${trimmed}`;
}

export function supportsOpenAIResponseImageMime(mimeType: string): boolean {
  return [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
  ].includes(mimeType.toLowerCase());
}

export function supportsOpenAIResponseFileMime(mimeType: string): boolean {
  return [
    "text/plain",
    "text/markdown",
    "text/html",
    "text/csv",
    "application/json",
    "application/pdf",
  ].includes(mimeType.toLowerCase());
}

function toAttachmentDataUrl(message: Pick<Message, "attachments">): OpenAIMessagePart[] {
  return (message.attachments ?? [])
    .filter((attachment) => attachment.mimeType.startsWith("image/") && typeof attachment.data === "string" && attachment.data.trim())
    .map((attachment) => ({
      type: "image_url" as const,
      image_url: {
        url: attachment.data!.startsWith("data:")
          ? attachment.data!
          : `data:${attachment.mimeType};base64,${attachment.data!}`,
      },
    }));
}

function toResponseParts(content: string, assets: ResolvedSessionAsset[]): OpenAIResponseContentPart[] {
  const parts: OpenAIResponseContentPart[] = [];
  const normalizedContent = content.trim();
  if (normalizedContent) {
    parts.push({
      type: "input_text",
      text: normalizedContent,
    });
  }

  const unsupportedAssets: string[] = [];

  for (const asset of assets) {
    if (!asset.data.trim()) continue;
    if (supportsOpenAIResponseImageMime(asset.mimeType)) {
      parts.push({
        type: "input_image",
        image_url: toDataUrl(asset.data, asset.mimeType),
      });
      continue;
    }
    if (supportsOpenAIResponseFileMime(asset.mimeType)) {
      parts.push({
        type: "input_file",
        filename: asset.name,
        file_data: toDataUrl(asset.data, asset.mimeType),
      });
      continue;
    }
    unsupportedAssets.push(asset.name);
  }

  if (unsupportedAssets.length > 0) {
    parts.push({
      type: "input_text",
      text: `Attachments: ${unsupportedAssets.join(", ")}`,
    });
  }

  return parts;
}

export function buildOpenAIMessages(input: {
  systemPrompt?: string;
  contextBlocks?: PromptContextBlock[];
  messages: Array<Pick<Message, "role" | "content" | "attachments">>;
}): OpenAIChatMessage[] {
  const result: OpenAIChatMessage[] = [];
  const system = buildSystemPromptWithContext(input.systemPrompt, input.contextBlocks);
  if (system) {
    result.push({ role: "system", content: system });
  }

  for (const message of input.messages) {
    const imageParts = toAttachmentDataUrl(message);
    if (imageParts.length === 0) {
      result.push({
        role: message.role,
        content: message.content,
      });
      continue;
    }

    result.push({
      role: message.role,
      content: [
        { type: "text", text: message.content },
        ...imageParts,
      ],
    });
  }

  return result;
}

export function buildOpenAIResponseMessages(input: {
  systemPrompt?: string;
  contextBlocks?: PromptContextBlock[];
  messages: Array<Pick<Message, "role" | "content"> & { assets?: ResolvedSessionAsset[] }>;
}): OpenAIResponseInputMessage[] {
  const result: OpenAIResponseInputMessage[] = [];
  const system = buildSystemPromptWithContext(input.systemPrompt, input.contextBlocks);
  if (system) {
    result.push({
      type: "message",
      role: "system",
      content: system,
    });
  }

  for (const message of input.messages) {
    const parts = toResponseParts(message.content, message.assets ?? []);
    result.push({
      type: "message",
      role: message.role,
      content: parts.length === 0 ? message.content : parts,
    });
  }

  return result;
}
