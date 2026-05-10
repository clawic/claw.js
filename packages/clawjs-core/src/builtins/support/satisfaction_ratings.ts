import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SATISFACTION_RATINGS: BuiltinCollectionDefinition = {
  name: "satisfaction_ratings",
  displayName: "Satisfaction Ratings",
  family: "support",
  aliases: ["csat","nps","satisfaction_rating","satisfaction_ratings"],
  fields: [
    { name: "conversationId", type: "relation", relation: { collectionName: "support_conversations" } },
    { name: "ticketId", type: "relation", relation: { collectionName: "support_tickets" } },
    { name: "contactId", type: "relation", relation: { collectionName: "contacts" } },
    { name: "score", type: "number", required: true },
    { name: "comment", type: "text" },
    { name: "kind", type: "select", options: ["csat","nps","ces"] },
    { name: "surveySentAt", type: "date" },
    { name: "respondedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "csat_conversation_idx", fields: ["conversationId"] },
    { name: "csat_kind_idx", fields: ["kind"] },
  ],
};
