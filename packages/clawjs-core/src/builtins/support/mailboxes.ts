import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MAILBOXES: BuiltinCollectionDefinition = {
  name: "mailboxes",
  displayName: "Mailboxes",
  family: "support",
  aliases: ["mailbox","mailboxes"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "teamId", type: "relation", relation: { collectionName: "teams" } },
    { name: "address", type: "text" },
    { name: "type", type: "select", required: true, options: ["email","sms","chat","whatsapp","instagram","facebook","twitter","telegram","slack","discord","other"] },
    { name: "displayName", type: "text" },
    { name: "signature", type: "text" },
    { name: "enabled", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "mailboxes_company_idx", fields: ["companyId"] },
    { name: "mailboxes_type_idx", fields: ["type"] },
  ],
};
