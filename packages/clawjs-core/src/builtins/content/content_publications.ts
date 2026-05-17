import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTENT_PUBLICATIONS: BuiltinCollectionDefinition = {
  name: "content_publications",
  displayName: "Content Publications",
  family: "content",
  aliases: ["content-publication", "content-publications", "content_publication", "content_publications", "publication-plan", "publication-plans"],
  catalog: {
    purpose: "Content publication center for scheduled or attempted delivery, external references, receipts, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Link contentEntryId, contentVariantId, and contentDestinationId; use externalUrl and providerReceipt for audited delivery state.",
    notes: "Local publication records describe intent and receipts; actual provider delivery is EXTERNAL PENDING unless a validated connector executed it.",
  },
  fields: [
    { name: "title", type: "text", aliases: ["name"] },
    { name: "contentEntryId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "content_entries" } },
    { name: "contentVariantId", type: "relation", relation: { collectionName: "content_variants" } },
    { name: "contentDestinationId", type: "relation", relation: { collectionName: "content_destinations" } },
    { name: "status", type: "select", options: ["planned", "scheduled", "publishing", "published", "failed", "canceled", "unknown"] },
    { name: "scheduledAt", type: "date" },
    { name: "publishedAt", type: "date" },
    { name: "externalUrl", type: "url" },
    { name: "attemptNumber", type: "number" },
    { name: "providerReceipt", type: "json" },
    { name: "error", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "content_publications_title_idx", fields: ["title"] },
    { name: "content_publications_entry_idx", fields: ["contentEntryId"] },
    { name: "content_publications_variant_idx", fields: ["contentVariantId"] },
    { name: "content_publications_destination_idx", fields: ["contentDestinationId"] },
    { name: "content_publications_status_idx", fields: ["status"] },
    { name: "content_publications_scheduled_idx", fields: ["scheduledAt"] },
  ],
};
