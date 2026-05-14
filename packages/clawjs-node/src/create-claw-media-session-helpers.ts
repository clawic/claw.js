// @ts-nocheck
import fs from "fs";
import path from "path";

export function createClawMediaSessionHelpers(locals: Record<string, any>): Record<string, any> {
  const {
    sessionStore,
    mediaStore,
    documentStore,
    workspaceDir,
    options,
    logicalAgentId,
    runtimeAgentId,
    processHost,
    resolvedRuntimeOptions,
    adapter,
    channelsRegistry,
    extractSessionIdFromSourcePath,
    extractDocumentIdFromSourcePath,
    runOpenClawMemorySearch,
  } = locals;

  function searchSessionsLocally(input: SessionSearchInput): SessionSearchResult[] {
    return sessionStore.searchSessions(input.query, {
      limit: input.limit,
      includeMessages: input.includeMessages,
    });
  }

  function mediaKindFromMime(mimeType: string): MediaKind {
    const lower = mimeType.toLowerCase();
    if (lower.startsWith("image/")) return "image";
    if (lower.startsWith("audio/")) return "audio";
    if (lower.startsWith("video/")) return "video";
    if (
      lower.startsWith("text/")
      || lower === "application/pdf"
      || lower.includes("document")
      || lower.includes("spreadsheet")
      || lower.includes("presentation")
      || lower === "application/json"
    ) return "document";
    return "other";
  }

  function mediaKindFromTelegram(type: TelegramSendMediaInput["type"]): MediaKind {
    if (type === "photo") return "image";
    if (type === "audio") return "audio";
    if (type === "video") return "video";
    if (type === "animation") return "animation";
    return "document";
  }

  function mediaKindFromChannel(type: SendChannelMessageInput["mediaType"]): MediaKind {
    if (type === "photo") return "image";
    if (type === "audio") return "audio";
    if (type === "video") return "video";
    if (type === "animation") return "animation";
    return "document";
  }

  function parseMediaStorageUrl(value: string | undefined): { bucket: string; key: string; url: string } | undefined {
    if (!value?.startsWith("storage://")) return undefined;
    const rest = value.slice("storage://".length);
    const slashIndex = rest.indexOf("/");
    if (slashIndex <= 0) return undefined;
    return {
      bucket: rest.slice(0, slashIndex),
      key: rest.slice(slashIndex + 1),
      url: value,
    };
  }

  function readDocumentIndexText(document: DocumentRecord): string | undefined {
    if (!document.textPath) return undefined;
    const indexPath = path.isAbsolute(document.textPath)
      ? document.textPath
      : path.resolve(workspaceDir, document.textPath);
    try {
      return fs.readFileSync(indexPath, "utf8");
    } catch {
      return undefined;
    }
  }

  function registerDocumentMedia(document: DocumentRecord, direction: "inbound" | "outbound" | "internal" = "internal"): MediaRecord {
    return mediaStore.register({
      name: document.name,
      mimeType: document.mimeType,
      kind: mediaKindFromMime(document.mimeType),
      workspaceId: document.workspaceId ?? options.workspace.workspaceId,
      projectId: document.projectId ?? options.workspace.projectId,
      agentId: document.agentId ?? logicalAgentId,
      sessionId: document.sessionId,
      messageId: document.createdByMessageId,
      origin: document.origin === "assistant_generated" ? "assistant_generated" : document.origin,
      direction,
      storage: parseMediaStorageUrl(document.storage.path),
      external: parseMediaStorageUrl(document.storage.path) ? undefined : { value: document.storage.path, kind: "opaque" },
      sourceText: readDocumentIndexText(document),
      sourceType: "document",
      sourceId: document.documentId,
      metadata: {
        documentId: document.documentId,
        indexStatus: document.indexStatus,
      },
    });
  }

  function registerGeneratedMedia(record: GenerationRecord): MediaRecord | null {
    if (record.status !== "succeeded" || !record.output) return null;
    return mediaStore.register({
      name: path.basename(record.output.relativePath),
      mimeType: record.output.mimeType ?? "application/octet-stream",
      kind: record.kind === "document" ? "document" : record.kind,
      filePath: record.output.filePath,
      workspaceId: options.workspace.workspaceId,
      projectId: options.workspace.projectId,
      agentId: logicalAgentId,
      origin: "generated",
      direction: "internal",
      sourceText: record.prompt,
      sourceType: "generation",
      sourceId: record.id,
      metadata: {
        generationId: record.id,
        backendId: record.backendId,
        title: record.title,
      },
    });
  }

  function registerImageMedia(record: ImageRecord): MediaRecord | null {
    if (record.status !== "succeeded" || !record.output) return null;
    return mediaStore.register({
      name: path.basename(record.output.relativePath),
      mimeType: record.output.mimeType ?? "image/*",
      kind: "image",
      filePath: record.output.filePath,
      workspaceId: record.workspaceId ?? options.workspace.workspaceId,
      projectId: options.workspace.projectId,
      agentId: record.agentId ?? logicalAgentId,
      origin: record.operation === "import" ? "imported" : "generated",
      direction: "internal",
      sourceText: [record.prompt, record.revisedPrompt, record.title, ...(record.tags ?? [])].filter(Boolean).join(" "),
      sourceType: "image",
      sourceId: record.id,
      metadata: {
        imageId: record.id,
        operation: record.operation,
        provider: record.provider,
        model: record.model,
      },
    });
  }

  function registerVoiceNoteMedia(note: VoiceNoteRecord): MediaRecord {
    return mediaStore.register({
      name: note.audio.fileName ?? `${note.id}.ogg`,
      mimeType: note.audio.mimeType,
      kind: "audio",
      storage: {
        bucket: note.audio.bucket,
        key: note.audio.key,
        url: note.audio.storageUrl,
      },
      agentId: logicalAgentId,
      origin: note.source.origin === "telegram" ? "channel_ingested" : "imported",
      direction: "inbound",
      channel: {
        provider: note.source.provider,
        accountId: note.source.accountId,
        targetId: note.source.targetId,
        ...(note.source.threadId !== undefined ? { threadId: String(note.source.threadId) } : {}),
        providerMessageId: note.source.providerMessageId,
      },
      sourceText: note.transcript?.text,
      sourceType: "voice-note",
      sourceId: note.id,
      metadata: {
        voiceNoteId: note.id,
        durationSeconds: note.audio.durationSeconds,
        status: note.status,
      },
    });
  }

  function registerOutboundChannelMedia(input: {
    provider: string;
    accountId?: string;
    targetId: string;
    threadId?: string | number;
    media: string;
    mediaType?: TelegramSendMediaInput["type"] | SendChannelMessageInput["mediaType"];
    text?: string;
    agentId?: string;
    response?: Record<string, unknown>;
    command?: string;
  }): MediaRecord {
    const providerMessageId = typeof input.response?.message_id === "number" || typeof input.response?.message_id === "string"
      ? String(input.response.message_id)
      : undefined;
    const mediaValue = input.media.trim();
    const localPath = mediaValue && fs.existsSync(mediaValue) ? mediaValue : undefined;
    const isUrl = /^https?:\/\//i.test(mediaValue);
    const mediaType = input.mediaType ?? "document";
    const kind = typeof mediaType === "string" && mediaType !== "document"
      ? mediaKindFromChannel(mediaType as SendChannelMessageInput["mediaType"])
      : "document";
    return mediaStore.register({
      name: localPath ? path.basename(localPath) : path.basename(new URL(isUrl ? mediaValue : "file:///media").pathname) || mediaValue,
      mimeType: kind === "image" ? "image/*" : kind === "audio" ? "audio/*" : kind === "video" ? "video/*" : "application/octet-stream",
      kind,
      filePath: localPath,
      external: localPath ? undefined : {
        provider: input.provider,
        value: mediaValue,
        kind: isUrl ? "url" : "provider_file_id",
      },
      workspaceId: options.workspace.workspaceId,
      projectId: options.workspace.projectId,
      agentId: input.agentId ?? logicalAgentId,
      command: input.command,
      origin: "assistant_generated",
      direction: "outbound",
      channel: {
        provider: input.provider,
        accountId: input.accountId ?? "default",
        targetId: input.targetId,
        ...(input.threadId !== undefined ? { threadId: String(input.threadId) } : {}),
        ...(providerMessageId ? { providerMessageId } : {}),
      },
      sourceText: input.text,
      sourceType: "channel-message",
      sourceId: [
        input.provider,
        input.accountId ?? "default",
        input.targetId,
        input.threadId,
        providerMessageId,
        mediaValue,
      ].filter((part) => part !== undefined && part !== null && String(part).trim()).map(String).join(":"),
      metadata: {
        mediaType,
      },
    });
  }

  function registerInboundTelegramMedia(message: ChannelMessageRecord): void {
    if (message.provider !== "telegram") return;
    const rawMessage = (message.raw?.message ?? message.raw?.edited_message) as Record<string, unknown> | undefined;
    if (!rawMessage) return;
    const candidates: Array<{ key: string; kind: MediaKind; mimeType: string; value: unknown }> = [
      { key: "photo", kind: "image", mimeType: "image/*", value: rawMessage.photo },
      { key: "document", kind: "document", mimeType: "application/octet-stream", value: rawMessage.document },
      { key: "audio", kind: "audio", mimeType: "audio/*", value: rawMessage.audio },
      { key: "voice", kind: "audio", mimeType: "audio/ogg", value: rawMessage.voice },
      { key: "video", kind: "video", mimeType: "video/*", value: rawMessage.video },
      { key: "animation", kind: "animation", mimeType: "image/gif", value: rawMessage.animation },
    ];
    for (const candidate of candidates) {
      const value = Array.isArray(candidate.value)
        ? [...candidate.value].reverse().find((entry) => entry && typeof entry === "object") as Record<string, unknown> | undefined
        : candidate.value as Record<string, unknown> | undefined;
      if (!value || typeof value !== "object") continue;
      const fileId = typeof value.file_id === "string" ? value.file_id : "";
      if (!fileId) continue;
      const fileName = typeof value.file_name === "string" ? value.file_name : `${candidate.key}-${fileId.slice(0, 12)}`;
      mediaStore.register({
        name: fileName,
        mimeType: typeof value.mime_type === "string" ? value.mime_type : candidate.mimeType,
        kind: candidate.kind,
        external: {
          provider: "telegram",
          value: fileId,
          kind: "provider_file_id",
        },
        agentId: logicalAgentId,
        origin: "channel_ingested",
        direction: "inbound",
        channel: {
          provider: "telegram",
          accountId: message.accountId,
          targetId: message.targetId,
          threadId: message.threadId,
          providerMessageId: message.providerMessageId,
        },
        sourceText: message.text,
        sourceType: "channel-message",
        sourceId: [
          "telegram",
          message.accountId,
          message.targetId,
          message.threadId,
          message.providerMessageId,
          fileId,
        ].filter(Boolean).join(":"),
        metadata: {
          telegramMediaType: candidate.key,
          fileUniqueId: typeof value.file_unique_id === "string" ? value.file_unique_id : undefined,
        },
      });
    }
  }

  function prepareMessageDocuments(
    sessionId: string,
    message: Parameters<SessionStore["appendMessage"]>[1],
  ): Parameters<SessionStore["appendMessage"]>[1] {
    const directDocuments = Array.isArray(message.documents) ? [...message.documents] : [];
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    if (attachments.length === 0) {
      return {
        ...message,
        ...(directDocuments.length > 0 ? { documents: directDocuments } : {}),
      };
    }

    const uploadedDocuments: DocumentRef[] = [];
    const legacyAttachments: Attachment[] = [];

    for (const attachment of attachments) {
      if (typeof attachment.data === "string" && attachment.data.trim()) {
        const document = documentStore.upload({
          name: attachment.name,
          mimeType: attachment.mimeType,
          data: attachment.data,
          origin: "user_upload",
          workspaceId: options.workspace.workspaceId,
          ...(options.workspace.projectId ? { projectId: options.workspace.projectId } : {}),
          agentId: options.workspace.agentId,
          sessionId,
        });
        registerDocumentMedia(document, message.role === "assistant" ? "outbound" : message.role === "user" ? "inbound" : "internal");
        uploadedDocuments.push({
          documentId: document.documentId,
          name: document.name,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          ...(document.sha256 ? { sha256: document.sha256 } : {}),
        });
        continue;
      }
      legacyAttachments.push(attachment);
    }

    const legacyDocuments = legacyAttachments.length > 0
      ? resolveLegacyDocumentRefs(message.id ?? `legacy-${sessionId}`, legacyAttachments)
      : [];

    return {
      ...message,
      ...(legacyAttachments.length > 0 ? { attachments: legacyAttachments } : {}),
      documents: [...directDocuments, ...uploadedDocuments, ...legacyDocuments],
    };
  }

  function sanitizeSessionPart(value: string): string {
    return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "default";
  }

  function hashSessionPart(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 16);
  }

  function resolveChannelSessionKey(input: {
    provider: string;
    accountId?: string;
    targetId: string;
    threadId?: string | number;
  }): string {
    return [
      input.provider,
      input.accountId ?? "default",
      input.targetId,
      input.threadId === undefined ? "chat" : `topic:${String(input.threadId)}`,
    ].join(":");
  }

  function resolveChannelSessionId(input: {
    provider: string;
    accountId?: string;
    targetId: string;
    threadId?: string | number;
  }): string {
    const key = resolveChannelSessionKey(input);
    return `channel-${sanitizeSessionPart(input.provider)}-${sanitizeSessionPart(input.targetId)}-${hashSessionPart(key)}`;
  }

  function resolveChannelMessageId(input: {
    provider: string;
    accountId?: string;
    targetId: string;
    threadId?: string | number;
    direction: "inbound" | "outbound";
    providerMessageId?: string;
    content: string;
  }): string {
    const stablePart = input.providerMessageId?.trim()
      || hashSessionPart(`${input.direction}:${input.content}`);
    return `channel-${hashSessionPart([
      resolveChannelSessionKey(input),
      input.direction,
      stablePart,
    ].join(":"))}`;
  }

  function appendChannelSessionMessage(input: {
    provider: string;
    accountId?: string;
    targetId: string;
    threadId?: string | number;
    direction: "inbound" | "outbound";
    role?: "user" | "assistant";
    content: string;
    providerMessageId?: string;
    senderId?: string;
    senderLabel?: string;
    metadata?: Record<string, unknown>;
    createdAt?: number;
  }): ReturnType<SessionStore["appendMessageOnce"]> & { sessionId: string } {
    const sessionId = resolveChannelSessionId(input);
    if (input.direction === "outbound" && input.providerMessageId) {
      const existing = sessionStore.getSession(sessionId);
      const duplicate = existing?.messages.some((message) => (
        message.role === (input.role ?? "assistant")
        && message.content.trim() === input.content.trim()
        && message.metadata?.provider === input.provider
        && message.metadata?.accountId === (input.accountId ?? "default")
        && message.metadata?.targetId === input.targetId
        && message.metadata?.direction === "outbound"
        && (input.threadId === undefined || message.metadata?.threadId === String(input.threadId))
      ));
      if (duplicate && existing) {
        return { sessionId, session: existing, appended: false };
      }
    }
    const id = resolveChannelMessageId(input);
    const message = prepareMessageDocuments(sessionId, {
      id,
      role: input.role ?? (input.direction === "outbound" ? "assistant" : "user"),
      content: input.content,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      metadata: {
        source: "channel",
        provider: input.provider,
        accountId: input.accountId ?? "default",
        targetId: input.targetId,
        ...(input.threadId !== undefined ? { threadId: String(input.threadId) } : {}),
        direction: input.direction,
        ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
        ...(input.senderId ? { senderId: input.senderId } : {}),
        ...(input.senderLabel ? { senderLabel: input.senderLabel } : {}),
        ...(input.metadata ?? {}),
      },
    });
    return {
      sessionId,
      ...sessionStore.appendMessageOnce(sessionId, message),
    };
  }

  function backfillChannelSession(input: {
    provider: string;
    accountId?: string;
    targetId: string;
    threadId?: string | number;
    limit?: number;
    excludeProviderMessageIds?: string[];
  }): ReturnType<SessionStore["getSession"]> {
    const sessionId = resolveChannelSessionId(input);
    const threadKey = input.threadId === undefined ? undefined : String(input.threadId);
    const excludedProviderMessageIds = new Set(input.excludeProviderMessageIds ?? []);
    const records = channelsRegistry.messages.read({
      provider: input.provider,
      accountId: input.accountId,
      targetId: input.targetId,
      limit: input.limit ?? 50,
    })
      .filter((message) => (
        message.threadId === threadKey
        && !!message.text?.trim()
        && !(message.providerMessageId && excludedProviderMessageIds.has(message.providerMessageId))
      ))
      .reverse();

    for (const record of records) {
      const parsedCreatedAt = Date.parse(record.receivedAt ?? record.sentAt ?? record.createdAt);
      appendChannelSessionMessage({
        provider: record.provider,
        accountId: record.accountId,
        targetId: record.targetId,
        ...(record.threadId !== undefined ? { threadId: record.threadId } : {}),
        direction: record.direction,
        content: record.text?.trim() ?? "",
        ...(record.providerMessageId ? { providerMessageId: record.providerMessageId } : {}),
        ...(record.senderId ? { senderId: record.senderId } : {}),
        ...(record.senderLabel ? { senderLabel: record.senderLabel } : {}),
        ...(!Number.isNaN(parsedCreatedAt) ? { createdAt: parsedCreatedAt } : {}),
        metadata: {
          backfilled: true,
        },
      });
    }

    return sessionStore.getSession(sessionId);
  }

  async function resolveSessionDocumentAssets(documents: DocumentRef[]): Promise<Array<{
    name: string;
    mimeType: string;
    data: string;
  }>> {
    const assets: Array<{ name: string; mimeType: string; data: string }> = [];
    for (const document of documents) {
      const downloaded = documentStore.download(document.documentId);
      if (!downloaded) continue;
      assets.push({
        name: downloaded.document.name,
        mimeType: downloaded.document.mimeType,
        data: downloaded.buffer.toString("base64"),
      });
    }
    return assets;
  }

  function searchDocumentsLocally(input: { query: string; limit?: number; sessionId?: string }): DocumentSearchResult[] {
    return documentStore.search(input);
  }

  async function searchDocumentsWithOpenClawMemory(input: { query: string; limit?: number; sessionId?: string }): Promise<DocumentSearchResult[]> {
    const hits = await runOpenClawMemorySearch(input.query, processHost, {
      agentId: runtimeAgentId,
      limit: input.limit,
      env: resolvedRuntimeOptions.env,
    });

    const bestHitByDocument = new Map<string, DocumentSearchResult>();
    for (const hit of hits) {
      const documentId = extractDocumentIdFromSourcePath(hit.path);
      if (!documentId) continue;
      const document = documentStore.get(documentId);
      if (!document) continue;
      if (input.sessionId && document.sessionId !== input.sessionId) continue;

      const candidate: DocumentSearchResult = {
        ...document,
        snippet: hit.text,
        score: hit.score ?? 0,
        ...(hit.path ? { sourcePath: hit.path } : {}),
        ...(typeof hit.startLine === "number" ? { startLine: hit.startLine } : {}),
        ...(typeof hit.endLine === "number" ? { endLine: hit.endLine } : {}),
      };

      const existing = bestHitByDocument.get(documentId);
      if (!existing || candidate.score > existing.score) {
        bestHitByDocument.set(documentId, candidate);
      }
    }

    return [...bestHitByDocument.values()]
      .sort((left, right) => (
        right.score - left.score
        || right.createdAt - left.createdAt
        || left.documentId.localeCompare(right.documentId)
      ))
      .slice(0, Math.max(1, input.limit ?? 20));
  }

  async function searchDocuments(input: { query: string; limit?: number; sessionId?: string }): Promise<DocumentSearchResult[]> {
    const normalizedQuery = input.query.trim();
    if (!normalizedQuery) return [];
    if (adapter.id === "openclaw") {
      try {
        const memoryHits = await searchDocumentsWithOpenClawMemory({ ...input, query: normalizedQuery });
        if (memoryHits.length > 0) return memoryHits;
      } catch {
        // Fall back to local index search when OpenClaw memory is unavailable or not configured.
      }
    }
    return searchDocumentsLocally({ ...input, query: normalizedQuery });
  }

  async function searchSessionsWithOpenClawMemory(input: SessionSearchInput): Promise<SessionSearchResult[]> {
    const hits = await runOpenClawMemorySearch(input.query, processHost, {
      agentId: runtimeAgentId,
      limit: input.limit,
      minScore: input.minScore,
      env: resolvedRuntimeOptions.env,
    });

    const bestHitBySession = new Map<string, SessionSearchResult>();
    for (const hit of hits) {
      const sessionId = extractSessionIdFromSourcePath(hit.path);
      if (!sessionId) continue;
      const session = sessionStore.getSession(sessionId);
      if (!session) continue;

      const candidate: SessionSearchResult = {
        sessionId: session.sessionId,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messageCount,
        preview: session.preview,
        snippet: hit.text,
        score: hit.score ?? 0,
        strategy: "openclaw-memory",
        matchedFields: ["memory"],
        ...(hit.path ? { sourcePath: hit.path } : {}),
        ...(typeof hit.startLine === "number" ? { startLine: hit.startLine } : {}),
        ...(typeof hit.endLine === "number" ? { endLine: hit.endLine } : {}),
      };

      const existing = bestHitBySession.get(sessionId);
      if (!existing || candidate.score > existing.score) {
        bestHitBySession.set(sessionId, candidate);
      }
    }

    return [...bestHitBySession.values()]
      .sort((left, right) => (
        right.score - left.score
        || right.updatedAt - left.updatedAt
        || right.createdAt - left.createdAt
        || right.sessionId.localeCompare(left.sessionId)
      ))
      .slice(0, Math.max(1, input.limit ?? 20));
  }

  async function searchSessions(input: SessionSearchInput): Promise<SessionSearchResult[]> {
    const normalizedInput: SessionSearchInput = {
      strategy: "auto",
      includeMessages: true,
      fallbackToLocal: true,
      limit: 20,
      ...input,
      query: input.query.trim(),
    };

    if (!normalizedInput.query) {
      return [];
    }

    const strategy = normalizedInput.strategy ?? "auto";
    if (strategy === "local") {
      return searchSessionsLocally(normalizedInput);
    }

    if (strategy === "openclaw-memory" || strategy === "auto") {
      const canUseOpenClawMemory = adapter.id === "openclaw";
      if (canUseOpenClawMemory) {
        try {
          const results = await searchSessionsWithOpenClawMemory(normalizedInput);
          if (results.length > 0 || normalizedInput.fallbackToLocal === false) {
            return results;
          }
        } catch (error) {
          if (strategy === "openclaw-memory" && normalizedInput.fallbackToLocal === false) {
            throw error;
          }
        }
      } else if (strategy === "openclaw-memory" && normalizedInput.fallbackToLocal === false) {
        throw new Error(`openclaw-memory search requires the openclaw adapter, received ${adapter.id}`);
      }
    }

    return searchSessionsLocally(normalizedInput);
  }



  return {
    searchSessionsLocally,
    mediaKindFromMime,
    mediaKindFromTelegram,
    mediaKindFromChannel,
    parseMediaStorageUrl,
    readDocumentIndexText,
    registerDocumentMedia,
    registerGeneratedMedia,
    registerImageMedia,
    registerVoiceNoteMedia,
    registerOutboundChannelMedia,
    registerInboundTelegramMedia,
    prepareMessageDocuments,
    sanitizeSessionPart,
    hashSessionPart,
    resolveChannelSessionKey,
    resolveChannelSessionId,
    resolveChannelMessageId,
    appendChannelSessionMessage,
    backfillChannelSession,
    resolveSessionDocumentAssets,
    searchDocumentsLocally,
    searchDocumentsWithOpenClawMemory,
    searchDocuments,
    searchSessionsWithOpenClawMemory,
    searchSessions,
  };
}
