import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CUSTOMER_REQUESTS: BuiltinCollectionDefinition = {
  name: "customer_requests",
  displayName: "Customer Requests",
  family: "customer_intake",
  aliases: ["need","needs","customer_request","customer_requests","customer_need","customer_needs"],
  fields: [
    { name: "customerId", type: "relation", relation: { collectionName: "customers" } },
    { name: "issueId", type: "relation", relation: { collectionName: "issues" } },
    { name: "externalUserId", type: "relation", relation: { collectionName: "external_users" } },
    { name: "title", type: "text" },
    { name: "body", type: "text" },
    { name: "priority", type: "select", options: ["low","medium","high","urgent"] },
    { name: "requestSource", type: "select", options: ["slack","intercom","zendesk","email","front","web_form","manual","other"] },
    { name: "sourceMetadata", type: "json" },
    { name: "importance", type: "boolean" },
    { name: "externalIdentifier", type: "text" },
    { name: "requesterEmail", type: "email" },
    { name: "requesterName", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "cr_customer_idx", fields: ["customerId"] },
    { name: "cr_issue_idx", fields: ["issueId"] },
    { name: "cr_source_idx", fields: ["requestSource"] },
  ],
};
