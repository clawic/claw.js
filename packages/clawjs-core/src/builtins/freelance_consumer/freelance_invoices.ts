import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FREELANCE_INVOICES: BuiltinCollectionDefinition = {
  name: "freelance_invoices",
  displayName: "Freelance Invoices",
  family: "freelance_consumer",
  aliases: ["freelance_invoice","freelance_invoices"],
  fields: [
    { name: "clientId", type: "relation", required: true, relation: { collectionName: "freelance_clients" } },
    { name: "number", type: "text", required: true },
    { name: "issuedAt", type: "date", required: true },
    { name: "dueAt", type: "date" },
    { name: "amountCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "status", type: "select", options: ["draft","sent","paid","overdue","void"] },
    { name: "paidAt", type: "date" },
    { name: "file", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "freelance_invoices_client_idx", fields: ["clientId"] },
    { name: "freelance_invoices_status_idx", fields: ["status"] },
  ],
};
