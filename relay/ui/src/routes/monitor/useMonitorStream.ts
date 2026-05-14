const STABLE_EVENT_TYPES = {
  sessionStart: "session.start",
  sessionDelta: "session.delta",
  sessionEnd: "session.end",
  sessionTouch: "session.touch",
  agentPresence: "agent.presence",
  clientAttach: "client.attach",
  clientDetach: "client.detach",
} as const;
import { useEffect, useReducer, useRef, useCallback } from "react";
import { streamSSE } from "../../lib/api";

export type ActiveSession = {
  sessionId: string;
  tenantId?: string;
  agentId?: string;
  workspaceId?: string;
  projectId?: string;
  startedAt?: number;
  lastMessageAt?: number;
  lastEventAt?: number;
  isStreaming: boolean;
  snippet?: string;
  fullText: string;
  endReason?: "complete" | "cancelled" | "error";
  endError?: string;
};

export type AgentInfo = {
  agentId: string;
  displayName?: string;
  status: "online" | "offline";
  version?: string | null;
  capabilities?: string[];
  lastSeenAt?: number | null;
  connectorId?: string;
};

export type ActivityRecord = {
  id?: string;
  tenantId: string;
  agentId: string | null;
  workspaceId: string | null;
  capability: string;
  status: "info" | "success" | "error";
  detail: string;
  createdAt: number;
};

export type AttachedClient = {
  clientId: string;
  attachedAt: number;
  openedSessionId?: string;
};

export type MonitorState = {
  sessions: Record<string, ActiveSession>;
  agents: Record<string, AgentInfo>;
  activity: ActivityRecord[];
  attachedClients: Record<string, AttachedClient>;
  selectedSessionId: string | null;
  connected: boolean;
  error?: string;
  myClientId?: string;
};

type Action =
  | { type: "connecting" }
  | { type: "connected"; clientId: string }
  | { type: "disconnected"; error?: string }
  | { type: "snapshot"; payload: any }
  | { type: typeof STABLE_EVENT_TYPES.sessionStart; payload: any }
  | { type: typeof STABLE_EVENT_TYPES.sessionDelta; payload: any }
  | { type: typeof STABLE_EVENT_TYPES.sessionEnd; payload: any }
  | { type: typeof STABLE_EVENT_TYPES.sessionTouch; payload: any }
  | { type: typeof STABLE_EVENT_TYPES.agentPresence; payload: any }
  | { type: "activity"; payload: any }
  | { type: typeof STABLE_EVENT_TYPES.clientAttach; payload: any }
  | { type: typeof STABLE_EVENT_TYPES.clientDetach; payload: any }
  | { type: "select"; sessionId: string | null };

const initialState: MonitorState = {
  sessions: {},
  agents: {},
  activity: [],
  attachedClients: {},
  selectedSessionId: null,
  connected: false,
};

function ensureSession(state: MonitorState, sessionId: string): ActiveSession {
  return state.sessions[sessionId] ?? {
    sessionId,
    isStreaming: false,
    fullText: "",
  };
}

