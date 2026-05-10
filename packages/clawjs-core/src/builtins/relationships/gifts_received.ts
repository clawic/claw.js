import type { BuiltinCollectionDefinition } from "../_types.ts";

export const GIFTS_RECEIVED: BuiltinCollectionDefinition = {
  name: "gifts_received",
  displayName: "Gifts Received",
  family: "relationships",
  aliases: ["gift_received","gifts_received"],
  fields: [
    { name: "personId", type: "relation", relation: { collectionName: "personal_contacts" } },
    { name: "title", type: "text", required: true },
    { name: "occasion", type: "text" },
    { name: "receivedAt", type: "date" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "gifts_received_person_idx", fields: ["personId"] },
  ],
};
