import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MEETINGS: BuiltinCollectionDefinition = {
  name: "meetings",
  displayName: "Meetings",
  family: "crm",
  aliases: ["meeting","meetings"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "activityId", type: "relation", relation: { collectionName: "activities" } },
    { name: "title", type: "text" },
    { name: "startTime", type: "date", required: true },
    { name: "endTime", type: "date" },
    { name: "attendees", type: "json" },
    { name: "location", type: "text" },
    { name: "videoUrl", type: "text" },
    { name: "recordingUrl", type: "text" },
    { name: "transcriptUrl", type: "text" },
    { name: "notes", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "meetings_company_idx", fields: ["companyId"] },
    { name: "meetings_start_idx", fields: ["startTime"] },
  ],
};
