import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ANALYTICS_EVENTS: BuiltinCollectionDefinition = {
  name: "analytics_events",
  displayName: "Analytics Events",
  family: "analytics",
  aliases: ["analytics_event","analytics_events"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "eventName", type: "text", required: true },
    { name: "distinctId", type: "text", required: true },
    { name: "personId", type: "relation", relation: { collectionName: "analytics_persons" } },
    { name: "groupId", type: "relation", relation: { collectionName: "analytics_groups" } },
    { name: "properties", type: "json" },
    { name: "ip", type: "text" },
    { name: "userAgent", type: "text" },
    { name: "sessionId", type: "text" },
    { name: "timestamp", type: "date", required: true },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "analytics_events_company_time_idx", fields: ["companyId","timestamp"] },
    { name: "analytics_events_company_name_time_idx", fields: ["companyId","eventName","timestamp"] },
    { name: "analytics_events_distinct_idx", fields: ["distinctId"] },
    { name: "analytics_events_session_idx", fields: ["sessionId"] },
  ],
};
