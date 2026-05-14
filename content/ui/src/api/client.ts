const CONTENT_TOKEN_STORAGE_KEY = CONTENT_TOKEN_STORAGE_KEY;
import type {
  DashboardPayload, CalendarItem, PipelineColumn,
  ComposerPayload, Destination, ApprovalRequest,
  PublicationRun, Brand, Campaign, Entry,
  FormSchema, WsEvent,
} from "./types";

const BASE = "/v1";

let _token: string | null = localStorage.getItem(CONTENT_TOKEN_STORAGE_KEY);

export function setToken(t: string | null) {
  _token = t;
  if (t) localStorage.setItem(CONTENT_TOKEN_STORAGE_KEY, t);
  else localStorage.removeItem(CONTENT_TOKEN_STORAGE_KEY);
}

export function getToken(): string | null { return _token; }

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts?.headers as Record<string, string> ?? {}),
  };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw Object.assign(new Error(body?.error?.message ?? res.statusText), {
      status: res.status,
      body,
    });
  }
  return res.json();
}

/* ── Auth ── */
export async function login(email: string, password: string) {
  const data = await req<{ accessToken: string; admin: { id: string; email: string } }>(
    "/auth/admin/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
  );
  setToken(data.accessToken);
  return data;
}

/* ── Read Models ── */
export const getDashboard      = () => req<DashboardPayload>("/app/dashboard");
export const getCalendar       = () => req<{ items: CalendarItem[] }>("/app/calendar");
export const getPipeline       = () => req<{ columns: PipelineColumn[] }>("/app/pipeline");
export const getComposer       = (id: string) => req<ComposerPayload>(`/app/composer/${id}`);
export const getDestinations   = () => req<{ items: Destination[] }>("/app/destinations");
export const getApprovals      = () => req<{ items: ApprovalRequest[] }>("/app/approvals");
export const getPublications   = () => req<{ items: PublicationRun[] }>("/app/publications");
export const getFormSchema     = (id: string) => req<FormSchema>(`/app/forms/${id}`);

/* ── Lists ── */
export const getBrands    = () => req<{ brands: Brand[] }>("/brands");
export const getCampaigns = () => req<{ campaigns: Campaign[] }>("/campaigns");
export const getEntries   = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return req<{ entries: Entry[] }>(`/entries${qs}`);
};
export const getEntry     = (id: string) => req<{ entry: Entry }>(`/entries/${id}`);

/* ── Mutations ── */
export const createEntry = (body: Record<string, unknown>) =>
  req<{ entry: Entry }>("/entries", { method: "POST", body: JSON.stringify(body) });

export const updateEntry = (id: string, body: Record<string, unknown>) =>
  req<{ entry: Entry }>(`/entries/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const archiveEntry = (id: string) =>
  req<{ entry: Entry }>(`/entries/${id}/archive`, { method: "POST" });

export const attachAsset = (entryId: string, body: Record<string, unknown>) =>
  req<{ asset: unknown }>(`/entries/${entryId}/assets`, { method: "POST", body: JSON.stringify(body) });

export const generateVariants = (entryId: string) =>
  req<{ variants: unknown[] }>(`/entries/${entryId}/variants:generate`, { method: "POST" });

export const updateVariant = (id: string, body: Record<string, unknown>) =>
  req<{ variant: unknown }>(`/variants/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const createDestination = (body: Record<string, unknown>) =>
  req<{ destination: Destination }>("/destinations", { method: "POST", body: JSON.stringify(body) });

export const testConnection = (id: string) =>
  req<{ ok: boolean; destination: Destination }>(`/destinations/${id}/test-connection`, { method: "POST" });

export const approveApproval = (id: string, comment?: string) =>
  req<{ approval: ApprovalRequest }>(`/approvals/${id}/approve`, { method: "POST", body: JSON.stringify({ comment }) });

export const rejectApproval = (id: string, comment: string) =>
  req<{ approval: ApprovalRequest }>(`/approvals/${id}/reject`, { method: "POST", body: JSON.stringify({ comment }) });

export const cancelApproval = (id: string) =>
  req<{ approval: ApprovalRequest }>(`/approvals/${id}/cancel`, { method: "POST" });

export const createPlan = (body: Record<string, unknown>) =>
  req<{ plan: unknown; approval: unknown }>("/plans", { method: "POST", body: JSON.stringify(body) });

export const runPlan = (id: string) =>
  req<{ plan: unknown; run: unknown }>(`/plans/${id}/run`, { method: "POST" });

export const cancelPlan = (id: string) =>
  req<{ plan: unknown }>(`/plans/${id}/cancel`, { method: "POST" });

export const retryPublication = (runId: string) =>
  req<{ plan: unknown; run: unknown }>(`/publications/${runId}/retry`, { method: "POST" });

export const getPublicationDetail = (runId: string) =>
  req<{ run: PublicationRun; canRetry: boolean; plan: unknown }>(`/publications/${runId}`);

/* ── WebSocket ── */
export function connectEvents(onEvent: (e: WsEvent) => void, onStatus: (s: "connected" | "disconnected" | "reconnecting") => void) {
  let ws: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout>;
  let attempts = 0;

  function connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}${BASE}/events/ws`);

    ws.onopen = () => { attempts = 0; onStatus("connected"); };
    ws.onmessage = (ev) => {
      try { onEvent(JSON.parse(ev.data)); } catch { /* ignore parse errors */ }
    };
    ws.onclose = () => {
      onStatus(attempts > 0 ? "reconnecting" : "disconnected");
      attempts++;
      const delay = Math.min(1000 * 2 ** attempts, 30000);
      retryTimer = setTimeout(connect, delay);
    };
    ws.onerror = () => ws?.close();
  }

  connect();

  return () => {
    clearTimeout(retryTimer);
    ws?.close();
  };
}
