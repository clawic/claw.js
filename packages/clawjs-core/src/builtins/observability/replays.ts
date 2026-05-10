import type { BuiltinCollectionDefinition } from "../_types.ts";

export const REPLAYS: BuiltinCollectionDefinition = {
  name: "replays",
  displayName: "Replays",
  family: "observability",
  aliases: ["replay","replays"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "errorEventId", type: "relation", relation: { collectionName: "error_events" } },
    { name: "personId", type: "relation", relation: { collectionName: "analytics_persons" } },
    { name: "sessionId", type: "text" },
    { name: "duration", type: "number" },
    { name: "storageRef", type: "text" },
    { name: "timestamp", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "replays_session_idx", fields: ["sessionId"] },
    { name: "replays_error_idx", fields: ["errorEventId"] },
  ],
};
