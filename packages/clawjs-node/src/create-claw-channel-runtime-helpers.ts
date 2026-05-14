// @ts-nocheck
import fs from "fs";

export function createClawChannelRuntimeHelpers(locals: Record<string, any>): Record<string, any> {
  const {
    invokeChannelProcessor,
    appendChannelSessionMessage,
    channelsRegistry,
    registerInboundTelegramMedia,
    registerOutboundChannelMedia,
    transcribeAudio,
    resolveSttInput,
    voiceNoteStore,
    registerVoiceNoteMedia,
    sendTelegramAccountMessage,
    processHost,
    secretsEnv,
    syncTelegramAccount,
    telegram,
    setTelegramAccountCommands,
    TELEGRAM_CODEX_BRIDGE_COMMANDS,
  } = locals;

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function appendChannelListenerLog(logPath: string | undefined, message: string): void {
    if (!logPath) return;
    filesystem.ensureDir(path.dirname(logPath));
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
  }

  async function applyChannelProcessorActions(
    actions: ChannelProcessorAction[],
    context: {
      provider: string;
      accountId: string;
      message: ChannelMessageRecord;
      processorId?: string;
      processorAgentId?: string;
    },
  ): Promise<void> {
    for (const action of actions) {
      if (action.type === "ignore") continue;
      if (action.type === "register_target") {
        channelsRegistry.targets.register({
          provider: action.provider ?? context.provider,
          accountId: action.accountId ?? context.accountId,
          targetId: action.targetId,
          kind: action.kind ?? "unknown",
          label: action.label,
          title: action.title,
          username: action.username,
          parentTargetId: action.parentTargetId,
          threadId: action.threadId,
          metadata: action.metadata,
        });
        continue;
      }
      if (action.type === "grant_permission") {
        channelsRegistry.bindings.grant({
          agentId: action.agentId,
          provider: action.provider ?? context.provider,
          accountId: action.accountId ?? context.accountId,
          targetId: action.targetId,
          permissions: action.permissions,
          priority: action.priority,
          metadata: action.metadata,
        });
        continue;
      }
      if (action.type === "send_message") {
        const agentId = action.agentId ?? context.processorAgentId ?? context.processorId;
        const targetId = action.targetId ?? context.message.targetId;
        if (!channelsRegistry.bindings.can(agentId, "write", { provider: context.provider, accountId: context.accountId, targetId })) {
          throw new Error(`processor ${context.processorId ?? "unknown"} does not have write permission for ${context.provider}:${targetId}`);
        }
        await sendTelegramAccountMessage({
          registry: channelsRegistry,
          runner: processHost,
          env: secretsEnv,
        }, {
          provider: context.provider,
          accountId: context.accountId,
          targetId,
          text: action.text,
          media: action.media,
          mediaType: action.mediaType,
          threadId: action.threadId ?? context.message.threadId,
          parseMode: action.parseMode,
          agentId,
          metadata: {
            ...(action.metadata ?? {}),
            processorId: context.processorId,
          },
        });
      }
    }
  }

  function extractTelegramVoiceMedia(message: ChannelMessageRecord): {
    kind: "voice" | "audio";
    fileId: string;
    fileUniqueId?: string;
    mimeType?: string;
    durationSeconds?: number;
    fileName?: string;
  } | null {
    const rawMessage = (message.raw?.message ?? message.raw?.edited_message) as Record<string, unknown> | undefined;
    const voice = rawMessage?.voice as Record<string, unknown> | undefined;
    const audio = rawMessage?.audio as Record<string, unknown> | undefined;
    const media = voice ?? audio;
    if (!media || typeof media.file_id !== "string") return null;
    return {
      kind: voice ? "voice" : "audio",
      fileId: media.file_id,
      fileUniqueId: typeof media.file_unique_id === "string" ? media.file_unique_id : undefined,
      mimeType: typeof media.mime_type === "string" ? media.mime_type : undefined,
      durationSeconds: typeof media.duration === "number" ? media.duration : undefined,
      fileName: typeof media.file_name === "string" ? media.file_name : undefined,
    };
  }

  function extractTelegramLanguageHint(message: ChannelMessageRecord): string | undefined {
    const rawMessage = (message.raw?.message ?? message.raw?.edited_message) as Record<string, unknown> | undefined;
    const from = rawMessage?.from as Record<string, unknown> | undefined;
    const languageCode = typeof from?.language_code === "string" ? from.language_code.trim().toLowerCase() : "";
    const normalized = languageCode.split(/[-_]/)[0];
    return /^[a-z]{2,3}$/.test(normalized) ? normalized : undefined;
  }

  async function ingestTelegramVoiceNote(message: ChannelMessageRecord): Promise<ChannelMessageRecord> {
    if (message.provider !== "telegram" || message.text?.trim()) return message;
    const media = extractTelegramVoiceMedia(message);
    if (!media) return message;
    const account = channelsRegistry.accounts.get("telegram", message.accountId);
    if (!account?.secretRef) return message;
    const apiBaseUrl = typeof account.metadata?.apiBaseUrl === "string" && account.metadata.apiBaseUrl.trim()
      ? account.metadata.apiBaseUrl
      : "https://api.telegram.org";
    const fileInfo = await callTelegramApi<Record<string, unknown>>(
      processHost,
      secretsEnv,
      account.secretRef,
      apiBaseUrl,
      "getFile",
      { file_id: media.fileId },
    );
    const telegramFilePath = typeof fileInfo.file_path === "string" ? fileInfo.file_path : null;
    if (!telegramFilePath) throw new Error("Telegram getFile did not return file_path");
    const buffer = await downloadTelegramFile(processHost, secretsEnv, account.secretRef, apiBaseUrl, telegramFilePath);
    const note = voiceNoteStore.create({
      data: buffer,
      mimeType: media.mimeType ?? (media.kind === "voice" ? "audio/ogg" : "application/octet-stream"),
      fileName: media.fileName ?? path.basename(telegramFilePath),
      durationSeconds: media.durationSeconds,
      source: {
        origin: "telegram",
        provider: "telegram",
        accountId: message.accountId,
        targetId: message.targetId,
        threadId: message.threadId,
        providerMessageId: message.providerMessageId,
        senderId: message.senderId,
        senderLabel: message.senderLabel,
        receivedAt: message.receivedAt,
        metadata: {
          fileId: media.fileId,
          fileUniqueId: media.fileUniqueId,
          kind: media.kind,
        },
      },
    });
    registerVoiceNoteMedia(note);
    const config = readSttConfig();
    const languageHint = config.language === "auto" || !config.language ? extractTelegramLanguageHint(message) : undefined;
    const transcriptionConfig = languageHint ? { ...config, language: languageHint } : config;
    const transcribed = config.enabled === false && !config.modelPath
      ? note
      : await voiceNoteStore.transcribe(note.id, transcriptionConfig);
    registerVoiceNoteMedia(transcribed);
    const transcript = transcribed.transcript?.text?.trim();
    if (!transcript) return message;
    return {
      ...message,
      text: transcript,
      metadata: {
        ...(message.metadata ?? {}),
        voiceNoteId: transcribed.id,
        voiceNoteStatus: transcribed.status,
        transcriptProvider: transcribed.transcript?.provider,
      },
    };
  }

  async function ensureTelegramCodexBridgeCommands(accountId?: string): Promise<void> {
    const account = channelsRegistry.accounts.get("telegram", accountId);
    const existingCommands = account?.metadata?.commands;
    if (
      Array.isArray(existingCommands) &&
      existingCommands.length === TELEGRAM_CODEX_BRIDGE_COMMANDS.length &&
      existingCommands.every((command, index) => {
        const expected = TELEGRAM_CODEX_BRIDGE_COMMANDS[index];
        return command.command === expected?.command && command.description === expected.description;
      })
    ) return;
    await setTelegramAccountCommands({
      registry: channelsRegistry,
      runner: processHost,
      env: secretsEnv,
    }, accountId, TELEGRAM_CODEX_BRIDGE_COMMANDS);
    await refreshChannelSnapshots();
  }

  async function runChannelListener(input: {
    provider?: string;
    accountId?: string;
    processorId?: string;
    once?: boolean;
    intervalMs?: number;
    timeoutSeconds?: number;
    processorTimeoutMs?: number;
    stopPath?: string;
    pidPath?: string;
    logPath?: string;
    mode?: "foreground" | "background";
  } = {}): Promise<ChannelListenerDescriptor> {
    const provider = input.provider ?? "telegram";
    const accountId = input.accountId ?? "default";
    if (provider !== "telegram") {
      throw new Error(`unsupported channel provider: ${provider}`);
    }
    const listenerId = `${provider}:${accountId}`;
    const configuredProcessor = input.processorId ? channelsRegistry.processors.get(input.processorId) : null;
    if (input.processorId && !configuredProcessor) {
      throw new Error(`channel processor not found: ${input.processorId}`);
    }
    if (provider === "telegram" && configuredProcessor?.id === "telegram-codex") {
      await ensureTelegramCodexBridgeCommands(accountId);
    }
    const resolveProcessorForMessage = (message: ChannelMessageRecord): ChannelProcessorDescriptor | null => {
      if (configuredProcessor) return configuredProcessor;
      const assignment = channelsRegistry.bindings.list({ provider, accountId })
        .filter((binding) => {
          if (!binding.enabled) return false;
          if (binding.targetId && binding.targetId !== message.targetId) return false;
          return binding.metadata?.assignmentType === "channel-agent";
        })
        .sort((left, right) => right.priority - left.priority)[0];
      const processorId = typeof assignment?.metadata?.processorId === "string"
        ? assignment.metadata.processorId
        : assignment?.agentId;
      return processorId ? channelsRegistry.processors.get(processorId) : null;
    };
    const startedAt = new Date().toISOString();
    if (input.pidPath) {
      filesystem.ensureDir(path.dirname(input.pidPath));
      filesystem.writeTextAtomic(input.pidPath, `${process.pid}\n`);
    }
    if (input.stopPath && fs.existsSync(input.stopPath)) {
      fs.rmSync(input.stopPath, { force: true });
    }
    let listener = channelsRegistry.listeners.upsert({
      id: listenerId,
      provider,
      accountId,
      processorId: configuredProcessor?.id,
      mode: input.mode ?? "foreground",
      status: "running",
      pid: process.pid,
      pidPath: input.pidPath,
      logPath: input.logPath,
      stopPath: input.stopPath,
      startedAt,
      lastHeartbeatAt: startedAt,
    });
    channelsRegistry.events.record({ type: "channel.listener.started", provider, accountId, processorId: configuredProcessor?.id, status: "ok" });
    eventBus.emit("channel.listener.started", { provider, accountId, processorId: configuredProcessor?.id, pid: process.pid });
    appendChannelListenerLog(input.logPath, `listener started provider=${provider} account=${accountId} processor=${configuredProcessor?.id ?? "assigned"}`);

    while (true) {
      if (input.stopPath && fs.existsSync(input.stopPath)) break;
      try {
        listener = channelsRegistry.listeners.upsert({
          id: listenerId,
          provider,
          accountId,
          processorId: configuredProcessor?.id,
          mode: input.mode ?? "foreground",
          status: "running",
          pid: process.pid,
          pidPath: input.pidPath,
          logPath: input.logPath,
          stopPath: input.stopPath,
          startedAt,
          lastHeartbeatAt: new Date().toISOString(),
        });
        const messages = await syncTelegramAccount({
          registry: channelsRegistry,
          runner: processHost,
          env: secretsEnv,
        }, {
          accountId,
          limit: 100,
          timeoutSeconds: input.timeoutSeconds ?? 1,
        });
        appendChannelListenerLog(input.logPath, `synced ${messages.length} messages`);
        for (const message of messages) {
          const processor = resolveProcessorForMessage(message);
          if (!processor) continue;
          try {
            const processorMessage = await ingestTelegramVoiceNote(message);
            const result = await invokeChannelProcessor(processor, {
              type: "channel.message.received",
              provider,
              accountId,
              targetId: processorMessage.targetId,
              message: processorMessage,
              processorId: processor.id,
            }, { env: secretsEnv, timeoutMs: input.processorTimeoutMs ?? 120_000 });
            channelsRegistry.events.record({
              type: "channel.processor.invoked",
              provider,
              accountId,
              targetId: processorMessage.targetId,
              messageId: processorMessage.id,
              processorId: processor.id,
              status: result.actions.length > 0 ? "ok" : "ignored",
              payload: { actionCount: result.actions.length },
            });
            await applyChannelProcessorActions(result.actions, {
              provider,
              accountId,
              message: processorMessage,
              processorId: processor.id,
              processorAgentId: processor.agentId,
            });
          } catch (error) {
            const messageText = error instanceof Error ? error.message : String(error);
            channelsRegistry.events.record({
              type: "channel.processor.invoked",
              provider,
              accountId,
              targetId: message.targetId,
              messageId: message.id,
              processorId: processor.id,
              status: "error",
              payload: { error: messageText },
            });
            appendChannelListenerLog(input.logPath, `processor error ${messageText}`);
          }
        }
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        channelsRegistry.events.record({ type: "channel.listener.error", provider, accountId, processorId: configuredProcessor?.id, status: "error", payload: { error: messageText } });
        listener = channelsRegistry.listeners.upsert({
          id: listenerId,
          provider,
          accountId,
          processorId: configuredProcessor?.id,
          mode: input.mode ?? "foreground",
          status: "error",
          pid: process.pid,
          pidPath: input.pidPath,
          logPath: input.logPath,
          stopPath: input.stopPath,
          startedAt,
          lastHeartbeatAt: new Date().toISOString(),
          lastError: messageText,
        });
        appendChannelListenerLog(input.logPath, `listener error ${messageText}`);
        await sleep(Math.max(1_000, Math.min(input.intervalMs ?? 2_000, 10_000)));
      }
      if (input.once) break;
      await sleep(input.intervalMs ?? 2_000);
    }

    listener = channelsRegistry.listeners.upsert({
      id: listenerId,
      provider,
      accountId,
      processorId: configuredProcessor?.id,
      mode: input.mode ?? "foreground",
      status: "stopped",
      pid: process.pid,
      pidPath: input.pidPath,
      logPath: input.logPath,
      stopPath: input.stopPath,
      startedAt,
      stoppedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    });
    channelsRegistry.events.record({ type: "channel.listener.stopped", provider, accountId, processorId: configuredProcessor?.id, status: "ok" });
    eventBus.emit("channel.listener.stopped", { provider, accountId, processorId: configuredProcessor?.id, pid: process.pid });
    appendChannelListenerLog(input.logPath, `listener stopped provider=${provider} account=${accountId}`);
    return listener;
  }



  return {
    sleep,
    appendChannelListenerLog,
    applyChannelProcessorActions,
    extractTelegramVoiceMedia,
    extractTelegramLanguageHint,
    ingestTelegramVoiceNote,
    ensureTelegramCodexBridgeCommands,
    runChannelListener,
  };
}
