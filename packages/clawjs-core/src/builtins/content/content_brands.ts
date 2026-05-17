import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTENT_BRANDS: BuiltinCollectionDefinition = {
  name: "content_brands",
  displayName: "Content Brands",
  family: "content",
  aliases: ["content-brand", "content-brands", "content_brand", "content_brands", "brand-profile", "brand-profiles"],
  catalog: {
    purpose: "CMS brand center for editorial identity, locale, voice, governance, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use companyId when the brand is owned by a canonical company; campaigns, entries, destinations, and publications link back here.",
    notes: "Brand records are CMS governance anchors, not a replacement for CRM accounts or ERP companies.",
  },
  fields: [
    { name: "name", type: "text", required: true, requiredReason: "identity" },
    { name: "slug", type: "text" },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "description", type: "markdown" },
    { name: "defaultLocale", type: "text" },
    { name: "voiceSummary", type: "markdown" },
    { name: "status", type: "select", options: ["draft", "active", "paused", "archived", "unknown"] },
    { name: "tags", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "content_brands_name_idx", fields: ["name"] },
    { name: "content_brands_slug_idx", fields: ["slug"] },
    { name: "content_brands_company_idx", fields: ["companyId"] },
    { name: "content_brands_status_idx", fields: ["status"] },
  ],
};
