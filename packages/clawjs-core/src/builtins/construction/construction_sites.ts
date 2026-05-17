import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONSTRUCTION_SITES: BuiltinCollectionDefinition = {
  name: "construction_sites",
  displayName: "Construction Sites",
  family: "construction",
  aliases: ["construction-site", "construction-sites", "construction_site", "construction_sites", "job-site", "job-sites"],
  catalog: {
    purpose: "Construction site center for location, project linkage, site status, superintendent, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Every site belongs to a construction project; use propertyListingId when a real-estate record already represents the location.",
    notes: "Sites model construction execution locations and should not duplicate generic locations or real-estate listings.",
  },
  fields: [
    { name: "name", type: "text", required: true, requiredReason: "identity", aliases: ["title", "label"] },
    { name: "projectId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "construction_projects" } },
    { name: "propertyListingId", type: "relation", relation: { collectionName: "property_listings" } },
    { name: "superintendentEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "status", type: "select", options: ["planned", "mobilized", "active", "delayed", "closed", "unknown"] },
    { name: "address", type: "address" },
    { name: "geo", type: "geo_point" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "construction_sites_project_idx", fields: ["projectId"] },
    { name: "construction_sites_property_idx", fields: ["propertyListingId"] },
    { name: "construction_sites_status_idx", fields: ["status"] },
  ],
};
