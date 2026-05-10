import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MEDICAL_COSTS_LOG: BuiltinCollectionDefinition = {
  name: "medical_costs_log",
  displayName: "Medical Costs Log",
  family: "health",
  aliases: ["medical_cost_log_entry","medical_costs_log"],
  fields: [
    { name: "incurredAt", type: "date", required: true },
    { name: "amount", type: "money" },
    { name: "kind", type: "select", options: ["consultation","prescription","procedure","lab","imaging","therapy","equipment","other"] },
    { name: "provider", type: "text" },
    { name: "reimbursed", type: "money" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "medical_costs_log_incurred_idx", fields: ["incurredAt"] },
  ],
};
