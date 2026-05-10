import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PERSONAL_CONTACTS: BuiltinCollectionDefinition = {
  name: "personal_contacts",
  displayName: "Personal Contacts",
  family: "relationships",
  aliases: ["personal_contact","personal_contacts"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "relationship", type: "text" },
    { name: "email", type: "email" },
    { name: "phone", type: "text" },
    { name: "address", type: "text" },
    { name: "birthday", type: "date" },
    { name: "tags", type: "json" },
    { name: "image", type: "file" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "personal_contacts_name_idx", fields: ["name"] },
  ],
};
