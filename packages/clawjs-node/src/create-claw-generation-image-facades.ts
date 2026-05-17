// @ts-nocheck
import path from "path";
import { OPENAI_BACKEND_ID } from "./images/store.ts";

export function createClawGenerationImageFacades(locals: Record<string, any>): Record<string, any> {
  const {
    generationStore,
    imageStore,
    options,
    logicalAgentId,
    appendAuditEvent,
    eventBus,
    registerGeneratedMedia,
    registerImageMedia,
  } = locals;

  function registerGenerationBackend(input: RegisterCommandGenerationBackendInput): GenerationBackendDescriptor {
    const backend = generationStore.registerCommandBackend(input);
    appendAuditEvent("generations.backend_registered", "file_sync", {
      backendId: backend.id,
      supportedKinds: backend.supportedKinds.join(","),
    });
    eventBus.emit("generations.backend_registered", {
      backendId: backend.id,
      supportedKinds: backend.supportedKinds,
    });
    return backend;
  }

  function removeGenerationBackend(id: string): boolean {
    const removed = generationStore.removeBackend(id);
    if (removed) {
      appendAuditEvent("generations.backend_removed", "file_sync", { backendId: id });
      eventBus.emit("generations.backend_removed", { backendId: id });
    }
    return removed;
  }

  async function createGenerationRecord(input: CreateGenerationInput): Promise<GenerationRecord> {
    const record = await generationStore.create(input);
    registerGeneratedMedia(record);
    appendAuditEvent("generations.created", "file_sync", {
      generationId: record.id,
      kind: record.kind,
      backendId: record.backendId,
      status: record.status,
    });
    eventBus.emit("generations.created", {
      generationId: record.id,
      kind: record.kind,
      backendId: record.backendId,
      status: record.status,
    });
    return record;
  }

  function removeGenerationRecord(id: string): boolean {
    const removed = generationStore.remove(id);
    if (removed) {
      appendAuditEvent("generations.removed", "file_sync", { generationId: id });
      eventBus.emit("generations.removed", { generationId: id });
    }
    return removed;
  }

  function createTypedGenerationFacade(kind: "image" | "audio" | "video") {
    return {
      backends: () => generationStore.listBackends().filter((backend) => backend.supportedKinds.includes(kind)),
      generate: (input: Omit<CreateGenerationInput, "kind">) => createGenerationRecord({ ...input, kind }),
      list: (options: Omit<GenerationListOptions, "kind"> = {}) => generationStore.list({ ...options, kind }),
      get: (id: string) => {
        const record = generationStore.get(id);
        return record?.kind === kind ? record : null;
      },
      remove: (id: string) => {
        const record = generationStore.get(id);
        if (!record || record.kind !== kind) return false;
        return removeGenerationRecord(id);
      },
    };
  }

  function mapGenerationToImageRecord(record: GenerationRecord): ImageRecord {
    return {
      id: record.id,
      kind: "image",
      status: record.status,
      operation: "create",
      prompt: record.prompt,
      title: record.title,
      tags: [],
      collections: [],
      project: options.workspace.appId,
      workspaceId: options.workspace.workspaceId,
      agentId: logicalAgentId,
      backendId: record.backendId,
      backendLabel: record.backendLabel,
      provider: record.backendId.startsWith("openclaw-skill:openai") ? "openai" : undefined,
      ...(record.model ? { model: record.model } : {}),
      sourceImageIds: [],
      editDepth: 0,
      provenance: "command-backend",
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      output: record.output,
      ...(record.metadata ? { metadata: record.metadata } : {}),
      ...(record.error ? { error: record.error } : {}),
    };
  }

  function isNativeImageBackend(input: { backendId?: string; command?: string }): boolean {
    return !input.command?.trim() && (!input.backendId || input.backendId === OPENAI_BACKEND_ID || input.backendId === "openai");
  }

  function shouldUseNativeImageBackend(input: { backendId?: string; command?: string }): boolean {
    if (!isNativeImageBackend(input)) return false;
    if (input.backendId === OPENAI_BACKEND_ID || input.backendId === "openai") return true;
    return imageStore.listBackends().some((backend) => backend.id === OPENAI_BACKEND_ID && backend.available)
      || !generationStore.listBackends().some((backend) => backend.id !== "command" && backend.available && backend.supportedKinds.includes("image"));
  }

  function imageBackends(): GenerationBackendDescriptor[] {
    const nativeBackends = imageStore.listBackends().map((backend) => ({
      id: backend.id,
      label: backend.label,
      type: "command" as const,
      supportedKinds: ["image" as const],
      command: "",
      args: [],
      source: "builtin" as const,
      available: backend.available,
      ...(backend.reason ? { reason: backend.reason } : {}),
      supportedModels: backend.supportedModels,
      metadataSchema: backend.metadataSchema,
    }));
    return [
      ...nativeBackends,
      ...generationStore.listBackends().filter((backend) => backend.supportedKinds.includes("image")),
    ];
  }

  function importGenerationRecord(record: GenerationRecord, operation: "create" | "edit", input: {
    parentId?: string;
    sourceImageIds?: string[];
    imageType?: ImageImportInput["imageType"];
    tags?: string[];
    collections?: string[];
    project?: string;
    topic?: string;
    externalGenerator?: string;
    metadata?: Record<string, unknown>;
  } = {}): ImageRecord {
    if (!record.output?.filePath || !record.output.exists) {
      return mapGenerationToImageRecord(record);
    }
    const image = imageStore.importImage({
      filePath: record.output.filePath,
      prompt: record.prompt,
      title: record.title,
      model: record.model,
      provider: record.backendId.includes("openai") ? "openai" : undefined,
      project: input.project,
      workspaceId: options.workspace.workspaceId,
      agentId: logicalAgentId,
      topic: input.topic,
      imageType: input.imageType,
      tags: input.tags,
      collections: input.collections,
      parentId: input.parentId,
      sourceImageIds: input.sourceImageIds,
      operation,
      provenance: "command-backend",
      externalGenerator: input.externalGenerator,
      backendId: record.backendId,
      backendLabel: record.backendLabel,
      metadata: {
        ...(record.metadata ?? {}),
        ...(input.metadata ?? {}),
        generationId: record.id,
      },
    });
    registerImageMedia(image);
    return image;
  }

  async function createImageRecord(input: Omit<ImageCreateInput, "workspaceId" | "agentId"> & {
    backendId?: string;
    command?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    outputExtension?: string;
    mimeType?: string;
  }): Promise<ImageRecord> {
    if (shouldUseNativeImageBackend(input)) {
      const image = await imageStore.create({
        ...input,
        workspaceId: options.workspace.workspaceId,
        agentId: logicalAgentId,
      });
      registerImageMedia(image);
      return image;
    }
    const record = await createGenerationRecord({
      kind: "image",
      prompt: input.prompt,
      title: input.title,
      backendId: input.backendId,
      model: input.model,
      metadata: input.metadata,
      command: input.command,
      args: input.args,
      cwd: input.cwd,
      env: input.env,
      outputExtension: input.outputExtension,
      mimeType: input.mimeType,
    });
    return importGenerationRecord(record, "create", input);
  }

  async function editImageRecord(input: Omit<ImageEditInput, "workspaceId" | "agentId"> & {
    backendId?: string;
    command?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    outputExtension?: string;
    mimeType?: string;
  }): Promise<ImageRecord> {
    if (shouldUseNativeImageBackend(input)) {
      const image = await imageStore.edit({
        ...input,
        workspaceId: options.workspace.workspaceId,
        agentId: logicalAgentId,
      });
      registerImageMedia(image);
      return image;
    }
    const parent = imageStore.get(input.parentId);
    const inputImages = [parent?.output?.filePath, ...(input.sourceImageIds ?? []).map((id) => imageStore.get(id)?.output?.filePath)]
      .filter((entry): entry is string => !!entry);
    const record = await createGenerationRecord({
      kind: "image",
      prompt: input.prompt,
      title: input.title,
      backendId: input.backendId,
      model: input.model,
      metadata: {
        ...(input.metadata ?? {}),
        inputImages,
        parentId: input.parentId,
      },
      command: input.command,
      args: input.args,
      cwd: input.cwd,
      env: input.env,
      outputExtension: input.outputExtension,
      mimeType: input.mimeType,
    });
    return importGenerationRecord(record, "edit", {
      ...input,
      sourceImageIds: [input.parentId, ...(input.sourceImageIds ?? [])],
    });
  }

  function listImageRecords(queryOptions: Omit<GenerationListOptions, "kind"> & ImageListOptions = {}): ImageRecord[] {
    const scopedOptions = {
      ...queryOptions,
      workspaceId: queryOptions.workspaceId ?? options.workspace.workspaceId,
      agentId: queryOptions.agentId ?? logicalAgentId,
    };
    const native = imageStore.list(scopedOptions);
    const existingIds = new Set(native.map((record) => String(record.metadata?.generationId ?? record.id)));
    const generationBacked = generationStore.list({
      kind: "image",
      ...(scopedOptions.backendId ? { backendId: scopedOptions.backendId } : {}),
      ...(scopedOptions.status ? { status: scopedOptions.status } : {}),
    })
      .filter((record) => !existingIds.has(record.id))
      .map(mapGenerationToImageRecord);
    const query = scopedOptions.query?.trim().toLowerCase();
    const merged = [...native, ...generationBacked]
      .filter((record) => !scopedOptions.operation || record.operation === scopedOptions.operation)
      .filter((record) => !scopedOptions.provenance || record.provenance === scopedOptions.provenance)
      .filter((record) => !scopedOptions.imageType || record.imageType === scopedOptions.imageType)
      .filter((record) => !scopedOptions.project || record.project === scopedOptions.project)
      .filter((record) => !scopedOptions.provider || record.provider === scopedOptions.provider)
      .filter((record) => !scopedOptions.model || record.model === scopedOptions.model)
      .filter((record) => !scopedOptions.parentId || record.parentId === scopedOptions.parentId)
      .filter((record) => !scopedOptions.sourceImageId || record.sourceImageIds.includes(scopedOptions.sourceImageId))
      .filter((record) => !scopedOptions.tag || record.tags.includes(scopedOptions.tag))
      .filter((record) => !query || `${record.title} ${record.prompt} ${record.tags.join(" ")} ${record.provider ?? ""} ${record.model ?? ""}`.toLowerCase().includes(query))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return merged.slice(0, Math.max(1, scopedOptions.limit ?? Number.MAX_SAFE_INTEGER));
  }

  function getImageRecord(id: string): ImageRecord | null {
    const image = imageStore.get(id);
    if (image) return image;
    const generation = generationStore.get(id);
    return generation?.kind === "image" ? mapGenerationToImageRecord(generation) : null;
  }

  function removeImageRecord(id: string): boolean {
    return imageStore.remove(id) || removeGenerationRecord(id);
  }



  return {
    registerGenerationBackend,
    removeGenerationBackend,
    createGenerationRecord,
    removeGenerationRecord,
    createTypedGenerationFacade,
    mapGenerationToImageRecord,
    isNativeImageBackend,
    shouldUseNativeImageBackend,
    imageBackends,
    importGenerationRecord,
    createImageRecord,
    editImageRecord,
    listImageRecords,
    getImageRecord,
    removeImageRecord,
  };
}
