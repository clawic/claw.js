import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ANNIVERSARY_DATES: BuiltinCollectionDefinition = {
  name: "anniversary_dates",
  displayName: "Anniversary Dates",
  family: "romance",
  aliases: ["anniversary_date","anniversary_dates","anniversary"],
  fields: [
    { name: "partnerId", type: "relation", relation: { collectionName: "romantic_partners" } },
    { name: "title", type: "text", required: true },
    { name: "dateOn", type: "date", required: true },
    { name: "recurring", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "anniversary_dates_date_idx", fields: ["dateOn"] },
  ],
};
