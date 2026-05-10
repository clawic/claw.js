import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SUPPORT_TICKETS: BuiltinCollectionDefinition = {
  name: "support_tickets",
  displayName: "Support Tickets",
  family: "support",
  aliases: ["ticket","tickets","support_ticket","support_tickets"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "number", type: "number" },
    { name: "conversationId", type: "relation", relation: { collectionName: "support_conversations" } },
    { name: "subject", type: "text" },
    { name: "description", type: "text" },
    { name: "status", type: "select", options: ["new","open","pending","on_hold","solved","closed"] },
    { name: "priority", type: "select", options: ["low","normal","high","urgent"] },
    { name: "requesterContactId", type: "relation", relation: { collectionName: "contacts" } },
    { name: "assigneeActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "mailboxId", type: "relation", relation: { collectionName: "mailboxes" } },
    { name: "slaPolicyId", type: "relation", relation: { collectionName: "sla_policies" } },
    { name: "linkedIssueId", type: "relation", relation: { collectionName: "issues" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "supp_tickets_company_idx", fields: ["companyId"] },
    { name: "supp_tickets_status_idx", fields: ["status"] },
    { name: "supp_tickets_number_unique", fields: ["companyId","number"], unique: true },
  ],
};
