import type { BuiltinCollectionDefinition } from "../_types.ts";

export const GROCERY_LISTS: BuiltinCollectionDefinition = {
  name: "grocery_lists",
  displayName: "Grocery Lists",
  family: "cooking",
  aliases: ["grocery_list","grocery_lists"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "forDate", type: "date" },
    { name: "status", type: "select", options: ["open","shopping","completed","archived"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "grocery_lists_status_idx", fields: ["status"] },
  ],
};
