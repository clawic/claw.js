import type { BuiltinCollectionDefinition } from "../_types.ts";

export const STOCK_MOVEMENTS: BuiltinCollectionDefinition = {
  name: "stock_movements",
  displayName: "Stock Movements",
  family: "warehouse",
  aliases: ["stock_movements", "stock-movement", "stock-movements", "inventory-movement", "inventory-movements"],
  catalog: {
    purpose: "Inventory movement center for receipts, issues, adjustments, transfers, counts, returns, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use inventoryItemId for the stock position and warehouseId for warehouse-level movement views.",
    notes: "This records stock movement facts; transport shipments and accounting entries remain separate records.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["description", "reason"] },
    { name: "inventoryItemId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "inventory_items" } },
    { name: "warehouseId", type: "relation", relation: { collectionName: "warehouses" } },
    { name: "movementType", type: "select", options: ["received", "issued", "adjusted", "transferred", "counted", "returned", "unknown"] },
    { name: "quantity", type: "number" },
    { name: "occurredAt", type: "date" },
    { name: "referenceCollection", type: "text" },
    { name: "referenceId", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "stock_movements_inventory_item_idx", fields: ["inventoryItemId"] },
    { name: "stock_movements_warehouse_idx", fields: ["warehouseId"] },
    { name: "stock_movements_type_idx", fields: ["movementType"] },
    { name: "stock_movements_occurred_idx", fields: ["occurredAt"] },
  ],
};
