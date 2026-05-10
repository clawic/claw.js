import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTACTS: BuiltinCollectionDefinition = {
  name: "contacts",
  displayName: "Contacts",
  family: "crm",
  aliases: ["contact","contacts"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "email", type: "email" },
    { name: "phone", type: "text" },
    { name: "firstName", type: "text" },
    { name: "lastName", type: "text" },
    { name: "title", type: "text" },
    { name: "accountId", type: "relation", relation: { collectionName: "accounts" } },
    { name: "ownerActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "properties", type: "json" },
    { name: "lifecycleStage", type: "select", options: ["subscriber","lead","mql","sql","opportunity","customer","evangelist","other"] },
    { name: "lastActivityAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "contacts_company_idx", fields: ["companyId"] },
    { name: "contacts_email_idx", fields: ["email"] },
    { name: "contacts_account_idx", fields: ["accountId"] },
  ],
};
