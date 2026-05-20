import trackingRegistry from "../../../tracking-registry.json" with { type: "json" };
import { clawCorePorts } from "@clawjs/core";
import { buildSignalsRegistryProjection, type RegistryProjection } from "@clawjs/signals-core";

export function getSignalsRegistryProjection(): RegistryProjection {
  return buildSignalsRegistryProjection({
    registry: trackingRegistry,
    servicePort: clawCorePorts.signals,
  });
}

export const signalsRegistryProjection: RegistryProjection = getSignalsRegistryProjection();
