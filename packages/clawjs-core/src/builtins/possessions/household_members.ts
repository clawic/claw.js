import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HOUSEHOLD_MEMBERS: BuiltinCollectionDefinition = {
  name: "household_members",
  displayName: "Household Members",
  family: "possessions",
  aliases: ["household_member","household_members"],
  fields: [
    { name: "householdId", type: "relation", relation: { collectionName: "households" } },
    { name: "name", type: "text", required: true },
    { name: "relation", type: "text" },
    { name: "email", type: "email" },
    { name: "phone", type: "text" },
    { name: "primaryContact", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "household_members_household_idx", fields: ["householdId"] },
  ],
};
