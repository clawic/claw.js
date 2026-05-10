import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PAYMENT_METHODS: BuiltinCollectionDefinition = {
  name: "payment_methods",
  displayName: "Payment Methods",
  family: "billing",
  aliases: ["payment_method","payment_methods","card","cards"],
  fields: [
    { name: "billingCustomerId", type: "relation", required: true, relation: { collectionName: "billing_customers" } },
    { name: "type", type: "select", required: true, options: ["card","sepa_debit","us_bank_account","ach","ideal","bancontact","sofort","paypal","applepay","googlepay","klarna","afterpay","other"] },
    { name: "brand", type: "text" },
    { name: "last4", type: "text" },
    { name: "expMonth", type: "number" },
    { name: "expYear", type: "number" },
    { name: "fingerprint", type: "text" },
    { name: "isDefault", type: "boolean" },
    { name: "country", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "pm_customer_idx", fields: ["billingCustomerId"] },
  ],
};
