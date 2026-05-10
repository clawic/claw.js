import type { BuiltinCollectionDefinition } from "../_types.ts";

export const GIFTS_GIVEN: BuiltinCollectionDefinition = {
  name: "gifts_given",
  displayName: "Gifts Given",
  family: "relationships",
  aliases: ["gift_given","gifts_given"],
  fields: [
    { name: "personId", type: "relation", relation: { collectionName: "personal_contacts" } },
    { name: "title", type: "text", required: true },
    { name: "occasion", type: "text" },
    { name: "givenAt", type: "date" },
    { name: "priceCents", type: "number" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "gifts_given_person_idx", fields: ["personId"] },
  ],
};
