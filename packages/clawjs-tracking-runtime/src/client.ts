import type {
  CatalogEntry,
  HealthKitAnchor,
  Observation,
  ObservationQuery,
  Session,
  StatsResult,
  UpsertCatalogInput,
  UpsertObservationInput,
  UpsertSessionInput,
} from "@clawjs/tracking-core";

export interface TrackingClientOptions {
  baseUrl: string;
  domain: string;
  token: string;
  fetchImpl?: typeof fetch;
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return entries.length ? `?${entries.join("&")}` : "";
}

export class TrackingApiClient {
  private readonly baseUrl: string;
  private readonly domain: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TrackingClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.domain = options.domain;
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private path(suffix: string): string {
    return `${this.baseUrl}/v1/${this.domain}${suffix}`;
  }

  private async call<T>(method: string, url: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`tracking-api ${method} ${url} -> ${response.status}: ${text}`);
    }
    return (await response.json()) as T;
  }

  health(): Promise<{ ok: boolean; service: string }> {
    return this.call("GET", `${this.baseUrl}/v1/health`);
  }

  catalog(): Promise<{ items: CatalogEntry[] }> {
    return this.call("GET", this.path("/catalog"));
  }

  getVariable(variableId: string): Promise<CatalogEntry> {
    return this.call("GET", this.path(`/variables/${encodeURIComponent(variableId)}`));
  }

  createUserVariable(input: UpsertCatalogInput): Promise<CatalogEntry> {
    return this.call("POST", this.path("/variables"), input);
  }

  deleteVariable(variableId: string): Promise<{ deleted: boolean; hidden: boolean }> {
    return this.call("DELETE", this.path(`/variables/${encodeURIComponent(variableId)}`));
  }

  unhideSystemVariable(variableId: string): Promise<{ unhid: boolean }> {
    return this.call("POST", this.path(`/variables/${encodeURIComponent(variableId)}/unhide`));
  }

  listObservations(query: ObservationQuery = {}): Promise<{ items: Observation[] }> {
    return this.call("GET", this.path(`/observations${buildQuery({ ...query })}`));
  }

  upsertObservation(input: UpsertObservationInput): Promise<Observation> {
    return this.call("POST", this.path("/observations"), input);
  }

  bulkUpsertObservations(items: readonly UpsertObservationInput[]): Promise<{
    items: Observation[];
    count: number;
  }> {
    return this.call("POST", this.path("/observations/bulk"), { items });
  }

  getObservation(id: string): Promise<Observation> {
    return this.call("GET", this.path(`/observations/${encodeURIComponent(id)}`));
  }

  updateObservation(id: string, patch: Partial<UpsertObservationInput>): Promise<Observation> {
    return this.call("PATCH", this.path(`/observations/${encodeURIComponent(id)}`), patch);
  }

  deleteObservation(id: string): Promise<{ deleted: boolean }> {
    return this.call("DELETE", this.path(`/observations/${encodeURIComponent(id)}`));
  }

  stats(
    variableId: string,
    options: { from?: number; to?: number; period?: StatsResult["period"] } = {},
  ): Promise<StatsResult> {
    return this.call(
      "GET",
      this.path(
        `/stats/${encodeURIComponent(variableId)}${buildQuery({
          from: options.from,
          to: options.to,
          period: options.period,
        })}`,
      ),
    );
  }

  listSessions(query: { from?: number; to?: number; limit?: number } = {}): Promise<{
    items: Session[];
  }> {
    return this.call("GET", this.path(`/sessions${buildQuery({ ...query })}`));
  }

  upsertSession(input: UpsertSessionInput): Promise<Session> {
    return this.call("POST", this.path("/sessions"), input);
  }

  getSession(id: string): Promise<Session> {
    return this.call("GET", this.path(`/sessions/${encodeURIComponent(id)}`));
  }

  updateSession(id: string, patch: Partial<UpsertSessionInput>): Promise<Session> {
    return this.call("PATCH", this.path(`/sessions/${encodeURIComponent(id)}`), patch);
  }

  deleteSession(id: string): Promise<{ deleted: boolean }> {
    return this.call("DELETE", this.path(`/sessions/${encodeURIComponent(id)}`));
  }

  appendObservationToSession(
    sessionId: string,
    input: Omit<UpsertObservationInput, "sessionId">,
  ): Promise<Observation> {
    return this.call(
      "POST",
      this.path(`/sessions/${encodeURIComponent(sessionId)}/observations`),
      input,
    );
  }

  getHealthKitAnchor(variableId: string): Promise<HealthKitAnchor | null> {
    return this.call("GET", this.path(`/healthkit/anchor/${encodeURIComponent(variableId)}`));
  }

  setHealthKitAnchor(
    variableId: string,
    anchorBlob: string,
    lastSyncedAt?: number,
  ): Promise<{ ok: boolean }> {
    return this.call(
      "PUT",
      this.path(`/healthkit/anchor/${encodeURIComponent(variableId)}`),
      { anchorBlob, lastSyncedAt },
    );
  }
}
