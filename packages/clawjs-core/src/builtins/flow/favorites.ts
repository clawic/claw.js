import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FAVORITES: BuiltinCollectionDefinition = {
  name: "favorites",
  displayName: "Favorites",
  family: "flow",
  aliases: ["favorite","favorites","fav","favs"],
  fields: [
    { name: "actorId", type: "relation", required: true, relation: { collectionName: "actors" } },
    { name: "type", type: "select", required: true, options: ["issue","task","project","initiative","saved_view","cycle","label","team","user","document","customer","deal","folder"] },
    { name: "targetId", type: "text" },
    { name: "parentFavoriteId", type: "relation", relation: { collectionName: "favorites" } },
    { name: "label", type: "text" },
    { name: "sortOrder", type: "number" },
    { name: "ownerType", type: "select", required: true, options: ["personal","team","workspace"] },
    { name: "ownerId", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "favorites_actor_idx", fields: ["actorId"] },
    { name: "favorites_target_idx", fields: ["type","targetId"] },
    { name: "favorites_parent_idx", fields: ["parentFavoriteId"] },
  ],
};
