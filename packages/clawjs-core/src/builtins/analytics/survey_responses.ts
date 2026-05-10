import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SURVEY_RESPONSES: BuiltinCollectionDefinition = {
  name: "survey_responses",
  displayName: "Survey Responses",
  family: "analytics",
  aliases: ["survey_response","survey_responses"],
  fields: [
    { name: "surveyId", type: "relation", required: true, relation: { collectionName: "surveys" } },
    { name: "personId", type: "relation", relation: { collectionName: "analytics_persons" } },
    { name: "answers", type: "json" },
    { name: "submittedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "survey_resp_survey_idx", fields: ["surveyId"] },
  ],
};
