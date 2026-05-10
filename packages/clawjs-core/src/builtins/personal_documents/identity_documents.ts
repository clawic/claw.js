import type { BuiltinCollectionDefinition } from "../_types.ts";

export const IDENTITY_DOCUMENTS: BuiltinCollectionDefinition = {
  name: "identity_documents",
  displayName: "Identity Documents",
  family: "personal_documents",
  aliases: ["identity_document","identity_documents"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "kind", type: "select", options: ["national_id","passport","visa","driver_license","residency_permit","ssn_card","other"] },
    { name: "number", type: "text" },
    { name: "country", type: "text" },
    { name: "issuedAt", type: "date" },
    { name: "expiresAt", type: "date" },
    { name: "file", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "identity_documents_expires_idx", fields: ["expiresAt"] },
    { name: "identity_documents_kind_idx", fields: ["kind"] },
  ],
};
