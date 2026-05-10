import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RELIGIOUS_PRACTICES: BuiltinCollectionDefinition = {
  name: "religious_practices",
  displayName: "Religious Practices",
  family: "communities_spirituality",
  aliases: ["religious_practice","religious_practices"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "tradition", type: "text" },
    { name: "description", type: "text" },
    { name: "cadence", type: "select", options: ["daily","weekly","monthly","yearly","ad_hoc"] },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "religious_practices_tradition_idx", fields: ["tradition"] },
  ],
};
