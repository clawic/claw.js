import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTENT_REVISIONS: BuiltinCollectionDefinition = {
  name: "content_revisions",
  displayName: "Content Revisions",
  family: "content",
  aliases: ["content-revision", "content-revisions", "content_revision", "content_revisions", "entry-revision", "entry-revisions"],
  catalog: {
    purpose: "Content revision center for immutable editorial snapshots, authorship, evidence, and review history.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Every revision links to contentEntryId; use authorActorId when known.",
  },
  fields: [
    { name: "contentEntryId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "content_entries" } },
    { name: "revisionNumber", type: "number", required: true, requiredReason: "identity" },
    { name: "title", type: "text", required: true, requiredReason: "identity" },
    { name: "summary", type: "markdown" },
    { name: "body", type: "markdown" },
    { name: "authorActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "snapshot", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
  ],
  indexes: [
    { name: "content_revisions_entry_idx", fields: ["contentEntryId"] },
    { name: "content_revisions_number_idx", fields: ["contentEntryId", "revisionNumber"] },
    { name: "content_revisions_author_idx", fields: ["authorActorId"] },
  ],
};
