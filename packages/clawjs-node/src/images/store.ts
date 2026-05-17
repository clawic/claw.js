import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";

import { createWorkspaceStorage, type WorkspaceStorage } from "../data/store.ts";
import { NodeFileSystemHost } from "../host/filesystem.ts";
import { resolveClawGlobalSurfacePath } from "../surface-paths.ts";
import type { SecretBrokerHttpInput, SecretBrokerHttpResult } from "../secrets/index.ts";
import type { LocalStorageStore } from "../storage/store.ts";

export type ImageOperation = "create" | "edit" | "import";
export type ImageStatus = "succeeded" | "failed";
export type ImageProvenance =
  | "generated-by-system"
  | "imported-codex"
  | "imported-chatgpt"
  | "imported-manual"
  | "command-backend"
  | "custom";

export type ImageType =
  | "logo"
  | "icon"
  | "illustration"
  | "photo"
  | "mockup"
  | "diagram"
  | "texture"
  | "screenshot"
  | "avatar"
  | "other";

export interface ImageAssetRecord {
  relativePath: string;
  filePath: string;
  exists: boolean;
  size: number | null;
  mimeType: string | null;
  hash?: string;
  format?: string;
  width?: number | null;
  height?: number | null;
}

export interface ImageProviderProfile {
  id: string;
  provider: "openai" | (string & {});
  label?: string;
  secretRef?: string;
  allowEnvCredentials?: boolean;
  envVar?: string;
  baseUrl?: string;
}

export interface ImageRecord {
  id: string;
  kind: "image";
  status: ImageStatus;
  operation: ImageOperation;
  prompt: string;
  revisedPrompt?: string;
  negativePrompt?: string;
  title: string;
  imageType?: ImageType;
  tags: string[];
  collections: string[];
  project?: string;
  workspaceId?: string;
  agentId?: string;
  topic?: string;
  backendId: string;
  backendLabel: string;
  provider?: string;
  model?: string;
  profileId?: string;
  secretRef?: string;
  requestId?: string;
  usage?: Record<string, unknown>;
  cost?: Record<string, unknown>;
  parentId?: string;
  sourceImageIds: string[];
  editDepth: number;
  provenance: ImageProvenance;
  externalGenerator?: string;
  createdAt: string;
  updatedAt: string;
  output: ImageAssetRecord | null;
  metadata?: Record<string, unknown>;
  error?: string;
}

interface PersistedImageRecord extends Omit<ImageRecord, "output"> {
  outputRelativePath?: string;
  outputMimeType?: string;
  outputHash?: string;
  outputFormat?: string;
  outputWidth?: number | null;
  outputHeight?: number | null;
  outputSize?: number | null;
}

export interface ImageListOptions {
  operation?: ImageOperation;
  status?: ImageStatus;
  provider?: string;
  model?: string;
  imageType?: ImageType;
  project?: string;
  workspaceId?: string;
  agentId?: string;
  provenance?: ImageProvenance;
  parentId?: string;
  sourceImageId?: string;
  tag?: string;
  collection?: string;
  query?: string;
  limit?: number;
}

export interface ImageCreateInput {
  prompt: string;
  title?: string;
  model?: string;
  profileId?: string;
  secretRef?: string;
  allowEnvCredentials?: boolean;
  openaiBaseUrl?: string;
  negativePrompt?: string;
  imageType?: ImageType;
  tags?: string[];
  collections?: string[];
  project?: string;
  workspaceId?: string;
  agentId?: string;
  topic?: string;
  metadata?: Record<string, unknown>;
}

export interface ImageEditInput extends ImageCreateInput {
  parentId: string;
  sourceImageIds?: string[];
}

export interface ImageImportInput {
  filePath: string;
  prompt?: string;
  title?: string;
  model?: string;
  provider?: string;
  profileId?: string;
  secretRef?: string;
  requestId?: string;
  negativePrompt?: string;
  revisedPrompt?: string;
  imageType?: ImageType;
  tags?: string[];
  collections?: string[];
  project?: string;
  workspaceId?: string;
  agentId?: string;
  topic?: string;
  parentId?: string;
  sourceImageIds?: string[];
  operation?: ImageOperation;
  provenance?: ImageProvenance;
  externalGenerator?: string;
  backendId?: string;
  backendLabel?: string;
  metadata?: Record<string, unknown>;
}

