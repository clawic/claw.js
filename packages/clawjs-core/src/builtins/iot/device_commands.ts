import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DEVICE_COMMANDS: BuiltinCollectionDefinition = {
  name: "device_commands",
  displayName: "Device Commands",
  family: "iot",
  aliases: ["device-command", "device-commands", "device_command", "device_commands", "iot-command", "iot-commands"],
  catalog: {
    purpose: "IoT command center for requested device actions, approval state, execution result, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Link deviceId and thingId; use approvalId when a command needs human or policy approval before execution.",
    notes: "Commands are intent and audit records in core.sqlite; physical dispatch to devices remains provider/physical-device external-pending.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "summary"] },
    { name: "thingId", type: "relation", relation: { collectionName: "iot_things" } },
    { name: "deviceId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "iot_devices" } },
    { name: "approvalId", type: "relation", relation: { collectionName: "approvals" } },
    { name: "commandType", type: "select", options: ["set_state", "toggle", "schedule", "calibrate", "restart", "lock", "unlock", "custom", "unknown"] },
    { name: "status", type: "select", options: ["draft", "pending_approval", "approved", "sent", "succeeded", "failed", "cancelled", "unknown"] },
    { name: "requestedAt", type: "date" },
    { name: "executedAt", type: "date" },
    { name: "payload", type: "json" },
    { name: "result", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "device_commands_thing_idx", fields: ["thingId"] },
    { name: "device_commands_device_idx", fields: ["deviceId"] },
    { name: "device_commands_status_idx", fields: ["status"] },
    { name: "device_commands_requested_idx", fields: ["requestedAt"] },
  ],
};
