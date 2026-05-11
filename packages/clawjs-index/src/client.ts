type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface IndexCliOptions { baseUrl: string; token?: string; }

export class IndexApiClient {
  constructor(private readonly options: IndexCliOptions) {}

  private async request(path: string, init: RequestInit = {}): Promise<JsonValue> {
    const headers = new Headers(init.headers);
    if (this.options.token) headers.set("authorization", `Bearer ${this.options.token}`);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(new URL(path, this.options.baseUrl), { ...init, headers });
    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? ((await response.json()) as JsonValue) : await response.text();
    if (!response.ok) {
      throw new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
    }
    return payload;
  }

  health() { return this.request("/v1/health"); }
  listTypes() { return this.request("/v1/types"); }
  declareType(payload: Record<string, unknown>) {
    return this.request("/v1/types", { method: "POST", body: JSON.stringify(payload) });
  }
  upsertEntity(payload: Record<string, unknown>) {
    return this.request("/v1/entities/upsert", { method: "POST", body: JSON.stringify(payload) });
  }
  getEntity(id: string) { return this.request(`/v1/entities/${id}`); }
  getHistory(id: string, field: string) {
    const url = new URL(`/v1/entities/${id}/history`, this.options.baseUrl);
    url.searchParams.set("field", field);
    return this.request(url.pathname + url.search);
  }
  queryEntities(payload: Record<string, unknown>) {
    return this.request("/v1/entities/query", { method: "POST", body: JSON.stringify(payload) });
  }
  searchEntities(payload: Record<string, unknown>) {
    return this.request("/v1/entities/search", { method: "POST", body: JSON.stringify(payload) });
  }
  listSearches() { return this.request("/v1/searches"); }
  createSearch(payload: Record<string, unknown>) {
    return this.request("/v1/searches", { method: "POST", body: JSON.stringify(payload) });
  }
  runSearch(id: string, payload: Record<string, unknown> = {}) {
    return this.request(`/v1/searches/${id}/run`, { method: "POST", body: JSON.stringify(payload) });
  }
  listMonitors() { return this.request("/v1/monitors"); }
  createMonitor(payload: Record<string, unknown>) {
    return this.request("/v1/monitors", { method: "POST", body: JSON.stringify(payload) });
  }
  fireMonitor(id: string) { return this.request(`/v1/monitors/${id}/fire`, { method: "POST" }); }
  listRuns() { return this.request("/v1/runs"); }
  getRun(id: string) { return this.request(`/v1/runs/${id}`); }
  listAlerts() { return this.request("/v1/alerts"); }
  ackAlert(id: string) { return this.request(`/v1/alerts/${id}/ack`, { method: "POST" }); }
  applyTag(payload: Record<string, unknown>) {
    return this.request("/v1/tags/apply", { method: "POST", body: JSON.stringify(payload) });
  }
}
