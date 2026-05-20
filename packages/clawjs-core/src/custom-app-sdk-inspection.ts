import {
  buildCustomAppCapabilityRiskMap,
  listClawCapabilities,
  sdkFirstCapabilityCatalogSource,
  type ClawCapabilityDescriptor,
} from "./capability-catalog.ts";
import {
  getCustomAppSDKSchema,
  listCustomAppSDKSchemaRefs,
} from "./custom-app-sdk-contracts.ts";

function referencedSchemaRefs(capabilities: ClawCapabilityDescriptor[]): string[] {
  return [...new Set(capabilities.flatMap((capability) => [
    capability.inputSchemaRef,
    capability.outputSchemaRef,
    capability.eventSchemaRefs?.cancel,
    capability.eventSchemaRefs?.progress,
    capability.eventSchemaRefs?.partial,
  ].filter((ref): ref is string => Boolean(ref))))].sort();
}

export const CUSTOM_APP_SDK_EXECUTION_BOUNDARY = {
  kind: "metadata_only_contract_catalog",
  executesCapabilityCalls: false,
  richUiExecutionPath: "sdk_host_bridge",
  localExecutableSurface: "host_bridge",
  nonExecutableSurfaces: [
    "cli.inspect",
    "service_api.contracts",
    "mcp.custom_app_sdk",
    "relay.remote.custom_app_sdk",
  ],
  dbSearchExecution: "host_bridge_only",
} as const;

export function buildCustomAppSDKInspectionPayload() {
  const capabilities = listClawCapabilities();
  const schemaRefs = listCustomAppSDKSchemaRefs();
  const refs = referencedSchemaRefs(capabilities);
  return {
    schemaVersion: 1,
    source: sdkFirstCapabilityCatalogSource(),
    executionBoundary: CUSTOM_APP_SDK_EXECUTION_BOUNDARY,
    riskMap: buildCustomAppCapabilityRiskMap(),
    schemaRefs,
    referencedSchemaRefs: refs,
    missingSchemaRefs: refs.filter((ref) => !getCustomAppSDKSchema(ref)),
    capabilities: capabilities.map((capability) => ({
      id: capability.id,
      domain: capability.domain,
      operation: capability.operation,
      customAppAccess: capability.customAppAccess,
      cancelable: capability.cancelable,
      streamable: capability.streamable,
      timeoutMs: capability.timeoutMs,
      dispatch: capability.dispatch,
      inputSchemaRef: capability.inputSchemaRef,
      outputSchemaRef: capability.outputSchemaRef,
      eventSchemaRefs: capability.eventSchemaRefs,
      redactionPolicyRef: capability.redactionPolicyRef,
      surfaces: capability.surfaces,
    })),
  };
}
