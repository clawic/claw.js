import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTACTS_PROFESSIONAL: BuiltinCollectionDefinition = {
  name: "contacts_professional",
  displayName: "Professional Contacts",
  family: "career",
  aliases: ["contact_professional","contacts_professional"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "role", type: "text" },
    { name: "company", type: "text" },
    { name: "email", type: "email" },
    { name: "phone", type: "text" },
    { name: "linkedinUrl", type: "url" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "contacts_professional_name_idx", fields: ["name"] },
  ],
};
