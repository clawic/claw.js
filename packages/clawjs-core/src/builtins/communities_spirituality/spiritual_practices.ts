import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SPIRITUAL_PRACTICES: BuiltinCollectionDefinition = {
  name: "spiritual_practices",
  displayName: "Spiritual Practices",
  family: "communities_spirituality",
  aliases: ["spiritual_practice","spiritual_practices"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "tradition", type: "text" },
    { name: "cadence", type: "select", options: ["daily","weekly","monthly","yearly","ad_hoc"] },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "spiritual_practices_active_idx", fields: ["active"] },
  ],
};
