import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SUPPLY_PLANS: BuiltinCollectionDefinition = {
  name: "supply_plans",
  displayName: "Supply Plans",
  family: "supply_chain",
  aliases: ["supply-plan", "supply-plans", "supply_plan", "supply_plans", "replenishment-plan", "replenishment-plans"],
  catalog: {
    purpose: "Supply-chain planning center for demand/supply balancing, company scope, planning horizon, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use companyId for the operating entity; line items and risks link the plan to suppliers, purchase orders, products, warehouses, and inventory.",
    notes: "This is the SCM orchestration layer; procurement commitments and warehouse stock remain in their own canonical records.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "planName"] },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "status", type: "select", options: ["draft", "active", "approved", "at_risk", "completed", "cancelled", "unknown"] },
    { name: "horizonStartAt", type: "date" },
    { name: "horizonEndAt", type: "date" },
    { name: "plannerEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "objective", type: "markdown" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "supply_plans_title_idx", fields: ["title"] },
    { name: "supply_plans_company_idx", fields: ["companyId"] },
    { name: "supply_plans_status_idx", fields: ["status"] },
    { name: "supply_plans_horizon_idx", fields: ["horizonStartAt", "horizonEndAt"] },
  ],
};
