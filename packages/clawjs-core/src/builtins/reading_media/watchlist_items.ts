import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WATCHLIST_ITEMS: BuiltinCollectionDefinition = {
  name: "watchlist_items",
  displayName: "Watchlist Items",
  family: "reading_media",
  aliases: ["watchlist_item","watchlist_items"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "kind", type: "select", options: ["movie","tv_show","documentary","anime","other"] },
    { name: "status", type: "select", options: ["to_watch","watching","watched","abandoned"] },
    { name: "rating", type: "number" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "watchlist_items_status_idx", fields: ["status"] },
  ],
};
