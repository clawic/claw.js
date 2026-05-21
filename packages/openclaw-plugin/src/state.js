const DEFAULTS = {
  version: "0.1.0",
  maxEvents: 200,
  maxSessions: 500,
  maxSessionMessages: 25,
  endedSessionTtlMs: 24 * 60 * 60 * 1000,
};

function createEmptySessionRecord(sessionKey) {
  return {
    sessionKey,
    sessionId: null,
    agentId: null,
    startedAt: null,
    endedAt: null,
    trigger: null,
    channelId: null,
    llmRuns: 0,
    toolCalls: 0,
    toolErrors: 0,
    subagentRuns: 0,
    messageCount: 0,
    eventCount: 0,
    lastModel: null,
    lastProvider: null,
    lastSeenAt: null,
    recentMessages: [],
  };
}

function createCompactedSessionStats() {
  return {
    count: 0,
    eventCount: 0,
    llmRuns: 0,
    toolCalls: 0,
    toolErrors: 0,
    subagentRuns: 0,
    messageCount: 0,
    startedCount: 0,
    endedCount: 0,
    oldestStartedAt: null,
    newestEndedAt: null,
  };
}

function createState() {
  return {
    version: DEFAULTS.version,
    service: {
      id: "clawjs-observability",
      healthy: false,
      startedAt: null,
      stoppedAt: null,
      startCount: 0,
      stopCount: 0,
    },
    hooks: {
      registered: [],
      handled: {},
    },
    commands: [],
    tools: [],
    gatewayMethods: [],
    events: [],
    maxEvents: DEFAULTS.maxEvents,
    maxSessions: DEFAULTS.maxSessions,
    maxSessionMessages: DEFAULTS.maxSessionMessages,
    endedSessionTtlMs: DEFAULTS.endedSessionTtlMs,
    sessions: new Map(),
    compactedSessions: createCompactedSessionStats(),
  };
}

function getGlobalState() {
  const globalObject = globalThis;
  if (!globalObject.__clawjsPluginState) {
    globalObject.__clawjsPluginState = createState();
  }
  return globalObject.__clawjsPluginState;
}

export function resetClawJsPluginStateForTests() {
  globalThis.__clawjsPluginState = createState();
  return globalThis.__clawjsPluginState;
}

function applyPositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function configureState(options = {}) {
  const state = getGlobalState();
  state.maxEvents = applyPositiveInteger(options.maxEvents, state.maxEvents);
  state.maxSessions = applyPositiveInteger(options.maxSessions, state.maxSessions);
  state.maxSessionMessages = applyPositiveInteger(options.maxSessionMessages, state.maxSessionMessages);
  state.endedSessionTtlMs = applyPositiveInteger(options.endedSessionTtlMs, state.endedSessionTtlMs);
  compactSessions(state, new Date().toISOString());
  return state;
}

export function rememberRegistration(type, value) {
  const state = getGlobalState();
  if (type === "hook" && !state.hooks.registered.includes(value)) {
    state.hooks.registered.push(value);
  } else if (type === "command" && !state.commands.includes(value)) {
    state.commands.push(value);
  } else if (type === "tool" && !state.tools.includes(value)) {
    state.tools.push(value);
  } else if (type === "gatewayMethod" && !state.gatewayMethods.includes(value)) {
    state.gatewayMethods.push(value);
  }
}

function resolveSessionKey(event = {}, ctx = {}) {
  return ctx.sessionKey || event.sessionKey || event.childSessionKey || event.targetSessionKey || "unknown";
}

function minIso(current, candidate) {
  if (!candidate) return current;
  if (!current || candidate < current) return candidate;
  return current;
}

function maxIso(current, candidate) {
  if (!candidate) return current;
  if (!current || candidate > current) return candidate;
  return current;
}

function compactSession(state, session) {
  state.compactedSessions.count += 1;
  state.compactedSessions.eventCount += session.eventCount;
  state.compactedSessions.llmRuns += session.llmRuns;
  state.compactedSessions.toolCalls += session.toolCalls;
  state.compactedSessions.toolErrors += session.toolErrors;
  state.compactedSessions.subagentRuns += session.subagentRuns;
  state.compactedSessions.messageCount += session.messageCount;
  state.compactedSessions.startedCount += session.startedAt ? 1 : 0;
  state.compactedSessions.endedCount += session.endedAt ? 1 : 0;
  state.compactedSessions.oldestStartedAt = minIso(state.compactedSessions.oldestStartedAt, session.startedAt);
  state.compactedSessions.newestEndedAt = maxIso(state.compactedSessions.newestEndedAt, session.endedAt);
}

function shouldExpireEndedSession(session, nowMs, endedSessionTtlMs) {
  if (!session.endedAt) return false;
  const endedAtMs = Date.parse(session.endedAt);
  if (!Number.isFinite(endedAtMs)) return false;
  return nowMs - endedAtMs > endedSessionTtlMs;
}

function deleteAndCompactSession(state, sessionKey) {
  const session = state.sessions.get(sessionKey);
  if (!session) return;
  state.sessions.delete(sessionKey);
  compactSession(state, session);
}

