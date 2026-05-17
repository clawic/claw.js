import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTENT_VARIANTS: BuiltinCollectionDefinition = {
  name: "content_variants",
  displayName: "Content Variants",
  family: "content",
  aliases: ["content-variant", "content-variants", "content_variant", "content_variants", "entry-variant", "entry-variants"],
  catalog: {
    purpose: "Content variant center for destination-specific formats, validation state, media plans, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Link contentEntryId and contentDestinationId to keep variants anchored to the canonical entry and channel.",
  },
  fields: [
    { name: "contentEntryId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "content_entries" } },
    { name: "contentDestinationId", type: "relation", relation: { collectionName: "content_destinations" } },
    { name: "format", type: "select", options: ["markdown", "html", "plain_text", "social_short", "email", "ad", "structured", "other"] },
    { name: "title", type: "text", required: true, requiredReason: "identity" },
    { name: "body", type: "markdown" },
    { name: "status", type: "select", options: ["draft", "validating", "valid", "invalid", "approved", "published", "archived", "unknown"] },
    { name: "validationErrors", type: "json" },
    { name: "mediaPlan", type: "json" },
    { name: "publishConfig", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "content_variants_entry_idx", fields: ["contentEntryId"] },
    { name: "content_variants_destination_idx", fields: ["contentDestinationId"] },
    { name: "content_variants_status_idx", fields: ["status"] },
  ],
};
