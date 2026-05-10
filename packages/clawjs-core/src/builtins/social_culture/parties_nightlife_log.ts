import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PARTIES_NIGHTLIFE_LOG: BuiltinCollectionDefinition = {
  name: "parties_nightlife_log",
  displayName: "Parties & Nightlife Log",
  family: "social_culture",
  aliases: ["nightlife_entry","parties_nightlife_log"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "venue", type: "text" },
    { name: "locationGeo", type: "geo_point" },
    { name: "attendedAt", type: "date", required: true },
    { name: "kind", type: "select", options: ["party","club","bar","house_party","festival","rave","wedding","other"] },
    { name: "drinksCost", type: "money" },
    { name: "partners", type: "json" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "parties_nightlife_log_attended_idx", fields: ["attendedAt"] },
  ],
};
