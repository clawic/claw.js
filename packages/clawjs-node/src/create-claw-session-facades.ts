// @ts-nocheck
export function createClawSessionFacades(locals: Record<string, any>): Record<string, any> {
  const {
    sessionStore,
    appendAuditEvent,
    eventBus,
    prepareMessageDocuments,
    resolveChannelSessionId,
    appendChannelSessionMessage,
    backfillChannelSession,
    searchSessions,
    generateRuntimeSessionTitle,
    sessionAdapter,
    processHost,
    runtimeAgentId,
    mergeRulesContextBlocks,
    streamRuntimeSessionEvents,
    streamRuntimeSession,
    resolveSessionDocumentAssets,
  } = locals;

  return {
    sessions: {
            inspect: async (input) => callManagedClawJsBridge("clawjs.sessions.inspect", input),
          },
          subagent: {
            run: async (input) => callManagedClawJsBridge("clawjs.subagent.run", input),
            wait: async (input) => callManagedClawJsBridge("clawjs.subagent.wait", input),
            messages: async (input) => callManagedClawJsBridge("clawjs.subagent.messages", input),
          },
          hooks: {
            status: async () => callManagedClawJsBridge("clawjs.hooks.status"),
            list: async () => {
              assertOpenClawPluginBridgeSupport();
              return listOpenClawHooks(processHost, resolvedRuntimeOptions);
            },
          },
          context: {
            status: async () => callManagedClawJsBridge("clawjs.context.status"),
          },
          doctor: async () => callManagedClawJsBridge("clawjs.doctor"),
        },
        get clawjs() {
          return this.claw;
        },
      },
      openclaw: {
        sessions: {
          list: async (input = {}) => {
            assertOpenClawGatewaySupport();
            return callOpenClawGateway("sessions.list", input, {
              runner: processHost,
              ...gatewayConfigOptions(),
            });
          },
          preview: async (input = {}) => {
            assertOpenClawGatewaySupport();
            return callOpenClawGateway("sessions.preview", input, {
              runner: processHost,
              ...gatewayConfigOptions(),
            });
          },
          resolve: async (input = {}) => {
            assertOpenClawGatewaySupport();
            return callOpenClawGateway("sessions.resolve", input, {
              runner: processHost,
              ...gatewayConfigOptions(),
            });
          },
        },
        chat: {
          history: async (input) => {
            assertOpenClawGatewaySupport();
            return callOpenClawGateway("chat.history", input, {
              runner: processHost,
              ...gatewayConfigOptions(),
            });
          },
          send: async (input) => {
            assertOpenClawGatewaySupport();
            return callOpenClawGateway("chat.send", input, {
              runner: processHost,
              ...gatewayConfigOptions(),
            });
          },
          inject: async (input) => {
            assertOpenClawGatewaySupport();
            return callOpenClawGateway("chat.inject", input, {
              runner: processHost,
              ...gatewayConfigOptions(),
            });
          },
          abort: async (input) => {
            assertOpenClawGatewaySupport();
            return callOpenClawGateway("chat.abort", input, {
              runner: processHost,
              ...gatewayConfigOptions(),
            });
          },
        },
      },
      install: async (installer = "npm", onProgress) => {
        await adapter.install(processHost, installer, handleRuntimeProgress(onProgress));
        appendAuditEvent("runtime.installed", "runtime", { installer, runtimeAdapter: adapter.id });
        eventBus.emit("runtime.installed", { installer, runtimeAdapter: adapter.id });
      },
      uninstall: async (installer = "npm", onProgress) => {
        await adapter.uninstall(processHost, installer, handleRuntimeProgress(onProgress));
        appendAuditEvent("runtime.uninstalled", "runtime", { installer, runtimeAdapter: adapter.id });
        eventBus.emit("runtime.uninstalled", { installer, runtimeAdapter: adapter.id });
      },
      repair: async (onProgress) => {
        await adapter.repair(processHost, handleRuntimeProgress(onProgress));
        appendAuditEvent("runtime.repaired", "runtime", { runtimeAdapter: adapter.id });
        eventBus.emit("runtime.repaired", { runtimeAdapter: adapter.id });
      },
      setupWorkspace: async (onProgress) => {
        await adapter.setupWorkspace({
          agentId: runtimeAgentId,
          workspaceDir,
        }, processHost, handleRuntimeProgress(onProgress));
        appendAuditEvent("runtime.workspace_setup", "runtime", {
          agentId: runtimeAgentId,
          workspaceDir,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("runtime.workspace_setup", {
          agentId: runtimeAgentId,
          workspaceDir,
          runtimeAdapter: adapter.id,
        });
      },
      installCommand: (installer = "npm") => adapter.buildInstallCommand(installer),
      uninstallCommand: (installer = "npm") => adapter.buildUninstallCommand(installer),
      repairCommand: () => adapter.buildRepairCommand(),
      setupWorkspaceCommand: () => adapter.buildWorkspaceSetupCommand({
        agentId: runtimeAgentId,
        workspaceDir,
      }),
      installPlan: (installer = "npm") => adapter.buildProgressPlan("install", undefined, installer),
      uninstallPlan: (installer = "npm") => adapter.buildProgressPlan("uninstall", undefined, installer),
      repairPlan: () => adapter.buildProgressPlan("repair"),
      setupWorkspacePlan: () => adapter.buildProgressPlan("setup", {
        agentId: runtimeAgentId,
        workspaceDir,
      }),
      discoverContext: (discoverOptions = {}) => adapter.id === "openclaw"
        ? discoverOpenClawAppContext({
          ...openClawContextDefaults(),
          ...discoverOptions,
        })
        : null,
      detachWorkspace: async (detachOptions = {}) => adapter.id === "openclaw"
        ? detachOpenClawAppContext({
          ...openClawContextDefaults(),
          ...detachOptions,
        })
        : null,
    },
    workspace: {
      init: async () => {
        await ensureWorkspaceInitialized();
      },
      attach: async () => attachWorkspace(workspaceDir, filesystem),
      validate: async () => {
        const validation = validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles);
        persistWorkspaceState(validation);
        return validation;
      },
      repair: async () => {
        const repaired = repairWorkspace(options.workspace, adapter.id, filesystem, options.templates?.pack, adapter.workspaceFiles);
        persistWorkspaceState(validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles));
        appendAuditEvent("workspace.repaired", "workspace", {
          createdDirectories: repaired.createdDirectories.length,
          createdRuntimeFiles: repaired.createdRuntimeFiles.length,
          compatSnapshotMigrated: repaired.compatSnapshotMigrated,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("workspace.repaired", {
          createdDirectories: repaired.createdDirectories.length,
          createdRuntimeFiles: repaired.createdRuntimeFiles.length,
          compatSnapshotMigrated: repaired.compatSnapshotMigrated,
          runtimeAdapter: adapter.id,
        });
        return repaired;
      },
      previewReset: async (resetOptions) => buildWorkspaceResetPlan(workspaceDir, resetOptions, filesystem, adapter.workspaceFiles),
      reset: async (resetOptions) => {
        const result = resetWorkspace(workspaceDir, resetOptions, filesystem, adapter.workspaceFiles);
        appendAuditEvent("workspace.reset", "workspace", {
          ...result.options,
          removedPaths: result.removedPaths.length,
          preservedPaths: result.preservedPaths.length,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("workspace.reset", {
          workspaceId: options.workspace.workspaceId,
          ...result.options,
          removedPaths: result.removedPaths.length,
          preservedPaths: result.preservedPaths.length,
          runtimeAdapter: adapter.id,
        });
        return result;
      },
      listManagedFiles: async () => listManagedFiles(workspaceDir, adapter.workspaceFiles),
      canonicalPaths: () => buildCanonicalPathMap(workspaceDir, adapter.workspaceFiles),
      inspect: async () => ({
        manifestPath: resolveManifestPath(workspaceDir),
        compatSnapshotPath: resolveCompatSnapshotPath(workspaceDir),
        capabilityReportPath: resolveCapabilityReportPath(workspaceDir),
        bindingsPath: resolveBindingsPath(workspaceDir),
        settingsSchemaPath: resolveSettingsSchemaPath(workspaceDir),
        settingsValuesPath: resolveSettingsValuesPath(workspaceDir),
        workspaceStatePath: resolveWorkspaceStatePath(workspaceDir),
        providerStatePath: resolveProviderStatePath(workspaceDir),
        schedulerStatePath: resolveSchedulerStatePath(workspaceDir),
        memoryStatePath: resolveMemoryStatePath(workspaceDir),
        skillsStatePath: resolveSkillsStatePath(workspaceDir),
        channelsStatePath: resolveChannelsStatePath(workspaceDir),
        telegramStatePath: resolveTelegramStatePath(workspaceDir),
        intentPaths: {
          runtime: resolveIntentDomainPath(workspaceDir, "runtime"),
          models: resolveIntentDomainPath(workspaceDir, "models"),
          providers: resolveIntentDomainPath(workspaceDir, "providers"),
          channels: resolveIntentDomainPath(workspaceDir, "channels"),
          skills: resolveIntentDomainPath(workspaceDir, "skills"),
          plugins: resolveIntentDomainPath(workspaceDir, "plugins"),
          files: resolveIntentDomainPath(workspaceDir, "files"),
          sessions: resolveIntentDomainPath(workspaceDir, "sessions"),
          speech: resolveIntentDomainPath(workspaceDir, "speech"),
        },
        observedPaths: {
          runtime: resolveObservedDomainPath(workspaceDir, "runtime"),
          workspace: resolveObservedDomainPath(workspaceDir, "workspace"),
          models: resolveObservedDomainPath(workspaceDir, "models"),
          providers: resolveObservedDomainPath(workspaceDir, "providers"),
          channels: resolveObservedDomainPath(workspaceDir, "channels"),
          skills: resolveObservedDomainPath(workspaceDir, "skills"),
          plugins: resolveObservedDomainPath(workspaceDir, "plugins"),
          memory: resolveObservedDomainPath(workspaceDir, "memory"),
          scheduler: resolveObservedDomainPath(workspaceDir, "scheduler"),
          sessions: resolveObservedDomainPath(workspaceDir, "sessions"),
        },
        manifest: readWorkspaceManifest(workspaceDir, filesystem),
        compatSnapshot: readCompatSnapshot(workspaceDir, filesystem),
        capabilityReport: readCapabilityReport(workspaceDir, filesystem),
        workspaceState: readWorkspaceStateSnapshot(workspaceDir, filesystem),
        providerState: readProviderStateSnapshot(workspaceDir, filesystem),
        schedulerState: readSchedulerStateSnapshot(workspaceDir, filesystem),
        memoryState: readMemoryStateSnapshot(workspaceDir, filesystem),
        skillsState: readSkillsStateSnapshot(workspaceDir, filesystem),
        channelsState: readChannelsStateSnapshot(workspaceDir, filesystem),
        telegramState: readTelegramStateSnapshot(workspaceDir, filesystem),
        slackState: readSlackStateSnapshot(workspaceDir, filesystem),
        whatsappState: readWhatsAppStateSnapshot(workspaceDir, filesystem),
        intents: readAllIntentDomains(workspaceDir, filesystem),
        observed: readAllObservedDomains(workspaceDir, filesystem),
      }),
    },
    intent: {
      get: (domain) => readIntent(domain),
      set: (domain, value) => writeIntent(domain, value),
      patch: (domain, patch) => patchIntent(domain, patch),
      plan: async (planOptions) => planIntent(planOptions),
      apply: async (applyOptions) => applyIntent(applyOptions),
      diff: async (diffOptions) => diffIntent(diffOptions),
    },
    observed: {
      read: (domain) => domain
        ? readObservedDomain(workspaceDir, domain, filesystem)
        : readAllObservedDomains(workspaceDir, filesystem),
      refresh: async (refreshOptions) => refreshObserved(refreshOptions),
    },
    features: {
      describe: () => describeFeatures(),
    },
    files: {
      applyTemplatePack: async (templatePackPath = options.templates?.pack, applyOptions = {}) => {
        if (!templatePackPath) {
          throw new Error("templatePackPath is required");
        }
        const backupDir = resolveClawWorkspaceSurfacePath("claw.workspace.backups", workspaceDir);
        const result = applyTemplatePack(templatePackPath, {
          workspaceDir,
          backupDir,
          filesystem,
          ...applyOptions,
        });
        appendAuditEvent("files.template_pack_applied", "templates", { templatePackPath, changes: result.filter((entry) => entry.changed).length });
        eventBus.emit("files.template_pack_applied", {
          templatePackPath,
          changedCount: result.filter((entry) => entry.changed).length,
        });
        return result;
      },
      diffBinding: (binding, settings, render) => syncBinding({
        workspaceDir,
        binding,
        settings,
        render,
        filesystem,
        dryRun: true,
      }),
      syncBinding: (binding, settings, render) => {
        const result = syncBinding({
          workspaceDir,
          binding,
          settings,
          render,
          filesystem,
          backupDir: resolveClawWorkspaceSurfacePath("claw.workspace.backups", workspaceDir),
        });
        appendAuditEvent("files.binding_synced", "file_sync", {
          bindingId: binding.id,
          filePath: result.filePath,
          changed: result.changed,
        });
        eventBus.emit("files.binding_synced", {
          bindingId: binding.id,
          filePath: result.filePath,
          changed: result.changed,
        });
        return result;
      },
      readBindingStore: () => readBindingStore(workspaceDir, filesystem),
      writeBindingStore: (bindings) => writeBindingStore(workspaceDir, bindings, filesystem),
      readSettingsSchema: () => readSettingsSchemaRecord(workspaceDir, filesystem),
      writeSettingsSchema: (settingsSchema) => writeSettingsSchemaRecord(workspaceDir, settingsSchema, filesystem),
      readSettingsValues: () => readSettingsValuesRecord(workspaceDir, filesystem),
      writeSettingsValues: (values) => writeSettingsValuesRecord(workspaceDir, values, filesystem),
      validateSettings: (values) => validateSettingsUpdate(readSettingsSchemaRecord(workspaceDir, filesystem).settingsSchema, values),
      renderTemplate: (template, values) => renderSettingsTemplate(template, values),
      updateSettings: (values, updateOptions) => {
        const result = updateBindingSettings({
          workspaceDir,
          bindings: readBindingStore(workspaceDir, filesystem).bindings,
          settingsSchema: readSettingsSchemaRecord(workspaceDir, filesystem).settingsSchema,
          values,
          renderers: updateOptions.renderers ?? {},
          autoSync: updateOptions.autoSync,
          reenableOptionalBindings: updateOptions.reenableOptionalBindings,
          filesystem,
        });
        appendAuditEvent("files.settings_updated", "file_sync", {
          autoSync: !!updateOptions.autoSync,
          syncCount: result.syncResults.length,
        });
        eventBus.emit("files.settings_updated", {
          autoSync: !!updateOptions.autoSync,
          syncCount: result.syncResults.length,
        });
        return result;
      },
      readWorkspaceFile: (relativePath) => readWorkspaceFile(workspaceDir, relativePath, filesystem),
      writeWorkspaceFile: (relativePath, content) => {
        const result = writeWorkspaceFile(workspaceDir, relativePath, content, filesystem);
        appendAuditEvent("files.workspace_written", "file_sync", {
          relativePath,
          filePath: result.filePath,
          changed: result.changed,
        });
        eventBus.emit("files.workspace_written", {
          relativePath,
          filePath: result.filePath,
          changed: result.changed,
        });
        return result;
      },
      writeWorkspaceFilePreservingManagedBlocks: (relativePath, content, preserveOptions = {}) => {
        const result = writeWorkspaceFilePreservingManagedBlocks(workspaceDir, relativePath, content, preserveOptions, filesystem);
        appendAuditEvent("files.workspace_written", "file_sync", {
          relativePath,
          filePath: result.filePath,
          changed: result.changed,
          preservedManagedBlocks: true,
        });
        eventBus.emit("files.workspace_written", {
          relativePath,
          filePath: result.filePath,
          changed: result.changed,
          preservedManagedBlocks: true,
        });
        return result;
      },
      previewWorkspaceFile: (relativePath, content) => previewWorkspaceFile(workspaceDir, relativePath, content, filesystem),
      inspectWorkspaceFile: (relativePath) => inspectWorkspaceFile(workspaceDir, relativePath, filesystem),
      inspectManagedBlock: (relativePath, blockId) => inspectManagedWorkspaceFile(workspaceDir, relativePath, blockId, filesystem),
      mergeManagedBlocks: (originalContent, editedContent, mergeOptions = {}) => mergeManagedBlocks(originalContent, editedContent, mergeOptions),
    },
    ...createClawKnowledgeFacades({ soulStore, userStore, appendAuditEvent, logicalAgentId, eventBus, adapter, processHost, resolvedRuntimeOptions, writeCompatSnapshot, workspaceDir, filesystem, writeCapabilityReport, persistWorkspaceState, persistProviderState, persistSchedulerState, readSchedulers, persistMemoryState, readMemory, persistSkillsState, readSkills, persistChannelsState, readChannels, augmentRuntimeStatusWithPluginBridge, pluginBridgeStatus, pluginBridgePolicy, validateWorkspace, readCompatSnapshot, buildCompatDriftReport, readProviderAuth, listManagedFiles, listManagedBlockProblems, buildCombinedDoctorReport, readModelCatalog, readDefaultModel, patchIntent, applyIntent, readProviderCatalog, readAuthState, prepareAuthLogin, emitAuthLoginProgress, patchProviderIntent, refreshObservedDomain, emitAuthProgress, requiresExplicitProviderEnable, outcomeStore, options, judgmentStore, sessionStore, contextStore, commitmentStore, projectCommitmentReminder, prepareContextPack, rulesStore, learningStore, libraryStore, dataStore }),
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
    ...createClawChannelFacades({ readChannels, persistChannelsState, channelsRegistry, patchTelegramChannelIntent, connectTelegramAccount, processHost, secretsEnv, ensureTelegramCodexBridgeCommands, refreshChannelSnapshots, appendAuditEvent, adapter, eventBus, refreshTelegramAccountStatus, runChannelListener, sendTelegramAccountMessage, registerOutboundChannelMedia, syncTelegramAccount, registerInboundTelegramMedia, ingestTelegramVoiceNote, setTelegramAccountCommands, getTelegramAccountCommands, ensureTelegramBotSecretReference, telegram, recordTelegramStatusInChannels, disableTelegramAccountWebhook, configureTelegramAccountWebhook, callTelegramApi, callTelegramAccountBooleanMethod, callTelegramAccountRecordMethod, downloadTelegramFile, getTelegramAccountChat, listTelegramAccountChats, telegramBanOrRestrictParams, telegramInviteLinkParams, slack, whatsapp }),
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
    calendar: calendarFacade,
    routines: routinesFacade,
    reminders: temporalRemindersFacade,
    ...createClawContentIotFacades({ contentClient, iotClient, requireContentClient, requireIotClient, options }),
    sessions: {
      createSession: (title) => {
        const session = sessionStore.createSession(title);
        appendAuditEvent("sessions.session_created", "sessions", {
          sessionId: session.sessionId,
          title: session.title,
        });
        eventBus.emit("sessions.session_created", {
          sessionId: session.sessionId,
          title: session.title,
        });
        return session;
      },
      appendMessage: (sessionId, message) => {
        const preparedMessage = prepareMessageDocuments(sessionId, message);
        const session = sessionStore.appendMessage(sessionId, preparedMessage);
        appendAuditEvent("sessions.message_appended", "sessions", {
          sessionId,
          role: message.role,
        });
        eventBus.emit("sessions.message_appended", {
          sessionId,
          role: message.role,
        });
        return session;
      },
      appendMessageOnce: (sessionId, message) => {
        const preparedMessage = prepareMessageDocuments(sessionId, message);
        const result = sessionStore.appendMessageOnce(sessionId, preparedMessage);
        if (result.appended) {
          appendAuditEvent("sessions.message_appended", "sessions", {
            sessionId,
            role: message.role,
            idempotent: true,
          });
          eventBus.emit("sessions.message_appended", {
            sessionId,
            role: message.role,
          });
        }
        return result;
      },
      resolveChannelSession: (input) => {
        const sessionId = resolveChannelSessionId(input);
        return {
          sessionId,
          session: sessionStore.getSession(sessionId),
        };
      },
      appendChannelMessage: (input) => {
        const result = appendChannelSessionMessage(input);
        if (result.appended) {
          appendAuditEvent("sessions.channel_message_appended", "sessions", {
            sessionId: result.sessionId,
            provider: input.provider,
            targetId: input.targetId,
          });
          eventBus.emit("sessions.channel_message_appended", {
            sessionId: result.sessionId,
            provider: input.provider,
            targetId: input.targetId,
          });
        }
        return result;
      },
      backfillChannelSession,
      listSessions: sessionStore.listSessions.bind(sessionStore),
      searchSessions: searchSessions,
      getSession: sessionStore.getSession.bind(sessionStore),
      updateSessionTitle: (sessionId, title) => {
        const updated = sessionStore.updateSessionTitle(sessionId, title);
        if (updated) {
          appendAuditEvent("sessions.title_updated", "sessions", {
            sessionId,
            title,
          });
          eventBus.emit("sessions.title_updated", {
            sessionId,
            title,
          });
        }
        return updated;
      },
      generateTitle: async (input) => {
        const session = sessionStore.getSession(input.sessionId);
        if (!session) {
          throw new Error(`Session not found: ${input.sessionId}`);
        }
        const title = await generateRuntimeSessionTitle({
          messages: session.messages,
          sessionAdapter: input.transport === "cli" ? { ...sessionAdapter, gateway: null } : sessionAdapter,
          ...(input.transport === "gateway" ? { runner: undefined } : { agentId: runtimeAgentId, runner: processHost }),
          ...(input.transport === "cli" ? { fetchImpl: undefined } : { fetchImpl: globalThis.fetch }),
        });
        sessionStore.updateSessionTitle(input.sessionId, title);
        appendAuditEvent("sessions.title_generated", "sessions", {
          sessionId: input.sessionId,
          title,
        });
        eventBus.emit("sessions.title_generated", {
          sessionId: input.sessionId,
          title,
        });
        return title;
      },
      streamAssistantReplyEvents: async function* (input) {
        const session = sessionStore.getSession(input.sessionId);
        if (!session) {
          throw new Error(`Session not found: ${input.sessionId}`);
        }
        if (!session.messages.some((message) => message.role === "user")) {
          throw new Error(`Session requires at least one user message: ${input.sessionId}`);
        }

        let fullText = "";
        let completed = false;
        let failed = false;

        for await (const event of streamRuntimeSessionEvents({
          sessionId: input.sessionId,
          agentId: runtimeAgentId,
          systemPrompt: input.systemPrompt,
          contextBlocks: mergeRulesContextBlocks({
            sessionMessages: session.messages,
            contextBlocks: input.contextBlocks,
            ruleHints: input.ruleHints,
          }),
          messages: session.messages,
          transport: input.transport,
          chunkSize: input.chunkSize,
          gatewayRetries: input.gatewayRetries,
          signal: input.signal,
        }, {
          sessionAdapter,
          runner: processHost,
          documentResolver: resolveSessionDocumentAssets,
        })) {
          if (event.type === "chunk") {
            fullText += event.chunk.delta;
          }
          if (event.type === "done") {
            completed = true;
          }
          if (event.type === "error" || event.type === "aborted") {
            failed = true;
          }
          if (event.type === "title") {
            sessionStore.updateSessionTitle(input.sessionId, event.title);
            appendAuditEvent("sessions.title_suggested", "sessions", {
              sessionId: input.sessionId,
              title: event.title,
              source: event.source,
            });
            eventBus.emit("sessions.title_suggested", {
              sessionId: input.sessionId,
              title: event.title,
              source: event.source,
            });
          }
          yield event;
        }

        if (completed && !failed && fullText.trim()) {
          sessionStore.appendMessage(input.sessionId, {
            role: "assistant",
            content: fullText.trim(),
          });
          appendAuditEvent("sessions.assistant_stream_persisted", "sessions", {
            sessionId: input.sessionId,
            length: fullText.trim().length,
          });
          eventBus.emit("sessions.assistant_stream_persisted", {
            sessionId: input.sessionId,
            length: fullText.trim().length,
          });
        }
      },
      streamAssistantReply: async function* (input) {
        const session = sessionStore.getSession(input.sessionId);
        if (!session) {
          throw new Error(`Session not found: ${input.sessionId}`);
        }
        if (!session.messages.some((message) => message.role === "user")) {
          throw new Error(`Session requires at least one user message: ${input.sessionId}`);
        }

        let fullText = "";

        for await (const chunk of streamRuntimeSession({
          sessionId: input.sessionId,
          agentId: runtimeAgentId,
          systemPrompt: input.systemPrompt,
          contextBlocks: mergeRulesContextBlocks({
            sessionMessages: session.messages,
            contextBlocks: input.contextBlocks,
            ruleHints: input.ruleHints,
          }),
          messages: session.messages,
          transport: input.transport,
          chunkSize: input.chunkSize,
          gatewayRetries: input.gatewayRetries,
          signal: input.signal,
        }, {
          sessionAdapter,
          runner: processHost,
          documentResolver: resolveSessionDocumentAssets,
        })) {
          if (!chunk.done) {
            fullText += chunk.delta;
          }
          yield chunk;
        }

        if (fullText.trim()) {
          sessionStore.appendMessage(input.sessionId, {
            role: "assistant",
            content: fullText.trim(),
          });
          appendAuditEvent("sessions.assistant_stream_persisted", "sessions", {
            sessionId: input.sessionId,
            length: fullText.trim().length,
          });
          eventBus.emit("sessions.assistant_stream_persisted", {
            sessionId: input.sessionId,
            length: fullText.trim().length,
          });
        }
      },
    },

  };
}
