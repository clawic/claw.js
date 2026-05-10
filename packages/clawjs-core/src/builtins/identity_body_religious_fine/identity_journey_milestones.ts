import type { BuiltinCollectionDefinition } from "../_types.ts";

export const IDENTITY_JOURNEY_MILESTONES: BuiltinCollectionDefinition = {
  name: "identity_journey_milestones",
  displayName: "Identity Journey Milestones",
  family: "identity_body_religious_fine",
  aliases: ["identity_milestone","identity_journey_milestones"],
  fields: [
    { name: "kind", type: "select", options: ["gender","orientation","cultural","spiritual","ethnic","other"] },
    { name: "title", type: "text", required: true },
    { name: "milestoneAt", type: "date", required: true },
    { name: "description", type: "text" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "identity_journey_milestones_kind_idx", fields: ["kind"] },
  ],
};
