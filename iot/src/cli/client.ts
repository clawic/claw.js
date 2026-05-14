import { clawApiPath } from "@clawjs/core";
type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface IotCliClientOptions {
  baseUrl: string;
}

export class IotApiClient {
  constructor(private readonly options: IotCliClientOptions) {}

  private async request(path: string, init: RequestInit = {}): Promise<JsonValue> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
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

  async listHomes() {
    return await this.request(clawApiPath("homes"));
  }

  async listAreas(homeId?: string) {
    return await this.request(homeId ? clawApiPath(`homes/${homeId}/areas`) : clawApiPath("areas"));
  }

  async listThings(options: { homeId?: string; kind?: string; q?: string; area?: string } = {}) {
    const base = new URL(options.homeId ? clawApiPath(`homes/${options.homeId}/things`) : clawApiPath("things"), this.options.baseUrl);
    if (options.kind) base.searchParams.set("kind", options.kind);
    if (options.q) base.searchParams.set("q", options.q);
    if (options.area) base.searchParams.set("area", options.area);
    return await this.request(base.pathname + base.search);
  }

  async state(homeId?: string) {
    return await this.request(homeId ? clawApiPath(`homes/${homeId}/state`) : clawApiPath("state"));
  }

  async evaluate(input: Record<string, unknown>, homeId?: string) {
    return await this.request(homeId ? clawApiPath(`homes/${homeId}/policies/evaluate`) : clawApiPath("policies/evaluate"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async runAction(input: Record<string, unknown>, homeId?: string) {
    return await this.request(homeId ? clawApiPath(`homes/${homeId}/actions`) : clawApiPath("actions"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listScenes(homeId?: string) {
    return await this.request(homeId ? clawApiPath(`homes/${homeId}/scenes`) : clawApiPath("scenes"));
  }

  async activateScene(sceneId: string, homeId?: string) {
    return await this.request(homeId ? clawApiPath(`homes/${homeId}/scenes/${sceneId}/activate`) : clawApiPath(`scenes/${sceneId}/activate`), {
      method: "POST",
    });
  }

  async listAutomations(homeId?: string) {
    return await this.request(homeId ? clawApiPath(`homes/${homeId}/automations`) : clawApiPath("automations"));
  }

  async createAutomation(input: Record<string, unknown>, homeId?: string) {
    return await this.request(homeId ? clawApiPath(`homes/${homeId}/automations`) : clawApiPath("automations"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async setAutomationEnabled(automationId: string, enabled: boolean, homeId?: string) {
    return await this.request(
      homeId ? clawApiPath(`homes/${homeId}/automations/${automationId}/${enabled ? "enable" : "disable"}`) : clawApiPath(`automations/${automationId}/${enabled ? "enable" : "disable"}`),
      { method: "POST" },
    );
  }

  async runAutomation(automationId: string, homeId?: string) {
    return await this.request(homeId ? clawApiPath(`homes/${homeId}/automations/${automationId}/run`) : clawApiPath(`automations/${automationId}/run`), {
      method: "POST",
    });
  }

  async listApprovals(homeId?: string) {
    return await this.request(homeId ? clawApiPath(`homes/${homeId}/approvals`) : clawApiPath("approvals"));
  }

  async approve(approvalId: string, homeId?: string) {
    return await this.request(homeId ? clawApiPath(`homes/${homeId}/approvals/${approvalId}/approve`) : clawApiPath(`approvals/${approvalId}/approve`), {
      method: "POST",
    });
  }

  async deny(approvalId: string, homeId?: string) {
    return await this.request(homeId ? clawApiPath(`homes/${homeId}/approvals/${approvalId}/deny`) : clawApiPath(`approvals/${approvalId}/deny`), {
      method: "POST",
    });
  }

  async rawInvoke(input: Record<string, unknown>) {
    return await this.request(clawApiPath("raw/invoke"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