export interface ImageBackendDescriptor {
  id: string;
  label: string;
  type: "native";
  supportedKinds: ["image"];
  source: "builtin";
  available: boolean;
  reason?: string;
  supportedModels: Array<{ id: string; label: string; default?: boolean }>;
  metadataSchema: Array<{
    key: string;
    label: string;
    type: "select" | "text";
    default?: string;
    options?: Array<{ value: string; label: string }>;
  }>;
}

export interface ImageLibraryStore {
  listBackends(): ImageBackendDescriptor[];
  create(input: ImageCreateInput): Promise<ImageRecord>;
  edit(input: ImageEditInput): Promise<ImageRecord>;
  importImage(input: ImageImportInput): ImageRecord;
  list(options?: ImageListOptions): ImageRecord[];
  search(options?: ImageListOptions): ImageRecord[];
  get(id: string): ImageRecord | null;
  remove(id: string): boolean;
}

export interface CreateImageLibraryStoreOptions {
  rootDir?: string;
  filesystem?: NodeFileSystemHost;
  dataStore?: WorkspaceStorage;
  storage?: LocalStorageStore;
  env?: NodeJS.ProcessEnv;
  scope?: {
    project?: string;
    workspaceId?: string;
    agentId?: string;
  };
  profiles?: ImageProviderProfile[];
  allowEnvCredentials?: boolean;
  openaiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  brokerHttp?: (input: SecretBrokerHttpInput) => Promise<SecretBrokerHttpResult>;
}

const IMAGE_COLLECTION = "images";
const PROFILE_COLLECTION = "image-profiles";
const DEFAULT_OPENAI_MODEL = "gpt-image-1.5";
const OPENAI_BACKEND_ID = "openai:image";

function defaultImageLibraryRoot(env?: NodeJS.ProcessEnv): string {
  return env?.CLAW_IMAGE_LIBRARY_DIR?.trim()
    || process.env.CLAW_IMAGE_LIBRARY_DIR?.trim()
    || resolveClawGlobalSurfacePath("claw.global.image_library", env);
}

function normalizeText(value: string | undefined, fallback = ""): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function normalizePrompt(value: string | undefined, fallback = ""): string {
  const prompt = normalizeText(value, fallback);
  if (!prompt) throw new Error("prompt is required");
  return prompt;
}

