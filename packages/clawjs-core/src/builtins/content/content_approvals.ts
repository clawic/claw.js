import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTENT_APPROVALS: BuiltinCollectionDefinition = {
  name: "content_approvals",
  displayName: "Content Approvals",
  family: "content",
  aliases: ["content-approval", "content-approvals", "content_approval", "content_approvals", "entry-approval", "entry-approvals"],
  catalog: {
    purpose: "Content approval center for review requests, decisions, comments, evidence, and audit gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Link the approval to contentEntryId, contentVariantId, and contentDestinationId when the review is channel-specific.",
  },
  fields: [
    { name: "contentEntryId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "content_entries" } },
    { name: "contentVariantId", type: "relation", relation: { collectionName: "content_variants" } },
    { name: "contentDestinationId", type: "relation", relation: { collectionName: "content_destinations" } },
    { name: "status", type: "select", options: ["requested", "approved", "rejected", "canceled", "expired", "unknown"] },
    { name: "requestedByActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "reviewedByActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "requestedAt", type: "date" },
    { name: "reviewedAt", type: "date" },
    { name: "comment", type: "markdown" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
  ],
  indexes: [
    { name: "content_approvals_entry_idx", fields: ["contentEntryId"] },
    { name: "content_approvals_variant_idx", fields: ["contentVariantId"] },
    { name: "content_approvals_destination_idx", fields: ["contentDestinationId"] },
    { name: "content_approvals_status_idx", fields: ["status"] },
  ],
};
