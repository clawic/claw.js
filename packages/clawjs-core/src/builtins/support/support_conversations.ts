import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SUPPORT_CONVERSATIONS: BuiltinCollectionDefinition = {
  name: "support_conversations",
  displayName: "Support Conversations",
  family: "support",
  aliases: ["conversation","conversations","support_conversation","support_conversations"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "contactId", type: "relation", relation: { collectionName: "contacts" } },
    { name: "externalUserId", type: "relation", relation: { collectionName: "external_users" } },
    { name: "mailboxId", type: "relation", relation: { collectionName: "mailboxes" } },
    { name: "subject", type: "text" },
    { name: "status", type: "select", required: true, options: ["open","snoozed","closed","spam"] },
    { name: "priority", type: "select", options: ["low","medium","high","urgent"] },
    { name: "assigneeActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "teamId", type: "relation", relation: { collectionName: "teams" } },
    { name: "tagIds", type: "json" },
    { name: "customFieldsValues", type: "json" },
    { name: "lastMessageAt", type: "date" },
    { name: "snoozedUntilAt", type: "date" },
    { name: "slaPolicyId", type: "relation", relation: { collectionName: "sla_policies" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "supp_conv_company_idx", fields: ["companyId"] },
    { name: "supp_conv_status_idx", fields: ["status"] },
    { name: "supp_conv_assignee_idx", fields: ["assigneeActorId"] },
    { name: "supp_conv_contact_idx", fields: ["contactId"] },
  ],
};
