import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SERVICES: BuiltinCollectionDefinition = {
  name: "services",
  displayName: "Services",
  family: "ops",
  aliases: ["service", "services", "itsm_service", "itsm_services"],
  catalog: {
    purpose: "Operational service center for ownership, incidents, checks, dependencies, SLOs, evidence, and timeline views.",
    evidence: ["human_recognizable", "market_validated", "agent_useful"],
    relationGuidance: "Use services as the stable ITSM/ops anchor; monitors, incidents, deployments, assets, and SLO records should point here.",
    notes: "This is distinct from monitor configuration; monitors can feed service evidence and incidents.",
  },
  fields: [
    { name: "name", type: "text", required: true, requiredReason: "identity", aliases: ["title", "serviceName"] },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "ownerActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "tier", type: "text" },
    { name: "status", type: "select", options: ["active", "degraded", "maintenance", "retired", "unknown"] },
    { name: "repositoryId", type: "relation", relation: { collectionName: "repositories" } },
    { name: "dependencies", type: "json" },
    { name: "slos", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "services_name_idx", fields: ["name"] },
    { name: "services_company_idx", fields: ["companyId"] },
    { name: "services_status_idx", fields: ["status"] },
  ],
};
