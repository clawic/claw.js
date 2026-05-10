import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WISHLISTS: BuiltinCollectionDefinition = {
  name: "wishlists",
  displayName: "Wishlists",
  family: "hobbies",
  aliases: ["wishlist","wishlists"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "occasion", type: "text" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "wishlists_active_idx", fields: ["active"] },
  ],
};
