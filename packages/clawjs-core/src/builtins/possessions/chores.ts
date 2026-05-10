import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CHORES: BuiltinCollectionDefinition = {
  name: "chores",
  displayName: "Chores",
  family: "possessions",
  aliases: ["chore","chores"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "room", type: "text" },
    { name: "cadence", type: "select", options: ["daily","weekly","biweekly","monthly","quarterly","yearly","ad_hoc"] },
    { name: "nextDueAt", type: "date" },
    { name: "assignedTo", type: "relation", relation: { collectionName: "household_members" } },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "chores_due_idx", fields: ["nextDueAt"] },
  ],
};
