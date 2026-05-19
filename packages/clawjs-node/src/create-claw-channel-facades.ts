// @ts-nocheck
import { evaluateRegulatedAction } from "@clawjs/core";

function requireExternalSendApproval(input: Record<string, unknown>, operation: string): { approvalId: string; legalLabel: string; policy: ReturnType<typeof evaluateRegulatedAction> } {
  const approvalId = typeof input?.approvalId === "string" ? input.approvalId.trim() : "";
  const legalLabel = typeof input?.legalLabel === "string" && input.legalLabel.trim()
    ? input.legalLabel.trim()
    : approvalId ? "External channel send - human reviewed" : "";
  const policy = evaluateRegulatedAction({
    regulatedDomain: "identity",
    decisionEffect: "external_action",
    requestedUse: "non_final_draft",
    externalAction: true,
    sensitiveExport: operation.includes("Media") || Boolean(input?.media),
    policyConfig: {
      confirmed: Boolean(approvalId),
      approvalId,
      legalLabel,
      materialConsent: Boolean(approvalId),
      destinationAuthorized: Boolean(approvalId),
    },
  });
  if (policy.policyDecision === "block") {
    throw new Error(`${operation} is blocked by regulated safety policy: ${policy.reasonCodes.join(", ") || "blocked"}.`);
  }
  if (!policy.allowed && !approvalId) {
    throw new Error(`${operation} requires explicit approvalId before external send.`);
  }
  if (!policy.allowed) {
    throw new Error(`${operation} requires policy confirmation before external send: ${policy.requirements.join(", ")}.`);
  }
  return { approvalId, legalLabel, policy };
}