function summarizeTitle(prompt: string, explicit?: string): string {
  const title = explicit?.trim();
  if (title) return title;
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77).trim()}...` : normalized;
}

function normalizeStringArray(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
}

function normalizeImageType(value: ImageType | undefined): ImageType | undefined {
  return value || undefined;
}

function inferMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

function extensionForMime(mimeType: string, fallbackPath?: string): string {
  switch (mimeType.toLowerCase().split(";")[0]?.trim()) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/png":
      return "png";
    default: {
      const ext = fallbackPath ? path.extname(fallbackPath).replace(/^\./, "").toLowerCase() : "";
      return ext || "bin";
    }
  }
}

function sha256(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (
    buffer.length >= 24
    && buffer.readUInt32BE(0) === 0x89504e47
    && buffer.readUInt32BE(4) === 0x0d0a1a0a
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  return null;
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png") return readPngDimensions(buffer);
  if (mimeType === "image/jpeg") return readJpegDimensions(buffer);
  return null;
}

function buildAssetRelativePath(hash: string, extension: string): string {
  return ["images", hash.slice(0, 2), `${hash}.${extension}`].join("/");
}

function enrichAssetRecord(
  dataStore: WorkspaceStorage,
  filesystem: NodeFileSystemHost,
  storage: LocalStorageStore | undefined,
  record: PersistedImageRecord,
): ImageAssetRecord | null {
  if (!record.outputRelativePath) return null;
  if (storage) {
    try {
      const object = storage.head({ key: record.outputRelativePath });
      if (object) {
        return {
          relativePath: record.outputRelativePath,
          filePath: object.filePath,
          exists: filesystem.exists(object.filePath),
          size: object.sizeBytes,
          mimeType: object.contentType || record.outputMimeType || null,
          hash: record.outputHash || object.sha256,
          format: record.outputFormat,
          width: record.outputWidth ?? null,
          height: record.outputHeight ?? null,
        };
      }
    } catch {
      // Fall back to workspace image files when object storage is unavailable.
    }
  }
  const asset = dataStore.asset(record.outputRelativePath);
  const filePath = asset.path();
  const exists = filesystem.exists(filePath);
  return {
    relativePath: record.outputRelativePath,
    filePath,
    exists,
    size: exists ? fs.statSync(filePath).size : record.outputSize ?? null,
    mimeType: record.outputMimeType ?? null,
    hash: record.outputHash,
    format: record.outputFormat,
    width: record.outputWidth ?? null,
    height: record.outputHeight ?? null,
  };
}

function hydrateRecord(
  dataStore: WorkspaceStorage,
  filesystem: NodeFileSystemHost,
  storage: LocalStorageStore | undefined,
  record: PersistedImageRecord,
): ImageRecord {
  const { outputRelativePath, outputMimeType, outputHash, outputFormat, outputWidth, outputHeight, outputSize, ...rest } = record;
  void outputRelativePath;
  void outputMimeType;
  void outputHash;
  void outputFormat;
  void outputWidth;
  void outputHeight;
  void outputSize;
  return {
    ...rest,
    output: enrichAssetRecord(dataStore, filesystem, storage, record),
  };
}

function compareImages(left: ImageRecord, right: ImageRecord): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

function normalizeProfiles(options: CreateImageLibraryStoreOptions, env: NodeJS.ProcessEnv): ImageProviderProfile[] {
  const configuredSecretRef = env.CLAW_OPENAI_IMAGE_SECRET_REF?.trim();
  const baseUrl = options.openaiBaseUrl?.trim() || env.CLAW_OPENAI_IMAGE_BASE_URL?.trim();
  const defaultProfile: ImageProviderProfile = {
    id: "openai:default",
    provider: "openai",
    label: "OpenAI default",
    ...(configuredSecretRef ? { secretRef: configuredSecretRef } : {}),
    allowEnvCredentials: options.allowEnvCredentials === true || env.CLAW_IMAGE_ALLOW_ENV_CREDENTIALS === "1",
    envVar: "OPENAI_API_KEY",
    ...(baseUrl ? { baseUrl } : {}),
  };
  return [defaultProfile, ...(options.profiles ?? [])];
}

function pickProfile(
  profiles: ImageProviderProfile[],
  input: Pick<ImageCreateInput, "profileId" | "secretRef" | "allowEnvCredentials" | "openaiBaseUrl">,
): ImageProviderProfile {
  const selected = input.profileId
    ? profiles.find((profile) => profile.id === input.profileId)
    : profiles.find((profile) => profile.provider === "openai");
  const base = selected ?? profiles[0] ?? { id: "openai:default", provider: "openai" as const };
  return {
    ...base,
    ...(input.secretRef ? { secretRef: input.secretRef } : {}),
    ...(typeof input.allowEnvCredentials === "boolean" ? { allowEnvCredentials: input.allowEnvCredentials } : {}),
    ...(input.openaiBaseUrl ? { baseUrl: input.openaiBaseUrl } : {}),
  };
}

function hasCredential(profile: ImageProviderProfile, env: NodeJS.ProcessEnv): boolean {
  if (profile.secretRef?.trim()) return true;
  return profile.allowEnvCredentials === true && !!env[profile.envVar ?? "OPENAI_API_KEY"]?.trim();
}

function openAIUrl(profile: ImageProviderProfile, suffix: string): string {
  const baseUrl = profile.baseUrl?.trim() || "https://api.openai.com/v1";
  return `${baseUrl.replace(/\/+$/, "")}${suffix}`;
}

async function parseOpenAIImageResponse(
  responseText: string,
  fetchImpl: typeof fetch,
): Promise<{
  buffer: Buffer;
  mimeType: string;
  revisedPrompt?: string;
  requestId?: string;
  usage?: Record<string, unknown>;
}> {
  const payload = JSON.parse(responseText || "{}") as {
    data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
    usage?: Record<string, unknown>;
    id?: string;
  };
  const image = payload.data?.[0];
  if (!image) throw new Error("OpenAI image response did not include image data");
  if (image.b64_json) {
    return {
      buffer: Buffer.from(image.b64_json, "base64"),
      mimeType: "image/png",
      ...(image.revised_prompt ? { revisedPrompt: image.revised_prompt } : {}),
      ...(payload.id ? { requestId: payload.id } : {}),
      ...(payload.usage ? { usage: payload.usage } : {}),
    };
  }
  if (image.url) {
    const downloaded = await fetchImpl(image.url);
    if (!downloaded.ok) throw new Error(`Failed to download generated image: ${downloaded.status}`);
    const arrayBuffer = await downloaded.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: downloaded.headers.get("content-type") || "image/png",
      ...(image.revised_prompt ? { revisedPrompt: image.revised_prompt } : {}),
      ...(payload.id ? { requestId: payload.id } : {}),
      ...(payload.usage ? { usage: payload.usage } : {}),
    };
  }
  throw new Error("OpenAI image response did not include b64_json or url");
}

export function createImageLibraryStore(options: CreateImageLibraryStoreOptions = {}): ImageLibraryStore {
  const filesystem = options.filesystem ?? new NodeFileSystemHost();
  const env = { ...process.env, ...(options.env ?? {}) };
  const rootDir = options.rootDir ?? defaultImageLibraryRoot(env);
  const dataStore = options.dataStore ?? createWorkspaceStorage(rootDir, filesystem);
  const storage = options.storage;
  const collection = dataStore.collection<PersistedImageRecord>(IMAGE_COLLECTION);
  const profileCollection = dataStore.collection<ImageProviderProfile>(PROFILE_COLLECTION);
  const fetchImpl = options.fetchImpl ?? fetch;
  const profiles = [...normalizeProfiles(options, env), ...profileCollection.list()];

  function writeAsset(buffer: Buffer, mimeType: string, sourcePath?: string): {
    relativePath: string;
    mimeType: string;
    hash: string;
    format: string;
    size: number;
    width: number | null;
    height: number | null;
  } {
    const hash = sha256(buffer);
    const format = extensionForMime(mimeType, sourcePath);
    let relativePath = buildAssetRelativePath(hash, format);
    if (storage) {
      const object = storage.put({
        key: relativePath,
        data: buffer,
        contentType: mimeType,
        visibility: "drive",
        metadata: {
          kind: "image",
          hash,
          format,
        },
      });
      relativePath = object.key;
    } else {
      const asset = dataStore.asset(relativePath);
      if (!asset.exists()) {
        asset.writeBuffer(buffer);
      }
    }
    const dimensions = readDimensions(buffer, mimeType);
    return {
      relativePath,
      mimeType,
      hash,
      format,
      size: buffer.length,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    };
  }

  function buildRecord(input: {
    operation: ImageOperation;
    prompt: string;
    title?: string;
    buffer: Buffer;
    mimeType: string;
    provider?: string;
    model?: string;
    profileId?: string;
    secretRef?: string;
    requestId?: string;
    usage?: Record<string, unknown>;
    revisedPrompt?: string;
    negativePrompt?: string;
    imageType?: ImageType;
    tags?: string[];
    collections?: string[];
    project?: string;
    workspaceId?: string;
    agentId?: string;
    topic?: string;
    parentId?: string;
    sourceImageIds?: string[];
    provenance: ImageProvenance;
    externalGenerator?: string;
    backendId: string;
    backendLabel: string;
    metadata?: Record<string, unknown>;
    sourcePath?: string;
  }): ImageRecord {
    const id = `img-${randomUUID()}`;
    const now = new Date().toISOString();
    const parent = input.parentId ? collection.get(input.parentId) : null;
    const asset = writeAsset(input.buffer, input.mimeType, input.sourcePath);
    const persisted: PersistedImageRecord = {
      id,
      kind: "image",
      status: "succeeded",
      operation: input.operation,
      prompt: input.prompt,
      ...(input.revisedPrompt ? { revisedPrompt: input.revisedPrompt } : {}),
      ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {}),
      title: summarizeTitle(input.prompt, input.title),
      ...(normalizeImageType(input.imageType) ? { imageType: normalizeImageType(input.imageType) } : {}),
      tags: normalizeStringArray(input.tags),
      collections: normalizeStringArray(input.collections),
      project: input.project ?? options.scope?.project,
      workspaceId: input.workspaceId ?? options.scope?.workspaceId,
      agentId: input.agentId ?? options.scope?.agentId,
      ...(input.topic ? { topic: input.topic } : {}),
      backendId: input.backendId,
      backendLabel: input.backendLabel,
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.profileId ? { profileId: input.profileId } : {}),
      ...(input.secretRef ? { secretRef: input.secretRef } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.usage ? { usage: input.usage } : {}),
      ...(input.parentId ? { parentId: input.parentId } : {}),
      sourceImageIds: normalizeStringArray(input.sourceImageIds),
      editDepth: input.operation === "edit" ? (parent?.editDepth ?? 0) + 1 : 0,
      provenance: input.provenance,
      ...(input.externalGenerator ? { externalGenerator: input.externalGenerator } : {}),
      createdAt: now,
      updatedAt: now,
      outputRelativePath: asset.relativePath,
      outputMimeType: asset.mimeType,
      outputHash: asset.hash,
      outputFormat: asset.format,
      outputSize: asset.size,
      outputWidth: asset.width,
      outputHeight: asset.height,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    collection.put(id, persisted);
    return hydrateRecord(dataStore, filesystem, storage, persisted);
  }

  async function callOpenAI(
    endpoint: "/images/generations" | "/images/edits",
    input: ImageCreateInput,
    extraBody: Record<string, unknown> = {},
  ) {
    const profile = pickProfile(profiles, input);
    const model = input.model?.trim() || DEFAULT_OPENAI_MODEL;
    if (!hasCredential(profile, env)) {
      throw new Error("No OpenAI image credential profile is available. Configure a secret reference or pass --allow-env-credentials with OPENAI_API_KEY.");
    }
    const body = JSON.stringify({
      model,
      prompt: input.prompt,
      n: 1,
      response_format: "b64_json",
      ...(input.metadata ?? {}),
      ...extraBody,
    });
    let status = 0;
    let responseText = "";
    if (profile.secretRef?.trim()) {
      if (!options.brokerHttp) throw new Error("Secret reference image generation requires a secrets broker.");
      const brokered = await options.brokerHttp({
        method: "POST",
        url: openAIUrl(profile, endpoint),
        capability: "broker.http",
        agent: "image-generation",
        riskTier: "cost",
        approvalSatisfied: true,
        declaredFields: [{ secretName: profile.secretRef, fieldName: "api_key", placement: "header" }],
        headers: {
          Authorization: `Bearer {{${profile.secretRef}.api_key}}`,
          "Content-Type": "application/json",
        },
        body,
      });
      status = brokered.status;
      responseText = brokered.bodyText;
      if (!brokered.ok) throw new Error(responseText || `OpenAI image request failed with ${status}`);
    } else {
      const apiKey = env[profile.envVar ?? "OPENAI_API_KEY"]?.trim();
      const response = await fetchImpl(openAIUrl(profile, endpoint), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });
      status = response.status;
      responseText = await response.text();
      if (!response.ok) throw new Error(responseText || `OpenAI image request failed with ${status}`);
    }
    return {
      ...(await parseOpenAIImageResponse(responseText, fetchImpl)),
      model,
      profile,
    };
  }

  function applyFilters(records: ImageRecord[], filters: ImageListOptions = {}): ImageRecord[] {
    const query = filters.query?.trim().toLowerCase();
    return records
      .filter((record) => !filters.operation || record.operation === filters.operation)
      .filter((record) => !filters.status || record.status === filters.status)
      .filter((record) => !filters.provider || record.provider === filters.provider)
      .filter((record) => !filters.model || record.model === filters.model)
      .filter((record) => !filters.imageType || record.imageType === filters.imageType)
      .filter((record) => !filters.project || record.project === filters.project)
      .filter((record) => !filters.workspaceId || record.workspaceId === filters.workspaceId)
      .filter((record) => !filters.agentId || record.agentId === filters.agentId)
      .filter((record) => !filters.provenance || record.provenance === filters.provenance)
      .filter((record) => !filters.parentId || record.parentId === filters.parentId)
      .filter((record) => !filters.sourceImageId || record.sourceImageIds.includes(filters.sourceImageId))
      .filter((record) => !filters.tag || record.tags.includes(filters.tag))
      .filter((record) => !filters.collection || record.collections.includes(filters.collection))
      .filter((record) => !query || [
        record.title,
        record.prompt,
        record.revisedPrompt ?? "",
        record.provider ?? "",
        record.model ?? "",
        record.provenance,
        record.imageType ?? "",
        record.externalGenerator ?? "",
        ...record.tags,
        ...record.collections,
      ].join(" ").toLowerCase().includes(query));
  }

  return {
    listBackends() {
      const profile = profiles.find((entry) => entry.provider === "openai") ?? profiles[0];
      const available = profile ? hasCredential(profile, env) : false;
      return [{
        id: OPENAI_BACKEND_ID,
        label: "OpenAI Image API",
        type: "native",
        supportedKinds: ["image"],
        source: "builtin",
        available,
        ...(!available ? { reason: "Configure an OpenAI image secret profile or explicitly allow OPENAI_API_KEY." } : {}),
        supportedModels: [
          { id: DEFAULT_OPENAI_MODEL, label: "GPT Image 1.5", default: true },
          { id: "gpt-image-1", label: "GPT Image 1" },
        ],
        metadataSchema: [
          {
            key: "size",
            label: "Size",
            type: "select",
            default: "1024x1024",
            options: [
              { value: "1024x1024", label: "1024x1024" },
              { value: "1024x1536", label: "1024x1536" },
              { value: "1536x1024", label: "1536x1024" },
            ],
          },
          {
            key: "quality",
            label: "Quality",
            type: "select",
            default: "auto",
            options: [
              { value: "auto", label: "Auto" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ],
          },
          {
            key: "background",
            label: "Background",
            type: "select",
            default: "auto",
            options: [
              { value: "auto", label: "Auto" },
              { value: "transparent", label: "Transparent" },
              { value: "opaque", label: "Opaque" },
            ],
          },
        ],
      }];
    },
    async create(input) {
      const prompt = normalizePrompt(input.prompt);
      const result = await callOpenAI("/images/generations", { ...input, prompt });
      return buildRecord({
        operation: "create",
        prompt,
        title: input.title,
        buffer: result.buffer,
        mimeType: result.mimeType,
        provider: "openai",
        model: result.model,
        profileId: result.profile.id,
        secretRef: result.profile.secretRef,
        requestId: result.requestId,
        usage: result.usage,
        revisedPrompt: result.revisedPrompt,
        negativePrompt: input.negativePrompt,
        imageType: input.imageType,
        tags: input.tags,
        collections: input.collections,
        project: input.project,
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        topic: input.topic,
        provenance: "generated-by-system",
        backendId: OPENAI_BACKEND_ID,
        backendLabel: "OpenAI Image API",
        metadata: input.metadata,
      });
    },
    async edit(input) {
      const parent = this.get(input.parentId);
      if (!parent?.output?.filePath) throw new Error(`Unknown parent image: ${input.parentId}`);
      const prompt = normalizePrompt(input.prompt);
      const parentBuffer = fs.readFileSync(parent.output.filePath);
      const result = await callOpenAI("/images/edits", { ...input, prompt }, {
        image: parentBuffer.toString("base64"),
        image_mime_type: parent.output.mimeType || "image/png",
      });
      const sourceImageIds = normalizeStringArray([input.parentId, ...(input.sourceImageIds ?? [])]);
      return buildRecord({
        operation: "edit",
        prompt,
        title: input.title,
        buffer: result.buffer,
        mimeType: result.mimeType,
        provider: "openai",
        model: result.model,
        profileId: result.profile.id,
        secretRef: result.profile.secretRef,
        requestId: result.requestId,
        usage: result.usage,
        revisedPrompt: result.revisedPrompt,
        negativePrompt: input.negativePrompt,
        imageType: input.imageType ?? parent.imageType,
        tags: input.tags ?? parent.tags,
        collections: input.collections ?? parent.collections,
        project: input.project ?? parent.project,
        workspaceId: input.workspaceId ?? parent.workspaceId,
        agentId: input.agentId ?? parent.agentId,
        topic: input.topic ?? parent.topic,
        parentId: input.parentId,
        sourceImageIds,
        provenance: "generated-by-system",
        backendId: OPENAI_BACKEND_ID,
        backendLabel: "OpenAI Image API",
        metadata: input.metadata,
      });
    },
    importImage(input) {
      const filePath = path.resolve(input.filePath);
      if (!filesystem.exists(filePath)) throw new Error(`Image file does not exist: ${filePath}`);
      const buffer = fs.readFileSync(filePath);
      const mimeType = inferMimeType(filePath);
      const fallbackPrompt = input.title || path.basename(filePath);
      const prompt = normalizePrompt(input.prompt, fallbackPrompt);
      const parent = input.parentId ? collection.get(input.parentId) : null;
      const operation = input.operation ?? (input.parentId ? "edit" : "import");
      return buildRecord({
        operation,
        prompt,
        title: input.title,
        buffer,
        mimeType,
        provider: input.provider,
        model: input.model,
        profileId: input.profileId,
        secretRef: input.secretRef,
        requestId: input.requestId,
        revisedPrompt: input.revisedPrompt,
        negativePrompt: input.negativePrompt,
        imageType: input.imageType,
        tags: input.tags,
        collections: input.collections,
        project: input.project,
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        topic: input.topic,
        parentId: input.parentId,
        sourceImageIds: input.sourceImageIds ?? (input.parentId ? [input.parentId] : []),
        provenance: input.provenance ?? "imported-manual",
        externalGenerator: input.externalGenerator,
        backendId: input.backendId ?? (input.provenance?.startsWith("imported-") ? input.provenance : "import"),
        backendLabel: input.backendLabel ?? "Imported image",
        metadata: {
          ...(parent ? { parentTitle: parent.title } : {}),
          ...(input.metadata ?? {}),
        },
        sourcePath: filePath,
      });
    },
    list(options = {}) {
      const limit = Math.max(1, options.limit ?? Number.MAX_SAFE_INTEGER);
      return applyFilters(collection.list().map((record) => hydrateRecord(dataStore, filesystem, storage, record)), options)
        .sort(compareImages)
        .slice(0, limit);
    },
    search(options = {}) {
      return this.list(options);
    },
    get(id) {
      const record = collection.get(id.trim());
      return record ? hydrateRecord(dataStore, filesystem, storage, record) : null;
    },
    remove(id) {
      const record = collection.get(id.trim());
      if (!record) return false;
      collection.remove(id.trim());
      const stillReferenced = record.outputHash
        ? collection.list().some((entry) => entry.outputHash === record.outputHash)
        : true;
      if (!stillReferenced && record.outputRelativePath) {
        if (storage) {
          storage.delete({ key: record.outputRelativePath });
        } else {
          dataStore.asset(record.outputRelativePath).remove();
        }
      }
      return true;
    },
  };
}

export { DEFAULT_OPENAI_MODEL, OPENAI_BACKEND_ID };
