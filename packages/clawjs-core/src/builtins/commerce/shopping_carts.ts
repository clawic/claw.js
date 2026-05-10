import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SHOPPING_CARTS: BuiltinCollectionDefinition = {
  name: "shopping_carts",
  displayName: "Shopping Carts",
  family: "commerce",
  aliases: ["cart","carts","shopping_cart","shopping_carts"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "customerId", type: "relation", relation: { collectionName: "customers" } },
    { name: "sessionId", type: "text" },
    { name: "items", type: "json" },
    { name: "totalCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "convertedToOrderId", type: "relation", relation: { collectionName: "orders" } },
    { name: "abandonedAt", type: "date" },
    { name: "checkoutUrl", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "carts_company_idx", fields: ["companyId"] },
    { name: "carts_session_idx", fields: ["sessionId"] },
    { name: "carts_customer_idx", fields: ["customerId"] },
  ],
};
