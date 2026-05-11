import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";

import { loadIotConfig, type IotServiceConfig } from "./config.ts";
import { IotRealtimeHub } from "./realtime.ts";
import { IotServiceStore, type IoTActionRequest } from "./db.ts";
import { registerIotTools, registerToolRoutes } from "./tools.ts";
import { AdapterRegistry } from "./adapters/registry.ts";
import { MockSimulatorAdapter } from "./adapters/mock-simulator.ts";
import { GenericHTTPAdapter } from "./adapters/generic-http.ts";
import { HueLocalAdapter } from "./adapters/hue-local.ts";
import { MatterAdapter } from "./adapters/matter.ts";
import { HomeKitAdapter } from "./adapters/homekit.ts";
import { MqttAdapter } from "./adapters/mqtt.ts";
import { DiscoveryOrchestrator } from "./discovery.ts";

function resolveUiRoot(): string | null {
  const candidates = [
    fileURLToPath(new URL("../../ui/dist", import.meta.url)),
    fileURLToPath(new URL("../ui/dist", import.meta.url)),
    path.join(process.cwd(), "ui", "dist"),
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html"))) ?? null;
}

function resolveBrandRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../../../public", import.meta.url)),
    fileURLToPath(new URL("../../public", import.meta.url)),
    path.join(process.cwd(), "../public"),
    path.join(process.cwd(), "public"),
  ];
  return candidates.find((candidate) => (
    fs.existsSync(path.join(candidate, "logo.png")) &&
    fs.existsSync(path.join(candidate, "favicon.ico"))
  )) ?? candidates[0];
}

function readBody(request: { body?: unknown }): Record<string, unknown> {
  return (request.body ?? {}) as Record<string, unknown>;
}

export interface BuildIotAppOptions {
  config?: Partial<IotServiceConfig>;
}

