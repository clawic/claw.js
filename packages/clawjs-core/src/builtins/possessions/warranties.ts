import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WARRANTIES: BuiltinCollectionDefinition = {
  name: "warranties",
  displayName: "Warranties",
  family: "possessions",
  aliases: ["warranty","warranties"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "itemName", type: "text" },
    { name: "provider", type: "text" },
    { name: "startedAt", type: "date" },
    { name: "expiresAt", type: "date" },
    { name: "document", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "warranties_expires_idx", fields: ["expiresAt"] },
  ],
};
