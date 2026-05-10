import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BABY_FEEDING_LOGS: BuiltinCollectionDefinition = {
  name: "baby_feeding_logs",
  displayName: "Baby Feeding Logs",
  family: "pregnancy_early_childhood",
  aliases: ["baby_feeding_log","baby_feeding_logs"],
  fields: [
    { name: "childId", type: "relation", required: true, relation: { collectionName: "children_profiles" } },
    { name: "fedAt", type: "date", required: true },
    { name: "method", type: "select", options: ["breast_left","breast_right","bottle","solid","formula","mixed"] },
    { name: "amountMlOrG", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "baby_feeding_logs_child_idx", fields: ["childId"] },
  ],
};
