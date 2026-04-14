type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface ErpCliOptions {
  baseUrl: string;
  token?: string;
}

export class ErpApiClient {
  constructor(private readonly options: ErpCliOptions) {}

  private async request(path: string, init: RequestInit = {}): Promise<JsonValue> {
    const headers = new Headers(init.headers);
    if (this.options.token) headers.set("authorization", `Bearer ${this.options.token}`);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(new URL(path, this.options.baseUrl), {
      ...init,
      headers,
    });
    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await response.json() as JsonValue : await response.text();
    if (!response.ok) {
      throw new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
    }
    return payload;
  }

  login(email: string, password: string): Promise<JsonValue> {
    return this.request("/v1/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  listTenants(): Promise<JsonValue> {
    return this.request("/v1/tenants");
  }

  bootstrapTenant(payload: Record<string, unknown>): Promise<JsonValue> {
    return this.request("/v1/tenants/bootstrap", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  listLegalEntities(tenantId: string): Promise<JsonValue> {
    return this.request(`/v1/tenants/${tenantId}/legal-entities`);
  }

  installLocalization(tenantId: string, legalEntityId: string, packKey: string): Promise<JsonValue> {
    return this.request(`/v1/tenants/${tenantId}/legal-entities/${legalEntityId}/localizations/install`, {
      method: "POST",
      body: JSON.stringify({ packKey }),
    });
  }

  listAccounts(tenantId: string, legalEntityId: string): Promise<JsonValue> {
    return this.request(`/v1/tenants/${tenantId}/legal-entities/${legalEntityId}/accounts`);
  }

  listPeriods(tenantId: string, legalEntityId: string): Promise<JsonValue> {
    return this.request(`/v1/tenants/${tenantId}/legal-entities/${legalEntityId}/periods`);
  }

  closePeriod(tenantId: string, legalEntityId: string, periodId: string): Promise<JsonValue> {
    return this.request(`/v1/tenants/${tenantId}/legal-entities/${legalEntityId}/periods/${periodId}/close`, {
      method: "POST",
    });
  }

  listEntries(tenantId: string, legalEntityId: string): Promise<JsonValue> {
    return this.request(`/v1/tenants/${tenantId}/legal-entities/${legalEntityId}/gl/entries`);
  }

  reverseEntry(tenantId: string, legalEntityId: string, entryId: string): Promise<JsonValue> {
    return this.request(`/v1/tenants/${tenantId}/legal-entities/${legalEntityId}/gl/entries/${entryId}/reverse`, {
      method: "POST",
    });
  }

  createItem(tenantId: string, legalEntityId: string, payload: Record<string, unknown>): Promise<JsonValue> {
    return this.request(`/v1/tenants/${tenantId}/legal-entities/${legalEntityId}/items`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  balances(tenantId: string, legalEntityId: string): Promise<JsonValue> {
    return this.request(`/v1/tenants/${tenantId}/legal-entities/${legalEntityId}/inventory/balances`);
  }

  createDocument(path: string, payload: Record<string, unknown>): Promise<JsonValue> {
    return this.request(path, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  listApprovals(tenantId: string, legalEntityId: string): Promise<JsonValue> {
    return this.request(`/v1/tenants/${tenantId}/legal-entities/${legalEntityId}/approvals`);
  }

  approve(tenantId: string, legalEntityId: string, approvalId: string): Promise<JsonValue> {
    return this.request(`/v1/tenants/${tenantId}/legal-entities/${legalEntityId}/approvals/${approvalId}/approve`, {
      method: "POST",
    });
  }

  audit(tenantId: string, legalEntityId: string): Promise<JsonValue> {
    return this.request(`/v1/tenants/${tenantId}/legal-entities/${legalEntityId}/audit`);
  }

  documents(tenantId: string, legalEntityId: string): Promise<JsonValue> {
    return this.request(`/v1/tenants/${tenantId}/legal-entities/${legalEntityId}/documents`);
  }

  dashboard(tenantId: string, legalEntityId: string): Promise<JsonValue> {
    return this.request(`/v1/app/dashboard?tenantId=${encodeURIComponent(tenantId)}&legalEntityId=${encodeURIComponent(legalEntityId)}`);
  }
}
