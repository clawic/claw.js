import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SLO_CALCULATIONS: BuiltinCollectionDefinition = {
  name: "slo_calculations",
  displayName: "SLO Calculations",
  family: "observability",
  aliases: ["slo_calculation","slo_calculations"],
  fields: [
    { name: "sloId", type: "relation", required: true, relation: { collectionName: "slos" } },
    { name: "periodStart", type: "date" },
    { name: "periodEnd", type: "date" },
    { name: "goodEvents", type: "number" },
    { name: "totalEvents", type: "number" },
    { name: "actualPercent", type: "number" },
    { name: "errorBudgetRemaining", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "slo_calc_slo_idx", fields: ["sloId","periodStart"] },
  ],
};
