import { clawApiPath } from "@clawjs/core";
// Agent tools registry exposed by clawjs-iot.
//
// Every LLM-callable verb the daemon ships passes through this module.
// Tools are registered at startup, listed via `GET /v1/tools/list`, and
// invoked via `POST /v1/tools/:toolId/invoke`. The wire shape mirrors
// `@clawjs/core` `AgentToolDescriptor` / `AgentToolInvocationResult`;
// the duplicated interfaces here keep clawjs-iot dependency-free from
// the SDK packages while staying type-compatible with consumers.
//
// IoT tools are the first feature to publish on this surface. Future
// features (database mutations, calendar, notes, ...) register through
// the same module in their own packages, and the daemon aggregates the
// catalog under a single clawApiPath(`tools/list`) response.

import type { FastifyInstance, FastifyRequest } from "fastify";

import type {
  CreateDeviceInput,
  IoTActionRequest,
  IotServiceStore,
} from "./db.ts";
import type { AdapterRegistry } from "./adapters/registry.ts";
import type { DiscoveryOrchestrator } from "./discovery.ts";
import type { MatterAdapter } from "./adapters/matter.ts";
import type { HomeKitAdapter } from "./adapters/homekit.ts";
import type { MqttAdapter, MqttBrokerConfig } from "./adapters/mqtt.ts";
import type { TuyaAdapter, TuyaCredentials } from "./adapters/tuya.ts";
import type { GoogleHomeAdapter, GoogleHomeCredentials } from "./adapters/google-home.ts";
import type { AlexaAdapter, AlexaCredentials } from "./adapters/alexa.ts";

/**
 * Severity grade attached to every agent tool. Drives the approval
 * gate at the client side. Kept in sync with `AgentToolRiskLevel` in
 * `@clawjs/core/agent_tools.ts` (canonical definition there).
 */
type ToolRiskLevel =
  | "safe"
  | "reversible"
  | "sensitive"
  | "catastrophic";

interface ToolParametersSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
}

interface ToolDescriptor {
  id: string;
  title: string;
  description: string;
  domain: string;
  sourceFeature: string;
  parameters: ToolParametersSchema;
  riskLevel: ToolRiskLevel;
  requiresApproval?: boolean;
  version?: string;
}

interface ToolInvocationResult {
  ok: boolean;
  value?: unknown;
  error?: ToolInvocationError;
  invocationId?: string;
  durationMs?: number;
}

interface ToolInvocationError {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
}

/** Runtime handler bound to a descriptor at registration time. */
type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolHandlerContext,
) => Promise<unknown>;

/** Dependencies handed to every tool handler. */
export interface ToolHandlerContext {
  store: IotServiceStore;
  registry: AdapterRegistry;
  discovery: DiscoveryOrchestrator;
}

interface RegisteredTool {
  descriptor: ToolDescriptor;
  handler: ToolHandler;
}

const REGISTRY = new Map<string, RegisteredTool>();

/**
 * Add a tool to the registry. Throws on duplicate ids so a caller
 * cannot silently override another feature's verb. Returns the
 * descriptor for chaining or logging.
 */
function registerTool(descriptor: ToolDescriptor, handler: ToolHandler): ToolDescriptor {
  if (REGISTRY.has(descriptor.id)) {
    throw new Error(`Tool already registered: ${descriptor.id}`);
  }
  REGISTRY.set(descriptor.id, { descriptor, handler });
  return descriptor;
}

