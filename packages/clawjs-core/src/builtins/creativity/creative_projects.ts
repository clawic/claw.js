import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CREATIVE_PROJECTS: BuiltinCollectionDefinition = {
  name: "creative_projects",
  displayName: "Creative Projects",
  family: "creativity",
  aliases: ["creative_project","creative_projects"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "medium", type: "select", options: ["writing","music","visual_art","photography","video","software","craft","design","performance","other"] },
    { name: "status", type: "select", options: ["idea","active","paused","completed","abandoned"] },
    { name: "startedAt", type: "date" },
    { name: "completedAt", type: "date" },
    { name: "tags", type: "json" },
    { name: "images", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "creative_projects_status_idx", fields: ["status"] },
    { name: "creative_projects_medium_idx", fields: ["medium"] },
  ],
};
