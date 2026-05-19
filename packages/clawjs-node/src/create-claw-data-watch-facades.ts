// @ts-nocheck
export function createClawDataWatchFacades(locals: Record<string, any>): Record<string, any> {
  const {
    channelRunStore,
    searchSessions,
    documentStore,
    searchDocuments,
    options,
    registerDocumentMedia,
    mediaStore,
    storageStore,
    dataStore,
    adapter,
    processHost,
    resolvedRuntimeOptions,
    readWorkspaceManifest,
    workspaceDir,
    filesystem,
    validateWorkspace,
    readProviderAuth,
    readDefaultModel,
    buildOrchestrationSnapshot,
    watchFacade,
    watchWorkspaceFile,
    watchSessionTranscript,
    watchRuntimeStatus,
    watchProviderStatus,
    persistProviderState,
    eventBus,
  } = locals;

  return {
    channelRuns: {
      resolveOrCreateChannelRun: (input) => channelRunStore.resolveOrCreateChannelRun(input),
      enqueueChannelMessage: (runKey, message) => channelRunStore.enqueueChannelMessage(runKey, message),
      processChannelRun: (input) => channelRunStore.processChannelRun(input),
      getChannelRunStatus: (runKey) => channelRunStore.getChannelRunStatus(runKey),
      requestChannelRunStop: (runKey) => channelRunStore.requestChannelRunStop(runKey),
      compactChannelSession: (input) => channelRunStore.compactChannelSession(input),
      drainQueuedChannelMessages: (runKey) => channelRunStore.drainQueuedChannelMessages(runKey),
      resetChannelRun: (input) => channelRunStore.resetChannelRun(input),
    },
    conversations: {
      searchSessions,
    },
    documents: {
      list: async (options) => documentStore.list(options),
      get: async (documentId) => documentStore.get(documentId),
      search: async (input) => searchDocuments(input),
      upload: async (input) => {
        const document = documentStore.upload({
          ...input,
          workspaceId: options.workspace.workspaceId,
          ...(options.workspace.projectId ? { projectId: options.workspace.projectId } : {}),
          agentId: options.workspace.agentId,
        });
        registerDocumentMedia(document);
        return document;
      },
      register: async (input) => {
        const document = documentStore.registerPath({
          ...input,
          workspaceId: options.workspace.workspaceId,
          ...(options.workspace.projectId ? { projectId: options.workspace.projectId } : {}),
          agentId: options.workspace.agentId,
        });
        registerDocumentMedia(document);
        return document;
      },
      beginUpload: async (input) => documentStore.beginUpload({
        ...input,
        workspaceId: options.workspace.workspaceId,
        ...(options.workspace.projectId ? { projectId: options.workspace.projectId } : {}),
        agentId: options.workspace.agentId,
      }),
      appendUploadChunk: async (uploadId, chunkBase64) => documentStore.appendUploadChunk(uploadId, chunkBase64),
      commitUpload: async (uploadId) => {
        const document = documentStore.commitUpload(uploadId);
        registerDocumentMedia(document);
        return document;
      },
      download: async (documentId) => documentStore.download(documentId),
      resolveRefs: async (documentIds) => documentStore.resolveRefs(documentIds),
    },
    media: {
      register: (input) => mediaStore.register(input),
      list: (input) => mediaStore.list(input),
      search: (input) => mediaStore.search(input),
      get: (mediaId) => mediaStore.get(mediaId),
      download: (mediaId) => mediaStore.download(mediaId),
      share: {
        create: async (input) => input.mediaId
          ? await mediaStore.createObjectShare({
              mediaId: input.mediaId,
              label: input.label,
              legalLabel: input.legalLabel,
              approvalId: input.approvalId,
              expiresAt: input.expiresAt,
              ttlMs: input.ttlMs,
            })
          : mediaStore.createGalleryShare({
              label: input.label,
              legalLabel: input.legalLabel,
              approvalId: input.approvalId,
              filters: input.filters,
              expiresAt: input.expiresAt,
              ttlMs: input.ttlMs,
            }),
        revoke: (id) => mediaStore.revokeShare(id),
        list: () => mediaStore.listShares(),
        resolveGallery: (id) => mediaStore.resolveGalleryShare(id),
      },
    },
    storage: {
      put: (input) => storageStore.put(input),
      get: (ref) => storageStore.get(ref),
      head: (ref) => storageStore.head(ref),
      list: (input) => storageStore.list(input),
      delete: (ref) => storageStore.delete(ref),
      readText: (ref) => storageStore.readText(ref),
      writeText: (input) => storageStore.writeText(input),
      exportToFile: (ref) => storageStore.exportToFile(ref),
      tokens: {
        issue: (input) => storageStore.issueToken(input),
        list: () => storageStore.listTokens(),
        revoke: (id) => storageStore.revokeToken(id),
      },
      share: {
        create: (input) => storageStore.createShare(input),
        revoke: (id) => storageStore.revokeShare(id),
        list: () => storageStore.listShares(),
      },
    },
    data: dataStore,
    orchestration: {
      snapshot: async () => {
        const status = await adapter.getStatus(processHost, resolvedRuntimeOptions);
        const compat = adapter.buildCompatReport(status);
        const doctor = adapter.buildDoctorReport(status);
        const manifest = readWorkspaceManifest(workspaceDir, filesystem);
        const workspaceValidation = validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles);
        const authSummaries = await readProviderAuth() as Record<string, ProviderAuthSummary>;
        const authReady = Object.values(authSummaries).some((summary) => summary.hasAuth);
        const modelReady = !!(await readDefaultModel());

        return buildOrchestrationSnapshot({
          runtime: status,
          compat,
          doctor,
          workspaceReady: !!manifest && workspaceValidation.ok,
          authReady,
          modelReady,
          fileSyncReady: !!options.templates?.pack,
        });
      },
    },
    watch: {
      ...watchFacade,
      file: (fileName, callback, watchOptions) => watchWorkspaceFile(workspaceDir, fileName, callback, watchOptions),
      transcript: (sessionId, callback, watchOptions) => watchSessionTranscript(workspaceDir, sessionId, callback, watchOptions),
      runtimeStatus: (callback, watchOptions) => watchRuntimeStatus(
        () => adapter.getStatus(processHost, resolvedRuntimeOptions),
        callback,
        watchOptions,
      ),
      providerStatus: (callback, watchOptions) => watchProviderStatus(
        async () => {
          const summaries = await readProviderAuth();
          persistProviderState(summaries, []);
          return summaries;
        },
        callback,
        watchOptions,
      ),
      events: (type, listener) => eventBus.on(type, listener),
      eventsIterator: (type = "*") => eventBus.iterate(type),
    },
  };
}
