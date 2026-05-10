import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WEB_FORM_SUBMISSIONS: BuiltinCollectionDefinition = {
  name: "web_form_submissions",
  displayName: "Web Form Submissions",
  family: "customer_intake",
  aliases: ["submission","submissions","web_form_submission","web_form_submissions"],
  fields: [
    { name: "intakeAddressId", type: "relation", required: true, relation: { collectionName: "intake_addresses" } },
    { name: "fieldsValues", type: "json" },
    { name: "createdIssueId", type: "relation", relation: { collectionName: "issues" } },
    { name: "requesterEmail", type: "email" },
    { name: "requesterName", type: "text" },
    { name: "ip", type: "text" },
    { name: "userAgent", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "wfs_intake_idx", fields: ["intakeAddressId"] },
    { name: "wfs_issue_idx", fields: ["createdIssueId"] },
  ],
};
