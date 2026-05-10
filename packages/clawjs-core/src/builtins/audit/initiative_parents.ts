import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INITIATIVE_PARENTS: BuiltinCollectionDefinition = {
  name: "initiative_parents",
  displayName: "Initiative Parents (multi)",
  family: "audit",
  aliases: ["initiative_parent","initiative_parents"],
  fields: [
    { name: "childInitiativeId", type: "relation", required: true, relation: { collectionName: "epics" } },
    { name: "parentInitiativeId", type: "relation", required: true, relation: { collectionName: "epics" } },
    { name: "sortOrder", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "init_parents_unique", fields: ["childInitiativeId","parentInitiativeId"], unique: true },
    { name: "init_parents_parent_idx", fields: ["parentInitiativeId"] },
  ],
};
