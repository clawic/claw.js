import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CREATIVE_DRAFTS: BuiltinCollectionDefinition = {
  name: "creative_drafts",
  displayName: "Creative Drafts",
  family: "creativity",
  aliases: ["creative_draft","creative_drafts"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "body", type: "text" },
    { name: "projectId", type: "relation", relation: { collectionName: "creative_projects" } },
    { name: "version", type: "number" },
    { name: "revisedAt", type: "date" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "creative_drafts_project_idx", fields: ["projectId"] },
  ],
};