function compactSessions(state, recordedAt) {
  const nowMs = Date.parse(recordedAt);
  if (!Number.isFinite(nowMs)) return;

  for (const [sessionKey, session] of state.sessions) {
    if (shouldExpireEndedSession(session, nowMs, state.endedSessionTtlMs)) {
      deleteAndCompactSession(state, sessionKey);
    }
  }

  while (state.sessions.size > state.maxSessions) {
    const oldestSessionKey = state.sessions.keys().next().value;
    if (!oldestSessionKey) break;
    deleteAndCompactSession(state, oldestSessionKey);
  }
}

function getOrCreateSession(sessionKey) {
  const state = getGlobalState();
  const existing = state.sessions.get(sessionKey);
  if (existing) {
    state.sessions.delete(sessionKey);
    state.sessions.set(sessionKey, existing);
    return existing;
  }
  const created = createEmptySessionRecord(sessionKey);
  state.sessions.set(sessionKey, created);
  return created;
}

export function recordEvent(kind, name, event = {}, ctx = {}) {
  const state = getGlobalState();
  const recordedAt = new Date().toISOString();
  const entry = {
    kind,
    name,
    recordedAt,
    sessionKey: ctx.sessionKey || event.sessionKey || event.childSessionKey || event.targetSessionKey || null,
    sessionId: ctx.sessionId || event.sessionId || null,
    agentId: ctx.agentId || event.agentId || null,
    runId: ctx.runId || event.runId || null,
    payload: event,
  };

  state.events.push(entry);
  if (state.events.length > state.maxEvents) {
    state.events.splice(0, state.events.length - state.maxEvents);
  }

  state.hooks.handled[name] = (state.hooks.handled[name] || 0) + 1;

  if (entry.sessionKey) {
    const session = getOrCreateSession(entry.sessionKey);
    session.sessionId = entry.sessionId || session.sessionId;
    session.agentId = entry.agentId || session.agentId;
    session.eventCount += 1;
    session.lastSeenAt = recordedAt;

    if (name === "session_start") {
      session.startedAt = recordedAt;
      session.trigger = ctx.trigger || session.trigger;
      session.channelId = ctx.channelId || session.channelId;
    } else if (name === "session_end") {
      session.endedAt = recordedAt;
      session.messageCount = typeof event.messageCount === "number" ? event.messageCount : session.messageCount;
    } else if (name === "llm_input") {
      session.llmRuns += 1;
      session.lastModel = event.model || session.lastModel;
      session.lastProvider = event.provider || session.lastProvider;
    } else if (name === "before_tool_call") {
      session.toolCalls += 1;
    } else if (name === "after_tool_call" && event.error) {
      session.toolErrors += 1;
    } else if (name === "subagent_spawned") {
      session.subagentRuns += 1;
    }

    if (typeof event.content === "string" && event.content.trim()) {
      session.recentMessages.push({
        recordedAt,
        kind,
        name,
        content: event.content.slice(0, 400),
      });
      if (session.recentMessages.length > state.maxSessionMessages) {
        session.recentMessages.splice(0, session.recentMessages.length - state.maxSessionMessages);
      }
    }
  }

  compactSessions(state, recordedAt);
  return entry;
}

export function listEvents(filters = {}) {
  const state = getGlobalState();
  return state.events.filter((entry) => {
    if (filters.kind && entry.kind !== filters.kind) return false;
    if (filters.name && entry.name !== filters.name) return false;
    if (filters.sessionKey && entry.sessionKey !== filters.sessionKey) return false;
    if (filters.runId && entry.runId !== filters.runId) return false;
    return true;
  });
}

export function inspectSession(sessionKey) {
  const state = getGlobalState();
  const session = state.sessions.get(sessionKey);
  if (!session) return null;
  return {
    ...session,
    eventCount: session.eventCount,
  };
}

export function getHealthSnapshot() {
  const state = getGlobalState();
  return {
    service: { ...state.service },
    hooks: {
      registered: [...state.hooks.registered],
      handled: { ...state.hooks.handled },
    },
    tools: [...state.tools],
    commands: [...state.commands],
    gatewayMethods: [...state.gatewayMethods],
    eventBufferSize: state.events.length,
    maxEvents: state.maxEvents,
    maxSessions: state.maxSessions,
    maxSessionMessages: state.maxSessionMessages,
    endedSessionTtlMs: state.endedSessionTtlMs,
    sessionCount: state.sessions.size,
    compactedSessionCount: state.compactedSessions.count,
    compactedSessions: { ...state.compactedSessions },
  };
}

export function markServiceStarted() {
  const state = getGlobalState();
  state.service.healthy = true;
  state.service.startedAt = new Date().toISOString();
  state.service.stoppedAt = null;
  state.service.startCount += 1;
}

export function markServiceStopped() {
  const state = getGlobalState();
  state.service.healthy = false;
  state.service.stoppedAt = new Date().toISOString();
  state.service.stopCount += 1;
}
