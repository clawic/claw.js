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
    runtimeAgentId,
    processHost,
    streamRuntimeSessionEvents,
    mergeRulesContextBlocks,
    resolveSessionDocumentAssets,
    streamRuntimeSession,
  } = locals;

  return {
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
