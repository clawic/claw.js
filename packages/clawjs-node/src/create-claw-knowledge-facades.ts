import path from "path";

export function createClawKnowledgeFacades(locals: Record<string, any>): any {
  const { soulStore, userStore, appendAuditEvent, logicalAgentId, eventBus, adapter, processHost, resolvedRuntimeOptions, writeCompatSnapshot, workspaceDir, filesystem, writeCapabilityReport, persistWorkspaceState, persistProviderState, persistSchedulerState, readSchedulers, persistMemoryState, readMemory, persistSkillsState, readSkills, persistChannelsState, readChannels, augmentRuntimeStatusWithPluginBridge, pluginBridgeStatus, pluginBridgePolicy, validateWorkspace, readCompatSnapshot, buildCompatDriftReport, readProviderAuth, listManagedFiles, listManagedBlockProblems, buildCombinedDoctorReport, readModelCatalog, readDefaultModel, patchIntent, applyIntent, readProviderCatalog, readAuthState, prepareAuthLogin, emitAuthLoginProgress, patchProviderIntent, refreshObservedDomain, emitAuthProgress, requiresExplicitProviderEnable, outcomeStore, options, judgmentStore, sessionStore, contextStore, commitmentStore, projectCommitmentReminder, prepareContextPack, rulesStore, learningStore, libraryStore, dataStore } = locals;
  return {
    soul: {
      list: () => soulStore.list(),
      get: (id) => soulStore.get(id),
      init: (input = {}) => soulStore.init(input),
      assign: (input) => soulStore.assign(input),
      assignmentForAgent: (targetAgentId) => soulStore.assignmentForAgent(targetAgentId),
      resolve: (input = {}) => soulStore.resolve(input),
      validate: (input) => soulStore.validate(input),
      preview: (input = {}) => soulStore.preview({ ...input, write: false }),
      compile: (input = {}) => {
        const result = soulStore.compile(input);
        appendAuditEvent("soul.compiled", "file_sync", {
          soulId: result.soulId,
          agentId: result.agentId ?? logicalAgentId,
          changed: result.changed,
        });
        eventBus.emit("soul.compiled", {
          soulId: result.soulId,
          agentId: result.agentId ?? logicalAgentId,
          changed: result.changed,
        });
        return result;
      },
      inspect: (id, targetAgentId) => soulStore.inspect(id, targetAgentId),
    },
    user: {
      list: () => userStore.list(),
      get: (id) => userStore.get(id),
      init: (input = {}) => userStore.init(input),
      packs: (targetUserId) => userStore.packs(targetUserId),
      enablePack: (input) => userStore.enablePack(input.userId, input.id),
      disablePack: (input) => userStore.disablePack(input.userId, input.id),
      domains: (targetUserId) => userStore.domains(targetUserId),
      enableDomain: (input) => userStore.enableDomain(input.userId, input.id),
      disableDomain: (input) => userStore.disableDomain(input.userId, input.id),
      set: (input) => userStore.set(input),
      add: (input) => userStore.addRecord(input),
      wizard: (input) => userStore.wizard(input),
      addEntity: (input) => userStore.addEntity(input),
      getEntity: (id, targetUserId) => userStore.getEntity(id, targetUserId),
      listEntities: (input = {}) => userStore.listEntities(input.userId, input.type),
      link: (input) => userStore.link(input),
      query: (input = {}) => userStore.query(input as Parameters<typeof userStore.query>[0]),
      delete: (id, targetUserId) => userStore.delete(id, targetUserId),
      review: {
        list: (input = {}) => userStore.reviewList(input),
        show: (id, targetUserId) => userStore.reviewShow(id, targetUserId),
        approve: (id, targetUserId) => userStore.verify(id, targetUserId),
        reject: (id, targetUserId, reason) => userStore.reviewReject(id, targetUserId, reason),
        edit: (id, patch, targetUserId) => userStore.reviewEdit(id, patch, targetUserId),
        approveMany: (ids, targetUserId) => userStore.reviewApproveMany(ids, targetUserId),
      },
      merge: {
        propose: (input = {}) => userStore.proposeMerge(input),
        approve: (id, targetUserId) => userStore.decideMerge(id, "approved", targetUserId),
        reject: (id, targetUserId) => userStore.decideMerge(id, "rejected", targetUserId),
      },
      supersede: (id, input) => userStore.supersede(id, input),
      classify: (text) => userStore.classify(text),
      extractMemory: (input) => userStore.extractMemory(input),
      propose: (input) => userStore.propose(input),
      verify: (proposalId, targetUserId) => userStore.verify(proposalId, targetUserId),
      assign: (input) => userStore.assign(input),
      assignmentForAgent: (targetAgentId) => userStore.assignmentForAgent(targetAgentId),
      resolve: (input = {}) => userStore.resolve(input),
      validate: (input) => userStore.validate(input),
      preview: (input = {}) => userStore.preview({ ...input, write: false }),
      compile: (input = {}) => {
        const result = userStore.compile(input);
        appendAuditEvent("user.compiled", "file_sync", {
          userId: result.userId,
          agentId: result.agentId ?? logicalAgentId,
          changed: result.changed,
        });
        eventBus.emit("user.compiled", {
          userId: result.userId,
          agentId: result.agentId ?? logicalAgentId,
          changed: result.changed,
        });
        return result;
      },
      inspect: (id, targetAgentId) => userStore.inspect(id, targetAgentId),
    },
    compat: {
      refresh: async () => {
        const status = await adapter.getStatus(processHost, resolvedRuntimeOptions);
        const compat = adapter.buildCompatReport(status);
        const snapshot = writeCompatSnapshot(workspaceDir, status, compat, filesystem);
        writeCapabilityReport(workspaceDir, {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          runtimeAdapter: compat.runtimeAdapter,
          runtimeVersion: compat.runtimeVersion,
          degraded: compat.degraded,
          capabilities: compat.capabilities,
          capabilityMap: compat.capabilityMap,
          issues: compat.issues,
          ...(compat.diagnostics ? { diagnostics: compat.diagnostics } : {}),
        }, filesystem);
        persistSchedulerState(await readSchedulers());
        persistMemoryState(await readMemory());
        persistSkillsState(await readSkills());
        persistChannelsState(await readChannels());
        appendAuditEvent("compat.refreshed", "compat", {
          degraded: compat.degraded,
          issueCount: compat.issues.length,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("compat.refreshed", {
          degraded: compat.degraded,
          issueCount: compat.issues.length,
          runtimeAdapter: adapter.id,
        });
        return snapshot;
      },
      read: () => readCompatSnapshot(workspaceDir, filesystem),
    },
    doctor: {
      run: async () => {
        const baseStatus = await adapter.getStatus(processHost, resolvedRuntimeOptions);
        const status = await augmentRuntimeStatusWithPluginBridge(baseStatus);
        const compat = adapter.buildCompatReport(status);
        const runtimeDoctor = adapter.buildDoctorReport(status);
        if (adapter.id === "openclaw") {
          const bridgeStatus = await pluginBridgeStatus();
          if (pluginBridgePolicy.mode === "managed" && bridgeStatus.supported) {
            if (!bridgeStatus.basePlugin.installed) {
              runtimeDoctor.issues.push("Managed ClawJS OpenClaw plugin is not installed.");
              runtimeDoctor.suggestedRepairs.push(`Install ${bridgeStatus.basePlugin.packageSpec} or call runtime.plugins.ensure().`);
            } else if (!bridgeStatus.basePlugin.enabled) {
              runtimeDoctor.issues.push("Managed ClawJS OpenClaw plugin is installed but disabled.");
              runtimeDoctor.suggestedRepairs.push("Enable the `clawjs` OpenClaw plugin or call runtime.plugins.ensure().");
            }
            if (pluginBridgePolicy.enableContextEngine && bridgeStatus.contextPlugin.selectedEngineId !== "clawjs-context") {
              runtimeDoctor.issues.push("Managed ClawJS context engine is not selected in plugins.slots.contextEngine.");
              runtimeDoctor.suggestedRepairs.push("Select `clawjs-context` in plugins.slots.contextEngine or call runtime.plugins.ensure().");
            }
          }
        }
        const workspace = validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles);
        const compatSnapshot = readCompatSnapshot(workspaceDir, filesystem);
        const compatDrift = buildCompatDriftReport(compatSnapshot, status, compat);
        const providerSummaries = await readProviderAuth();
        const schedulers = await readSchedulers();
        const memory = await readMemory();
        const skills = await readSkills();
        const channels = await readChannels();
        persistWorkspaceState(workspace);
        persistProviderState(providerSummaries, []);
        persistSchedulerState(schedulers);
        persistMemoryState(memory);
        persistSkillsState(skills);
        persistChannelsState(channels);
        const managedBlockProblems = Array.from(new Set(
          listManagedFiles(workspaceDir, adapter.workspaceFiles)
            .flatMap((filePath) => listManagedBlockProblems(filesystem.tryReadText(filePath)).map((problem) => ({
              ...problem,
              message: `${path.basename(filePath)}: ${problem.message}`,
            }))),
        ));
        return buildCombinedDoctorReport({
          runtime: status,
          compat,
          runtimeDoctor,
          workspace,
          compatSnapshot,
          compatDrift,
          managedBlockProblems,
          missingProvidersInUse: [],
          providerSummaries,
        });
      },
    },
    models: {
      list: async () => {
        try {
          return await adapter.listModels(processHost, resolvedRuntimeOptions);
        } catch {
          return [];
        }
      },
      catalog: async () => readModelCatalog(),
      getDefault: async () => readDefaultModel(),
      setDefault: async (model) => {
        patchIntent("models", {
          defaultModel: model,
        });
        const result = await applyIntent({ domains: ["models"] });
        const modelId = await readDefaultModel();
        appendAuditEvent("models.default_set", "models", { modelId, runtimeAdapter: adapter.id });
        eventBus.emit("models.default_set", { modelId, runtimeAdapter: adapter.id });
        if (result.actions.some((action) => action.domain === "models" && action.status === "unsupported")) {
          throw new Error(`Model intents are unsupported for adapter ${adapter.id}`);
        }
        return modelId?.modelId ?? model;
      },
    },
    providers: {
      list: async () => (await readProviderCatalog()).providers,
      catalog: async () => readProviderCatalog(),
      authState: async () => {
        const state = await readAuthState();
        persistProviderState(state.providers, []);
        return state;
      },
    },
    auth: {
      status: async () => {
        const summaries = await readProviderAuth();
        persistProviderState(summaries, []);
        return summaries;
      },
      diagnostics: (provider) => adapter.diagnostics(provider, resolvedRuntimeOptions),
      prepareLogin: async (provider) => prepareAuthLogin(provider),
      login: async (provider, loginOptions = {}) => {
        const requestedProvider = provider.trim();
        emitAuthLoginProgress({
          phase: "auth.login",
          status: "start",
          provider: requestedProvider,
          timestamp: new Date().toISOString(),
          step: "checking_existing_auth",
          message: "Checking whether an existing provider auth can be reused.",
        }, loginOptions.onProgress);
        try {
          const plan = await prepareAuthLogin(requestedProvider);
          if (plan.status === "reused") {
            patchProviderIntent(plan.provider, {
              enabled: true,
              preferredAuthMode: "oauth",
              metadata: {
                lastLoginStartedAt: new Date().toISOString(),
                lastLoginReuseAt: new Date().toISOString(),
              },
            });
            const reused = {
              requestedProvider: plan.requestedProvider,
              provider: plan.provider,
              status: "reused",
              launchMode: "none",
              message: plan.message,
            };
            emitAuthLoginProgress({
              phase: "auth.login",
              status: "complete",
              provider: reused.provider,
              timestamp: new Date().toISOString(),
              step: "reused_existing_auth",
              result: reused.status,
              launchMode: reused.launchMode,
              message: reused.message,
            }, loginOptions.onProgress);
            return reused;
          }

          const launched = await adapter.login(requestedProvider, processHost, {
            ...resolvedRuntimeOptions,
            setDefault: loginOptions.setDefault,
            cwd: workspaceDir,
            env: loginOptions.env ?? resolvedRuntimeOptions.env,
          });
          patchProviderIntent(launched.provider, {
            enabled: true,
            preferredAuthMode: "oauth",
            metadata: {
              lastLoginStartedAt: new Date().toISOString(),
            },
          });
          appendAuditEvent("auth.login_started", "auth", {
            provider: launched.provider,
            pid: launched.pid,
            launchMode: launched.launchMode,
            runtimeAdapter: adapter.id,
          });
          eventBus.emit("auth.login_started", {
            provider: launched.provider,
            pid: launched.pid,
            launchMode: launched.launchMode,
            runtimeAdapter: adapter.id,
          });
          emitAuthLoginProgress({
            phase: "auth.login",
            status: "complete",
            provider: launched.provider,
            timestamp: new Date().toISOString(),
            step: "launching_interactive_flow",
            result: launched.status,
            launchMode: launched.launchMode,
            ...(typeof launched.pid === "number" ? { pid: launched.pid } : {}),
            ...(launched.command ? { command: launched.command } : {}),
            ...(launched.args ? { args: launched.args } : {}),
            ...(launched.message ? { message: launched.message } : {}),
          }, loginOptions.onProgress);
          return launched;
        } catch (error) {
          emitAuthLoginProgress({
            phase: "auth.login",
            status: "error",
            provider: requestedProvider,
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : "login failed",
          }, loginOptions.onProgress);
          throw error;
        }
      },
      setApiKey: (provider, key, profileId) => {
        emitAuthProgress("auth.api_key.save", "start", provider);
        try {
          const summary = adapter.setApiKey(provider, key, {
            ...resolvedRuntimeOptions,
            ...(profileId ? { profileId } : {}),
          });
          patchProviderIntent(provider, {
            enabled: true,
            preferredAuthMode: "api_key",
            profileId: summary.profileId,
          });
          refreshObservedDomain("providers").catch(() => undefined);
          appendAuditEvent("auth.api_key_saved", "auth", {
            provider,
            profileId: summary.profileId,
            runtimeAdapter: adapter.id,
          });
          eventBus.emit("auth.api_key_saved", {
            provider,
            profileId: summary.profileId,
            runtimeAdapter: adapter.id,
          });
          emitAuthProgress("auth.api_key.save", "complete", provider, {
            profileId: summary.profileId,
            mode: "store",
          });
          return summary;
        } catch (error) {
          emitAuthProgress("auth.api_key.save", "error", provider, {
            message: error instanceof Error ? error.message : "save failed",
          });
          throw error;
        }
      },
      saveApiKey: async (provider, key, saveOptions = {}) => {
        emitAuthProgress("auth.api_key.save", "start", provider);
        try {
          const persisted = await adapter.saveApiKey(provider, key, processHost, {
            ...resolvedRuntimeOptions,
            ...(saveOptions.profileId ? { profileId: saveOptions.profileId } : {}),
            ...(saveOptions.runtimeCommand ? { runtimeCommand: saveOptions.runtimeCommand } : {}),
          });
          patchProviderIntent(provider, {
            enabled: true,
            preferredAuthMode: "api_key",
            profileId: persisted.summary.profileId,
          });
          await refreshObservedDomain("providers");
          appendAuditEvent("auth.api_key_saved", "auth", {
            provider,
            profileId: persisted.summary.profileId,
            mode: persisted.mode,
            runtimeAdapter: adapter.id,
          });
          eventBus.emit("auth.api_key_saved", {
            provider,
            profileId: persisted.summary.profileId,
            mode: persisted.mode,
            runtimeAdapter: adapter.id,
          });
          emitAuthProgress("auth.api_key.save", "complete", provider, {
            profileId: persisted.summary.profileId,
            mode: persisted.mode,
          });
          return persisted;
        } catch (error) {
          emitAuthProgress("auth.api_key.save", "error", provider, {
            message: error instanceof Error ? error.message : "save failed",
          });
          throw error;
        }
      },
      setProviderEnabled: async (provider, enabled, intentOptions = {}) => {
        const patch: {
          enabled: boolean;
          preferredAuthMode?: "oauth" | "token" | "api_key" | "env" | "secret_ref" | null;
          secretRef?: string | null;
          profileId?: string | null;
          metadata?: Record<string, unknown>;
        } = { enabled };
        if ("preferredAuthMode" in intentOptions) {
          patch.preferredAuthMode = intentOptions.preferredAuthMode ?? null;
        }
        if ("secretRef" in intentOptions) {
          patch.secretRef = intentOptions.secretRef ?? null;
        }
        if ("profileId" in intentOptions) {
          patch.profileId = intentOptions.profileId ?? null;
        }
        if (intentOptions.metadata) {
          patch.metadata = intentOptions.metadata;
        }

        patchProviderIntent(provider, patch);
        if (!enabled && !requiresExplicitProviderEnable(provider)) {
          adapter.removeProvider(provider, resolvedRuntimeOptions);
        }
        await refreshObservedDomain("providers");
        appendAuditEvent("auth.provider_intent_updated", "auth", {
          provider,
          enabled,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("auth.provider_intent_updated", {
          provider,
          enabled,
          runtimeAdapter: adapter.id,
        });
      },
      removeProvider: (provider) => {
        emitAuthProgress("auth.remove", "start", provider);
        const removed = adapter.removeProvider(provider, resolvedRuntimeOptions);
        patchProviderIntent(provider, {
          enabled: false,
        });
        refreshObservedDomain("providers").catch(() => undefined);
        if (removed > 0) {
          appendAuditEvent("auth.provider_removed", "auth", {
            provider,
            removed,
            runtimeAdapter: adapter.id,
          });
          eventBus.emit("auth.provider_removed", {
            provider,
            removed,
            runtimeAdapter: adapter.id,
          });
        }
        emitAuthProgress("auth.remove", "complete", provider, { removed });
        return removed;
      },
    },
    scheduler: {
      list: async () => {
        const schedulers = await readSchedulers();
        persistSchedulerState(schedulers);
        return schedulers;
      },
      run: async (id) => {
        await adapter.runScheduler(id, processHost, resolvedRuntimeOptions);
        appendAuditEvent("scheduler.run", "scheduler", { id, runtimeAdapter: adapter.id });
        eventBus.emit("scheduler.run", { id, runtimeAdapter: adapter.id });
      },
      enable: async (id) => {
        await adapter.setSchedulerEnabled(id, true, processHost, resolvedRuntimeOptions);
        appendAuditEvent("scheduler.enabled", "scheduler", { id, runtimeAdapter: adapter.id });
        eventBus.emit("scheduler.enabled", { id, runtimeAdapter: adapter.id });
      },
      disable: async (id) => {
        await adapter.setSchedulerEnabled(id, false, processHost, resolvedRuntimeOptions);
        appendAuditEvent("scheduler.disabled", "scheduler", { id, runtimeAdapter: adapter.id });
        eventBus.emit("scheduler.disabled", { id, runtimeAdapter: adapter.id });
      },
    },
    memory: {
      list: async () => {
        const memory = await readMemory();
        persistMemoryState(memory);
        return memory;
      },
      search: async (query) => {
        const memory = await adapter.searchMemory(query, processHost, resolvedRuntimeOptions);
        persistMemoryState(memory);
        return memory;
      },
    },
    outcomes: {
      add: (input) => {
        const outcome = outcomeStore.add({
          ...input,
          agentId: input.agentId ?? logicalAgentId,
          workspaceId: input.workspaceId ?? options.workspace.workspaceId,
        }, {
          judgment: input.judgment ? judgmentStore.get(input.judgment) : null,
        });
        appendAuditEvent("outcome.added", "outcome", {
          outcomeId: outcome.id,
          result: outcome.result,
          score: outcome.score,
          judgmentId: input.judgment,
        });
        eventBus.emit("outcome.added", {
          outcomeId: outcome.id,
          result: outcome.result,
          score: outcome.score,
          judgmentId: input.judgment,
        });
        return outcome;
      },
      capture: (input) => {
        const session = sessionStore.getSession(input.sessionId);
        const result = outcomeStore.captureSession(session, {
          agentId: logicalAgentId,
          workspaceId: options.workspace.workspaceId,
        });
        appendAuditEvent("outcome.captured", "outcome", {
          sessionId: input.sessionId,
          count: result.outcomes.length,
          ignored: result.ignored,
        });
        eventBus.emit("outcome.captured", {
          sessionId: input.sessionId,
          count: result.outcomes.length,
          ignored: result.ignored,
        });
        return result;
      },
      list: (input = {}) => outcomeStore.list(input),
      show: (id) => outcomeStore.get(id),
      link: (id, input) => {
        const outcome = outcomeStore.link(id, input, {
          judgment: input.judgment ? judgmentStore.get(input.judgment) : null,
        });
        appendAuditEvent("outcome.linked", "outcome", {
          outcomeId: outcome.id,
        });
        eventBus.emit("outcome.linked", {
          outcomeId: outcome.id,
        });
        return outcome;
      },
      archive: (id, reason) => {
        const outcome = outcomeStore.archive(id, reason);
        appendAuditEvent("outcome.archived", "outcome", {
          outcomeId: outcome.id,
          reason,
        });
        eventBus.emit("outcome.archived", {
          outcomeId: outcome.id,
          reason,
        });
        return outcome;
      },
    },
    context: {
      prepare: (input) => prepareContextPack(input),
      list: (input = {}) => contextStore.list(input),
      show: (id) => contextStore.get(id),
      archive: (id, reason) => {
        const pack = contextStore.archive(id, reason);
        appendAuditEvent("context.archived", "context", {
          contextPackId: pack.id,
          reason,
        });
        eventBus.emit("context.archived", {
          contextPackId: pack.id,
          reason,
        });
        return pack;
      },
    },
    commitments: {
      capture: (input) => {
        const session = sessionStore.getSession(input.sessionId);
        const result = commitmentStore.captureSession(session, {
          ...input,
          ownerAgentId: input.ownerAgentId ?? logicalAgentId,
          agentId: input.agentId ?? logicalAgentId,
          workspaceId: input.workspaceId ?? options.workspace.workspaceId,
        });
        appendAuditEvent("commitments.captured", "commitments", { sessionId: input.sessionId, count: result.commitments.length, ignored: result.ignored });
        eventBus.emit("commitments.captured", { sessionId: input.sessionId, count: result.commitments.length, ignored: result.ignored });
        return result;
      },
      add: async (input) => {
        const commitment = commitmentStore.add({
          ...input,
          ownerAgentId: input.ownerAgentId ?? logicalAgentId,
          agentId: input.agentId ?? logicalAgentId,
          workspaceId: input.workspaceId ?? options.workspace.workspaceId,
        });
        const projected = await projectCommitmentReminder(commitment);
        appendAuditEvent("commitments.added", "commitments", { commitmentId: projected.id, kind: projected.kind, reminderCount: projected.links.reminders.length });
        eventBus.emit("commitments.added", { commitmentId: projected.id, kind: projected.kind, reminderCount: projected.links.reminders.length });
        return projected;
      },
      list: (input = {}) => commitmentStore.list(input),
      show: (id) => commitmentStore.get(id),
      fulfill: (id, input) => {
        const commitment = commitmentStore.fulfill(id, input);
        appendAuditEvent("commitments.fulfilled", "commitments", { commitmentId: commitment.id });
        eventBus.emit("commitments.fulfilled", { commitmentId: commitment.id });
        return commitment;
      },
      miss: (id, input) => {
        const commitment = commitmentStore.miss(id, input);
        appendAuditEvent("commitments.missed", "commitments", { commitmentId: commitment.id });
        eventBus.emit("commitments.missed", { commitmentId: commitment.id });
        return commitment;
      },
      cancel: (id, reason) => {
        const commitment = commitmentStore.cancel(id, reason);
        appendAuditEvent("commitments.cancelled", "commitments", { commitmentId: commitment.id, reason });
        eventBus.emit("commitments.cancelled", { commitmentId: commitment.id, reason });
        return commitment;
      },
      link: (id, input) => {
        const commitment = commitmentStore.link(id, input);
        appendAuditEvent("commitments.linked", "commitments", { commitmentId: commitment.id });
        eventBus.emit("commitments.linked", { commitmentId: commitment.id });
        return commitment;
      },
    },
    judgment: {
      prepare: (input) => {
        const contextPack = prepareContextPack({
          query: input.question,
          purpose: "judgment",
          domain: input.domain,
          sessionId: input.sessionId,
        });
        const rules = rulesStore.compile({
          prompt: input.question,
          domain: input.domain,
          agent: logicalAgentId,
        });
        const activeLearnings = learningStore.list({ status: "active" });
        const session = input.sessionId ? sessionStore.getSession(input.sessionId) : null;
        const judgment = judgmentStore.prepare({
          ...input,
          contextPackId: contextPack.id,
          agentId: logicalAgentId,
          workspaceId: options.workspace.workspaceId,
        }, {
          rules: rules.included,
          learnings: activeLearnings,
          commitments: commitmentStore.relevantTo(input.question, input.options ?? []),
          user: userStore.resolve({ agentId: logicalAgentId }),
          soul: soulStore.resolve({ agentId: logicalAgentId }),
          session,
        });
        appendAuditEvent("judgment.prepared", "judgment", {
          judgmentId: judgment.id,
          recommendation: judgment.recommendation,
          confidence: judgment.confidence,
          domain: judgment.domain,
        });
        eventBus.emit("judgment.prepared", {
          judgmentId: judgment.id,
          recommendation: judgment.recommendation,
          confidence: judgment.confidence,
          domain: judgment.domain,
        });
        return judgment;
      },
      record: (id, input) => {
        const judgment = judgmentStore.record(id, input);
        appendAuditEvent("judgment.decided", "judgment", {
          judgmentId: judgment.id,
          chosenOption: judgment.chosenOption,
          confidence: judgment.confidence,
        });
        eventBus.emit("judgment.decided", {
          judgmentId: judgment.id,
          chosenOption: judgment.chosenOption,
          confidence: judgment.confidence,
        });
        return judgment;
      },
      list: (input = {}) => judgmentStore.list(input),
      show: (id) => judgmentStore.get(id),
      link: (id, input) => {
        const judgment = judgmentStore.link(id, input);
        appendAuditEvent("judgment.linked", "judgment", {
          judgmentId: judgment.id,
        });
        eventBus.emit("judgment.linked", {
          judgmentId: judgment.id,
        });
        return judgment;
      },
      archive: (id, reason) => {
        const judgment = judgmentStore.archive(id, reason);
        appendAuditEvent("judgment.archived", "judgment", {
          judgmentId: judgment.id,
          reason,
        });
        eventBus.emit("judgment.archived", {
          judgmentId: judgment.id,
          reason,
        });
        return judgment;
      },
    },
    learning: {
      capture: (input) => {
        const session = sessionStore.getSession(input.sessionId);
        const result = learningStore.captureSession(session);
        appendAuditEvent("learning.captured", "memory", {
          sessionId: input.sessionId,
          count: result.learnings.length,
          ignored: result.ignored,
        });
        eventBus.emit("learning.captured", {
          sessionId: input.sessionId,
          count: result.learnings.length,
          ignored: result.ignored,
        });
        return result;
      },
      add: (input) => {
        const learning = learningStore.add(input);
        appendAuditEvent("learning.added", "memory", {
          learningId: learning.id,
          target: learning.target,
          kind: learning.kind,
        });
        eventBus.emit("learning.added", {
          learningId: learning.id,
          target: learning.target,
          kind: learning.kind,
        });
        return learning;
      },
      list: (input = {}) => learningStore.list(input),
      show: (id) => learningStore.get(id),
      addEvidence: (id, input) => {
        const learning = learningStore.addEvidence(id, input);
        appendAuditEvent("learning.evidence_added", "memory", {
          learningId: learning.id,
          evidenceCount: learning.evidence.length,
          confidence: learning.confidence,
        });
        eventBus.emit("learning.evidence_added", {
          learningId: learning.id,
          evidenceCount: learning.evidence.length,
          confidence: learning.confidence,
        });
        return learning;
      },
      promote: (id, input) => {
        const preview = learningStore.previewPromotion(id, input.to);
        const shouldApply = input.apply === true;
        if (!shouldApply || input.dryRun === true) {
          return { ...preview, applied: false };
        }
        if (!preview.writable) {
          throw new Error(`Learning promotion to ${input.to} is dry-run only.`);
        }
        let result: Record<string, unknown>;
        if (input.to === "rule") {
          if (!rulesStore.readState().scopes.some((scope) => scope.id === "clawjs")) {
            rulesStore.upsertScope({ id: "clawjs", kind: "user", name: "global", aliases: ["ClawJS", "claw", "clawjs", "default"] });
          }
          result = rulesStore.propose(preview.payload as unknown as Parameters<typeof rulesStore.propose>[0]) as unknown as Record<string, unknown>;
        } else if (input.to === "user") {
          result = userStore.propose(preview.payload as Parameters<typeof userStore.propose>[0]) as unknown as Record<string, unknown>;
        } else if (input.to === "skill") {
          const payload = preview.payload as unknown as Parameters<typeof libraryStore.create>[0];
          const existing = payload.id ? libraryStore.get(String(payload.id)) : null;
          result = existing
            ? libraryStore.update(existing.id, payload as Parameters<typeof libraryStore.update>[1]) as unknown as Record<string, unknown>
            : libraryStore.create(payload) as unknown as Record<string, unknown>;
        } else if (input.to === "memory") {
          const payload = preview.payload as Record<string, unknown>;
          const collection = dataStore.collection<Record<string, unknown>>("memory");
          const timestamp = new Date().toISOString();
          const record = {
            ...payload,
            id: String(payload.id ?? `learning-${id}`),
            source: "learning",
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          collection.put(record.id as string, record);
          result = record;
        } else {
          throw new Error(`Learning promotion to ${input.to} is dry-run only.`);
        }
        learningStore.recordPromotion(id, {
          target: input.to,
          dryRun: false,
          applied: true,
          payload: preview.payload,
          result,
        });
        appendAuditEvent("learning.promoted", "memory", {
          learningId: id,
          target: input.to,
        });
        eventBus.emit("learning.promoted", {
          learningId: id,
          target: input.to,
        });
        return { ...preview, applied: true, result };
      },
      archive: (id, reason) => {
        const learning = learningStore.archive(id, reason);
        appendAuditEvent("learning.archived", "memory", {
          learningId: learning.id,
          reason,
        });
        eventBus.emit("learning.archived", {
          learningId: learning.id,
          reason,
        });
        return learning;
      },
    },
  };
}
