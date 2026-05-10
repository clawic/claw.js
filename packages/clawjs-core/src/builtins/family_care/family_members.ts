import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FAMILY_MEMBERS: BuiltinCollectionDefinition = {
  name: "family_members",
  displayName: "Family Members",
  family: "family_care",
  aliases: ["family_member","family_members"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "relation", type: "text" },
    { name: "birthDate", type: "date" },
    { name: "phone", type: "text" },
    { name: "email", type: "email" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "family_members_relation_idx", fields: ["relation"] },
  ],
};
