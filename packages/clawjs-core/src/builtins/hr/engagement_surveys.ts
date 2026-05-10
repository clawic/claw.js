import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ENGAGEMENT_SURVEYS: BuiltinCollectionDefinition = {
  name: "engagement_surveys",
  displayName: "Engagement Surveys",
  family: "hr",
  aliases: ["engagement_survey","engagement_surveys"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "questions", type: "json" },
    { name: "audienceFilter", type: "json" },
    { name: "startDate", type: "date" },
    { name: "endDate", type: "date" },
    { name: "anonymous", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "eng_surveys_company_idx", fields: ["companyId"] },
  ],
};
