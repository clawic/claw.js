import type { BuiltinCollectionDefinition } from "../_types.ts";

export const GIFT_IDEAS: BuiltinCollectionDefinition = {
  name: "gift_ideas",
  displayName: "Gift Ideas",
  family: "relationships",
  aliases: ["gift_idea","gift_ideas"],
  fields: [
    { name: "personId", type: "relation", relation: { collectionName: "personal_contacts" } },
    { name: "title", type: "text", required: true },
    { name: "occasion", type: "text" },
    { name: "priceCents", type: "number" },
    { name: "link", type: "url" },
    { name: "status", type: "select", options: ["idea","selected","purchased","given","discarded"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "gift_ideas_status_idx", fields: ["status"] },
  ],
};
