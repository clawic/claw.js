import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EMAIL_MESSAGES: BuiltinCollectionDefinition = {
  name: "email_messages",
  displayName: "Email Messages",
  family: "crm",
  aliases: ["email_message","email_messages","email","emails"],
  fields: [
    { name: "threadId", type: "relation", required: true, relation: { collectionName: "email_threads" } },
    { name: "fromEmail", type: "email" },
    { name: "toEmails", type: "json" },
    { name: "ccEmails", type: "json" },
    { name: "bccEmails", type: "json" },
    { name: "subject", type: "text" },
    { name: "body", type: "text" },
    { name: "bodyHtml", type: "text" },
    { name: "direction", type: "select", options: ["inbound","outbound"] },
    { name: "messageId", type: "text" },
    { name: "inReplyTo", type: "text" },
    { name: "attachments", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "email_msg_thread_idx", fields: ["threadId"] },
    { name: "email_msg_message_id_idx", fields: ["messageId"] },
  ],
};
