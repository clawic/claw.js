import type { BuiltinCollectionDefinition } from "../_types.ts";

export const IOT_THINGS: BuiltinCollectionDefinition = {
  name: "iot_things",
  displayName: "IoT Things",
  family: "iot",
  aliases: ["thing", "things", "iot-thing", "iot-things", "iot_thing", "iot_things"],
  catalog: {
    purpose: "IoT thing center for real-world devices/assets, locations, ownership, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use companyId, location, and linked devices/readings/commands for operational state; use existing asset/vehicle/property records when the thing is also a managed asset.",
    notes: "This is the dense IoT inventory center; connector configuration remains in iot_config and physical device behavior remains external-pending.",
  },
  fields: [
    { name: "name", type: "text", required: true, requiredReason: "identity", aliases: ["label", "title"] },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "assetId", type: "relation", relation: { collectionName: "assets" } },
    { name: "kind", type: "select", options: ["sensor", "actuator", "gateway", "controller", "appliance", "vehicle", "environment", "unknown"] },
    { name: "status", type: "select", options: ["active", "inactive", "maintenance", "offline", "retired", "unknown"] },
    { name: "location", type: "address" },
    { name: "externalId", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "iot_things_name_idx", fields: ["name"] },
    { name: "iot_things_company_idx", fields: ["companyId"] },
    { name: "iot_things_asset_idx", fields: ["assetId"] },
    { name: "iot_things_status_idx", fields: ["status"] },
    { name: "iot_things_external_idx", fields: ["externalId"] },
  ],
};
