import type { BuiltinCollectionDefinition } from "../_types.ts";

export const IMPORTANT_DATES: BuiltinCollectionDefinition = {
  name: "important_dates",
  displayName: "Important Dates",
  family: "relationships",
  aliases: ["important_date","important_dates"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "dateOn", type: "date", required: true },
    { name: "kind", type: "select", options: ["anniversary","memorial","celebration","deadline","milestone","other"] },
    { name: "personId", type: "relation", relation: { collectionName: "personal_contacts" } },
    { name: "recurring", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "important_dates_date_idx", fields: ["dateOn"] },
  ],
};
