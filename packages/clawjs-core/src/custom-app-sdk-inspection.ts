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

export function buildCustomAppSDKInspectionPayload() {
  const capabilities = listClawCapabilities();
  const schemaRefs = listCustomAppSDKSchemaRefs();
  const refs = referencedSchemaRefs(capabilities);
  return {
    schemaVersion: 1,
    source: sdkFirstCapabilityCatalogSource(),
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
