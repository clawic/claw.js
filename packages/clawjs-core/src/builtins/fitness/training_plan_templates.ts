import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TRAINING_PLAN_TEMPLATES: BuiltinCollectionDefinition = {
  name: "training_plan_templates",
  displayName: "Training Plan Templates",
  family: "fitness",
  aliases: ["training_plan_template","training_plan_templates"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "weeksCount", type: "number" },
    { name: "weeklyStructure", type: "json" },
    { name: "goal", type: "text" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "training_plan_templates_active_idx", fields: ["active"] },
  ],
};
