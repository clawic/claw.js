import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DATES_LOG: BuiltinCollectionDefinition = {
  name: "dates_log",
  displayName: "Dates",
  family: "romance",
  aliases: ["date_log","dates_log"],
  fields: [
    { name: "matchId", type: "relation", relation: { collectionName: "dating_matches" } },
    { name: "partnerId", type: "relation", relation: { collectionName: "romantic_partners" } },
    { name: "dateOn", type: "date", required: true },
    { name: "location", type: "text" },
    { name: "kind", type: "select", options: ["coffee","dinner","drinks","activity","trip","other"] },
    { name: "rating", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "dates_log_date_idx", fields: ["dateOn"] },
  ],
};
