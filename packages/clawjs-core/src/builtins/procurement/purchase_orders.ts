import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PURCHASE_ORDERS: BuiltinCollectionDefinition = {
  name: "purchase_orders",
  displayName: "Purchase Orders",
  family: "procurement",
  aliases: ["purchase-order", "purchase-orders", "purchase_order", "purchase_orders", "po", "pos"],
  catalog: {
    purpose: "Purchase order center for supplier commitments, buyer/company links, lines, receipts, status, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Link supplierId to suppliers, companyId to the buying company, and line items through purchase_order_line_items.",
    notes: "This is procurement intent and commitment data; inventory receipt, accounting, and payment execution remain separate records.",
  },
  fields: [
    { name: "number", type: "text", required: true, requiredReason: "identity", aliases: ["poNumber", "purchaseOrderNumber"] },
    { name: "supplierId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "suppliers" } },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "status", type: "select", options: ["draft", "issued", "acknowledged", "partially_received", "received", "cancelled", "closed", "unknown"] },
    { name: "orderedAt", type: "date" },
    { name: "expectedAt", type: "date" },
    { name: "currency", type: "currency" },
    { name: "totalCents", type: "number", min: 0 },
    { name: "buyerEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "purchase_orders_number_idx", fields: ["number"] },
    { name: "purchase_orders_supplier_idx", fields: ["supplierId"] },
    { name: "purchase_orders_company_idx", fields: ["companyId"] },
    { name: "purchase_orders_status_idx", fields: ["status"] },
  ],
};
