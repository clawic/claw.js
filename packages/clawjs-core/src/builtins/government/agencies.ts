import type { BuiltinCollectionDefinition } from "../_types.ts";

export const AGENCIES: BuiltinCollectionDefinition = {
  name: "agencies",
  displayName: "Agencies",
  family: "government",
  aliases: ["agency", "agencies", "public-agency", "public-agencies", "government-agency", "government-agencies"],
  catalog: {
    purpose: "Government agency center for jurisdiction, level, public contact data, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use agencyId from public cases, permits, and filings when a public authority is known.",
    notes: "This is public-administration data, not a company, legal client, or internal team.",
  },
  fields: [
    { name: "name", type: "text", required: true, requiredReason: "identity", aliases: ["title", "agencyName"] },
    { name: "jurisdiction", type: "text" },
    { name: "level", type: "select", options: ["municipal", "regional", "national", "international", "other", "unknown"] },
    { name: "status", type: "select", options: ["active", "inactive", "merged", "unknown"] },
    { name: "website", type: "url" },
    { name: "phone", type: "phone" },
    { name: "email", type: "email" },
    { name: "address", type: "address" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "agencies_name_idx", fields: ["name"] },
    { name: "agencies_jurisdiction_idx", fields: ["jurisdiction"] },
    { name: "agencies_level_idx", fields: ["level"] },
    { name: "agencies_status_idx", fields: ["status"] },
  ],
};
