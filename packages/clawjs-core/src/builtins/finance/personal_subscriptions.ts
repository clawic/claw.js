import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PERSONAL_SUBSCRIPTIONS: BuiltinCollectionDefinition = {
  name: "personal_subscriptions",
  displayName: "Personal Subscriptions",
  family: "finance",
  aliases: ["personal_subscription","personal_subscriptions"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "amountCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "cadence", type: "select", options: ["weekly","monthly","quarterly","yearly"] },
    { name: "nextChargeAt", type: "date" },
    { name: "startedAt", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "status", type: "select", options: ["active","paused","cancelled","expired"] },
    { name: "accountId", type: "relation", relation: { collectionName: "financial_accounts" } },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "personal_subscriptions_status_idx", fields: ["status"] },
    { name: "personal_subscriptions_next_charge_idx", fields: ["nextChargeAt"] },
  ],
};
