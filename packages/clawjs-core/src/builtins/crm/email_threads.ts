import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EMAIL_THREADS: BuiltinCollectionDefinition = {
  name: "email_threads",
  displayName: "Email Threads",
  family: "crm",
  aliases: ["email_thread","email_threads"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "subject", type: "text" },
    { name: "participants", type: "json" },
    { name: "contactId", type: "relation", relation: { collectionName: "contacts" } },
    { name: "dealId", type: "relation", relation: { collectionName: "deals" } },
    { name: "lastMessageAt", type: "date" },
    { name: "messageCount", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "email_threads_company_idx", fields: ["companyId"] },
    { name: "email_threads_contact_idx", fields: ["contactId"] },
  ],
};
