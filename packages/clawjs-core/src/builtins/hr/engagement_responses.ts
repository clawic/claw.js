import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ENGAGEMENT_RESPONSES: BuiltinCollectionDefinition = {
  name: "engagement_responses",
  displayName: "Engagement Responses",
  family: "hr",
  aliases: ["engagement_response","engagement_responses"],
  fields: [
    { name: "surveyId", type: "relation", required: true, relation: { collectionName: "engagement_surveys" } },
    { name: "respondentEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "answers", type: "json" },
    { name: "anonymous", type: "boolean" },
    { name: "enpsScore", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "eng_resp_survey_idx", fields: ["surveyId"] },
  ],
};