function reducer(state: MonitorState, action: Action): MonitorState {
  switch (action.type) {
    case "connecting":
      return { ...state, connected: false, error: undefined };

    case "connected":
      return { ...state, connected: true, myClientId: action.clientId, error: undefined };

    case "disconnected":
      return { ...state, connected: false, error: action.error };

    case "snapshot": {
      const p = action.payload ?? {};
      const agents: Record<string, AgentInfo> = {};
      for (const a of p.agents ?? []) {
        if (a?.agentId) agents[a.agentId] = a;
      }
      const attached: Record<string, AttachedClient> = {};
      for (const c of p.attachedClients ?? []) {
        if (c?.clientId) attached[c.clientId] = c;
      }
      return {
        ...state,
        agents,
        activity: Array.isArray(p.activity) ? p.activity : [],
        attachedClients: attached,
        myClientId: typeof p.clientId === "string" ? p.clientId : state.myClientId,
        selectedSessionId: typeof p.openedSessionId === "string" ? p.openedSessionId : state.selectedSessionId,
      };
    }

    case "session.start": {
      const p = action.payload ?? {};
      const sid: string | undefined = p.sessionId;
      if (!sid) return state;
      const prev = ensureSession(state, sid);
      const nextText = state.selectedSessionId === sid && prev.endReason === undefined ? prev.fullText : "";
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [sid]: {
            ...prev,
            sessionId: sid,
            tenantId: p.tenantId ?? prev.tenantId,
            agentId: p.agentId ?? prev.agentId,
            workspaceId: p.workspaceId ?? prev.workspaceId,
            projectId: p.projectId ?? prev.projectId,
            startedAt: typeof p.startedAt === "number" ? p.startedAt : Date.now(),
            isStreaming: true,
            snippet: typeof p.snippet === "string" ? p.snippet : prev.snippet,
            fullText: nextText,
            lastEventAt: Date.now(),
            endReason: undefined,
            endError: undefined,
          },
        },
      };
    }

    case "session.delta": {
      const p = action.payload ?? {};
      const sid: string | undefined = p.sessionId;
      const delta: string = typeof p.delta === "string" ? p.delta : "";
      if (!sid || !delta) return state;
      const prev = ensureSession(state, sid);
      const isSelected = state.selectedSessionId === sid;
      const trimmedSnippet = (prev.snippet ?? "") + delta;
      const snippet = trimmedSnippet.length > 200
        ? trimmedSnippet.slice(trimmedSnippet.length - 200)
        : trimmedSnippet;
      const fullText = isSelected ? prev.fullText + delta : prev.fullText;
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [sid]: {
            ...prev,
            sessionId: sid,
            tenantId: p.tenantId ?? prev.tenantId,
            agentId: p.agentId ?? prev.agentId,
            workspaceId: p.workspaceId ?? prev.workspaceId,
            projectId: p.projectId ?? prev.projectId,
            isStreaming: true,
            snippet,
            fullText,
            lastEventAt: Date.now(),
          },
        },
      };
    }

    case "session.end": {
      const p = action.payload ?? {};
      const sid: string | undefined = p.sessionId;
      if (!sid) return state;
      const prev = ensureSession(state, sid);
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [sid]: {
            ...prev,
            sessionId: sid,
            isStreaming: false,
            endReason: p.reason,
            endError: typeof p.error === "string" ? p.error : undefined,
            lastEventAt: Date.now(),
          },
        },
      };
    }

    case "session.touch": {
      const p = action.payload ?? {};
      const sid: string | undefined = p.sessionId;
      if (!sid) return state;
      const prev = ensureSession(state, sid);
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [sid]: {
            ...prev,
            sessionId: sid,
            tenantId: p.tenantId ?? prev.tenantId,
            agentId: p.agentId ?? prev.agentId,
            workspaceId: p.workspaceId ?? prev.workspaceId,
            projectId: p.projectId ?? prev.projectId,
            lastMessageAt: typeof p.lastMessageAt === "number" ? p.lastMessageAt : Date.now(),
            snippet: typeof p.snippet === "string" ? p.snippet : prev.snippet,
            lastEventAt: Date.now(),
          },
        },
      };
    }

    case "agent.presence": {
      const p = action.payload ?? {};
      const id: string | undefined = p.agentId;
      if (!id) return state;
      const existing = state.agents[id] ?? { agentId: id, status: "offline" as const };
      return {
        ...state,
        agents: {
          ...state.agents,
          [id]: {
            ...existing,
            agentId: id,
            status: p.status === "online" ? "online" : "offline",
            version: p.version ?? existing.version,
            capabilities: p.capabilities ?? existing.capabilities,
            lastSeenAt: typeof p.lastSeenAt === "number" ? p.lastSeenAt : existing.lastSeenAt,
            connectorId: p.connectorId ?? existing.connectorId,
          },
        },
      };
    }

    case "activity": {
      const p = action.payload ?? {};
      const next = [
        {
          tenantId: p.tenantId ?? "",
          agentId: p.agentId ?? null,
          workspaceId: p.workspaceId ?? null,
          capability: p.capability ?? "",
          status: p.status ?? "info",
          detail: p.detail ?? "",
          createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
        },
        ...state.activity,
      ].slice(0, 50);
      return { ...state, activity: next };
    }

    case "client.attach": {
      const p = action.payload ?? {};
      if (!p.clientId) return state;
      return {
        ...state,
        attachedClients: {
          ...state.attachedClients,
          [p.clientId]: {
            clientId: p.clientId,
            attachedAt: typeof p.attachedAt === "number" ? p.attachedAt : Date.now(),
            ...(typeof p.openedSessionId === "string" ? { openedSessionId: p.openedSessionId } : {}),
          },
        },
      };
    }

    case "client.detach": {
      const p = action.payload ?? {};
      if (!p.clientId) return state;
      const next = { ...state.attachedClients };
      delete next[p.clientId];
      return { ...state, attachedClients: next };
    }

    case "select": {
      const sid = action.sessionId;
      if (sid === state.selectedSessionId) return state;
      // when changing selection, reset fullText buffer for old/new
      const sessions = { ...state.sessions };
      if (sid && sessions[sid]) {
        sessions[sid] = { ...sessions[sid], fullText: "" };
      }
      return { ...state, selectedSessionId: sid, sessions };
    }

    default:
      return state;
  }
}

