import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadVehicleConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "vehicle",
    defaultPort: 4757,
    hasSessions: false,
    envPrefix: "VEHICLE",
    overrides,
  });
}
