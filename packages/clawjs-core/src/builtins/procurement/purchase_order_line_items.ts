import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PURCHASE_ORDER_LINE_ITEMS: BuiltinCollectionDefinition = {
  name: "purchase_order_line_items",
  displayName: "Purchase Order Line Items",
  family: "procurement",
  aliases: ["purchase-order-line-item", "purchase-order-line-items", "purchase_order_line_item", "purchase_order_line_items", "po-line", "po-lines"],
  catalog: {
    purpose: "Line-item center for purchase order products/services, quantities, receiving status, costs, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Every line item belongs to a purchase order; productCatalogId links to the shared product catalog when known.",
    notes: "This keeps procurement lines separate from invoice lines and sales/order lines.",
  },
  fields: [
    { name: "description", type: "text", required: true, requiredReason: "identity", aliases: ["title", "name"] },
    { name: "purchaseOrderId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "purchase_orders" } },
    { name: "productCatalogId", type: "relation", relation: { collectionName: "products_catalog" } },
    { name: "quantity", type: "number", min: 0 },
    { name: "unitCostCents", type: "number", min: 0 },
    { name: "totalCents", type: "number", min: 0 },
    { name: "receivedQuantity", type: "number", min: 0 },
    { name: "status", type: "select", options: ["ordered", "partially_received", "received", "cancelled", "unknown"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "purchase_order_lines_po_idx", fields: ["purchaseOrderId"] },
    { name: "purchase_order_lines_product_idx", fields: ["productCatalogId"] },
    { name: "purchase_order_lines_status_idx", fields: ["status"] },
  ],
};
