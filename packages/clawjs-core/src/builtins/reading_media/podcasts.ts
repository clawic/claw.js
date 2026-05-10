import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PODCASTS: BuiltinCollectionDefinition = {
  name: "podcasts",
  displayName: "Podcasts",
  family: "reading_media",
  aliases: ["podcast","podcasts"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "host", type: "text" },
    { name: "feedUrl", type: "url" },
    { name: "description", type: "text" },
    { name: "image", type: "file" },
    { name: "subscribed", type: "boolean" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "podcasts_name_idx", fields: ["name"] },
  ],
};
