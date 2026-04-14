import type {
  ApprovalRecord,
  AreaDescriptor,
  AutomationRecord,
  HomeDescriptor,
  IoTActionRequest,
  IoTActionResult,
  IoTEventRecord,
  IoTPolicyEvaluation,
  IoTStateSnapshot,
  RawIoTInvocation,
  SceneRecord,
  ThingDescriptor,
} from "@clawjs/core";

export interface IotClientOptions {
  baseUrl: string;
  token?: string;
}

export class IotClient {
  private readonly baseUrl: string;
  private readonly token?: string;

  constructor(options: IotClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.token) {
      headers.set("authorization", `Bearer ${this.token}`);
    }
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const payload = await response.json() as T & { error?: string; message?: string };
    if (!response.ok) {
      throw new Error(
        typeof payload === "object" && payload && ("error" in payload || "message" in payload)
          ? String(payload.error ?? payload.message)
          : JSON.stringify(payload),
      );
    }
    return payload;
  }

  async listHomes(): Promise<HomeDescriptor[]> {
    const payload = await this.request<{ homes: HomeDescriptor[] }>("/v1/homes");
    return payload.homes;
  }

  async getHome(homeId?: string): Promise<HomeDescriptor> {
    const payload = await this.request<{ home: HomeDescriptor }>(homeId ? `/v1/homes/${homeId}` : "/v1/default-home");
    return payload.home;
  }

  async listAreas(homeId?: string): Promise<AreaDescriptor[]> {
    const payload = await this.request<{ areas: AreaDescriptor[] }>(homeId ? `/v1/homes/${homeId}/areas` : "/v1/areas");
    return payload.areas;
  }

  async listThings(options: { homeId?: string; kind?: string; query?: string; area?: string } = {}): Promise<ThingDescriptor[]> {
    const url = new URL(
      options.homeId ? `/v1/homes/${options.homeId}/things` : "/v1/things",
      this.baseUrl,
    );
    if (options.kind) url.searchParams.set("kind", options.kind);
    if (options.query) url.searchParams.set("q", options.query);
    if (options.area) url.searchParams.set("area", options.area);
    const payload = await this.request<{ things: ThingDescriptor[] }>(url.pathname + url.search);
    return payload.things;
  }

  async getThing(thingId: string, homeId?: string): Promise<ThingDescriptor | null> {
    const things = await this.listThings({ homeId });
    return things.find((thing) => thing.id === thingId) ?? null;
  }

  async searchThings(query: string, options: { homeId?: string; kind?: string; area?: string } = {}): Promise<ThingDescriptor[]> {
    return await this.listThings({
      ...options,
      query,
    });
  }

  async getState(homeId?: string): Promise<IoTStateSnapshot> {
    const payload = await this.request<{ snapshot: IoTStateSnapshot }>(homeId ? `/v1/homes/${homeId}/state` : "/v1/state");
    return payload.snapshot;
  }

  async history(homeId?: string, options: { limit?: number } = {}): Promise<IoTEventRecord[]> {
    const suffix = options.limit ? `?limit=${options.limit}` : "";
    const payload = await this.request<{ events: IoTEventRecord[] }>(homeId ? `/v1/homes/${homeId}/events${suffix}` : `/v1/events${suffix}`);
    return payload.events;
  }

  async *watch(homeId?: string): AsyncGenerator<IoTEventRecord> {
    const response = await fetch(`${this.baseUrl}${homeId ? `/v1/homes/${homeId}/events/stream` : "/v1/events/stream"}`, {
      headers: this.token ? { authorization: `Bearer ${this.token}` } : undefined,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Failed to open IoT event stream: ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex !== -1) {
        const chunk = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
        if (dataLine) {
          const event = JSON.parse(dataLine.slice(6)) as IoTEventRecord | { homeId: string };
          if ("id" in event) {
            yield event;
          }
        }
        separatorIndex = buffer.indexOf("\n\n");
      }
    }
  }

  async runAction(input: IoTActionRequest, homeId?: string): Promise<IoTActionResult> {
    const payload = await this.request<{ result: IoTActionResult }>(homeId ? `/v1/homes/${homeId}/actions` : "/v1/actions", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return payload.result;
  }

  async listScenes(homeId?: string): Promise<SceneRecord[]> {
    const payload = await this.request<{ scenes: SceneRecord[] }>(homeId ? `/v1/homes/${homeId}/scenes` : "/v1/scenes");
    return payload.scenes;
  }

  async activateScene(sceneId: string, homeId?: string): Promise<{ scene: SceneRecord; results: IoTActionResult[] }> {
    const payload = await this.request<{ result: { scene: SceneRecord; results: IoTActionResult[] } }>(
      homeId ? `/v1/homes/${homeId}/scenes/${sceneId}/activate` : `/v1/scenes/${sceneId}/activate`,
      { method: "POST" },
    );
    return payload.result;
  }

  async listAutomations(homeId?: string): Promise<AutomationRecord[]> {
    const payload = await this.request<{ automations: AutomationRecord[] }>(homeId ? `/v1/homes/${homeId}/automations` : "/v1/automations");
    return payload.automations;
  }

  async createAutomation(input: {
    label: string;
    enabled?: boolean;
    trigger?: Record<string, unknown>;
    conditions?: Array<Record<string, unknown>>;
    actions: IoTActionRequest[];
  }, homeId?: string): Promise<AutomationRecord> {
    const payload = await this.request<{ automation: AutomationRecord }>(homeId ? `/v1/homes/${homeId}/automations` : "/v1/automations", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return payload.automation;
  }

  async enableAutomation(automationId: string, homeId?: string): Promise<AutomationRecord> {
    const payload = await this.request<{ automation: AutomationRecord }>(
      homeId ? `/v1/homes/${homeId}/automations/${automationId}/enable` : `/v1/automations/${automationId}/enable`,
      { method: "POST" },
    );
    return payload.automation;
  }

  async disableAutomation(automationId: string, homeId?: string): Promise<AutomationRecord> {
    const payload = await this.request<{ automation: AutomationRecord }>(
      homeId ? `/v1/homes/${homeId}/automations/${automationId}/disable` : `/v1/automations/${automationId}/disable`,
      { method: "POST" },
    );
    return payload.automation;
  }

  async runAutomation(automationId: string, homeId?: string): Promise<{ automation: AutomationRecord; results: IoTActionResult[] }> {
    const payload = await this.request<{ result: { automation: AutomationRecord; results: IoTActionResult[] } }>(
      homeId ? `/v1/homes/${homeId}/automations/${automationId}/run` : `/v1/automations/${automationId}/run`,
      { method: "POST" },
    );
    return payload.result;
  }

  async evaluatePolicy(input: IoTActionRequest, homeId?: string): Promise<IoTPolicyEvaluation> {
    const payload = await this.request<{ evaluation: IoTPolicyEvaluation }>(
      homeId ? `/v1/homes/${homeId}/policies/evaluate` : "/v1/policies/evaluate",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    return payload.evaluation;
  }

  async listApprovals(homeId?: string): Promise<ApprovalRecord[]> {
    const payload = await this.request<{ approvals: ApprovalRecord[] }>(homeId ? `/v1/homes/${homeId}/approvals` : "/v1/approvals");
    return payload.approvals;
  }

  async approve(approvalId: string, homeId?: string): Promise<{ approval: ApprovalRecord; result: IoTActionResult }> {
    const payload = await this.request<{ result: { approval: ApprovalRecord; result: IoTActionResult } }>(
      homeId ? `/v1/homes/${homeId}/approvals/${approvalId}/approve` : `/v1/approvals/${approvalId}/approve`,
      { method: "POST" },
    );
    return payload.result;
  }

  async deny(approvalId: string, homeId?: string): Promise<ApprovalRecord> {
    const payload = await this.request<{ approval: ApprovalRecord }>(
      homeId ? `/v1/homes/${homeId}/approvals/${approvalId}/deny` : `/v1/approvals/${approvalId}/deny`,
      { method: "POST" },
    );
    return payload.approval;
  }

  async rawInvoke(input: RawIoTInvocation): Promise<RawIoTInvocation & { acceptedAt: string }> {
    const payload = await this.request<{ result: RawIoTInvocation & { acceptedAt: string } }>("/v1/raw/invoke", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return payload.result;
  }
}
