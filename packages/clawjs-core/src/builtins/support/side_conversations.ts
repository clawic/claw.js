import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SIDE_CONVERSATIONS: BuiltinCollectionDefinition = {
  name: "side_conversations",
  displayName: "Side Conversations",
  family: "support",
  aliases: ["side_conversation","side_conversations"],
  fields: [
    { name: "parentConversationId", type: "relation", required: true, relation: { collectionName: "support_conversations" } },
    { name: "subject", type: "text" },
    { name: "participants", type: "json" },
    { name: "messages", type: "json" },
    { name: "status", type: "select", options: ["open","closed"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "side_conv_parent_idx", fields: ["parentConversationId"] },
  ],
};
