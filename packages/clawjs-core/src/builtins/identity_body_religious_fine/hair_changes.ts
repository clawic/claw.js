import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HAIR_CHANGES: BuiltinCollectionDefinition = {
  name: "hair_changes",
  displayName: "Hair Changes",
  family: "identity_body_religious_fine",
  aliases: ["hair_change","hair_changes"],
  fields: [
    { name: "changedAt", type: "date", required: true },
    { name: "style", type: "text" },
    { name: "color", type: "text" },
    { name: "lengthCm", type: "number" },
    { name: "stylist", type: "text" },
    { name: "price", type: "money" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "hair_changes_changed_idx", fields: ["changedAt"] },
  ],
};
