import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PERSONAL_RELATIONSHIPS: BuiltinCollectionDefinition = {
  name: "personal_relationships",
  displayName: "Relationships",
  family: "relationships",
  aliases: ["personal_relationship","personal_relationships"],
  fields: [
    { name: "personId", type: "relation", required: true, relation: { collectionName: "personal_contacts" } },
    { name: "kind", type: "select", options: ["family","friend","colleague","partner","neighbor","acquaintance","other"] },
    { name: "subtype", type: "text" },
    { name: "startedAt", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "personal_relationships_person_idx", fields: ["personId"] },
  ],
};
