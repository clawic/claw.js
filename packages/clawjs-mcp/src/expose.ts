import { MAC_PERMISSION_CATALOG, MAC_PERMISSION_PACKS, buildMacActionPlan, clawMacControlPlaneRegistry, listMacAtlasCapabilities, macActionRequestSchema } from "@clawjs/core";
import { buildCustomAppSDKInspectionPayload } from "@clawjs/core/catalogs";

import type { MCPExposedTool } from "./types.ts";
import type { MacSignedHostBridge } from "./mac-signed-host-bridge.ts";
import {
  collectMcpSystemTelemetrySnapshot,
  mcpSystemTelemetryControlPlanPayload,
  mcpSystemTelemetryControlsPayload,
  mcpSystemTelemetryMetricsPayload,
  mcpSystemTelemetryProviderPlanPayload,
  mcpSystemTelemetryProvidersPayload,
  mcpSystemTelemetryWidgetsPayload,
  readMcpSystemTelemetryHistory,
} from "./system-telemetry.ts";

/**
 * Default ClawJS surface exposed as MCP tools. Real implementations would route to
 * sessions/, memory/, user-model/, kanban/, etc. APIs. Tests and consumers can pass
 * their own list of tools via buildMCPApp options.
 */
export interface DefaultExposedToolsOptions {
  macSignedHostBridge?: MacSignedHostBridge | null;
}

export function customAppSDKMCPContractPayload() {
  return {
    mcpRole: "inspection_validation_contract_resource",
    richUiRuntime: "sdk_host_bridge_not_mcp_process",
    ...buildCustomAppSDKInspectionPayload(),
  };
}

const publicCredentialLeaseRefInputSchema = {
  type: "string",
  description: "Public credential lease reference. Raw secret refs, file URLs, private local paths, key material, and key-like tokens are rejected.",
  not: {
    anyOf: [
      { pattern: "secret://" },
      { pattern: "file://" },
      { pattern: "[/\\\\][Uu]sers[/\\\\]" },
      { pattern: "-----BEGIN" },
      { pattern: "\\bsk-[A-Za-z0-9_-]+" },
      { pattern: "\\bAKIA[A-Z0-9]+" },
    ],
  },
};

/**
 * Computer Use tool surface. Ergonomic per-action tools (`computer_use.*`) that
 * target a Mac app by name and act on Accessibility elements by `element_index`,
 * routed to the signed host `mac.app.*` capabilities. The signed host performs
 * the action with AXUIElement + per-process events, so the system pointer never
 * moves and the target app stays backgrounded. Mutating actions come back as
 * `approval_required` from the host until the host UI approves them.
 */
