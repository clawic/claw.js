import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ADVOCACY_LOG: BuiltinCollectionDefinition = {
  name: "advocacy_log",
  displayName: "Advocacy Log",
  family: "identity_body_religious_fine",
  aliases: ["advocacy_entry","advocacy_log"],
  fields: [
    { name: "cause", type: "text", required: true },
    { name: "action", type: "select", options: ["signed_petition","attended_protest","donated","volunteered","spoke_publicly","wrote_letter","organized","other"] },
    { name: "occurredAt", type: "date", required: true },
    { name: "location", type: "text" },
    { name: "donation", type: "money" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "advocacy_log_cause_idx", fields: ["cause"] },
    { name: "advocacy_log_occurred_idx", fields: ["occurredAt"] },
  ],
};
