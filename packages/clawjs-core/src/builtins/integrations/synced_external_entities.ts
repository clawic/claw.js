import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SYNCED_EXTERNAL_ENTITIES: BuiltinCollectionDefinition = {
  name: "synced_external_entities",
  displayName: "Synced External Entities",
  family: "integrations",
  aliases: ["synced","synced_external_entity","synced_external_entities"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "type", type: "select", required: true, options: ["jira_issue","github_issue","github_pr","gitlab_issue","gitlab_mr","asana_task","linear_issue","slack_message","zendesk_ticket","intercom_conversation","front_conversation","figma_file","notion_page","custom"] },
    { name: "externalId", type: "text", required: true },
    { name: "externalUrl", type: "text" },
    { name: "localEntityKind", type: "text" },
    { name: "localEntityId", type: "text" },
    { name: "externalSource", type: "text" },
    { name: "sourceMetadata", type: "json" },
    { name: "syncDirection", type: "select", options: ["in","out","bidirectional"] },
    { name: "lastSyncedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "synced_external_unique", fields: ["type","externalId"], unique: true },
    { name: "synced_external_local_idx", fields: ["localEntityKind","localEntityId"] },
  ],
};
