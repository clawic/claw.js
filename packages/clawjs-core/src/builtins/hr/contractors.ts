import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTRACTORS: BuiltinCollectionDefinition = {
  name: "contractors",
  displayName: "Contractors",
  family: "hr",
  aliases: ["contractor","contractors"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "actorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "firstName", type: "text" },
    { name: "lastName", type: "text" },
    { name: "email", type: "email" },
    { name: "contractStart", type: "date" },
    { name: "contractEnd", type: "date" },
    { name: "rateCents", type: "number" },
    { name: "rateCurrency", type: "text" },
    { name: "rateUnit", type: "select", options: ["hour","day","month","project","deliverable"] },
    { name: "country", type: "text" },
    { name: "taxForm", type: "select", options: ["W9","W8BEN","W8BENE","1099_NEC","EU_VAT","other"] },
    { name: "status", type: "select", options: ["active","ended","suspended"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "contractors_company_idx", fields: ["companyId"] },
    { name: "contractors_email_idx", fields: ["email"] },
  ],
};
