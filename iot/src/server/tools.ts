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
// catalog under a single `/v1/tools/list` response.

import type { FastifyInstance, FastifyRequest } from "fastify";

import type { IotServiceStore } from "./db.ts";

/**
 * Severity grade attached to every agent tool. Drives the approval
 * gate at the client side. Kept in sync with `AgentToolRiskLevel` in
 * `@clawjs/core/agent_tools.ts` (canonical definition there).
 */
export type ToolRiskLevel =
  | "safe"
  | "reversible"
  | "sensitive"
  | "catastrophic";

export interface ToolParametersSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
}

export interface ToolDescriptor {
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

export interface ToolInvocationResult {
  ok: boolean;
  value?: unknown;
  error?: ToolInvocationError;
  invocationId?: string;
  durationMs?: number;
}

export interface ToolInvocationError {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
}

/** Runtime handler bound to a descriptor at registration time. */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolHandlerContext,
) => Promise<unknown>;

/** Dependencies handed to every tool handler. */
export interface ToolHandlerContext {
  store: IotServiceStore;
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
export function registerTool(descriptor: ToolDescriptor, handler: ToolHandler): ToolDescriptor {
  if (REGISTRY.has(descriptor.id)) {
    throw new Error(`Tool already registered: ${descriptor.id}`);
  }
  REGISTRY.set(descriptor.id, { descriptor, handler });
  return descriptor;
}

export function listTools(): ToolDescriptor[] {
  return Array.from(REGISTRY.values())
    .map((entry) => entry.descriptor)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function invokeTool(
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
  app.get("/v1/tools/list", async () => ({
    generatedAt: new Date().toISOString(),
    tools: listTools(),
  }));

  app.post("/v1/tools/:toolId/invoke", async (request: FastifyRequest) => {
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
}
