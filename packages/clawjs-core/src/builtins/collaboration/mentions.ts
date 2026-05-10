import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MENTIONS: BuiltinCollectionDefinition = {
  name: "mentions",
  displayName: "Mentions",
  family: "collaboration",
  aliases: ["mention","mentions"],
  fields: [
    { name: "entityKind", type: "select", required: true, options: ["comment","document_block","issue_description","task_description","project_description","initiative_description"] },
    { name: "entityId", type: "text", required: true },
    { name: "mentionedActorId", type: "relation", required: true, relation: { collectionName: "actors" } },
    { name: "notified", type: "boolean" },
    { name: "createdByActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "mentions_entity_idx", fields: ["entityKind","entityId"] },
    { name: "mentions_actor_idx", fields: ["mentionedActorId"] },
  ],
};
