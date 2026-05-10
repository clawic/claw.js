import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ROMANTIC_GIFTS: BuiltinCollectionDefinition = {
  name: "romantic_gifts",
  displayName: "Romantic Gifts",
  family: "romance",
  aliases: ["romantic_gift","romantic_gifts"],
  fields: [
    { name: "partnerId", type: "relation", relation: { collectionName: "romantic_partners" } },
    { name: "title", type: "text", required: true },
    { name: "givenAt", type: "date" },
    { name: "direction", type: "select", options: ["given","received"] },
    { name: "priceCents", type: "number" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "romantic_gifts_partner_idx", fields: ["partnerId"] },
  ],
};