export function buildIotApp(options: BuildIotAppOptions = {}) {
  const config = loadIotConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false });
  const realtime = new IotRealtimeHub();
  const registry = new AdapterRegistry();
  registry.register(new MockSimulatorAdapter());
  registry.register(new GenericHTTPAdapter());
  registry.register(new HueLocalAdapter());
  registry.register(new MatterAdapter());
  registry.register(new HomeKitAdapter());
  registry.register(new MqttAdapter());
  const store = new IotServiceStore(config.dbPath, {
    onEvent: (event) => realtime.broadcast(event),
    onActionExecuted: ({ home, request, capabilityKey, targets, capabilityUpdates, actor }) => {
      // Fan out the optimistic update to the real device(s). The
      // adapter dispatch is async + best-effort; errors are logged and
      // surfaced through `iot.adapter.failed` realtime events so the
      // UI can flag the device as offline without rolling back the
      // optimistic SQLite state.
      for (const thing of targets) {
        const update = capabilityUpdates.find((entry) => entry.thingId === thing.id);
        const desiredValue = update?.desiredValue ?? request.value;
        void (async () => {
          const result = await registry.dispatch({
            thing,
            capability: capabilityKey,
            desiredValue,
            action: request.action,
          });
          if (!result) {
            // No adapter registered for this connectorId. Keep optimistic
            // state — useful for seed devices that don't have hardware.
            return;
          }
          if (result.note?.startsWith("dispatch_failed")) {
            realtime.broadcast({
              id: `adapter_${thing.id}_${Date.now()}`,
              homeId: home.id,
              type: "iot.adapter.failed",
              payload: { thingId: thing.id, capability: capabilityKey, actor, note: result.note },
              createdAt: new Date().toISOString(),
            });
          }
        })();
      }
    },
  });
  const discovery = new DiscoveryOrchestrator(registry, realtime, () => {
    try {
      return store.resolveHome().id;
    } catch {
      return "default";
    }
  });
  const uiRoot = resolveUiRoot();
  const brandRoot = resolveBrandRoot();

  app.addHook("onClose", async () => {
    store.close();
  });

  app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  });

  if (uiRoot) {
    app.register(fastifyStatic, {
      root: uiRoot,
      prefix: "/",
      wildcard: false,
      index: false,
    });
  }
  app.register(fastifyStatic, {
    root: brandRoot,
    prefix: "/brand/",
    decorateReply: false,
  });

  app.get("/", async (_request, reply) => {
    if (!uiRoot) {
      reply.type("text/html; charset=utf-8");
      return [
        "<!doctype html>",
        "<html><head><meta charset='utf-8'><title>IoT</title></head>",
        "<body><main><h1>IoT</h1><p>Build the UI with <code>npm --prefix iot run build:ui</code>.</p></main></body></html>",
      ].join("");
    }
    reply.type("text/html; charset=utf-8");
    return fs.readFileSync(path.join(uiRoot, "index.html"), "utf8");
  });

  app.get("/favicon.ico", async (_request, reply) => {
    await reply.code(204).send();
  });

  app.get("/v1/health", async () => ({
    ok: true,
    service: "iot",
    host: config.host,
    port: config.port,
  }));

  // Agent tools: read-only verbs from Phase 1 plus Phase 2 mutating
  // verbs (control, scenes, automations, approvals, discovery, things).
  // Routes are GET /v1/tools/list and POST /v1/tools/:toolId/invoke;
  // see `./tools.ts` for the registry.
  registerIotTools();
  registerToolRoutes(app, { store, registry, discovery });

  // Discovery stops cleanly on shutdown so the bonjour multicast
  // sockets release. Idempotent: a stop without an active scan is a
  // no-op. MQTT disconnect releases the broker connection so port
  // recycling stays clean.
  app.addHook("onClose", async () => {
    discovery.stop();
    const mqtt = registry.get("mqtt") as MqttAdapter | undefined;
    await mqtt?.disconnect();
  });

  app.get("/v1/homes", async () => ({
    homes: store.listHomes(),
  }));

  app.get("/v1/default-home", async () => ({
    home: store.resolveHome(),
  }));

  app.get("/v1/homes/:homeId", async (request) => ({
    home: store.resolveHome((request.params as { homeId: string }).homeId),
  }));

  app.get("/v1/areas", async () => ({
    areas: store.listAreas(),
  }));

  app.get("/v1/homes/:homeId/areas", async (request) => ({
    areas: store.listAreas((request.params as { homeId: string }).homeId),
  }));

  app.get("/v1/things", async (request) => {
    const query = request.query as { kind?: string; q?: string; area?: string };
    return {
      things: store.listThings(undefined, {
        kind: query.kind,
        query: query.q,
        area: query.area,
      }),
    };
  });

  app.get("/v1/homes/:homeId/things", async (request) => {
    const params = request.params as { homeId: string };
    const query = request.query as { kind?: string; q?: string; area?: string };
    return {
      things: store.listThings(params.homeId, {
        kind: query.kind,
        query: query.q,
        area: query.area,
      }),
    };
  });

  app.get("/v1/state", async () => ({
    snapshot: store.getStateSnapshot(),
  }));

  app.get("/v1/homes/:homeId/state", async (request) => ({
    snapshot: store.getStateSnapshot((request.params as { homeId: string }).homeId),
  }));

  app.get("/v1/events", async (request) => ({
    events: store.listEvents(undefined, Number((request.query as { limit?: string }).limit ?? "50")),
  }));

  app.get("/v1/homes/:homeId/events", async (request) => ({
    events: store.listEvents((request.params as { homeId: string }).homeId, Number((request.query as { limit?: string }).limit ?? "50")),
  }));

  app.get("/v1/events/stream", async (_request, reply) => {
    const home = store.resolveHome();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ homeId: home.id })}\n\n`);
    realtime.attach(home.id, reply);
    return reply;
  });

  app.get("/v1/homes/:homeId/events/stream", async (request, reply) => {
    const home = store.resolveHome((request.params as { homeId: string }).homeId);
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ homeId: home.id })}\n\n`);
    realtime.attach(home.id, reply);
    return reply;
  });

  app.get("/v1/scenes", async () => ({
    scenes: store.listScenes(),
  }));

  app.get("/v1/homes/:homeId/scenes", async (request) => ({
    scenes: store.listScenes((request.params as { homeId: string }).homeId),
  }));

  app.post("/v1/scenes/:sceneId/activate", async (request) => ({
    result: store.activateScene(undefined, (request.params as { sceneId: string }).sceneId, "ui"),
  }));

  app.post("/v1/homes/:homeId/scenes/:sceneId/activate", async (request) => {
    const params = request.params as { homeId: string; sceneId: string };
    return {
      result: store.activateScene(params.homeId, params.sceneId, "ui"),
    };
  });

  app.get("/v1/automations", async () => ({
    automations: store.listAutomations(),
  }));

  app.get("/v1/homes/:homeId/automations", async (request) => ({
    automations: store.listAutomations((request.params as { homeId: string }).homeId),
  }));

  app.post("/v1/automations", async (request) => {
    const body = readBody(request);
    return {
      automation: store.createAutomation(undefined, {
        label: String(body.label ?? ""),
        enabled: body.enabled !== false,
        trigger: (body.trigger ?? {}) as Record<string, unknown>,
        conditions: ((body.conditions ?? []) as Array<Record<string, unknown>>),
        actions: ((body.actions ?? []) as IoTActionRequest[]),
      }),
    };
  });

  app.post("/v1/homes/:homeId/automations", async (request) => {
    const body = readBody(request);
    return {
      automation: store.createAutomation((request.params as { homeId: string }).homeId, {
        label: String(body.label ?? ""),
        enabled: body.enabled !== false,
        trigger: (body.trigger ?? {}) as Record<string, unknown>,
        conditions: ((body.conditions ?? []) as Array<Record<string, unknown>>),
        actions: ((body.actions ?? []) as IoTActionRequest[]),
      }),
    };
  });

  app.post("/v1/automations/:automationId/enable", async (request) => ({
    automation: store.setAutomationEnabled(undefined, (request.params as { automationId: string }).automationId, true),
  }));

  app.post("/v1/homes/:homeId/automations/:automationId/enable", async (request) => {
    const params = request.params as { homeId: string; automationId: string };
    return {
      automation: store.setAutomationEnabled(params.homeId, params.automationId, true),
    };
  });

  app.post("/v1/automations/:automationId/disable", async (request) => ({
    automation: store.setAutomationEnabled(undefined, (request.params as { automationId: string }).automationId, false),
  }));

  app.post("/v1/homes/:homeId/automations/:automationId/disable", async (request) => {
    const params = request.params as { homeId: string; automationId: string };
    return {
      automation: store.setAutomationEnabled(params.homeId, params.automationId, false),
    };
  });

  app.post("/v1/automations/:automationId/run", async (request) => ({
    result: store.runAutomation(undefined, (request.params as { automationId: string }).automationId),
  }));

  app.post("/v1/homes/:homeId/automations/:automationId/run", async (request) => {
    const params = request.params as { homeId: string; automationId: string };
    return {
      result: store.runAutomation(params.homeId, params.automationId),
    };
  });

  app.post("/v1/policies/evaluate", async (request) => ({
    evaluation: store.evaluatePolicy(undefined, readBody(request) as unknown as IoTActionRequest),
  }));

  app.post("/v1/homes/:homeId/policies/evaluate", async (request) => ({
    evaluation: store.evaluatePolicy((request.params as { homeId: string }).homeId, readBody(request) as unknown as IoTActionRequest),
  }));

  app.get("/v1/approvals", async () => ({
    approvals: store.listApprovals(),
  }));

  app.get("/v1/homes/:homeId/approvals", async (request) => ({
    approvals: store.listApprovals((request.params as { homeId: string }).homeId),
  }));

  app.post("/v1/approvals/:approvalId/approve", async (request) => ({
    result: store.approveApproval(undefined, (request.params as { approvalId: string }).approvalId),
  }));

  app.post("/v1/homes/:homeId/approvals/:approvalId/approve", async (request) => {
    const params = request.params as { homeId: string; approvalId: string };
    return {
      result: store.approveApproval(params.homeId, params.approvalId),
    };
  });

  app.post("/v1/approvals/:approvalId/deny", async (request) => ({
    approval: store.denyApproval(undefined, (request.params as { approvalId: string }).approvalId),
  }));

  app.post("/v1/homes/:homeId/approvals/:approvalId/deny", async (request) => {
    const params = request.params as { homeId: string; approvalId: string };
    return {
      approval: store.denyApproval(params.homeId, params.approvalId),
    };
  });

  app.post("/v1/actions", async (request) => ({
    result: store.runAction(undefined, readBody(request) as unknown as IoTActionRequest),
  }));

  app.post("/v1/homes/:homeId/actions", async (request) => ({
    result: store.runAction((request.params as { homeId: string }).homeId, readBody(request) as unknown as IoTActionRequest),
  }));

  app.post("/v1/raw/invoke", async (request) => {
    const body = readBody(request);
    return {
      result: store.rawInvoke({
        connector: String(body.connector ?? ""),
        homeId: typeof body.homeId === "string" ? body.homeId : undefined,
        target: String(body.target ?? ""),
        action: String(body.action ?? ""),
        payload: (body.payload ?? {}) as Record<string, unknown>,
      }),
    };
  });

  return { app, store };
}
