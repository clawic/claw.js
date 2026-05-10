import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RACE_RESULTS: BuiltinCollectionDefinition = {
  name: "race_results",
  displayName: "Race Results",
  family: "fitness",
  aliases: ["race_result","race_results"],
  fields: [
    { name: "raceId", type: "relation", relation: { collectionName: "races_registered" } },
    { name: "timeSeconds", type: "duration", durationDisplayUnit: "second" },
    { name: "positionOverall", type: "number" },
    { name: "positionAgeGroup", type: "number" },
    { name: "paceMinPerKm", type: "text" },
    { name: "photoFinish", type: "url" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "race_results_race_idx", fields: ["raceId"] },
  ],
};
