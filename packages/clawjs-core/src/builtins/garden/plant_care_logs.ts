import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PLANT_CARE_LOGS: BuiltinCollectionDefinition = {
  name: "plant_care_logs",
  displayName: "Plant Care Logs",
  family: "garden",
  aliases: ["plant_care_log","plant_care_logs"],
  fields: [
    { name: "plantId", type: "relation", required: true, relation: { collectionName: "plants" } },
    { name: "loggedAt", type: "date", required: true },
    { name: "action", type: "select", options: ["water","fertilize","prune","repot","treat_pest","harvest","other"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "plant_care_logs_plant_idx", fields: ["plantId"] },
  ],
};
