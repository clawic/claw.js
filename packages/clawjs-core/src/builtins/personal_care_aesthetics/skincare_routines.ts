import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SKINCARE_ROUTINES: BuiltinCollectionDefinition = {
  name: "skincare_routines",
  displayName: "Skincare Routines",
  family: "personal_care_aesthetics",
  aliases: ["skincare_routine","skincare_routines"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "timeOfDay", type: "select", options: ["am","pm","weekly","monthly","ad_hoc"] },
    { name: "steps", type: "json" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "skincare_routines_active_idx", fields: ["active"] },
  ],
};
