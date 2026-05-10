import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EMAIL_SEQUENCES: BuiltinCollectionDefinition = {
  name: "email_sequences",
  displayName: "Email Sequences",
  family: "marketing",
  aliases: ["sequence","sequences","email_sequence","email_sequences","drip"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "trigger", type: "select", options: ["subscribed","tag_added","event_fired","form_submitted","purchase","manual","scheduled"] },
    { name: "triggerConfig", type: "json" },
    { name: "status", type: "select", options: ["active","paused","draft","archived"] },
    { name: "steps", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "seq_company_idx", fields: ["companyId"] },
    { name: "seq_status_idx", fields: ["status"] },
  ],
};
