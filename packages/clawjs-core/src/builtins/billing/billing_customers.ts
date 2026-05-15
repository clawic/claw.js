import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BILLING_CUSTOMERS: BuiltinCollectionDefinition = {
  name: "billing_customers",
  displayName: "Billing Customers",
  family: "billing",
  aliases: ["billing_customer","billing_customers","buyer","buyers"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "email", type: "email", aliases: ["billingEmail", "buyerEmail"] },
    { name: "name", type: "text", aliases: ["billingName", "buyerName"] },
    { name: "taxId", type: "text" },
    { name: "taxCountry", type: "text" },
    { name: "taxExempt", type: "boolean" },
    { name: "taxIds", type: "json" },
    { name: "defaultPaymentMethodId", type: "relation", relation: { collectionName: "payment_methods" } },
    { name: "balanceCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "delinquent", type: "boolean" },
    { name: "linkedCustomerId", type: "relation", relation: { collectionName: "customers" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "bill_cust_company_idx", fields: ["companyId"] },
    { name: "bill_cust_email_idx", fields: ["email"] },
  ],
};
