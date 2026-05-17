import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WORK_ORDERS: BuiltinCollectionDefinition = {
  name: "work_orders",
  displayName: "Work Orders",
  family: "manufacturing",
  aliases: ["work-order", "work-orders", "work_order", "work_orders", "production_order", "production_orders"],
  catalog: {
    purpose: "Manufacturing execution center for materials, operations, labor, equipment, quality events, evidence, and timeline views.",
    evidence: ["human_recognizable", "market_validated", "agent_useful"],
    relationGuidance: "Use companyId and assetId where available; materials, quality checks, and events can be linked through evidence or later specialized records.",
    notes: "This is a MES-style center, not a replacement for ERP inventory/procurement/accounting records.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "workOrderName"] },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "assetId", type: "relation", relation: { collectionName: "assets" } },
    { name: "status", type: "select", options: ["planned", "released", "in_progress", "blocked", "completed", "cancelled", "unknown"] },
    { name: "priority", type: "select", options: ["low", "medium", "high", "urgent"] },
    { name: "plannedStartAt", type: "date" },
    { name: "plannedEndAt", type: "date" },
    { name: "startedAt", type: "date" },
    { name: "completedAt", type: "date" },
    { name: "materials", type: "json" },
    { name: "operations", type: "json" },
    { name: "qualityChecks", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "work_orders_title_idx", fields: ["title"] },
    { name: "work_orders_company_idx", fields: ["companyId"] },
    { name: "work_orders_status_idx", fields: ["status"] },
  ],
};
