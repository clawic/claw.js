import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MEAL_PLANS: BuiltinCollectionDefinition = {
  name: "meal_plans",
  displayName: "Meal Plans",
  family: "cooking",
  aliases: ["meal_plan","meal_plans"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "startDate", type: "date" },
    { name: "endDate", type: "date" },
    { name: "description", type: "text" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "meal_plans_start_idx", fields: ["startDate"] },
  ],
};
