// @ts-nocheck
import fs from "fs";
import path from "path";

export function createClawSkillProviderFacades(locals: Record<string, any>): Record<string, any> {
  const {
    workspaceDir,
    processHost,
    resolvedRuntimeOptions,
    adapter,
    telegram,
    slack,
    whatsapp,
    channelsRegistry,
    filesystem,
    persistSkillsState,
    appendAuditEvent,
    eventBus,
    patchSkillIntentEntry,
    readTelegramStateSnapshot,
    readSlackStateSnapshot,
    readWhatsAppStateSnapshot,
    listSkillSources,
    getSkillSource,
    normalizeInstallRef,
    resolveSkillSourceFromRef,
  } = locals;

  function listWorkspaceSkillPaths(): string[] {
    const skillsDir = path.join(workspaceDir, "skills");
    try {
      return fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || entry.isFile())
        .map((entry) => path.join(skillsDir, entry.name))
        .sort((left, right) => left.localeCompare(right));
    } catch {
      return [];
    }
  }

  function diffWorkspaceSkillPaths(before: string[], after: string[]): string[] {
    const beforeSet = new Set(before);
    return after.filter((entry) => !beforeSet.has(entry));
  }

  async function readSkillSources(): Promise<SkillSourceDescriptor[]> {
    return Promise.all(
      listSkillSources().map((source) => source.status({
        runner: processHost,
        workspaceDir,
        env: resolvedRuntimeOptions.env,
      }))
    );
  }

  async function resolveReadySkillSource(sourceId: string): Promise<SkillSourceAdapter> {
    return getSkillSource(sourceId);
  }

  async function searchSkillCatalog(query: string, options: { source?: string; limit?: number } = {}): Promise<SkillSearchResult> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return {
        query: trimmedQuery,
        entries: [],
        sources: await readSkillSources(),
        warnings: ["Query is empty."],
      };
    }

    const descriptors = await readSkillSources();
    const requestedSource = options.source?.trim();
    const omittedSources: Array<{ source: string; reason: string }> = [];
    const warnings: string[] = [];
    const entries: SkillCatalogEntry[] = [];

    const targets = requestedSource
      ? descriptors.filter((descriptor) => descriptor.id === requestedSource)
      : descriptors;

    if (requestedSource && targets.length === 0) {
      throw new Error(`Unsupported skill source: ${requestedSource}`);
    }

    for (const descriptor of targets) {
      const source = getSkillSource(descriptor.id);

      if (source.search && descriptor.capabilities.search) {
        try {
          const result = await source.search(trimmedQuery, { limit: options.limit }, {
            runner: processHost,
            workspaceDir,
            env: resolvedRuntimeOptions.env,
          });
          entries.push(...result.entries);
          warnings.push(...(result.warnings ?? []));
        } catch (error) {
          omittedSources.push({
            source: descriptor.id,
            reason: error instanceof Error ? error.message : "Search failed.",
          });
        }
        continue;
      }

      if (requestedSource && source.resolveExact && descriptor.capabilities.resolveExact) {
        try {
          const resolved = await source.resolveExact(trimmedQuery, {
            runner: processHost,
            workspaceDir,
            env: resolvedRuntimeOptions.env,
          });
          if (resolved) {
            entries.push(resolved);
          } else {
            omittedSources.push({
              source: descriptor.id,
              reason: "This source supports exact refs only in v1.",
            });
          }
        } catch (error) {
          omittedSources.push({
            source: descriptor.id,
            reason: error instanceof Error ? error.message : "Exact resolution failed.",
          });
        }
        continue;
      }

      omittedSources.push({
        source: descriptor.id,
        reason: "General text search is not supported for this source in v1.",
      });
    }

    return {
      query: trimmedQuery,
      entries,
      sources: descriptors,
      ...(omittedSources.length > 0 ? { omittedSources } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async function installSkillFromSource(ref: string, options: { source?: string } = {}): Promise<SkillInstallResult & { syncedSkills?: SkillDescriptor[] }> {
    const normalizedRef = normalizeInstallRef(ref);
    if (!normalizedRef) {
      throw new Error("Skill ref is required.");
    }

    const sourceId = options.source?.trim() || resolveSkillSourceFromRef(ref)?.id;
    if (!sourceId) {
      throw new Error("Unable to infer a skill source from the ref. Pass { source } explicitly.");
    }

    const source = await resolveReadySkillSource(sourceId);
    const beforePaths = listWorkspaceSkillPaths();
    const result = await source.install(normalizedRef, {
      runner: processHost,
      workspaceDir,
      env: resolvedRuntimeOptions.env,
    });
    const afterPaths = listWorkspaceSkillPaths();
    const detectedPaths = diffWorkspaceSkillPaths(beforePaths, afterPaths);
    const installedPaths = result.installedPaths && result.installedPaths.length > 0
      ? result.installedPaths
      : detectedPaths;

    let runtimeVisibility = result.runtimeVisibility;
    if (installedPaths.length > 0) {
      runtimeVisibility = "runtime";
    }

    const finalResult: SkillInstallResult & { syncedSkills?: SkillDescriptor[] } = {
      ...result,
      runtimeVisibility,
      ...(installedPaths.length > 0 ? { installedPaths } : {}),
    };

    if (runtimeVisibility === "runtime" || runtimeVisibility === "unknown") {
      const syncedSkills = await adapter.syncSkills(processHost, resolvedRuntimeOptions);
      persistSkillsState(syncedSkills);
      appendAuditEvent("skills.synced", "skills", { count: syncedSkills.length, runtimeAdapter: adapter.id });
      eventBus.emit("skills.synced", { count: syncedSkills.length, runtimeAdapter: adapter.id });
      finalResult.syncedSkills = syncedSkills;
      if (syncedSkills.length > 0 && runtimeVisibility === "unknown") {
        finalResult.runtimeVisibility = "runtime";
      }
    }

    appendAuditEvent("skills.installed", "skills", {
      source: finalResult.source,
      slug: finalResult.slug,
      runtimeVisibility: finalResult.runtimeVisibility,
      runtimeAdapter: adapter.id,
    });
    eventBus.emit("skills.installed", {
      source: finalResult.source,
      slug: finalResult.slug,
      runtimeVisibility: finalResult.runtimeVisibility,
      runtimeAdapter: adapter.id,
    });

    return finalResult;
  }

  async function readProviderAuth(): Promise<Record<string, ProviderAuthSummary>> {
    try {
      return await adapter.getProviderAuth(processHost, resolvedRuntimeOptions);
    } catch {
      return {};
    }
  }

  async function readDefaultModel(): Promise<DefaultModelRef | null> {
    try {
      return await adapter.getDefaultModel(processHost, resolvedRuntimeOptions);
    } catch {
      return null;
    }
  }

  async function readProviderCatalog(): Promise<ProviderCatalog> {
    try {
      return await adapter.getProviderCatalog(processHost, resolvedRuntimeOptions);
    } catch {
      return { providers: [] };
    }
  }

  function resolveRequestedAuthProvider(provider: string): string {
    const requested = provider.trim();
    if (!requested) return requested;
    const diagnostics = adapter.diagnostics(requested, resolvedRuntimeOptions) as AuthDiagnostics & {
      resolvedOauthProvider?: string | null;
    };
    return diagnostics.resolvedOauthProvider?.trim() || requested;
  }

  async function prepareAuthLogin(provider: string): Promise<AuthLoginPlan> {
    const requestedProvider = provider.trim();
    const resolvedProvider = resolveRequestedAuthProvider(requestedProvider);

    if (typeof adapter.prepareLogin === "function") {
      const prepared = await adapter.prepareLogin(requestedProvider, processHost, resolvedRuntimeOptions).catch(() => null);
      if (prepared) {
        return prepared;
      }
    }

    const summaries = await readProviderAuth();
    const current = summaries[resolvedProvider] ?? summaries[requestedProvider];
    if (current?.hasAuth && current.hasSubscription) {
      return {
        requestedProvider,
        provider: current.provider,
        status: "reused",
        hasExistingAuth: true,
        launchMode: "none",
        message: "Existing provider auth is already available.",
      };
    }

    return {
      requestedProvider,
      provider: resolvedProvider,
      status: "launch_required",
      hasExistingAuth: false,
      launchMode: adapter.id === "openclaw" ? "browser" : "unknown",
      message: "Interactive sign-in is required.",
    };
  }

  async function readModelCatalog(): Promise<ModelCatalog> {
    try {
      return await adapter.getModelCatalog(processHost, resolvedRuntimeOptions);
    } catch {
      return { models: [], defaultModel: null };
    }
  }

  async function readAuthState(): Promise<AuthState> {
    try {
      return await adapter.getAuthState(processHost, resolvedRuntimeOptions);
    } catch {
      return { providers: {} };
    }
  }

  async function readSchedulers(): Promise<SchedulerDescriptor[]> {
    try {
      return await adapter.listSchedulers(processHost, resolvedRuntimeOptions);
    } catch {
      return [];
    }
  }

  async function readMemory(): Promise<MemoryDescriptor[]> {
    try {
      return await adapter.listMemory(processHost, resolvedRuntimeOptions);
    } catch {
      return [];
    }
  }

  async function readSkills(): Promise<SkillDescriptor[]> {
    try {
      return await adapter.listSkills(processHost, resolvedRuntimeOptions);
    } catch {
      return [];
    }
  }

  async function readChannels(): Promise<ChannelDescriptor[]> {
    const telegramChannel = telegram.channel();
    const slackChannel = slack.channel();
    const whatsappChannel = whatsapp.channel();
    const registryChannels = channelsRegistry.accounts.descriptors();
    const registryChannelIds = new Set(registryChannels.map((channel) => channel.id));
    try {
      const channels = await adapter.listChannels(processHost, resolvedRuntimeOptions);
      const runtimeChannelMap = new Map(channels.map((channel) => [channel.id, channel]));
      const filtered = channels.filter((channel) => channel.id !== "telegram" && channel.id !== "slack" && channel.id !== "whatsapp" && !registryChannelIds.has(channel.id));
      const result = [...filtered, ...registryChannels.filter((channel) => channel.id !== "telegram")];
      const shouldUseLocalTelegram = telegramChannel.status !== "disconnected" || !!readTelegramStateSnapshot(workspaceDir, filesystem);
      const registryTelegram = registryChannels.find((channel) => channel.id === "telegram");
      if (registryTelegram) {
        result.push(registryTelegram);
      } else if (shouldUseLocalTelegram) {
        result.push(telegramChannel);
      } else if (runtimeChannelMap.has("telegram")) {
        result.push(runtimeChannelMap.get("telegram")!);
      }
      const shouldUseLocalSlack = slackChannel.status !== "disconnected" || !!readSlackStateSnapshot(workspaceDir, filesystem);
      if (shouldUseLocalSlack) {
        result.push(slackChannel);
      } else if (runtimeChannelMap.has("slack")) {
        result.push(runtimeChannelMap.get("slack")!);
      }
      const shouldUseLocalWhatsApp = whatsappChannel.status !== "disconnected" || !!readWhatsAppStateSnapshot(workspaceDir, filesystem);
      if (shouldUseLocalWhatsApp) {
        result.push(whatsappChannel);
      } else if (runtimeChannelMap.has("whatsapp")) {
        result.push(runtimeChannelMap.get("whatsapp")!);
      }
      return result;
    } catch {
      const result: ChannelDescriptor[] = [...registryChannels.filter((channel) => channel.id !== "telegram")];
      const registryTelegram = registryChannels.find((channel) => channel.id === "telegram");
      if (registryTelegram) {
        result.push(registryTelegram);
      } else if (telegramChannel.status !== "disconnected" || readTelegramStateSnapshot(workspaceDir, filesystem)) {
        result.push(telegramChannel);
      }
      if (slackChannel.status !== "disconnected" || readSlackStateSnapshot(workspaceDir, filesystem)) {
        result.push(slackChannel);
      }
      if (whatsappChannel.status !== "disconnected" || readWhatsAppStateSnapshot(workspaceDir, filesystem)) {
        result.push(whatsappChannel);
      }
      return result;
    }
  }



  return {
    listWorkspaceSkillPaths,
    diffWorkspaceSkillPaths,
    readSkillSources,
    resolveReadySkillSource,
    searchSkillCatalog,
    installSkillFromSource,
    readProviderAuth,
    readDefaultModel,
    readProviderCatalog,
    resolveRequestedAuthProvider,
    prepareAuthLogin,
    readModelCatalog,
    readAuthState,
    readSchedulers,
    readMemory,
    readSkills,
    readChannels,
  };
}
