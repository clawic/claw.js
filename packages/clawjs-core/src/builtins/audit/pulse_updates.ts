import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PULSE_UPDATES: BuiltinCollectionDefinition = {
  name: "pulse_updates",
  displayName: "Pulse Updates",
  family: "audit",
  aliases: ["pulse","pulses","pulse_update","pulse_updates"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "scopeKind", type: "select", required: true, options: ["project","initiative","team","workspace","portfolio_item"] },
    { name: "scopeId", type: "text" },
    { name: "period", type: "select", options: ["day","week","month","quarter"] },
    { name: "summary", type: "text" },
    { name: "summaryData", type: "json" },
    { name: "generatedByActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "aiGenerated", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "pulse_company_idx", fields: ["companyId"] },
    { name: "pulse_scope_idx", fields: ["scopeKind","scopeId"] },
  ],
};
