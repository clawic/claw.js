import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EXTERNAL_THREADS: BuiltinCollectionDefinition = {
  name: "external_threads",
  displayName: "External Threads",
  family: "integrations",
  aliases: ["external_thread","external_threads"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "externalSource", type: "text", required: true },
    { name: "externalThreadId", type: "text", required: true },
    { name: "externalUrl", type: "text" },
    { name: "localCommentId", type: "relation", relation: { collectionName: "comments" } },
    { name: "localIssueId", type: "relation", relation: { collectionName: "issues" } },
    { name: "syncedMessages", type: "json" },
    { name: "lastSyncedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "ext_threads_unique", fields: ["externalSource","externalThreadId"], unique: true },
    { name: "ext_threads_issue_idx", fields: ["localIssueId"] },
  ],
};
