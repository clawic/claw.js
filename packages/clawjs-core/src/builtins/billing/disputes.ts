import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DISPUTES: BuiltinCollectionDefinition = {
  name: "disputes",
  displayName: "Disputes",
  family: "billing",
  aliases: ["dispute","disputes","chargeback","chargebacks"],
  fields: [
    { name: "chargeId", type: "relation", required: true, relation: { collectionName: "charges" } },
    { name: "amountCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "reason", type: "select", options: ["credit_not_processed","duplicate","fraudulent","general","incorrect_account_details","insufficient_funds","product_not_received","product_unacceptable","subscription_canceled","unrecognized"] },
    { name: "status", type: "select", options: ["warning_needs_response","warning_under_review","warning_closed","needs_response","under_review","won","lost"] },
    { name: "evidenceSummary", type: "text" },
    { name: "evidenceSubmittedAt", type: "date" },
    { name: "evidence", type: "json" },
    { name: "dueBy", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "disputes_charge_idx", fields: ["chargeId"] },
    { name: "disputes_status_idx", fields: ["status"] },
  ],
};
