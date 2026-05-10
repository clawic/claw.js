import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SURVEYS: BuiltinCollectionDefinition = {
  name: "surveys",
  displayName: "Surveys",
  family: "analytics",
  aliases: ["survey","surveys"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "questions", type: "json" },
    { name: "targeting", type: "json" },
    { name: "status", type: "select", options: ["draft","active","paused","completed"] },
    { name: "responsesCount", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "surveys_company_idx", fields: ["companyId"] },
  ],
};
