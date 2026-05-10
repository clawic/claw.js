import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SKINCARE_LOGS: BuiltinCollectionDefinition = {
  name: "skincare_logs",
  displayName: "Skincare Logs",
  family: "personal_care_aesthetics",
  aliases: ["skincare_log","skincare_logs"],
  fields: [
    { name: "routineId", type: "relation", relation: { collectionName: "skincare_routines" } },
    { name: "performedAt", type: "date", required: true },
    { name: "skinConditionBefore", type: "text" },
    { name: "productsUsed", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "skincare_logs_performed_idx", fields: ["performedAt"] },
  ],
};