function listTools(): ToolDescriptor[] {
  return Array.from(REGISTRY.values())
    .map((entry) => entry.descriptor)
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function invokeTool(
  id: string,
  args: Record<string, unknown>,
  context: ToolHandlerContext,
  invocationId?: string,
): Promise<ToolInvocationResult> {
  const entry = REGISTRY.get(id);
  if (!entry) {
    return {
      ok: false,
      invocationId,
      error: { code: "not_found", message: `Unknown tool: ${id}` },
    };
  }
  const started = Date.now();
  try {
    const value = await entry.handler(args, context);
    return {
      ok: true,
      value,
      invocationId,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const err = error as Error;
    return {
      ok: false,
      invocationId,
      durationMs: Date.now() - started,
      error: {
        code: "internal",
        message: err?.message ?? String(error),
      },
    };
  }
}

/**
 * Register the Fastify routes that surface the registry. Idempotent
 * within one app instance; calling twice with the same `app` is a
 * Fastify error (route conflict) and intentional so the developer
 * notices the duplicate wiring.
 */
export function registerToolRoutes(app: FastifyInstance, context: ToolHandlerContext): void {
  app.get(clawApiPath("tools/list"), async () => ({
    generatedAt: new Date().toISOString(),
    tools: listTools(),
  }));

  app.post(clawApiPath("tools/:toolId/invoke"), async (request: FastifyRequest) => {
    const params = request.params as { toolId: string };
    const body = (request.body ?? {}) as { arguments?: Record<string, unknown>; invocationId?: string };
    const args = (body.arguments ?? {}) as Record<string, unknown>;
    return invokeTool(params.toolId, args, context, body.invocationId);
  });
}

// ---------------------------------------------------------------------------
// IoT tool registrations · read-only set for Phase 1
// ---------------------------------------------------------------------------

const IOT_FEATURE = "iot";

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = optionalString(args, key);
  if (!value) {
    throw new Error(`Missing required argument: ${key}`);
  }
  return value;
}

/** Idempotency guard: tests re-call `buildIotApp()` per case. */
let iotToolsRegistered = false;

/**
 * Register the initial IoT tool surface. Only read-only verbs ship in
 * Phase 1; mutating verbs (control, scene activation, automation
 * create/run, approval approve/deny) land in Phase 2 alongside the
 * adapter SPI and approval flow.
 */
export function registerIotTools(): void {
  if (iotToolsRegistered) {
    return;
  }
  iotToolsRegistered = true;
  registerTool(
    {
      id: "iot.homes.list",
      title: "List homes",
      description: "List every home the user has configured. Returns id, label, and default flag.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: { type: "object", properties: {}, additionalProperties: false },
      riskLevel: "safe",
    },
    async (_args, { store }) => ({ homes: store.listHomes() }),
  );

  registerTool(
    {
      id: "iot.things.list",
      title: "List things",
      description:
        "List smart-home things (lights, switches, sensors, ...). Optional filters: homeId, area, kind, query.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          homeId: { type: "string", description: "Restrict to a single home." },
          area: { type: "string", description: "Restrict to a single area inside the home." },
          kind: {
            type: "string",
            description: "Restrict to one thing kind (e.g. light, switch, climate).",
          },
          query: { type: "string", description: "Free-text match against label and aliases." },
        },
        additionalProperties: false,
      },
      riskLevel: "safe",
    },
    async (args, { store }) => ({
      things: store.listThings(optionalString(args, "homeId"), {
        kind: optionalString(args, "kind"),
        area: optionalString(args, "area"),
        query: optionalString(args, "query"),
      }),
    }),
  );

  registerTool(
    {
      id: "iot.things.get",
      title: "Get thing",
      description: "Return one thing by id, including its capabilities and last known state.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          thingId: { type: "string", description: "Unique thing identifier." },
          homeId: {
            type: "string",
            description: "Optional home scope; defaults to the user's resolved home.",
          },
        },
        required: ["thingId"],
        additionalProperties: false,
      },
      riskLevel: "safe",
    },
    async (args, { store }) => {
      const thingId = requiredString(args, "thingId");
      const thing = store.getThing(optionalString(args, "homeId"), thingId);
      if (!thing) {
        throw new Error(`Unknown thing: ${thingId}`);
      }
      return { thing };
    },
  );

  registerTool(
    {
      id: "iot.areas.list",
      title: "List areas",
      description: "List areas (rooms or zones). Optional homeId filter.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          homeId: { type: "string", description: "Restrict to a single home." },
        },
        additionalProperties: false,
      },
      riskLevel: "safe",
    },
    async (args, { store }) => ({ areas: store.listAreas(optionalString(args, "homeId")) }),
  );

  registerTool(
    {
      id: "iot.scenes.list",
      title: "List scenes",
      description: "List saved scenes (one-shot state recipes). Optional homeId filter.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          homeId: { type: "string", description: "Restrict to a single home." },
        },
        additionalProperties: false,
      },
      riskLevel: "safe",
    },
    async (args, { store }) => ({ scenes: store.listScenes(optionalString(args, "homeId")) }),
  );

  registerTool(
    {
      id: "iot.automations.list",
      title: "List automations",
      description:
        "List automations (trigger + conditions + actions). Optional homeId filter; includes both enabled and disabled.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          homeId: { type: "string", description: "Restrict to a single home." },
        },
        additionalProperties: false,
      },
      riskLevel: "safe",
    },
    async (args, { store }) => ({
      automations: store.listAutomations(optionalString(args, "homeId")),
    }),
  );

  // -------------------------------------------------------------------------
  // Phase 2 · Connectors + discovery + mutating verbs
  // -------------------------------------------------------------------------

  registerTool(
    {
      id: "iot.connectors.list",
      title: "List connectors",
      description: "List the connector adapters the daemon has registered (mock simulator, generic HTTP, Hue local, ...).",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: { type: "object", properties: {}, additionalProperties: false },
      riskLevel: "safe",
    },
    async (_args, { registry }) => ({
      connectors: registry.list().map((adapter) => ({
        id: adapter.id,
        label: adapter.label,
        description: adapter.description ?? null,
        discovers: typeof adapter.discover === "function",
      })),
    }),
  );

  registerTool(
    {
      id: "iot.discovery.start",
      title: "Start discovery",
      description: "Kick off an mDNS + adapter-driven scan for devices on the local network. Results stream via the SSE event channel as iot.discovery.found events.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", description: "Optional DeviceKind to focus the scan." },
          timeoutMs: { type: "number", description: "Max scan duration. Default 8000." },
        },
        additionalProperties: false,
      },
      riskLevel: "safe",
    },
    async (args, { discovery }) => {
      const timeoutRaw = args["timeoutMs"];
      const timeoutMs = typeof timeoutRaw === "number" ? timeoutRaw : undefined;
      const result = await discovery.start({
        kind: optionalString(args, "kind") as never,
        timeoutMs,
      });
      return result;
    },
  );

  registerTool(
    {
      id: "iot.discovery.stop",
      title: "Stop discovery",
      description: "Stop an in-progress discovery scan. Idempotent.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: { type: "object", properties: {}, additionalProperties: false },
      riskLevel: "safe",
    },
    async (_args, { discovery }) => {
      discovery.stop();
      return { stopped: true };
    },
  );

  registerTool(
    {
      id: "iot.discovery.list",
      title: "List discovered devices",
      description: "Return the in-memory snapshot of devices the orchestrator has surfaced during the current scan window.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: { type: "object", properties: {}, additionalProperties: false },
      riskLevel: "safe",
    },
    async (_args, { discovery }) => ({
      scanning: discovery.isScanning(),
      devices: discovery.list(),
    }),
  );

  registerTool(
    {
      id: "iot.things.add",
      title: "Add a thing",
      description: "Register a new device in the store. Either pass a discovery fingerprint to lift a discovered device, or provide label + kind + connectorId + targetRef directly for a manual add.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          homeId: { type: "string", description: "Home scope; defaults to the resolved home." },
          fingerprint: { type: "string", description: "Discovery fingerprint from iot.discovery.list." },
          label: { type: "string" },
          kind: { type: "string" },
          connectorId: { type: "string" },
          targetRef: { type: "string" },
          areaId: { type: "string" },
          aliases: { type: "array", description: "Free-form aliases the agent should match." },
          metadata: { type: "object", description: "Adapter-specific configuration blob." },
        },
        additionalProperties: false,
      },
      riskLevel: "reversible",
    },
    async (args, { store, discovery }) => {
      const homeId = optionalString(args, "homeId");
      const fingerprint = optionalString(args, "fingerprint");
      let input: CreateDeviceInput;
      if (fingerprint) {
        const discovered = discovery.get(fingerprint);
        if (!discovered) {
          throw new Error(`Unknown discovery fingerprint ${fingerprint}`);
        }
        input = {
          label: optionalString(args, "label") ?? discovered.label,
          kind: discovered.kind,
          connectorId: discovered.connectorId,
          targetRef: discovered.targetRef,
          ...(optionalString(args, "areaId") ? { areaId: optionalString(args, "areaId")! } : {}),
          metadata: discovered.metadata,
          capabilities: discovered.capabilities?.map((capability) => ({
            key: capability.key,
            label: capability.label,
            valueType: capability.valueType,
            unit: capability.unit,
          })),
        };
      } else {
        input = {
          label: requiredString(args, "label"),
          kind: requiredString(args, "kind") as never,
          connectorId: requiredString(args, "connectorId"),
          targetRef: requiredString(args, "targetRef"),
          ...(optionalString(args, "areaId") ? { areaId: optionalString(args, "areaId")! } : {}),
          aliases: Array.isArray(args["aliases"]) ? (args["aliases"] as string[]) : undefined,
          metadata: (args["metadata"] as Record<string, unknown> | undefined),
        };
      }
      return { thing: store.createThing(homeId, input) };
    },
  );

  registerTool(
    {
      id: "iot.things.remove",
      title: "Remove a thing",
      description: "Delete a thing from the store along with its capabilities. Phase 2 hard-deletes; the trash window for recoverable deletes lands in Phase 3 with the UI.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          thingId: { type: "string" },
          homeId: { type: "string" },
        },
        required: ["thingId"],
        additionalProperties: false,
      },
      riskLevel: "sensitive",
    },
    async (args, { store }) => ({
      removed: store.deleteThing(optionalString(args, "homeId"), requiredString(args, "thingId")),
    }),
  );

  registerTool(
    {
      id: "iot.things.control",
      title: "Control a thing",
      description: "Send a capability change to a thing. Examples: turn a light on, set brightness to 60, set thermostat target to 21, open a cover. The daemon resolves selectors and gates risky actions through the approval queue.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          homeId: { type: "string" },
          selector: { type: "string", description: "Free-text match against id, label, alias, or targetRef." },
          area: { type: "string", description: "Restrict to one area." },
          family: { type: "string", description: "Restrict to one DeviceKind." },
          capability: { type: "string", description: "Capability key to write." },
          action: {
            type: "string",
            description: "Verb the agent intends (on/off/toggle/set/open/close/lock/unlock/start/stop/...).",
          },
          value: { description: "Desired value for the capability." },
          targets: { type: "array", description: "Explicit list of thing ids or labels." },
        },
        required: ["action"],
        additionalProperties: false,
      },
      riskLevel: "reversible",
    },
    async (args, { store }) => {
      const request: IoTActionRequest = {
        ...(optionalString(args, "homeId") ? { homeId: optionalString(args, "homeId")! } : {}),
        ...(optionalString(args, "selector") ? { selector: optionalString(args, "selector")! } : {}),
        ...(optionalString(args, "area") ? { area: optionalString(args, "area")! } : {}),
        ...(optionalString(args, "family") ? { family: optionalString(args, "family") as never } : {}),
        ...(optionalString(args, "capability") ? { capability: optionalString(args, "capability")! } : {}),
        action: requiredString(args, "action") as IoTActionRequest["action"],
        value: args["value"],
        ...(Array.isArray(args["targets"]) ? { targets: args["targets"] as string[] } : {}),
      };
      return { result: store.runAction(optionalString(args, "homeId"), request, { actor: "agent" }) };
    },
  );

  registerTool(
    {
      id: "iot.scenes.activate",
      title: "Activate a scene",
      description: "Run a saved scene's action list against its things.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          sceneId: { type: "string" },
          homeId: { type: "string" },
        },
        required: ["sceneId"],
        additionalProperties: false,
      },
      riskLevel: "reversible",
    },
    async (args, { store }) => ({
      result: store.activateScene(
        optionalString(args, "homeId"),
        requiredString(args, "sceneId"),
        "agent",
      ),
    }),
  );

  registerTool(
    {
      id: "iot.automations.create",
      title: "Create automation",
      description: "Register a new automation (trigger + conditions + actions).",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          homeId: { type: "string" },
          label: { type: "string" },
          enabled: { type: "boolean", description: "Default true." },
          trigger: { type: "object", description: "Free-form trigger descriptor." },
          conditions: { type: "array", description: "Free-form condition descriptors." },
          actions: { type: "array", description: "IoT action requests to run when the trigger fires." },
        },
        required: ["label", "actions"],
        additionalProperties: false,
      },
      riskLevel: "reversible",
    },
    async (args, { store }) => ({
      automation: store.createAutomation(optionalString(args, "homeId"), {
        label: requiredString(args, "label"),
        enabled: args["enabled"] !== false,
        trigger: (args["trigger"] ?? {}) as Record<string, unknown>,
        conditions: (args["conditions"] ?? []) as Array<Record<string, unknown>>,
        actions: (args["actions"] ?? []) as IoTActionRequest[],
      }),
    }),
  );

  registerTool(
    {
      id: "iot.automations.enable",
      title: "Enable automation",
      description: "Flip an automation to enabled. Idempotent.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          automationId: { type: "string" },
          homeId: { type: "string" },
        },
        required: ["automationId"],
        additionalProperties: false,
      },
      riskLevel: "reversible",
    },
    async (args, { store }) => ({
      automation: store.setAutomationEnabled(
        optionalString(args, "homeId"),
        requiredString(args, "automationId"),
        true,
      ),
    }),
  );

  registerTool(
    {
      id: "iot.automations.disable",
      title: "Disable automation",
      description: "Flip an automation to disabled. Idempotent.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          automationId: { type: "string" },
          homeId: { type: "string" },
        },
        required: ["automationId"],
        additionalProperties: false,
      },
      riskLevel: "reversible",
    },
    async (args, { store }) => ({
      automation: store.setAutomationEnabled(
        optionalString(args, "homeId"),
        requiredString(args, "automationId"),
        false,
      ),
    }),
  );

  registerTool(
    {
      id: "iot.automations.run",
      title: "Run automation now",
      description: "Manually trigger an automation regardless of its scheduled trigger.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          automationId: { type: "string" },
          homeId: { type: "string" },
        },
        required: ["automationId"],
        additionalProperties: false,
      },
      riskLevel: "reversible",
    },
    async (args, { store }) => ({
      result: store.runAutomation(
        optionalString(args, "homeId"),
        requiredString(args, "automationId"),
        "agent",
      ),
    }),
  );

  registerTool(
    {
      id: "iot.approvals.approve",
      title: "Approve a pending action",
      description: "Approve a pending high-risk action and let the store execute it with skipApproval=true.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          approvalId: { type: "string" },
          homeId: { type: "string" },
        },
        required: ["approvalId"],
        additionalProperties: false,
      },
      riskLevel: "sensitive",
    },
    async (args, { store }) => ({
      result: store.approveApproval(
        optionalString(args, "homeId"),
        requiredString(args, "approvalId"),
      ),
    }),
  );

  registerTool(
    {
      id: "iot.approvals.deny",
      title: "Deny a pending action",
      description: "Reject a pending action so it never reaches the device.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          approvalId: { type: "string" },
          homeId: { type: "string" },
        },
        required: ["approvalId"],
        additionalProperties: false,
      },
      riskLevel: "safe",
    },
    async (args, { store }) => ({
      approval: store.denyApproval(
        optionalString(args, "homeId"),
        requiredString(args, "approvalId"),
      ),
    }),
  );

  // -------------------------------------------------------------------------
  // Phase 4 · Matter + HomeKit + MQTT helpers
  // -------------------------------------------------------------------------

  registerTool(
    {
      id: "iot.matter.commission",
      title: "Commission a Matter device",
      description: "Run the Matter commissioning ceremony for one device. Pass the pairing code printed on the device's sticker or the QR-encoded payload.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          pairingCode: { type: "string", description: "Matter pairing code or QR-encoded payload." },
          label: { type: "string", description: "Optional friendly label for the new node." },
        },
        required: ["pairingCode"],
        additionalProperties: false,
      },
      riskLevel: "sensitive",
    },
    async (args, { registry }) => {
      const adapter = registry.get("matter") as MatterAdapter | undefined;
      if (!adapter) throw new Error("Matter adapter not registered.");
      return await adapter.commission({
        pairingCode: requiredString(args, "pairingCode"),
        label: optionalString(args, "label"),
      });
    },
  );

  registerTool(
    {
      id: "iot.homekit.startBridge",
      title: "Start HomeKit bridge",
      description: "Advertise Clawix on the local network as a HomeKit bridge so Apple Home can pair with it. Returns the setup code the user types into Apple Home.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          label: { type: "string", description: "Optional friendly label for the bridge entry in Apple Home." },
        },
        additionalProperties: false,
      },
      riskLevel: "reversible",
    },
    async (args, { registry }) => {
      const adapter = registry.get("homekit") as HomeKitAdapter | undefined;
      if (!adapter) throw new Error("HomeKit adapter not registered.");
      return await adapter.startBridge({ label: optionalString(args, "label") });
    },
  );

  registerTool(
    {
      id: "iot.homekit.exportThing",
      title: "Export a thing to HomeKit",
      description: "Publish one of the user's IoT things as a HomeKit accessory inside the bridge.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          thingId: { type: "string" },
          label: { type: "string", description: "Label as it appears in Apple Home." },
          kind: { type: "string", description: "DeviceKind hint so the adapter picks the right HAP Service." },
        },
        required: ["thingId", "label", "kind"],
        additionalProperties: false,
      },
      riskLevel: "reversible",
    },
    async (args, { registry }) => {
      const adapter = registry.get("homekit") as HomeKitAdapter | undefined;
      if (!adapter) throw new Error("HomeKit adapter not registered.");
      return await adapter.exportThing({
        thingId: requiredString(args, "thingId"),
        label: requiredString(args, "label"),
        kind: requiredString(args, "kind"),
      });
    },
  );

  registerTool(
    {
      id: "iot.mqtt.connect",
      title: "Connect to MQTT broker",
      description: "Open a connection to an MQTT broker so subsequent thing dispatches can publish on its topics. Auto-detects Zigbee2MQTT devices when the broker streams `zigbee2mqtt/bridge/devices`.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Broker URL, e.g. mqtt://192.168.1.50:1883." },
          username: { type: "string" },
          password: { type: "string" },
        },
        required: ["url"],
        additionalProperties: false,
      },
      riskLevel: "reversible",
    },
    async (args, { registry }) => {
      const adapter = registry.get("mqtt") as MqttAdapter | undefined;
      if (!adapter) throw new Error("MQTT adapter not registered.");
      const broker: MqttBrokerConfig = {
        url: requiredString(args, "url"),
        ...(optionalString(args, "username") ? { username: optionalString(args, "username")! } : {}),
        ...(optionalString(args, "password") ? { password: optionalString(args, "password")! } : {}),
      };
      return await adapter.connect(broker);
    },
  );

  registerTool(
    {
      id: "iot.mqtt.disconnect",
      title: "Disconnect MQTT broker",
      description: "Tear down the MQTT broker connection. Idempotent.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: { type: "object", properties: {}, additionalProperties: false },
      riskLevel: "safe",
    },
    async (_args, { registry }) => {
      const adapter = registry.get("mqtt") as MqttAdapter | undefined;
      if (!adapter) throw new Error("MQTT adapter not registered.");
      await adapter.disconnect();
      return { disconnected: true };
    },
  );

  // -------------------------------------------------------------------------
  // Phase 5 · Cloud adapters (Tuya / Google Home / Alexa)
  // -------------------------------------------------------------------------

  registerTool(
    {
      id: "iot.tuya.connect",
      title: "Connect to Tuya Cloud",
      description: "Authenticate against the Tuya IoT Cloud OpenAPI using the user's client id + client secret. Required before any Tuya device dispatch or sync.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          appKey: { type: "string", description: "Client id from the Tuya IoT Platform console." },
          appSecret: { type: "string", description: "Client secret from the Tuya IoT Platform console." },
          baseUrl: { type: "string", description: "Optional regional base URL, e.g. https://openapi.tuyaus.com." },
        },
        required: ["appKey", "appSecret"],
        additionalProperties: false,
      },
      riskLevel: "reversible",
    },
    async (args, { registry }) => {
      const adapter = registry.get("tuya") as TuyaAdapter | undefined;
      if (!adapter) throw new Error("Tuya adapter not registered.");
      const credentials: TuyaCredentials = {
        appKey: requiredString(args, "appKey"),
        appSecret: requiredString(args, "appSecret"),
        ...(optionalString(args, "baseUrl") ? { baseUrl: optionalString(args, "baseUrl")! } : {}),
      };
      return await adapter.connect(credentials);
    },
  );

  registerTool(
    {
      id: "iot.tuya.sync",
      title: "Sync Tuya devices",
      description: "Pull the user's Tuya cloud device list and surface each entry as a discovery candidate the wizard can promote.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: { type: "object", properties: {}, additionalProperties: false },
      riskLevel: "safe",
    },
    async (_args, { registry }) => {
      const adapter = registry.get("tuya") as TuyaAdapter | undefined;
      if (!adapter) throw new Error("Tuya adapter not registered.");
      return await adapter.syncDevices();
    },
  );

  registerTool(
    {
      id: "iot.tuya.disconnect",
      title: "Disconnect Tuya Cloud",
      description: "Drop the Tuya session. Idempotent.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: { type: "object", properties: {}, additionalProperties: false },
      riskLevel: "safe",
    },
    async (_args, { registry }) => {
      const adapter = registry.get("tuya") as TuyaAdapter | undefined;
      if (!adapter) throw new Error("Tuya adapter not registered.");
      adapter.disconnect();
      return { disconnected: true };
    },
  );

  registerTool(
    {
      id: "iot.googleHome.connect",
      title: "Connect Google Home",
      description: "Wire the Google Smart Home Actions OAuth credentials. Subsequent fulfillment POSTs from Google to /v1/cloud/google/fulfillment authenticate against this secret.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          publicFulfillmentUrl: { type: "string" },
          oauthClientId: { type: "string" },
          oauthClientSecret: { type: "string" },
          homeGraphToken: { type: "string", description: "Service-account OAuth token for ReportState pushes." },
          agentUserId: { type: "string", description: "Stable user id Google associates the linked account with." },
        },
        required: ["publicFulfillmentUrl", "oauthClientId", "oauthClientSecret", "agentUserId"],
        additionalProperties: false,
      },
      riskLevel: "sensitive",
    },
    async (args, { registry }) => {
      const adapter = registry.get("google-home") as GoogleHomeAdapter | undefined;
      if (!adapter) throw new Error("Google Home adapter not registered.");
      const credentials: GoogleHomeCredentials = {
        publicFulfillmentUrl: requiredString(args, "publicFulfillmentUrl"),
        oauthClientId: requiredString(args, "oauthClientId"),
        oauthClientSecret: requiredString(args, "oauthClientSecret"),
        agentUserId: requiredString(args, "agentUserId"),
        ...(optionalString(args, "homeGraphToken") ? { homeGraphToken: optionalString(args, "homeGraphToken")! } : {}),
      };
      return await adapter.connect(credentials);
    },
  );

  registerTool(
    {
      id: "iot.googleHome.reportState",
      title: "Push state to Google HomeGraph",
      description: "Sends a ReportState update so the Google Home app and the user's voice device reflect the local state change.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          deviceId: { type: "string" },
          state: { type: "object" },
        },
        required: ["deviceId", "state"],
        additionalProperties: false,
      },
      riskLevel: "reversible",
    },
    async (args, { registry }) => {
      const adapter = registry.get("google-home") as GoogleHomeAdapter | undefined;
      if (!adapter) throw new Error("Google Home adapter not registered.");
      return await adapter.reportState({
        deviceId: requiredString(args, "deviceId"),
        state: (args["state"] as Record<string, unknown>) ?? {},
      });
    },
  );

  registerTool(
    {
      id: "iot.googleHome.disconnect",
      title: "Disconnect Google Home",
      description: "Drop the Google Home session. New fulfillment POSTs from Google will be rejected with 401 until iot.googleHome.connect runs again.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: { type: "object", properties: {}, additionalProperties: false },
      riskLevel: "safe",
    },
    async (_args, { registry }) => {
      const adapter = registry.get("google-home") as GoogleHomeAdapter | undefined;
      if (!adapter) throw new Error("Google Home adapter not registered.");
      adapter.disconnect();
      return { disconnected: true };
    },
  );

  registerTool(
    {
      id: "iot.alexa.connect",
      title: "Connect Alexa Smart Home",
      description: "Wire the Alexa Smart Home Skill OAuth credentials. Subsequent directives Amazon POSTs to /v1/cloud/alexa/fulfillment authenticate against this secret.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          publicFulfillmentUrl: { type: "string" },
          oauthClientSecret: { type: "string" },
          eventGatewayToken: { type: "string", description: "Skill Messaging API token for ChangeReport." },
          eventGatewayUrl: { type: "string", description: "Region-specific event gateway URL." },
        },
        required: ["publicFulfillmentUrl", "oauthClientSecret"],
        additionalProperties: false,
      },
      riskLevel: "sensitive",
    },
    async (args, { registry }) => {
      const adapter = registry.get("alexa") as AlexaAdapter | undefined;
      if (!adapter) throw new Error("Alexa adapter not registered.");
      const credentials: AlexaCredentials = {
        publicFulfillmentUrl: requiredString(args, "publicFulfillmentUrl"),
        oauthClientSecret: requiredString(args, "oauthClientSecret"),
        ...(optionalString(args, "eventGatewayToken") ? { eventGatewayToken: optionalString(args, "eventGatewayToken")! } : {}),
        ...(optionalString(args, "eventGatewayUrl") ? { eventGatewayUrl: optionalString(args, "eventGatewayUrl")! } : {}),
      };
      return await adapter.connect(credentials);
    },
  );

  registerTool(
    {
      id: "iot.alexa.reportState",
      title: "Push ChangeReport to Alexa",
      description: "Sends an Alexa ChangeReport so the Alexa app + voice device reflect the local state change.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          endpointId: { type: "string" },
          properties: { type: "array" },
        },
        required: ["endpointId", "properties"],
        additionalProperties: false,
      },
      riskLevel: "reversible",
    },
    async (args, { registry }) => {
      const adapter = registry.get("alexa") as AlexaAdapter | undefined;
      if (!adapter) throw new Error("Alexa adapter not registered.");
      return await adapter.reportState({
        endpointId: requiredString(args, "endpointId"),
        properties: (args["properties"] as Array<Record<string, unknown>>) ?? [],
      });
    },
  );

  registerTool(
    {
      id: "iot.alexa.disconnect",
      title: "Disconnect Alexa Smart Home",
      description: "Drop the Alexa session.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: { type: "object", properties: {}, additionalProperties: false },
      riskLevel: "safe",
    },
    async (_args, { registry }) => {
      const adapter = registry.get("alexa") as AlexaAdapter | undefined;
      if (!adapter) throw new Error("Alexa adapter not registered.");
      adapter.disconnect();
      return { disconnected: true };
    },
  );

  registerTool(
    {
      id: "iot.policy.evaluate",
      title: "Evaluate policy",
      description: "Dry-run policy evaluation for a proposed action. Returns the decision (allow / approval_required / deny / ambiguous) without executing.",
      domain: IOT_FEATURE,
      sourceFeature: IOT_FEATURE,
      parameters: {
        type: "object",
        properties: {
          homeId: { type: "string" },
          request: { type: "object", description: "An IoTActionRequest to dry-run." },
        },
        required: ["request"],
        additionalProperties: false,
      },
      riskLevel: "safe",
    },
    async (args, { store }) => ({
      evaluation: store.evaluatePolicy(
        optionalString(args, "homeId"),
        args["request"] as IoTActionRequest,
      ),
    }),
  );
}