export function useMonitorStream(tenantId: string) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const clientIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `mc_${Math.random().toString(36).slice(2)}`,
  );
  const selectedRef = useRef<string | null>(null);
  const reconnectKeyRef = useRef(0);

  const selectSession = useCallback((sessionId: string | null) => {
    selectedRef.current = sessionId;
    dispatch({ type: "select", sessionId });
    reconnectKeyRef.current += 1; // trigger reopen with new openedSessionId
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    const ctrl = new AbortController();

    const run = async () => {
      dispatch({ type: "connecting" });
      const opened = selectedRef.current;
      const params = new URLSearchParams({ clientId: clientIdRef.current });
      if (opened) params.set("openedSessionId", opened);
      const url = `/tenants/${tenantId}/monitor/stream?${params.toString()}`;
      try {
        for await (const evt of streamSSE(url, { method: "GET", signal: ctrl.signal })) {
          if (cancelled) break;
          const data = (evt.data ?? {}) as Record<string, unknown>;
          switch (evt.event) {
            case "monitor.snapshot":
              dispatch({ type: "snapshot", payload: data });
              dispatch({ type: "connected", clientId: typeof data.clientId === "string" ? data.clientId : clientIdRef.current });
              break;
            case "monitor.session.start":
              dispatch({ type: STABLE_EVENT_TYPES.sessionStart, payload: data });
              break;
            case "monitor.session.delta":
              dispatch({ type: STABLE_EVENT_TYPES.sessionDelta, payload: data });
              break;
            case "monitor.session.end":
              dispatch({ type: STABLE_EVENT_TYPES.sessionEnd, payload: data });
              break;
            case "monitor.session.touch":
              dispatch({ type: STABLE_EVENT_TYPES.sessionTouch, payload: data });
              break;
            case "monitor.agent.presence":
              dispatch({ type: STABLE_EVENT_TYPES.agentPresence, payload: data });
              break;
            case "monitor.activity":
              dispatch({ type: "activity", payload: data });
              break;
            case "monitor.client.attach":
              dispatch({ type: STABLE_EVENT_TYPES.clientAttach, payload: data });
              break;
            case "monitor.client.detach":
              dispatch({ type: STABLE_EVENT_TYPES.clientDetach, payload: data });
              break;
            case "monitor.heartbeat":
            default:
              break;
          }
        }
      } catch (err) {
        if (!cancelled) {
          dispatch({
            type: "disconnected",
            error: (err as Error)?.message ?? String(err),
          });
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [tenantId, reconnectKeyRef.current]);

  return { state, selectSession, clientId: clientIdRef.current };
}
