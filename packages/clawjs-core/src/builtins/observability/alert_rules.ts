import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ALERT_RULES: BuiltinCollectionDefinition = {
  name: "alert_rules",
  displayName: "Alert Rules",
  family: "observability",
  aliases: ["alert","alerts","alert_rule","alert_rules"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "target", type: "select", options: ["error_issue","event_count","monitor","sla","metric","log","custom"] },
    { name: "query", type: "json" },
    { name: "condition", type: "json" },
    { name: "actions", type: "json" },
    { name: "cooldownSeconds", type: "number" },
    { name: "enabled", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "alert_rules_company_idx", fields: ["companyId"] },
  ],
};
