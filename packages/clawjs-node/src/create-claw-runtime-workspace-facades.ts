// @ts-nocheck
export function createClawRuntimeWorkspaceFacades(locals: Record<string, any>): Record<string, any> {
  const {
    runtimeContext,
    adapter,
    processHost,
    resolvedRuntimeOptions,
    augmentRuntimeStatusWithPluginBridge,
    telegram,
    assertOpenClawGatewaySupport,
    getOpenClawGatewayStatus,
    gatewayConfigOptions,
    startOpenClawGateway,
    stopOpenClawGateway,
    restartOpenClawGateway,
    waitForOpenClawGateway,
    callOpenClawGateway,
    pluginBridgeStatus,
    assertOpenClawPluginBridgeSupport,
    listOpenClawPlugins,
    doctorOpenClawPlugins,
    patchManagedPluginIntent,
    installManagedOpenClawPlugins,
    enableManagedOpenClawPlugins,
    disableManagedOpenClawPlugins,
    updateManagedOpenClawPlugins,
    ensureOpenClawPluginBridge,
    pluginBridgePolicy,
    refreshObservedDomain,
    callManagedClawJsBridge,
    listOpenClawHooks,
    handleRuntimeProgress,
    appendAuditEvent,
    eventBus,
    runtimeAgentId,
    workspaceDir,
    discoverOpenClawAppContext,
    openClawContextDefaults,
    detachOpenClawAppContext,
    ensureWorkspaceInitialized,
    attachWorkspace,
    filesystem,
    validateWorkspace,
    persistWorkspaceState,
    repairWorkspace,
    options,
    buildWorkspaceResetPlan,
    resetWorkspace,
    listManagedFiles,
    buildCanonicalPathMap,
    resolveManifestPath,
    resolveCompatSnapshotPath,
    resolveCapabilityReportPath,
    resolveBindingsPath,
    resolveSettingsSchemaPath,
    resolveSettingsValuesPath,
    resolveWorkspaceStatePath,
    resolveProviderStatePath,
    resolveSchedulerStatePath,
    resolveMemoryStatePath,
    resolveSkillsStatePath,
    resolveChannelsStatePath,
    resolveTelegramStatePath,
    resolveIntentDomainPath,
    resolveObservedDomainPath,
    readWorkspaceManifest,
    readCompatSnapshot,
    readCapabilityReport,
    readWorkspaceStateSnapshot,
    readProviderStateSnapshot,
    readSchedulerStateSnapshot,
    readMemoryStateSnapshot,
    readSkillsStateSnapshot,
    readChannelsStateSnapshot,
    readTelegramStateSnapshot,
    readSlackStateSnapshot,
    readWhatsAppStateSnapshot,
    readAllIntentDomains,
    readAllObservedDomains,
    readIntent,
    writeIntent,
    patchIntent,
    planIntent,
    applyIntent,
    diffIntent,
    readObservedDomain,
    refreshObserved,
    describeFeatures,
    resolveClawWorkspaceSurfacePath,
    applyTemplatePack,
    syncBinding,
    readBindingStore,
    writeBindingStore,
    readSettingsSchemaRecord,
    writeSettingsSchemaRecord,
    readSettingsValuesRecord,
    writeSettingsValuesRecord,
    validateSettingsUpdate,
    renderSettingsTemplate,
    updateBindingSettings,
    readWorkspaceFile,
    writeWorkspaceFile,
    writeWorkspaceFilePreservingManagedBlocks,
    previewWorkspaceFile,
    inspectWorkspaceFile,
    inspectManagedWorkspaceFile,
    mergeManagedBlocks,
  } = locals;

  return {
    runtime: {
      context: () => runtimeContext,
      status: async () => {
        const baseStatus = await adapter.getStatus(processHost, resolvedRuntimeOptions);
        const status = await augmentRuntimeStatusWithPluginBridge(baseStatus);
        const telegramStatus = await telegram.status();
        const channelsSupport: RuntimeCapabilitySupport = telegramStatus.channel.status === "disconnected"
          ? status.capabilityMap.channels
          : {
            supported: true,
            status: telegramStatus.channel.status === "degraded" ? "degraded" : "ready",
            strategy: "bridge" as const,
            diagnostics: {
              provider: "telegram",
              mode: telegramStatus.transport.mode,
            },
          };
        return {
          ...status,
          capabilityMap: {
            ...status.capabilityMap,
            channels: channelsSupport,
          },
        };
      },
      gateway: {
        status: async () => {
          assertOpenClawGatewaySupport();
          return getOpenClawGatewayStatus(processHost, gatewayConfigOptions());
        },
        start: async () => {
          assertOpenClawGatewaySupport();
          await startOpenClawGateway(processHost, gatewayConfigOptions());
        },
        stop: async () => {
          assertOpenClawGatewaySupport();
          await stopOpenClawGateway(processHost, gatewayConfigOptions());
        },
        restart: async () => {
          assertOpenClawGatewaySupport();
          await restartOpenClawGateway(processHost, gatewayConfigOptions());
        },
        waitUntilReady: async (waitOptions = {}) => {
          assertOpenClawGatewaySupport();
          return waitForOpenClawGateway(processHost, {
            runner: processHost,
            ...gatewayConfigOptions(),
            ...waitOptions,
          });
        },
        call: async (method, params = {}, callOptions = {}) => {
          assertOpenClawGatewaySupport();
          return callOpenClawGateway(method, params, {
            runner: processHost,
            ...gatewayConfigOptions(),
            ...callOptions,
          });
        },
      },
      plugins: {
        status: async () => pluginBridgeStatus(),
        list: async () => {
          assertOpenClawPluginBridgeSupport();
          return listOpenClawPlugins(processHost, resolvedRuntimeOptions);
        },
        doctor: async () => {
          assertOpenClawPluginBridgeSupport();
          return doctorOpenClawPlugins(processHost, resolvedRuntimeOptions);
        },
        install: async (target = "clawjs") => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent(target, true);
          const result = await installManagedOpenClawPlugins(target, processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        enable: async (target = "clawjs") => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent(target, true);
          const result = await enableManagedOpenClawPlugins(target, processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        disable: async (target = "clawjs") => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent(target, false);
          const result = await disableManagedOpenClawPlugins(target, processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        update: async (target = "clawjs") => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent(target, true);
          const result = await updateManagedOpenClawPlugins(target, processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        ensure: async () => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent("all", true);
          const result = await ensureOpenClawPluginBridge(processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        claw: {
          status: async () => callManagedClawJsBridge("clawjs.status"),
          events: {
            list: async (input = {}) => callManagedClawJsBridge("clawjs.events.list", input),
          },
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
          compatSnapshotCanonicalized: repaired.compatSnapshotCanonicalized,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("workspace.repaired", {
          createdDirectories: repaired.createdDirectories.length,
          createdRuntimeFiles: repaired.createdRuntimeFiles.length,
          compatSnapshotCanonicalized: repaired.compatSnapshotCanonicalized,
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
  };
}
