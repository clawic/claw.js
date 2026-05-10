import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FRAGRANCES_OWNED: BuiltinCollectionDefinition = {
  name: "fragrances_owned",
  displayName: "Fragrances Owned",
  family: "personal_care_aesthetics",
  aliases: ["fragrance","fragrances_owned"],
  fields: [
    { name: "brand", type: "text", required: true },
    { name: "name", type: "text", required: true },
    { name: "kind", type: "select", options: ["edt","edp","parfum","cologne","eau_fraiche","attar","other"] },
    { name: "notesTop", type: "json" },
    { name: "notesMiddle", type: "json" },
    { name: "notesBase", type: "json" },
    { name: "openedAt", type: "date" },
    { name: "finishedAt", type: "date" },
    { name: "cost", type: "money" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "fragrances_owned_brand_idx", fields: ["brand"] },
  ],
};
