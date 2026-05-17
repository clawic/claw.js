import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INVENTORY_ITEMS: BuiltinCollectionDefinition = {
  name: "inventory_items",
  displayName: "Inventory Items",
  family: "warehouse",
  aliases: ["inventory_items", "inventory-item", "inventory-items", "stock-item", "stock-items", "warehouse-inventory", "warehouse-stock"],
  catalog: {
    purpose: "Stock position center for product/service inventory in a warehouse, quantities, status, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Link warehouseId to warehouses and productCatalogId to products_catalog when the stock item is a known product.",
    notes: "This is operational warehouse stock, not a household inventory record and not an accounting ledger.",
  },
  fields: [
    { name: "name", type: "text", required: true, requiredReason: "identity", aliases: ["label", "title"] },
    { name: "warehouseId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "warehouses" } },
    { name: "productCatalogId", type: "relation", relation: { collectionName: "products_catalog" } },
    { name: "sku", type: "text" },
    { name: "locationCode", type: "text" },
    { name: "quantityOnHand", type: "number", min: 0 },
    { name: "quantityReserved", type: "number", min: 0 },
    { name: "reorderPoint", type: "number", min: 0 },
    { name: "status", type: "select", options: ["in_stock", "low_stock", "out_of_stock", "discontinued", "unknown"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "inventory_items_warehouse_idx", fields: ["warehouseId"] },
    { name: "inventory_items_product_idx", fields: ["productCatalogId"] },
    { name: "inventory_items_sku_idx", fields: ["sku"] },
    { name: "inventory_items_status_idx", fields: ["status"] },
  ],
};
