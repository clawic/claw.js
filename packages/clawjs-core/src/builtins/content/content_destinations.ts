import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTENT_DESTINATIONS: BuiltinCollectionDefinition = {
  name: "content_destinations",
  displayName: "Content Destinations",
  family: "content",
  aliases: ["content-destination", "content-destinations", "content_destination", "content_destinations", "publishing-destination", "publishing-destinations"],
  catalog: {
    purpose: "Publishing destination center for channels, provider capability snapshots, policy, evidence, and delivery gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Link contentBrandId to the owning content brand; publication records link entries and variants to destinations.",
    notes: "Destinations store local intent and capability metadata; real external publication remains gated.",
  },
  fields: [
    { name: "contentBrandId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "content_brands" } },
    { name: "name", type: "text", required: true, requiredReason: "identity" },
    { name: "kind", type: "select", options: ["website", "newsletter", "social", "blog", "help_center", "ads", "marketplace", "other"] },
    { name: "status", type: "select", options: ["draft", "active", "paused", "disabled", "unknown"] },
    { name: "publishPolicy", type: "select", options: ["manual", "approval_required", "scheduled", "automatic", "unknown"] },
    { name: "externalAccountLabel", type: "text" },
    { name: "capabilityMap", type: "json" },
    { name: "config", type: "json" },
    { name: "lastCheckedAt", type: "date" },
    { name: "lastError", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "content_destinations_brand_idx", fields: ["contentBrandId"] },
    { name: "content_destinations_name_idx", fields: ["name"] },
    { name: "content_destinations_kind_idx", fields: ["kind"] },
    { name: "content_destinations_status_idx", fields: ["status"] },
  ],
};
