import type { BuiltinCollectionDefinition } from "../_types.ts";

export const AUDIT_LOG: BuiltinCollectionDefinition = {
  name: "audit_log",
  displayName: "Audit Log",
  family: "identity",
  aliases: ["audit","audit_log"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "eventType", type: "text", required: true },
    { name: "actorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "ip", type: "text" },
    { name: "countryCode", type: "text" },
    { name: "userAgent", type: "text" },
    { name: "resourceKind", type: "text" },
    { name: "resourceId", type: "text" },
    { name: "requestInformation", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "audit_log_company_idx", fields: ["companyId"] },
    { name: "audit_log_event_idx", fields: ["eventType"] },
    { name: "audit_log_resource_idx", fields: ["resourceKind","resourceId"] },
  ],
};
