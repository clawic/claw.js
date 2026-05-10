import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HEALTH_CONDITIONS: BuiltinCollectionDefinition = {
  name: "health_conditions",
  displayName: "Health Conditions",
  family: "health",
  aliases: ["health_condition","health_conditions"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "diagnosedAt", type: "date" },
    { name: "status", type: "select", options: ["active","resolved","chronic","monitoring"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "health_conditions_status_idx", fields: ["status"] },
  ],
};
