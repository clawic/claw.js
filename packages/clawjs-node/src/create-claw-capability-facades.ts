// @ts-nocheck
export function createClawCapabilityFacades(locals: Record<string, any>): Record<string, any> {
  const {
    rulesStore,
    guidanceStore,
    resourceRegistryStore,
    logicalAgentId,
    readSkills,
    persistSkillsState,
    adapter,
    processHost,
    resolvedRuntimeOptions,
    appendAuditEvent,
    eventBus,
    readSkillSources,
    searchSkillCatalog,
    installSkillFromSource,
    patchSkillIntentEntry,
    refreshObservedDomain,
    skillsV2Store,
    skillsV2SyncEngine,
    skillsV2Importer,
    compileSkillsV2,
    generateSkillsV2Builtins,
    soulStore,
    libraryStore,
    options,
    syncLibraryAssets,
    generationStore,
    registerGenerationBackend,
    removeGenerationBackend,
    createGenerationRecord,
    removeGenerationRecord,
    imageBackends,
    createImageRecord,
    editImageRecord,
    imageStore,
    registerImageMedia,
    listImageRecords,
    getImageRecord,
    removeImageRecord,
    createTypedGenerationFacade,
    resolveTtsInput,
    synthesize,
    readSpeechConfig,
    writeSpeechConfig,
    listTtsProviders,
    getTtsCatalog,
    normalizeTtsConfig,
    stripMarkdownForTts,
    segmentTextForTts,
    createTtsPlaybackPlan,
    transcribeAudio,
    resolveSttInput,
    readSttConfig,
    writeSttConfig,
    listSttProviders,
    normalizeSttConfig,
    voiceNoteStore,
    registerVoiceNoteMedia,
    generateRuntimeText,
    runtimeAgentId,
    mergeRulesContextBlocks,
    resolveSessionDocumentAssets,
    sessionAdapter,
    prepareMessageDocuments,
    sessionStore,
    listSecrets,
    secretsEnv,
    describeSecret,
    listSecretTypes,
    getSecretCapabilities,
    listSecretActions,
    brokerSecretHttp,
    runSecretAction,
    listSecretLeases,
    doctorKeychain,
    ensureHttpSecretReference,
    ensureTelegramBotSecretReference,
    requireNotifyClient,
    sourceNotifyClient,
    clientNotifyClient,
    timeClient,
    requireTimeClient,
  } = locals;

  return {
    rules: {
      status: () => rulesStore.status(),
      list: (input = {}) => rulesStore.list(input),
      get: (id) => rulesStore.get(id),
      scopes: () => rulesStore.scopes(),
      upsertScope: (input) => rulesStore.upsertScope(input),
      propose: (input) => rulesStore.propose(input),
      approve: (id) => rulesStore.approve(id),
      archive: (id) => rulesStore.archive(id),
      compile: (input) => rulesStore.compile({
        ...input,
        agent: input.agent ?? logicalAgentId,
      }),
    },
    guidance: {
      status: () => guidanceStore.status(),
      list: (input = {}) => guidanceStore.list(input),
      show: (id) => guidanceStore.get(id),
      create: (input) => guidanceStore.create(input),
      archive: (id) => guidanceStore.archive(id),
      match: (input) => guidanceStore.match({
        ...input,
        agent: input.agent ?? logicalAgentId,
      }),
    },
    resources: {
      list: (input = {}) => resourceRegistryStore.list(input),
      register: (input) => resourceRegistryStore.register(input),
      show: (id) => resourceRegistryStore.get(id),
      resolve: (id) => resourceRegistryStore.resolve(id),
      status: (id) => resourceRegistryStore.status(id),
      read: (id, input = {}) => resourceRegistryStore.read(id, input),
    },
    skills: {
      list: async () => {
        const skills = await readSkills();
        persistSkillsState(skills);
        return skills;
      },
      sync: async () => {
        const skills = await adapter.syncSkills(processHost, resolvedRuntimeOptions);
        persistSkillsState(skills);
        appendAuditEvent("skills.synced", "skills", { count: skills.length, runtimeAdapter: adapter.id });
        eventBus.emit("skills.synced", { count: skills.length, runtimeAdapter: adapter.id });
        return skills;
      },
      sources: async () => readSkillSources(),
      search: async (query, options = {}) => searchSkillCatalog(query, options),
      install: async (ref, options = {}) => {
        const result = await installSkillFromSource(ref, options);
        patchSkillIntentEntry({
          id: result.slug,
          enabled: true,
          installRef: result.installRef,
          source: result.source,
          label: result.label,
        });
        await refreshObservedDomain("skills");
        return result;
      },

      // ─── Skills v2 (unified, agentskills.io-compatible) ────────────────
      listV2: (filter) => skillsV2Store.list(filter),
      get: (slug) => skillsV2Store.get(slug),
      searchV2: (query, options) => skillsV2Store.search(query, options),
      resolveActive: (ctx = {}) => skillsV2Store.resolveActive(ctx),
      create: (input) => {
        const created = skillsV2Store.create(input);
        eventBus.emit("skills.created", { slug: created.slug, kind: created.kind });
        return created;
      },
      update: (slug, patch) => {
        const updated = skillsV2Store.update(slug, patch);
        eventBus.emit("skills.updated", { slug: updated.slug });
        return updated;
      },
      removeV2: (slug) => {
        const removed = skillsV2Store.remove(slug);
        if (removed) eventBus.emit("skills.removed", { slug });
        return removed;
      },
      activate: (slug, scope, opts = {}) => {
        const assignment = skillsV2Store.activate(slug, scope, opts);
        eventBus.emit("skills.activated", { slug, scope: scope.kind });
        return assignment;
      },
      deactivate: (slug, scope) => {
        const removed = skillsV2Store.deactivate(slug, scope);
        if (removed) eventBus.emit("skills.deactivated", { slug, scope: scope.kind });
        return removed;
      },
      instantiate: (templateSlug, params, opts = {}) => skillsV2Store.instantiate(templateSlug, params, opts),
      freeze: (instanceSlug) => skillsV2Store.freeze(instanceSlug),
      syncV2: (opts = {}) => skillsV2SyncEngine.sync(opts),
      syncTargets: () => skillsV2Store.syncTargets(),
      registerSyncTarget: (target) => skillsV2Store.registerSyncTarget(target),
      importExternal: (opts = {}) => skillsV2Importer.importExternal(opts),
      compile: (slugs) => compileSkillsV2(skillsV2Store, slugs),
      initBuiltins: () => generateSkillsV2Builtins(skillsV2Store, soulStore),
    },
    library: {
      list: () => libraryStore.list(),
      get: (id) => libraryStore.get(id),
      create: (input) => libraryStore.create(input),
      update: (id, patch) => libraryStore.update(id, patch),
      remove: (id) => libraryStore.remove(id),
      importSkill: (ref, importOptions = {}) => libraryStore.importSkill(ref, importOptions),
      createInstruction: (input) => libraryStore.createInstruction(input),
      createBundle: (input) => libraryStore.createBundle(input),
      assign: (input) => libraryStore.assign(input),
      unassign: (input) => libraryStore.unassign(input),
      resolve: (input = {}) => libraryStore.resolve({
        agentId: input.agentId ?? logicalAgentId,
        workspaceId: input.workspaceId ?? options.workspace.workspaceId,
        tags: input.tags,
        availableSecrets: input.availableSecrets,
      }),
      resolveSkillCapsules: (input = {}) => libraryStore.resolveSkillCapsules({
        agentId: input.agentId ?? logicalAgentId,
        workspaceId: input.workspaceId ?? options.workspace.workspaceId,
        tags: input.tags,
        availableSecrets: input.availableSecrets,
        includeDefault: input.includeDefault,
      }),
      sync: (input = {}) => syncLibraryAssets(input),
    },
    generations: {
      backends: () => generationStore.listBackends(),
      registerCommandBackend: (input) => registerGenerationBackend(input),
      removeBackend: (id) => removeGenerationBackend(id),
      create: async (input) => createGenerationRecord(input),
      list: (query) => generationStore.list(query),
      get: (id) => generationStore.get(id),
      remove: (id) => removeGenerationRecord(id),
    },
    image: {
      backends: () => imageBackends(),
      create: (input) => createImageRecord(input),
      generate: (input) => createImageRecord(input),
      edit: (input) => editImageRecord(input),
      import: (input) => {
        const image = imageStore.importImage({
          ...input,
          workspaceId: options.workspace.workspaceId,
          agentId: logicalAgentId,
        });
        registerImageMedia(image);
        return image;
      },
      list: (query) => listImageRecords(query),
      search: (query) => listImageRecords(query),
      get: (id) => getImageRecord(id),
      remove: (id) => removeImageRecord(id),
    },
    audio: createTypedGenerationFacade("audio"),
    video: createTypedGenerationFacade("video"),
    tts: {
      synthesize: async (input) => {
        const resolvedInput = resolveTtsInput(input);
        const result = await synthesize(resolvedInput);
        appendAuditEvent("tts.synthesized", "channels", {
          provider: resolvedInput.provider ?? "local",
          textLength: resolvedInput.text.length,
        });
        eventBus.emit("tts.synthesized", {
          provider: resolvedInput.provider ?? "local",
          textLength: resolvedInput.text.length,
        });
        return result;
      },
      config: () => readSpeechConfig(),
      setConfig: (input) => writeSpeechConfig(input),
      providers: () => listTtsProviders(),
      catalog: () => getTtsCatalog(),
      normalizeConfig: (input) => normalizeTtsConfig(input),
      stripMarkdown: (text) => stripMarkdownForTts(text),
      segmentText: (text, options) => segmentTextForTts(text, options),
      createPlaybackPlan: (input) => createTtsPlaybackPlan(input),
    },
    stt: {
      transcribe: async (input) => transcribeAudio(resolveSttInput(input)),
      config: () => readSttConfig(),
      setConfig: (input) => writeSttConfig(input),
      providers: () => listSttProviders(),
      normalizeConfig: (input) => normalizeSttConfig(input),
    },
    voiceNotes: {
      create: (input) => {
        const note = voiceNoteStore.create(input);
        registerVoiceNoteMedia(note);
        return note;
      },
      registerPath: (input) => {
        const note = voiceNoteStore.registerPath(input);
        registerVoiceNoteMedia(note);
        return note;
      },
      list: (input) => voiceNoteStore.list(input),
      get: (id) => voiceNoteStore.get(id),
      download: (id) => voiceNoteStore.download(id),
      transcribe: async (id, input) => {
        const note = await voiceNoteStore.transcribe(id, input);
        registerVoiceNoteMedia(note);
        return note;
      },
    },
    inference: {
      generateText: async (input) => {
        if (!input.sessionId) {
          return generateRuntimeText({
            ...input,
            agentId: input.agentId ?? runtimeAgentId,
            contextBlocks: mergeRulesContextBlocks({
              sessionMessages: input.messages,
              contextBlocks: input.contextBlocks,
              ruleHints: input.ruleHints,
            }),
          }, {
            fetchImpl: input.transport === "cli" ? undefined : globalThis.fetch,
            runner: input.transport === "gateway" ? undefined : processHost,
            documentResolver: resolveSessionDocumentAssets,
            sessionAdapter: input.transport === "cli"
              ? { ...sessionAdapter, gateway: null }
              : sessionAdapter,
          });
        }

        for (const message of input.messages) {
          const preparedMessage = prepareMessageDocuments(input.sessionId, message);
          sessionStore.appendMessage(input.sessionId, preparedMessage);
        }
        const session = sessionStore.getSession(input.sessionId);
        const result = await generateRuntimeText({
          ...input,
          agentId: input.agentId ?? runtimeAgentId,
          messages: session?.messages ?? input.messages,
          contextBlocks: mergeRulesContextBlocks({
            sessionMessages: session?.messages ?? input.messages,
            contextBlocks: input.contextBlocks,
            ruleHints: input.ruleHints,
          }),
        }, {
          fetchImpl: input.transport === "cli" ? undefined : globalThis.fetch,
          runner: input.transport === "gateway" ? undefined : processHost,
          documentResolver: resolveSessionDocumentAssets,
          sessionAdapter: input.transport === "cli"
            ? { ...sessionAdapter, gateway: null }
            : sessionAdapter,
        });
        if (result.text) {
          sessionStore.appendMessage(input.sessionId, {
            role: "assistant",
            content: result.text,
          });
        }
        return result;
      },
    },
    secrets: {
      list: async (search) => listSecrets(processHost, { search, env: secretsEnv }),
      describe: async (name) => describeSecret(processHost, { name, env: secretsEnv }),
      types: async (search) => listSecretTypes(processHost, { search, env: secretsEnv }),
      capabilities: async (name) => getSecretCapabilities(processHost, { name, env: secretsEnv }),
      actions: async (name) => listSecretActions(processHost, { name, env: secretsEnv }),
      brokerHttp: async (input) => brokerSecretHttp(processHost, input, { env: secretsEnv }),
      runAction: async (name, actionId) => runSecretAction(processHost, { name, actionId, env: secretsEnv }),
      leases: async () => listSecretLeases(processHost, { env: secretsEnv }),
      doctorKeychain: async () => doctorKeychain(processHost, { env: secretsEnv }),
      ensureHttpReference: async (input) => ensureHttpSecretReference(processHost, input, { env: secretsEnv }),
      ensureTelegramBotReference: async (input) => ensureTelegramBotSecretReference(processHost, input, { env: secretsEnv }),
    },
    notify: {
      send: async (input) => requireNotifyClient("source").send(input),
      cancel: async (notificationId) => requireNotifyClient("source").cancel(notificationId),
      receipt: async (receiptId) => {
        const client = sourceNotifyClient ?? clientNotifyClient;
        if (!client) {
          throw new Error("notify client is not configured. Set CreateClawOptions.notify with baseUrl and a token.");
        }
        return await client.receipt(receiptId);
      },
      feed: async (limit) => requireNotifyClient("client").feed(limit),
      markRead: async (notificationId) => requireNotifyClient("client").markRead(notificationId),
      acknowledgeReceipt: async (receiptId) => requireNotifyClient("client").acknowledgeReceipt(receiptId),
      updatePushToken: async (installationId, pushToken) => requireNotifyClient("client").updatePushToken(installationId, pushToken),
      putGlance: async (scope, input) => requireNotifyClient("source").putGlance(scope, input),
      subscriptions: {
        upsert: async (input) => requireNotifyClient("client").upsertSubscription(input),
        remove: async (id) => requireNotifyClient("client").deleteSubscription(id),
      },
    },
    time: {
      configured: Boolean(timeClient),
      list: async (filters) => requireTimeClient().list(filters),
      get: async (id) => requireTimeClient().get(id),
      create: async (input) => requireTimeClient().create(input),
      update: async (id, input) => requireTimeClient().update(id, input),
      delete: async (id) => requireTimeClient().delete(id),
      pause: async (id) => requireTimeClient().pause(id),
      resume: async (id) => requireTimeClient().resume(id),
      runNow: async (id) => requireTimeClient().runNow(id),
      listExecutions: async (itemId) => requireTimeClient().listExecutions(itemId),
      listRunLog: async (itemId, limit) => requireTimeClient().listRunLog(itemId, limit),
      calendarView: async (input) => requireTimeClient().calendarView(input),
      timelineView: async (input) => requireTimeClient().timelineView(input),
      signalAnchor: async (input) => requireTimeClient().signalAnchor(input),
    },
  };
}
