import type { BuiltinCollectionDefinition } from "../_types.ts";

export const AUTOMATIONS: BuiltinCollectionDefinition = {
  name: "automations",
  displayName: "Automations",
  family: "flow",
  aliases: ["automation","automations"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "teamId", type: "relation", relation: { collectionName: "teams" } },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "triggerKind", type: "select", required: true, options: ["issue_created","issue_updated","status_changed","assignee_changed","label_added","label_removed","comment_created","scheduled","sla_breach","customer_request_created","release_created","deployment_completed","webhook_received"] },
    { name: "triggerConfig", type: "json" },
    { name: "conditions", type: "json" },
    { name: "actions", type: "json" },
    { name: "enabled", type: "boolean" },
    { name: "lastRunAt", type: "date" },
    { name: "runCount", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "automations_company_idx", fields: ["companyId"] },
    { name: "automations_trigger_idx", fields: ["triggerKind"] },
  ],
};
