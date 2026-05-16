// @ts-nocheck
export function createClawIntentFacades(locals: Record<string, any>): Record<string, any> {
  const {
    adapter,
    resolvedRuntimeOptions,
    resolvedLocations,
    workspaceDir,
    filesystem,
    readAllIntentDomains,
    readIntentDomain,
    writeIntentDomain,
    patchIntentDomain,
    augmentRuntimeStatusWithPluginBridge,
    processHost,
    writeObservedDomain,
    validateWorkspace,
    persistWorkspaceState,
    readModelCatalog,
    readDefaultModel,
    readProviderAuth,
    persistProviderState,
    readChannels,
    persistChannelsState,
    readSkills,
    persistSkillsState,
    readMemory,
    persistMemoryState,
    readSchedulers,
    persistSchedulerState,
    pluginBridgeStatus,
    sessionStore,
    runtimeContext,
    readObservedDomain,
    readProviderStateSnapshot,
    readChannelsStateSnapshot,
    readSkillsStateSnapshot,
    normalizeTtsConfig,
    telegram,
    installSkillFromSource,
    enableManagedOpenClawPlugins,
    disableManagedOpenClawPlugins,
    pluginBridgePolicy,
    writeSpeechConfig,
    writeSttConfig,
  } = locals;

  function describeFeatures(): RuntimeFeatureDescriptor[] {
    return adapter.describeFeatures(resolvedRuntimeOptions);
  }

  function defaultSessionPolicy(): SessionPolicy {
    return describeFeatures().find((feature) => feature.featureId === "sessions")?.sessionPolicy ?? "managed";
  }

  function featureForDomain(domain: IntentDomain): RuntimeFeatureDescriptor {
    return describeFeatures().find((feature) => feature.featureId === domain) ?? {
      featureId: domain,
      ownership: "mirrored",
      supported: false,
    };
  }

  function defaultIntentState(domain: IntentDomain): Record<string, unknown> {
    switch (domain) {
      case "runtime":
        return {
          adapter: adapter.id,
          locations: resolvedLocations,
        };
      case "models":
        return {
          defaultModel: null,
          logicalDefaults: {},
        };
      case "providers":
        return { providers: {} };
      case "channels":
        return { channels: {} };
      case "skills":
        return { skills: [] };
      case "plugins":
        return { plugins: {}, slots: {} };
      case "files":
        return { values: {} };
      case "sessions":
        return { policy: defaultSessionPolicy() };
      case "speech":
        return { tts: {}, stt: {} };
    }
  }

  function readIntent(domain?: IntentDomain): unknown {
    if (!domain) {
      return readAllIntentDomains(workspaceDir, filesystem);
    }
    return readIntentDomain(workspaceDir, domain, filesystem) ?? {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      ...defaultIntentState(domain),
    };
  }

  function writeIntent(domain: IntentDomain, value: Record<string, unknown>): unknown {
    return writeIntentDomain(workspaceDir, domain, {
      ...value,
    }, filesystem);
  }

  function patchIntent(domain: IntentDomain, value: Record<string, unknown>): unknown {
    return patchIntentDomain(workspaceDir, domain, value, defaultIntentState(domain), filesystem);
  }

  async function refreshObservedDomain(domain: ObservedDomain): Promise<unknown> {
    switch (domain) {
      case "runtime": {
        const status = await augmentRuntimeStatusWithPluginBridge(await adapter.getStatus(processHost, resolvedRuntimeOptions));
        return writeObservedDomain(workspaceDir, "runtime", {
          runtime: {
            ...status,
            diagnostics: status.diagnostics,
          },
        }, filesystem);
      }
      case "workspace": {
        const validation = validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles);
        return persistWorkspaceState(validation);
      }
      case "models": {
        const catalog = await readModelCatalog();
        const defaultModel = await readDefaultModel();
        return writeObservedDomain(workspaceDir, "models", {
          catalog,
          defaultModel,
        }, filesystem);
      }
      case "providers": {
        const providers = await readProviderAuth();
        return persistProviderState(providers, []);
      }
      case "channels": {
        const channels = await readChannels();
        return persistChannelsState(channels);
      }
      case "skills": {
        const skills = await readSkills();
        return persistSkillsState(skills);
      }
      case "memory": {
        const memory = await readMemory();
        return persistMemoryState(memory);
      }
      case "scheduler": {
        const schedulers = await readSchedulers();
        return persistSchedulerState(schedulers);
      }
      case "plugins": {
        if (adapter.id === "openclaw") {
          const status = await pluginBridgeStatus();
          return writeObservedDomain(workspaceDir, "plugins", {
            plugins: {
              [status.basePlugin.id]: {
                installed: status.basePlugin.installed,
                enabled: status.basePlugin.enabled,
                loaded: status.basePlugin.loaded,
                status: status.basePlugin.status,
                version: status.basePlugin.version,
                error: status.basePlugin.error,
              },
              [status.contextPlugin.id]: {
                installed: status.contextPlugin.installed,
                enabled: status.contextPlugin.enabled,
                loaded: status.contextPlugin.loaded,
                status: status.contextPlugin.status,
                version: status.contextPlugin.version,
                error: status.contextPlugin.error,
              },
            },
            slots: {
              contextEngine: status.contextPlugin.selectedEngineId,
            },
            diagnostics: status.diagnostics,
          }, filesystem);
        }
        return writeObservedDomain(workspaceDir, "plugins", {
          plugins: {},
          slots: {},
          diagnostics: [],
        }, filesystem);
      }
      case "sessions": {
        return writeObservedDomain(workspaceDir, "sessions", {
          policy: defaultSessionPolicy(),
          sessionCount: sessionStore.listSessions().length,
          runtimePath: runtimeContext?.sessionsDir ?? null,
        }, filesystem);
      }
    }
  }

  async function refreshObserved(options: { domains?: ObservedDomain[] } = {}): Promise<Record<string, unknown>> {
    const domains = options.domains ?? ["runtime", "workspace", "models", "providers", "channels", "skills", "plugins", "memory", "scheduler", "sessions"];
    const result: Record<string, unknown> = {};
    for (const domain of domains) {
      result[domain] = await refreshObservedDomain(domain);
    }
    return result;
  }

  async function diffIntent(options: { domains?: IntentDomain[] } = {}) {
    const domains = options.domains ?? ["runtime", "models", "providers", "channels", "skills", "plugins", "files", "sessions", "speech"];
    const issues: Array<{ domain: IntentDomain; path: string; message: string; expected?: unknown; actual?: unknown }> = [];

    for (const domain of domains) {
      const intent = readIntent(domain) as Record<string, unknown>;
      switch (domain) {
        case "runtime": {
          const observed = readObservedDomain(workspaceDir, "runtime", filesystem) as { runtime?: { adapter?: string } } | null;
          const expected = intent.adapter;
          const actual = observed?.runtime?.adapter ?? adapter.id;
          if (expected && expected !== actual) {
            issues.push({ domain, path: "adapter", message: "Selected runtime adapter does not match observed runtime.", expected, actual });
          }
          break;
        }
        case "models": {
          const observed = readObservedDomain(workspaceDir, "models", filesystem) as { defaultModel?: { modelId?: string | null } | null } | null;
          const expected = intent.defaultModel ?? null;
          const actual = observed?.defaultModel?.modelId ?? null;
          if (expected !== actual) {
            issues.push({ domain, path: "defaultModel", message: "Default model intent differs from observed runtime model.", expected, actual });
          }
          break;
        }
        case "providers": {
          const observed = readProviderStateSnapshot(workspaceDir, filesystem);
          const providers = (intent.providers ?? {}) as Record<string, {
            enabled?: boolean;
            preferredAuthMode?: "oauth" | "token" | "api_key" | "env" | "secret_ref" | null;
            secretRef?: string | null;
            profileId?: string | null;
          }>;
          for (const [provider, config] of Object.entries(providers)) {
            const actual = observed?.providers?.[provider];
            if (config.enabled === false) {
              if (actual?.hasAuth) {
                issues.push({ domain, path: `providers.${provider}.enabled`, message: `Provider ${provider} is disabled in intent but still has observed auth.`, expected: false, actual: true });
              }
              continue;
            }
            if (!actual?.hasAuth) {
              issues.push({ domain, path: `providers.${provider}`, message: `Provider ${provider} is desired but has no observed auth.` });
            }
            if (config.preferredAuthMode && config.preferredAuthMode !== "secret_ref" && actual?.authType && config.preferredAuthMode !== actual.authType) {
              issues.push({
                domain,
                path: `providers.${provider}.preferredAuthMode`,
                message: `Provider ${provider} auth mode differs from observed auth mode.`,
                expected: config.preferredAuthMode,
                actual: actual.authType,
              });
            }
            if (config.secretRef && !actual?.hasAuth) {
              issues.push({
                domain,
                path: `providers.${provider}.secretRef`,
                message: `Provider ${provider} declares a secret reference but no observed auth has been materialized.`,
                expected: config.secretRef,
              });
            }
            if (config.profileId) {
              const diagnostics = adapter.diagnostics(provider, resolvedRuntimeOptions) as { profiles?: Array<{ profileId?: string }> };
              const actualProfileIds = Array.isArray(diagnostics.profiles)
                ? diagnostics.profiles
                  .map((entry) => entry.profileId)
                  .filter((entry): entry is string => typeof entry === "string")
                : [];
              if (actualProfileIds.length > 0 && !actualProfileIds.includes(config.profileId)) {
                issues.push({
                  domain,
                  path: `providers.${provider}.profileId`,
                  message: `Provider ${provider} expects profile ${config.profileId} but it is not present in runtime diagnostics.`,
                  expected: config.profileId,
                  actual: actualProfileIds,
                });
              }
            }
          }
          break;
        }
        case "channels": {
          const observed = readChannelsStateSnapshot(workspaceDir, filesystem);
          const channels = (intent.channels ?? {}) as Record<string, { enabled?: boolean }>;
          for (const [channelId, config] of Object.entries(channels)) {
            if (!config.enabled) continue;
            const channel = observed?.channels.find((entry) => entry.id === channelId);
            if (!channel || channel.status === "disconnected") {
              issues.push({ domain, path: `channels.${channelId}`, message: `Channel ${channelId} is enabled in intent but not connected/configured.` });
            }
          }
          break;
        }
        case "skills": {
          const observed = readSkillsStateSnapshot(workspaceDir, filesystem);
          const skills = Array.isArray(intent.skills) ? intent.skills as Array<{ id: string; enabled: boolean }> : [];
          for (const skill of skills.filter((entry) => entry.enabled)) {
            if (!observed?.skills.some((entry) => entry.id === skill.id)) {
              issues.push({ domain, path: `skills.${skill.id}`, message: `Skill ${skill.id} is desired but not observed.` });
            }
          }
          break;
        }
        case "plugins": {
          const observed = readObservedDomain(workspaceDir, "plugins", filesystem) as { plugins?: Record<string, { enabled?: boolean; installed?: boolean }> } | null;
          const plugins = (intent.plugins ?? {}) as Record<string, { enabled?: boolean }>;
          for (const [pluginId, config] of Object.entries(plugins)) {
            const actual = observed?.plugins?.[pluginId];
            if (config.enabled === true && (!actual?.installed || !actual.enabled)) {
              issues.push({ domain, path: `plugins.${pluginId}`, message: `Plugin ${pluginId} is enabled in intent but not active in observed state.` });
            }
            if (config.enabled === false && actual?.enabled) {
              issues.push({ domain, path: `plugins.${pluginId}`, message: `Plugin ${pluginId} is disabled in intent but still enabled in observed state.` });
            }
          }
          break;
        }
        case "sessions": {
          const observed = readObservedDomain(workspaceDir, "sessions", filesystem) as { policy?: SessionPolicy } | null;
          const expected = (intent.policy as SessionPolicy | undefined) ?? defaultSessionPolicy();
          const actual = observed?.policy ?? defaultSessionPolicy();
          if (expected !== actual) {
            issues.push({ domain, path: "policy", message: "Session policy differs from observed policy.", expected, actual });
          }
          break;
        }
        case "speech": {
          const actual = (intent.tts ?? {}) as TtsProviderConfig | null;
          const expected = normalizeTtsConfig(actual);
          if (JSON.stringify(actual ?? {}) !== JSON.stringify(expected)) {
            issues.push({
              domain,
              path: "tts",
              message: "Speech intent is not normalized.",
              expected,
              actual,
            });
          }
          break;
        }
        default:
          break;
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      domains,
      drifted: issues.length > 0,
      issues,
    };
  }

  async function applyIntent(options: { domains?: IntentDomain[]; dryRun?: boolean } = {}) {
    const domains = options.domains ?? ["runtime", "models", "providers", "channels", "skills", "plugins", "files", "sessions", "speech"];
    const dryRun = options.dryRun === true;
    const actions: Array<{
      domain: IntentDomain;
      featureId: string;
      ownership: RuntimeFeatureDescriptor["ownership"];
      supported: boolean;
      status: "planned" | "applied" | "skipped" | "unsupported";
      message: string;
    }> = [];

    for (const domain of domains) {
      const feature = featureForDomain(domain);
      if (!feature.supported) {
        actions.push({ domain, featureId: feature.featureId, ownership: feature.ownership, supported: false, status: "unsupported", message: `Feature ${domain} is unsupported for ${adapter.id}.` });
        continue;
      }

      const intent = readIntent(domain) as Record<string, unknown>;
      if (dryRun) {
        actions.push({ domain, featureId: feature.featureId, ownership: feature.ownership, supported: true, status: "planned", message: `Planned apply for ${domain}.` });
        continue;
      }

      switch (domain) {
        case "runtime":
          patchIntent("runtime", {
            adapter: adapter.id,
            locations: resolvedLocations,
          });
          await refreshObservedDomain("runtime");
          break;
        case "models":
          if (typeof intent.defaultModel === "string" && intent.defaultModel.trim()) {
            await adapter.setDefaultModel(intent.defaultModel.trim(), processHost, resolvedRuntimeOptions);
          }
          await refreshObservedDomain("models");
          break;
        case "providers":
          for (const [provider, config] of Object.entries((intent.providers ?? {}) as Record<string, { enabled?: boolean }>)) {
            if (config.enabled === false) {
              adapter.removeProvider(provider, {
                ...resolvedRuntimeOptions,
              });
            }
          }
          await refreshObservedDomain("providers");
          break;
        case "channels": {
          const channels = (intent.channels ?? {}) as Record<string, { enabled?: boolean; secretRef?: string; config?: Record<string, unknown> }>;
          const telegramIntent = channels.telegram;
          if (telegramIntent?.enabled && telegramIntent.secretRef) {
            const config = telegramIntent.config ?? {};
            await telegram.connectBot({
              secretName: telegramIntent.secretRef,
              apiBaseUrl: typeof config.apiBaseUrl === "string" ? config.apiBaseUrl : undefined,
              webhookUrl: typeof config.webhookUrl === "string" ? config.webhookUrl : undefined,
              webhookSecretToken: typeof config.webhookSecretToken === "string" ? config.webhookSecretToken : undefined,
              allowedUpdates: Array.isArray(config.allowedUpdates) ? config.allowedUpdates.filter((value): value is string => typeof value === "string") : undefined,
              dropPendingUpdates: typeof config.dropPendingUpdates === "boolean" ? config.dropPendingUpdates : undefined,
            });
            if (Array.isArray(config.commands)) {
              await telegram.setCommands(config.commands as TelegramCommand[]);
            }
          }
          await refreshObservedDomain("channels");
          break;
        }
        case "skills": {
          const desired = Array.isArray(intent.skills) ? intent.skills as Array<{ id: string; enabled: boolean; installRef?: string; source?: string }> : [];
          const observed = readSkillsStateSnapshot(workspaceDir, filesystem);
          for (const skill of desired.filter((entry) => entry.enabled && entry.installRef && entry.source)) {
            if (!observed?.skills.some((entry) => entry.id === skill.id)) {
              await installSkillFromSource(skill.installRef!, { source: skill.source });
            }
          }
          await adapter.syncSkills(processHost, resolvedRuntimeOptions);
          await refreshObservedDomain("skills");
          break;
        }
        case "plugins":
          if (adapter.id === "openclaw") {
            const plugins = (intent.plugins ?? {}) as Record<string, { enabled?: boolean }>;
            const targets = Object.entries(plugins)
              .filter(([, config]) => config.enabled)
              .map(([pluginId]) => pluginId)
              .filter((pluginId): pluginId is "clawjs" | "clawjs-context" => pluginId === "clawjs" || pluginId === "clawjs-context");
            for (const target of targets) {
              await enableManagedOpenClawPlugins(target === "clawjs-context" ? "context" : "clawjs", processHost, resolvedRuntimeOptions, pluginBridgePolicy);
            }
            for (const [pluginId, config] of Object.entries(plugins)) {
              if (config.enabled !== false) continue;
              if (pluginId === "clawjs" || pluginId === "clawjs-context") {
                await disableManagedOpenClawPlugins(pluginId === "clawjs-context" ? "context" : "clawjs", processHost, resolvedRuntimeOptions, pluginBridgePolicy);
              }
            }
          }
          await refreshObservedDomain("plugins");
          break;
        case "files":
          break;
        case "sessions":
          await refreshObservedDomain("sessions");
          break;
        case "speech":
          writeSpeechConfig((intent.tts ?? {}) as TtsProviderConfig | null);
          writeSttConfig((intent.stt ?? {}) as SttProviderConfig | null);
          break;
      }

      actions.push({ domain, featureId: feature.featureId, ownership: feature.ownership, supported: true, status: "applied", message: `Applied ${domain} intent.` });
    }

    return {
      appliedAt: new Date().toISOString(),
      domains,
      dryRun,
      actions,
    };
  }

  async function planIntent(options: { domains?: IntentDomain[]; dryRun?: boolean } = {}) {
    const diff = await diffIntent({ domains: options.domains });
    const domains = diff.domains;
    return {
      generatedAt: new Date().toISOString(),
      domains,
      dryRun: options.dryRun === true,
      actions: domains.map((domain) => {
        const feature = featureForDomain(domain);
        const relatedIssues = diff.issues.filter((issue) => issue.domain === domain);
        return {
          domain,
          featureId: feature.featureId,
          ownership: feature.ownership,
          supported: feature.supported,
          needsApply: relatedIssues.length > 0,
          message: relatedIssues[0]?.message ?? `No drift detected for ${domain}.`,
        };
      }),
    };
  }

  return {
    describeFeatures,
    readIntent,
    writeIntent,
    patchIntent,
    refreshObservedDomain,
    refreshObserved,
    diffIntent,
    applyIntent,
    planIntent,
  };
}
