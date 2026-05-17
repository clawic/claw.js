import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INCIDENTS: BuiltinCollectionDefinition = {
  name: "incidents",
  displayName: "Incidents",
  family: "ops",
  aliases: ["incident", "incidents", "itsm_incident", "itsm_incidents"],
  catalog: {
    purpose: "Operational incident center for affected services, severity, status, evidence, actions, postmortems, and timelines.",
    evidence: ["human_recognizable", "market_validated", "agent_useful"],
    relationGuidance: "Use serviceId when an incident affects a known service; keep evidence/source fields for monitor, log, or external incident references.",
    notes: "Incident records organize operational facts; real external paging, provider sync, and destructive actions remain gated separately.",
  },
  fields: [
    { name: "serviceId", type: "relation", relation: { collectionName: "services" }, aliases: ["service", "affectedServiceId"] },
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["summary", "name"] },
    { name: "severity", type: "select", options: ["sev1", "sev2", "sev3", "sev4"] },
    { name: "status", type: "select", options: ["open", "investigating", "mitigated", "resolved", "closed"] },
    { name: "startedAt", type: "date" },
    { name: "detectedAt", type: "date" },
    { name: "resolvedAt", type: "date" },
    { name: "description", type: "text" },
    { name: "impact", type: "text" },
    { name: "source", type: "json" },
    { name: "actions", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "incidents_service_idx", fields: ["serviceId"] },
    { name: "incidents_status_idx", fields: ["status"] },
    { name: "incidents_severity_idx", fields: ["severity"] },
  ],
};
