import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FORM_SUBMISSIONS: BuiltinCollectionDefinition = {
  name: "form_submissions",
  displayName: "Form Submissions",
  family: "marketing",
  aliases: ["form_submission","form_submissions"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "formId", type: "relation", required: true, relation: { collectionName: "forms" } },
    { name: "fieldsValues", type: "json" },
    { name: "submitterEmail", type: "email" },
    { name: "submitterName", type: "text" },
    { name: "ip", type: "text" },
    { name: "userAgent", type: "text" },
    { name: "convertedToLeadId", type: "relation", relation: { collectionName: "leads" } },
    { name: "convertedToContactId", type: "relation", relation: { collectionName: "contacts" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "form_subs_form_idx", fields: ["formId"] },
  ],
};
