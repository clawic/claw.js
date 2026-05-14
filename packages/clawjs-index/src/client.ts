import { clawSearchApiRoutes } from "@clawjs/core";

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

  health() { return this.request(clawSearchApiRoutes.health); }
  listTypes() { return this.request(clawSearchApiRoutes.types); }
  declareType(payload: Record<string, unknown>) {
    return this.request(clawSearchApiRoutes.types, { method: "POST", body: JSON.stringify(payload) });
  }
  upsertEntity(payload: Record<string, unknown>) {
    return this.request(clawSearchApiRoutes.entitiesUpsert, { method: "POST", body: JSON.stringify(payload) });
  }
  getEntity(id: string) { return this.request(clawSearchApiRoutes.entity(id)); }
  getHistory(id: string, field: string) {
    const url = new URL(clawSearchApiRoutes.entityHistory(id), this.options.baseUrl);
    url.searchParams.set("field", field);
    return this.request(url.pathname + url.search);
  }
  queryEntities(payload: Record<string, unknown>) {
    return this.request(clawSearchApiRoutes.entitiesQuery, { method: "POST", body: JSON.stringify(payload) });
  }
  searchEntities(payload: Record<string, unknown>) {
    return this.request(clawSearchApiRoutes.entitiesSearch, { method: "POST", body: JSON.stringify(payload) });
  }
  listSearches() { return this.request(clawSearchApiRoutes.searches); }
  createSearch(payload: Record<string, unknown>) {
    return this.request(clawSearchApiRoutes.searches, { method: "POST", body: JSON.stringify(payload) });
  }
  runSearch(id: string, payload: Record<string, unknown> = {}) {
    return this.request(clawSearchApiRoutes.runSearch(id), { method: "POST", body: JSON.stringify(payload) });
  }
  listMonitors() { return this.request(clawSearchApiRoutes.monitors); }
  createMonitor(payload: Record<string, unknown>) {
    return this.request(clawSearchApiRoutes.monitors, { method: "POST", body: JSON.stringify(payload) });
  }
  fireMonitor(id: string) { return this.request(clawSearchApiRoutes.fireMonitor(id), { method: "POST" }); }
  listRuns() { return this.request(clawSearchApiRoutes.runs); }
  getRun(id: string) { return this.request(clawSearchApiRoutes.run(id)); }
  listAlerts() { return this.request(clawSearchApiRoutes.alerts); }
  ackAlert(id: string) { return this.request(clawSearchApiRoutes.ackAlert(id), { method: "POST" }); }
  applyTag(payload: Record<string, unknown>) {
    return this.request(clawSearchApiRoutes.tagsApply, { method: "POST", body: JSON.stringify(payload) });
  }
}
