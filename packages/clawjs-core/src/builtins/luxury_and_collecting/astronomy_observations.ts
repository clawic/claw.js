import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ASTRONOMY_OBSERVATIONS: BuiltinCollectionDefinition = {
  name: "astronomy_observations",
  displayName: "Astronomy Observations",
  family: "luxury_and_collecting",
  aliases: ["astronomy_observation","astronomy_observations"],
  fields: [
    { name: "targetObject", type: "text", required: true },
    { name: "kind", type: "select", options: ["planet","moon","star","double_star","nebula","galaxy","cluster","comet","asteroid","meteor_shower","aurora","other"] },
    { name: "equipment", type: "text" },
    { name: "seeingConditions", type: "text" },
    { name: "locationGeo", type: "geo_point" },
    { name: "observedAt", type: "date", required: true },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "astronomy_observations_target_idx", fields: ["targetObject"] },
  ],
};
