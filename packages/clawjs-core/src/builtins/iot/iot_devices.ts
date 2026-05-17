import type { BuiltinCollectionDefinition } from "../_types.ts";

export const IOT_DEVICES: BuiltinCollectionDefinition = {
  name: "iot_devices",
  displayName: "IoT Devices",
  family: "iot",
  aliases: ["iot-device", "iot-devices", "iot_device", "iot_devices", "device", "devices"],
  catalog: {
    purpose: "IoT device center for protocol identity, connector mapping, firmware, capabilities, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Every device should link to a thingId; configId may point to legacy iot_config connector configuration when present.",
    notes: "Devices represent controllable or observable endpoints, while iot_config remains connector setup and secrets.",
  },
  fields: [
    { name: "name", type: "text", required: true, requiredReason: "identity", aliases: ["label", "title"] },
    { name: "thingId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "iot_things" } },
    { name: "configId", type: "text" },
    { name: "protocol", type: "select", options: ["matter", "mqtt", "zigbee", "zwave", "homekit", "http", "modbus", "bacnet", "custom", "unknown"] },
    { name: "deviceType", type: "select", options: ["sensor", "switch", "light", "thermostat", "lock", "camera", "gateway", "meter", "unknown"] },
    { name: "status", type: "select", options: ["online", "offline", "unknown", "disabled", "retired"] },
    { name: "firmwareVersion", type: "text" },
    { name: "capabilities", type: "json" },
    { name: "lastSeenAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "iot_devices_name_idx", fields: ["name"] },
    { name: "iot_devices_thing_idx", fields: ["thingId"] },
    { name: "iot_devices_config_idx", fields: ["configId"] },
    { name: "iot_devices_status_idx", fields: ["status"] },
  ],
};
