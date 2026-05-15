import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CERTIFICATIONS_PERSONAL: BuiltinCollectionDefinition = {
  name: "certifications_personal",
  displayName: "Certifications",
  family: "career",
  aliases: ["certification","certifications","certifications_personal"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "issuer", type: "text", aliases: ["credentialIssuer"] },
    { name: "issuedAt", type: "date" },
    { name: "expiresAt", type: "date" },
    { name: "credentialId", type: "text", aliases: ["certificateNumber"] },
    { name: "verificationUrl", type: "url" },
    { name: "document", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "certifications_personal_name_idx", fields: ["name"] },
  ],
};
