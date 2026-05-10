import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LAUNDRY_LOGS: BuiltinCollectionDefinition = {
  name: "laundry_logs",
  displayName: "Laundry Logs",
  family: "wardrobe",
  aliases: ["laundry_log","laundry_logs","laundry"],
  fields: [
    { name: "loggedAt", type: "date", required: true },
    { name: "kind", type: "select", options: ["wash","dry","iron","dry_clean","repair"] },
    { name: "clothingIds", type: "json" },
    { name: "temperature", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "laundry_logs_logged_idx", fields: ["loggedAt"] },
  ],
};
