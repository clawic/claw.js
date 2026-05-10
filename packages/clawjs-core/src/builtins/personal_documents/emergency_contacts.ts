import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EMERGENCY_CONTACTS: BuiltinCollectionDefinition = {
  name: "emergency_contacts",
  displayName: "Emergency Contacts",
  family: "personal_documents",
  aliases: ["emergency_contact","emergency_contacts"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "relationship", type: "text" },
    { name: "phone", type: "text" },
    { name: "email", type: "email" },
    { name: "address", type: "text" },
    { name: "priority", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "emergency_contacts_priority_idx", fields: ["priority"] },
  ],
};
