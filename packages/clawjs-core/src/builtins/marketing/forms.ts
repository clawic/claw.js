import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FORMS: BuiltinCollectionDefinition = {
  name: "forms",
  displayName: "Forms",
  family: "marketing",
  aliases: ["form","forms"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "slug", type: "text", required: true },
    { name: "fields", type: "json" },
    { name: "successAction", type: "select", options: ["redirect","message","email","create_issue","create_lead"] },
    { name: "successActionConfig", type: "json" },
    { name: "submissionCount", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "forms_company_slug_unique", fields: ["companyId","slug"], unique: true },
  ],
};
