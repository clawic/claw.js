import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ROMANTIC_PARTNERS: BuiltinCollectionDefinition = {
  name: "romantic_partners",
  displayName: "Romantic Partners",
  family: "romance",
  aliases: ["romantic_partner","romantic_partners","partner"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "startedAt", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "status", type: "select", options: ["dating","exclusive","engaged","married","separated","ended"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "romantic_partners_status_idx", fields: ["status"] },
  ],
};
