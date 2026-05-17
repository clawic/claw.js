import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTENT_CAMPAIGNS: BuiltinCollectionDefinition = {
  name: "content_campaigns",
  displayName: "Content Campaigns",
  family: "content",
  aliases: ["content-campaign", "content-campaigns", "content_campaign", "content_campaigns", "editorial-campaign", "editorial-campaigns"],
  catalog: {
    purpose: "Editorial campaign center for CMS planning, goals, schedules, linked entries, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use contentBrandId for CMS ownership; CRM `campaigns` remains the customer/marketing campaign center.",
    notes: "This avoids reusing the top-level `campaign` noun, which stays CRM-owned.",
  },
  fields: [
    { name: "contentBrandId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "content_brands" } },
    { name: "name", type: "text", required: true, requiredReason: "identity", aliases: ["title"] },
    { name: "slug", type: "text" },
    { name: "description", type: "markdown" },
    { name: "status", type: "select", options: ["planning", "active", "completed", "canceled", "archived", "unknown"] },
    { name: "startsAt", type: "date" },
    { name: "endsAt", type: "date" },
    { name: "goals", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "content_campaigns_brand_idx", fields: ["contentBrandId"] },
    { name: "content_campaigns_name_idx", fields: ["name"] },
    { name: "content_campaigns_slug_idx", fields: ["slug"] },
    { name: "content_campaigns_status_idx", fields: ["status"] },
  ],
};
