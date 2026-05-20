import {
  MAC_PERMISSION_CATALOG,
  MAC_PERMISSION_PACKS,
  buildMacActionPlan,
  buildCustomAppSDKInspectionPayload,
  clawMacControlPlaneRegistry,
  listMacAtlasCapabilities,
  macActionRequestSchema,
} from "@clawjs/core";

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

export function defaultExposedTools(options: DefaultExposedToolsOptions = {}): MCPExposedTool[] {
  const macSignedHostBridge = options.macSignedHostBridge ?? null;
  return [
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
