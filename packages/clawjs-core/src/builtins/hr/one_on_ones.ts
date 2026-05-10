import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ONE_ON_ONES: BuiltinCollectionDefinition = {
  name: "one_on_ones",
  displayName: "1-on-1s",
  family: "hr",
  aliases: ["1on1","one_on_one","one_on_ones"],
  fields: [
    { name: "managerEmployeeId", type: "relation", required: true, relation: { collectionName: "employees" } },
    { name: "reportEmployeeId", type: "relation", required: true, relation: { collectionName: "employees" } },
    { name: "scheduledAt", type: "date" },
    { name: "completedAt", type: "date" },
    { name: "notes", type: "text" },
    { name: "actionItems", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "one_on_ones_manager_idx", fields: ["managerEmployeeId"] },
    { name: "one_on_ones_report_idx", fields: ["reportEmployeeId"] },
  ],
};
