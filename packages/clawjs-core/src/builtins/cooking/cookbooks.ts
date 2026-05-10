import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COOKBOOKS: BuiltinCollectionDefinition = {
  name: "cookbooks",
  displayName: "Cookbooks",
  family: "cooking",
  aliases: ["cookbook","cookbooks"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "author", type: "text" },
    { name: "description", type: "text" },
    { name: "image", type: "file" },
    { name: "recipeIds", type: "json" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "cookbooks_title_idx", fields: ["title"] },
  ],
};
