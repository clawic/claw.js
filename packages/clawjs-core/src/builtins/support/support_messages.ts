import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SUPPORT_MESSAGES: BuiltinCollectionDefinition = {
  name: "support_messages",
  displayName: "Support Messages",
  family: "support",
  aliases: ["support_message","support_messages"],
  fields: [
    { name: "conversationId", type: "relation", required: true, relation: { collectionName: "support_conversations" } },
    { name: "actorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "externalUserId", type: "relation", relation: { collectionName: "external_users" } },
    { name: "body", type: "text" },
    { name: "bodyHtml", type: "text" },
    { name: "direction", type: "select", options: ["inbound","outbound","internal_note"] },
    { name: "channel", type: "select", options: ["email","chat","sms","social","phone_call","internal"] },
    { name: "attachments", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "supp_msg_conversation_idx", fields: ["conversationId"] },
  ],
};