export function createClawChannelFacades(locals: Record<string, any>): any {
  const { readChannels, persistChannelsState, channelsRegistry, patchTelegramChannelIntent, connectTelegramAccount, processHost, secretsEnv, ensureTelegramCodexBridgeCommands, refreshChannelSnapshots, appendAuditEvent, adapter, eventBus, refreshTelegramAccountStatus, runChannelListener, sendTelegramAccountMessage, registerOutboundChannelMedia, syncTelegramAccount, registerInboundTelegramMedia, ingestTelegramVoiceNote, setTelegramAccountCommands, getTelegramAccountCommands, ensureTelegramBotSecretReference, telegram, recordTelegramStatusInChannels, disableTelegramAccountWebhook, configureTelegramAccountWebhook, callTelegramApi, callTelegramAccountBooleanMethod, callTelegramAccountRecordMethod, downloadTelegramFile, getTelegramAccountChat, listTelegramAccountChats, telegramBanOrRestrictParams, telegramInviteLinkParams, slack, whatsapp } = locals;
  return {
    channels: {
      list: async () => {
        const channels = await readChannels();
        persistChannelsState(channels);
        return channels;
      },
      accounts: {
        registerTelegramBot: async (input) => {
          const { accountId, label, ...telegramInput } = input;
          patchTelegramChannelIntent({
            enabled: true,
            secretRef: telegramInput.secretName,
            config: {
              accountId: accountId ?? "default",
              ...(telegramInput.apiBaseUrl ? { apiBaseUrl: telegramInput.apiBaseUrl } : {}),
              ...(telegramInput.webhookUrl ? { webhookUrl: telegramInput.webhookUrl } : {}),
              ...(telegramInput.webhookSecretToken ? { webhookSecretToken: telegramInput.webhookSecretToken } : {}),
              ...(telegramInput.allowedUpdates ? { allowedUpdates: telegramInput.allowedUpdates } : {}),
              ...(typeof telegramInput.dropPendingUpdates === "boolean" ? { dropPendingUpdates: telegramInput.dropPendingUpdates } : {}),
            },
          });
          const account = await connectTelegramAccount({
            registry: channelsRegistry,
            runner: processHost,
            env: secretsEnv,
          }, {
            ...telegramInput,
            accountId,
            label,
          });
          await ensureTelegramCodexBridgeCommands(account.accountId);
          await refreshChannelSnapshots();
          appendAuditEvent("telegram.connected", "channels", {
            secretName: telegramInput.secretName,
            accountId: account.accountId,
            mode: (account.transport as TelegramTransportStatus | null)?.mode,
            runtimeAdapter: adapter.id,
          });
          eventBus.emit("telegram.connected", {
            secretName: telegramInput.secretName,
            accountId: account.accountId,
            mode: (account.transport as TelegramTransportStatus | null)?.mode,
            runtimeAdapter: adapter.id,
          });
          return account;
        },
        list: (provider) => channelsRegistry.accounts.list(provider),
        get: (provider, accountId) => channelsRegistry.accounts.get(provider, accountId),
        status: async (provider) => {
          if (!provider || provider === "telegram") {
            const accounts = channelsRegistry.accounts.list("telegram");
            for (const account of accounts) {
              await refreshTelegramAccountStatus({
                registry: channelsRegistry,
                runner: processHost,
                env: secretsEnv,
              }, account.accountId);
            }
            await refreshChannelSnapshots();
          }
          return channelsRegistry.accounts.list(provider);
        },
        remove: async (provider, accountId) => {
          channelsRegistry.accounts.remove(provider, accountId);
          await refreshChannelSnapshots();
          return channelsRegistry.accounts.list(provider);
        },
      },
      targets: {
        register: (input) => channelsRegistry.targets.register(input),
        list: (input) => channelsRegistry.targets.list(input),
        get: (provider, accountId, targetId, threadId) => channelsRegistry.targets.get(provider, accountId, targetId, threadId),
      },
      bindings: {
        grant: (input) => channelsRegistry.bindings.grant(input),
        revoke: (id) => channelsRegistry.bindings.revoke(id),
        list: (input) => channelsRegistry.bindings.list(input),
        can: (agentId, permission, selector) => channelsRegistry.bindings.can(agentId, permission, selector),
      },
      processors: {
        register: (input) => channelsRegistry.processors.register(input),
        list: () => channelsRegistry.processors.list(),
        get: (id) => channelsRegistry.processors.get(id),
        remove: (id) => channelsRegistry.processors.remove(id),
      },
      listeners: {
        upsert: (input) => channelsRegistry.listeners.upsert(input),
        list: (input) => channelsRegistry.listeners.list(input),
        get: (provider, accountId) => channelsRegistry.listeners.get(provider, accountId),
        remove: (provider, accountId) => channelsRegistry.listeners.remove(provider, accountId),
      },
      events: {
        list: (input) => channelsRegistry.events.list(input),
      },
      listen: {
        run: (input) => runChannelListener(input),
      },
      messages: {
        send: async (input) => {
          const review = requireExternalSendApproval(input, "channels.messages.send");
          const provider = input.provider ?? "telegram";
          const accountId = input.accountId ?? "default";
          if (provider !== "telegram") {
            throw new Error(`unsupported channel provider: ${provider}`);
          }
          if (!channelsRegistry.bindings.can(input.agentId, "write", { provider, accountId, targetId: input.targetId })) {
            throw new Error(`agent ${input.agentId} does not have write permission for ${provider}:${input.targetId}`);
          }
          const message = await sendTelegramAccountMessage({
            registry: channelsRegistry,
            runner: processHost,
            env: secretsEnv,
          }, {
            ...input,
            provider,
            accountId,
          });
          if (input.media) {
            registerOutboundChannelMedia({
              provider,
              accountId,
              targetId: input.targetId,
              threadId: input.threadId,
              media: input.media,
              mediaType: input.mediaType,
              text: input.text,
              agentId: input.agentId,
              approvalId: review.approvalId,
              response: message.raw as Record<string, unknown> | undefined,
              command: "channels messages send",
            });
          }
          return message;
        },
        read: (input) => channelsRegistry.messages.read(input),
        sync: async (input = {}) => {
          const provider = input.provider ?? "telegram";
          if (provider !== "telegram") {
            throw new Error(`unsupported channel provider: ${provider}`);
          }
          const records = await syncTelegramAccount({
            registry: channelsRegistry,
            runner: processHost,
            env: secretsEnv,
          }, input);
          const processedRecords = [];
          for (const record of records) {
            registerInboundTelegramMedia(record);
            processedRecords.push(await ingestTelegramVoiceNote(record));
          }
          await refreshChannelSnapshots();
          return processedRecords;
        },
      },
      commands: {
        set: async (provider, commands, input) => {
          if (provider !== "telegram") {
            throw new Error(`unsupported channel provider: ${provider}`);
          }
          const saved = await setTelegramAccountCommands({
            registry: channelsRegistry,
            runner: processHost,
            env: secretsEnv,
          }, input?.accountId, commands);
          await refreshChannelSnapshots();
          return saved;
        },
        get: async (provider, input) => {
          if (provider !== "telegram") {
            throw new Error(`unsupported channel provider: ${provider}`);
          }
          return getTelegramAccountCommands({
            registry: channelsRegistry,
            runner: processHost,
            env: secretsEnv,
          }, input?.accountId);
        },
      },
    },
    telegram: {
      provisionSecretReference: async (input) => ensureTelegramBotSecretReference(processHost, {
        name: input.secretName,
        apiBaseUrl: input.apiBaseUrl,
        notes: input.notes,
        readOnly: input.readOnly,
      }, { env: secretsEnv }),
      connectBot: async (input) => {
        patchTelegramChannelIntent({
          enabled: true,
          secretRef: input.secretName,
          config: {
            ...(input.apiBaseUrl ? { apiBaseUrl: input.apiBaseUrl } : {}),
            ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
            ...(input.webhookSecretToken ? { webhookSecretToken: input.webhookSecretToken } : {}),
            ...(input.allowedUpdates ? { allowedUpdates: input.allowedUpdates } : {}),
            ...(typeof input.dropPendingUpdates === "boolean" ? { dropPendingUpdates: input.dropPendingUpdates } : {}),
          },
        });
        const status = await telegram.connectBot(input);
        recordTelegramStatusInChannels(status, { secretName: input.secretName });
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.connected", "channels", {
          secretName: input.secretName,
          mode: status.transport.mode,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("telegram.connected", {
          secretName: input.secretName,
          mode: status.transport.mode,
          runtimeAdapter: adapter.id,
        });
        return status;
      },
      status: async () => {
        const status = await telegram.status();
        recordTelegramStatusInChannels(status);
        await refreshChannelSnapshots();
        return status;
      },
      configureWebhook: async (input) => {
        patchTelegramChannelIntent({
          enabled: true,
          config: {
            webhookUrl: input.url,
            ...(input.secretToken ? { webhookSecretToken: input.secretToken } : {}),
            ...(input.allowedUpdates ? { allowedUpdates: input.allowedUpdates } : {}),
            ...(typeof input.dropPendingUpdates === "boolean" ? { dropPendingUpdates: input.dropPendingUpdates } : {}),
          },
        });
        const status = await telegram.configureWebhook(input);
        recordTelegramStatusInChannels(status);
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.webhook_configured", "channels", {
          url: input.url,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("telegram.webhook_configured", {
          url: input.url,
          runtimeAdapter: adapter.id,
        });
        return status;
      },
      disableWebhook: async (input) => {
        patchTelegramChannelIntent({
          config: {
            webhookUrl: null,
            ...(typeof input?.dropPendingUpdates === "boolean" ? { dropPendingUpdates: input.dropPendingUpdates } : {}),
          },
        });
        const status = await telegram.disableWebhook(input);
        recordTelegramStatusInChannels(status);
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.webhook_disabled", "channels", { runtimeAdapter: adapter.id });
        eventBus.emit("telegram.webhook_disabled", { runtimeAdapter: adapter.id });
        return status;
      },
      startPolling: async (input) => {
        patchTelegramChannelIntent({
          enabled: true,
          config: {
            polling: true,
            ...(typeof input?.limit === "number" ? { limit: input.limit } : {}),
            ...(typeof input?.timeoutSeconds === "number" ? { timeoutSeconds: input.timeoutSeconds } : {}),
            ...(typeof input?.dropPendingUpdates === "boolean" ? { dropPendingUpdates: input.dropPendingUpdates } : {}),
          },
        });
        const status = await telegram.startPolling(input);
        recordTelegramStatusInChannels(status);
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.polling_started", "channels", { runtimeAdapter: adapter.id });
        eventBus.emit("telegram.polling_started", { runtimeAdapter: adapter.id });
        return status;
      },
      stopPolling: async () => {
        patchTelegramChannelIntent({
          config: {
            polling: false,
          },
        });
        const status = await telegram.stopPolling();
        recordTelegramStatusInChannels(status);
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.polling_stopped", "channels", { runtimeAdapter: adapter.id });
        eventBus.emit("telegram.polling_stopped", { runtimeAdapter: adapter.id });
        return status;
      },
      setCommands: async (commands) => {
        patchTelegramChannelIntent({
          enabled: true,
          config: {
            commands,
          },
        });
        const saved = await telegram.setCommands(commands);
        appendAuditEvent("telegram.commands_set", "channels", { count: saved.length, runtimeAdapter: adapter.id });
        eventBus.emit("telegram.commands_set", { count: saved.length, runtimeAdapter: adapter.id });
        return saved;
      },
      getCommands: () => telegram.getCommands(),
      sendMessage: async (input) => {
        const review = requireExternalSendApproval(input, "telegram.sendMessage");
        const response = await telegram.sendMessage(input);
        channelsRegistry.messages.recordTelegramOutbound({
          provider: "telegram",
          accountId: "default",
          targetId: String(input.chatId),
          text: input.text,
          threadId: input.messageThreadId,
          metadata: {
            approvalId: review.approvalId,
            legalLabel: review.legalLabel,
            policyDecision: review.policy.policyDecision,
            policyReasonCodes: review.policy.reasonCodes,
          },
        }, response);
        return response;
      },
      sendMedia: async (input) => {
        const review = requireExternalSendApproval(input, "telegram.sendMedia");
        const response = await telegram.sendMedia(input);
        channelsRegistry.messages.recordTelegramOutbound({
          provider: "telegram",
          accountId: "default",
          targetId: String(input.chatId),
          text: input.caption,
          media: input.media,
          threadId: input.messageThreadId,
          metadata: {
            approvalId: review.approvalId,
            legalLabel: review.legalLabel,
            policyDecision: review.policy.policyDecision,
            policyReasonCodes: review.policy.reasonCodes,
          },
        }, response);
        registerOutboundChannelMedia({
          provider: "telegram",
          accountId: "default",
          targetId: String(input.chatId),
          threadId: input.messageThreadId,
          media: input.media,
          mediaType: input.type,
          text: input.caption,
          approvalId: review.approvalId,
          response,
          command: "telegram send",
        });
        return response;
      },
      listChats: (query) => telegram.listChats(query),
      getChat: (chatId) => telegram.getChat(chatId),
      getChatAdministrators: (chatId) => telegram.getChatAdministrators(chatId),
      getChatMember: (chatId, userId) => telegram.getChatMember(chatId, userId),
      setChatPermissions: (chatId, permissions) => telegram.setChatPermissions(chatId, permissions),
      banOrRestrictMember: (input) => telegram.banOrRestrictMember(input),
      createInviteLink: (chatId, options) => telegram.createInviteLink(chatId, options),
      revokeInviteLink: (chatId, inviteLink) => telegram.revokeInviteLink(chatId, inviteLink),
      syncUpdates: async (input) => {
        const updates = await telegram.syncUpdates(input);
        for (const envelope of updates) {
          const record = channelsRegistry.messages.recordTelegramUpdate(envelope);
          if (record) registerInboundTelegramMedia(record);
        }
        await refreshChannelSnapshots();
        if (updates.length > 0) {
          appendAuditEvent("telegram.updates_synced", "channels", { count: updates.length, runtimeAdapter: adapter.id });
          eventBus.emit("telegram.updates_synced", { count: updates.length, runtimeAdapter: adapter.id });
        }
        return updates;
      },
      ingestUpdate: async (update) => {
        const envelope = await telegram.ingestUpdate(update);
        if (envelope) {
          channelsRegistry.messages.recordTelegramUpdate(envelope);
        }
        await refreshChannelSnapshots();
        if (envelope) {
          appendAuditEvent("telegram.update_ingested", "channels", { updateId: envelope.updateId, type: envelope.type, runtimeAdapter: adapter.id });
          eventBus.emit("telegram.update_ingested", { updateId: envelope.updateId, type: envelope.type, runtimeAdapter: adapter.id });
        }
        return envelope;
      },
    },
    slack: {
      connectBot: async (input) => {
        const status = await slack.connectBot(input);
        await refreshChannelSnapshots();
        appendAuditEvent("slack.connected", "channels", {
          secretName: input.secretName,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("slack.connected", {
          secretName: input.secretName,
          runtimeAdapter: adapter.id,
        });
        return status;
      },
      status: async () => {
        const status = await slack.status();
        await refreshChannelSnapshots();
        return status;
      },
      sendMessage: (input) => {
        requireExternalSendApproval(input, "slack.sendMessage");
        return slack.sendMessage(input);
      },
      listChannels: (query) => slack.listChannels(query),
      getChannel: (channelId) => slack.getChannel(channelId),
    },
    whatsapp: {
      connect: async (input) => {
        const status = await whatsapp.connect(input);
        await refreshChannelSnapshots();
        appendAuditEvent("whatsapp.connected", "channels", {
          mode: input.mode,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("whatsapp.connected", {
          mode: input.mode,
          runtimeAdapter: adapter.id,
        });
        return status;
      },
      status: async () => {
        const status = await whatsapp.status();
        await refreshChannelSnapshots();
        return status;
      },
      sendMessage: (input) => {
        requireExternalSendApproval(input, "whatsapp.sendMessage");
        return whatsapp.sendMessage(input);
      },
      disconnect: async () => {
        const status = await whatsapp.disconnect();
        await refreshChannelSnapshots();
        appendAuditEvent("whatsapp.disconnected", "channels", { runtimeAdapter: adapter.id });
        eventBus.emit("whatsapp.disconnected", { runtimeAdapter: adapter.id });
        return status;
      },
    },
  };
}
