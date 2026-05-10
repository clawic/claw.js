import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SESSION_RECORDINGS: BuiltinCollectionDefinition = {
  name: "session_recordings",
  displayName: "Session Recordings",
  family: "analytics",
  aliases: ["recording","recordings","session_recording","session_recordings"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "personId", type: "relation", relation: { collectionName: "analytics_persons" } },
    { name: "sessionId", type: "text", required: true },
    { name: "duration", type: "number" },
    { name: "startTime", type: "date" },
    { name: "endTime", type: "date" },
    { name: "pageCount", type: "number" },
    { name: "storageRef", type: "text" },
    { name: "eventsCount", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "sess_rec_session_idx", fields: ["sessionId"] },
    { name: "sess_rec_person_idx", fields: ["personId"] },
  ],
};
