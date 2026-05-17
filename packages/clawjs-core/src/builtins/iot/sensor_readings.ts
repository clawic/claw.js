import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SENSOR_READINGS: BuiltinCollectionDefinition = {
  name: "sensor_readings",
  displayName: "Sensor Readings",
  family: "iot",
  aliases: ["sensor-reading", "sensor-readings", "sensor_reading", "sensor_readings", "reading", "readings"],
  catalog: {
    purpose: "Sensor reading center for measured values, units, timestamps, device/thing links, evidence, and data-quality gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Link deviceId and thingId when known; unitId can link to the universal units catalog when a standardized unit exists.",
    notes: "Readings are observed facts, not command state and not connector configuration.",
  },
  fields: [
    { name: "metric", type: "text", required: true, requiredReason: "identity", aliases: ["name", "measurement"] },
    { name: "thingId", type: "relation", relation: { collectionName: "iot_things" } },
    { name: "deviceId", type: "relation", relation: { collectionName: "iot_devices" } },
    { name: "unitId", type: "relation", relation: { collectionName: "units" } },
    { name: "value", type: "number" },
    { name: "valueText", type: "text" },
    { name: "quality", type: "select", options: ["good", "uncertain", "bad", "estimated", "unknown"] },
    { name: "observedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "sensor_readings_thing_idx", fields: ["thingId"] },
    { name: "sensor_readings_device_idx", fields: ["deviceId"] },
    { name: "sensor_readings_metric_idx", fields: ["metric"] },
    { name: "sensor_readings_observed_idx", fields: ["observedAt"] },
  ],
};