export function computerUseExposedTools(macSignedHostBridge: MacSignedHostBridge | null): MCPExposedTool[] {
  const defaultActor = { kind: "agent", id: "clawjs-agent" } as const;
  const defaultHost = { hostId: "clawjs-host", bundleId: "clawjs.host" } as const;

  function buildRequest(capabilityId: string, args: Record<string, unknown>, actionArgs: Record<string, unknown>) {
    const actor = args.actor && typeof args.actor === "object" ? args.actor : defaultActor;
    const host = args.host && typeof args.host === "object" ? args.host : defaultHost;
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(actionArgs)) {
      if (value !== undefined && value !== null) cleaned[key] = value;
    }
    return macActionRequestSchema.parse({
      // clawContractVersionV1
      schemaVersion: 1,
      requestId: typeof args.requestId === "string"
        ? args.requestId
        : `macreq_cu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      capabilityId,
      actor,
      host,
      arguments: cleaned,
      dryRun: args.dryRun === true,
      reason: typeof args.reason === "string" ? args.reason : undefined,
    });
  }

  function tool(
    name: string,
    description: string,
    capabilityId: string,
    properties: Record<string, unknown>,
    required: string[],
    mapArgs: (args: Record<string, unknown>) => Record<string, unknown>,
  ): MCPExposedTool {
    return {
      name,
      description,
      inputSchema: { type: "object", properties, additionalProperties: true, ...(required.length ? { required } : {}) },
      handler: async (args) => {
        const request = buildRequest(capabilityId, args, mapArgs(args));
        if (macSignedHostBridge) return macSignedHostBridge.execute(request);
        return {
          status: "signed_host_required",
          request,
          reason: "Computer Use must run through the active signed host broker.",
        };
      },
    };
  }

  const appProp = { app: { type: "string", description: "Target app name (or bundle id, or \"frontmost\")." } };
  const indexProp = { element_index: { type: "integer", minimum: 0, description: "Element index from get_app_state." } };

  return [
    tool(
      "computer_use.list_apps",
      "List running apps so Computer Use can target one by name.",
      "mac.app.list",
      {},
      [],
      () => ({}),
    ),
    tool(
      "computer_use.get_app_state",
      "Read the indexed accessibility element tree of a running app.",
      "mac.app.state",
      { ...appProp, max_depth: { type: "integer", minimum: 1 }, max_elements: { type: "integer", minimum: 1 } },
      ["app"],
      (args) => ({ app: args.app, max_depth: args.max_depth, max_elements: args.max_elements }),
    ),
    tool(
      "computer_use.click",
      "Click a UI element by Computer Use element index.",
      "mac.app.click",
      { ...appProp, ...indexProp },
      ["app", "element_index"],
      (args) => ({ app: args.app, element_index: args.element_index }),
    ),
    tool(
      "computer_use.type_text",
      "Type text into the focused field of a running app.",
      "mac.app.type",
      { ...appProp, text: { type: "string" } },
      ["app", "text"],
      (args) => ({ app: args.app, text: args.text }),
    ),
    tool(
      "computer_use.press_key",
      "Send a key chord (e.g. cmd+n, shift+tab) to a running app.",
      "mac.app.key",
      { ...appProp, key: { type: "string" } },
      ["app", "key"],
      (args) => ({ app: args.app, key: args.key }),
    ),
    tool(
      "computer_use.scroll",
      "Scroll a running app by a pixel delta.",
      "mac.app.scroll",
      { ...appProp, delta_x: { type: "integer" }, delta_y: { type: "integer" } },
      ["app"],
      (args) => ({ app: args.app, delta_x: args.delta_x, delta_y: args.delta_y }),
    ),
    tool(
      "computer_use.set_value",
      "Set the value of a UI element by Computer Use element index.",
      "mac.app.set_value",
      { ...appProp, ...indexProp, value: { type: "string" } },
      ["app", "element_index", "value"],
      (args) => ({ app: args.app, element_index: args.element_index, value: args.value }),
    ),
    tool(
      "computer_use.perform_action",
      "Perform a named accessibility action (e.g. AXShowMenu) on an element.",
      "mac.app.action",
      { ...appProp, ...indexProp, ax_action: { type: "string" } },
      ["app", "element_index", "ax_action"],
      (args) => ({ app: args.app, element_index: args.element_index, ax_action: args.ax_action }),
    ),
  ];
}

export function defaultExposedTools(options: DefaultExposedToolsOptions = {}): MCPExposedTool[] {
  const macSignedHostBridge = options.macSignedHostBridge ?? null;
  return [
    ...computerUseExposedTools(macSignedHostBridge),
    {
      name: "clawjs_ping",
      description: "Health-check tool exposed by ClawJS MCP server.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => ({ ok: true, service: "clawjs-mcp", at: new Date().toISOString() }),
    },
    {
      name: "clawjs.custom_app_sdk",
      description: "Returns the custom app SDK contract catalog for SDK-first UI surfaces.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => customAppSDKMCPContractPayload(),
    },
    {
      name: "clawjs_echo",
      description: "Echoes back its arguments. Useful to test MCP plumbing end-to-end.",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
        additionalProperties: false,
      },
      handler: async (args) => ({ echo: args.message }),
    },
    {
      name: "mac.plan",
      description: "Builds a governed Mac action plan without native execution.",
      inputSchema: {
        type: "object",
        properties: {
          request: { type: "object", additionalProperties: true },
        },
        additionalProperties: true,
      },
      handler: async (args) => {
        const request = macActionRequestSchema.parse(args.request ?? args);
        return buildMacActionPlan({ request });
      },
    },
    {
      name: "mac.permissions",
      description: "Lists central Mac permissions or plans/routes a just-in-time signed-host permission request.",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", enum: ["list", "request"] },
          permissionId: { type: "string" },
          confirm: { type: "boolean" },
        },
        additionalProperties: false,
      },
      handler: async (args) => {
        const command = args.command === "request" ? "request" : "list";
        const permissionId = typeof args.permissionId === "string" ? args.permissionId : undefined;
        const confirm = args.confirm === true;
        if (macSignedHostBridge) return macSignedHostBridge.permissions({ command, permissionId, confirm });
        if (command === "request") {
          return {
            status: "signed_host_required",
            permissionId,
            nativePrompt: "just_in_time_only",
            surprisePrompt: false,
            reason: "Permission prompts must be routed to the active signed host broker.",
          };
        }
        return {
            packs: MAC_PERMISSION_PACKS,
            permissions: MAC_PERMISSION_CATALOG,
        };
      },
    },
    {
      name: "mac.audit",
      description: "Reports where Mac action audit is available.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => macSignedHostBridge
        ? macSignedHostBridge.audit()
        : ({ status: "host_required", reason: "Mac action audit lives in the signed host operational store." }),
    },
    {
      name: "mac.execute",
      description: "Fails closed unless routed through the active signed host Mac Action Broker.",
      inputSchema: {
        type: "object",
        properties: {
          request: { type: "object", additionalProperties: true },
        },
        additionalProperties: true,
      },
      handler: async (args) => {
        const request = macActionRequestSchema.parse(args.request ?? args);
        const plan = buildMacActionPlan({ request });
        if (macSignedHostBridge) return macSignedHostBridge.execute(request);
        return {
          status: "signed_host_required",
          plan,
          reason: "MCP cannot execute native Mac actions directly; it must hand this plan to the signed host broker.",
        };
      },
    },
    {
      name: "mac.revert",
      description: "Plans a Mac action revert boundary without executing native state changes.",
      inputSchema: {
        type: "object",
        properties: { receiptId: { type: "string" } },
        required: ["receiptId"],
        additionalProperties: false,
      },
      handler: async (args) => macSignedHostBridge
        ? macSignedHostBridge.revert(String(args.receiptId))
        : ({
            status: "plan_required",
            receiptId: args.receiptId,
            revertContract: "Revert always plans first and only executes after explicit confirmation in the signed host.",
          }),
    },
    {
      name: "mac.coverage",
      description: "Returns the Mac Control Plane atlas and coverage summary.",
      inputSchema: {
        type: "object",
        properties: { family: { type: "string" } },
        additionalProperties: false,
      },
      handler: async (args) => {
        const family = typeof args.family === "string" ? args.family : undefined;
        const capabilities = listMacAtlasCapabilities(family ? { family } : {});
        return {
          registryVersion: clawMacControlPlaneRegistry.version,
          family: family ?? null,
          capabilities,
          coverage: capabilities.reduce<Record<string, number>>((summary, capability) => {
            summary[capability.coverageState] = (summary[capability.coverageState] ?? 0) + 1;
            return summary;
          }, {}),
        };
      },
    },
    {
      name: "system.snapshot",
      description: "Returns a read-only system telemetry snapshot for safe agent context.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => collectMcpSystemTelemetrySnapshot(),
    },
    {
      name: "system.metrics",
      description: "Lists the portable system telemetry metric catalog.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => mcpSystemTelemetryMetricsPayload(),
    },
    {
      name: "system.widgets",
      description: "Lists the portable context widget catalog for menu bar and panel indicators.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => mcpSystemTelemetryWidgetsPayload(),
    },
    {
      name: "system.providers",
      description: "Lists mock, offline and live provider slots for system and context telemetry.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => mcpSystemTelemetryProvidersPayload(),
    },
    {
      name: "system.provider_plan",
      description: "Creates a fail-closed plan for connecting a live system context provider.",
      inputSchema: {
        type: "object",
        properties: {
          providerId: { type: "string" },
          credentialRef: publicCredentialLeaseRefInputSchema,
          reason: { type: "string" },
        },
        required: ["providerId"],
        additionalProperties: false,
      },
      handler: async (args) => mcpSystemTelemetryProviderPlanPayload({
        providerId: String(args.providerId ?? ""),
        credentialRef: typeof args.credentialRef === "string" ? args.credentialRef : undefined,
        reason: typeof args.reason === "string" ? args.reason : undefined,
      }),
    },
    {
      name: "system.controls",
      description: "Lists plan-first system control contracts without executing hardware mutations.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => mcpSystemTelemetryControlsPayload(),
    },
    {
      name: "system.control_plan",
      description: "Creates a fail-closed signed-host plan for a system control action.",
      inputSchema: {
        type: "object",
        properties: {
          controlId: { type: "string" },
          target: { type: "string" },
          value: { type: "string" },
          reason: { type: "string" },
        },
        required: ["controlId"],
        additionalProperties: false,
      },
      handler: async (args) => mcpSystemTelemetryControlPlanPayload({
        controlId: String(args.controlId ?? ""),
        target: typeof args.target === "string" ? args.target : undefined,
        value: typeof args.value === "string" ? args.value : undefined,
        reason: typeof args.reason === "string" ? args.reason : undefined,
      }),
    },
    {
      name: "system.history",
      description: "Reads retained system telemetry samples, rollups, and incidents from the local Monitor store.",
      inputSchema: {
        type: "object",
        properties: {
          metricKey: { type: "string" },
          range: { type: "string" },
          monitorDb: { type: "string" },
        },
        required: ["metricKey"],
        additionalProperties: false,
      },
      handler: async (args) => readMcpSystemTelemetryHistory({
        metricKey: String(args.metricKey ?? ""),
        range: typeof args.range === "string" ? args.range : undefined,
        monitorDb: typeof args.monitorDb === "string" ? args.monitorDb : undefined,
      }),
    },
  ];
}
