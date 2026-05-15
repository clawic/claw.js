import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PAYROLL_RUNS: BuiltinCollectionDefinition = {
  name: "payroll_runs",
  displayName: "Payroll Runs",
  family: "hr",
  aliases: ["payroll","payrolls","payroll_run","payroll_runs"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "periodStart", type: "date" },
    { name: "periodEnd", type: "date" },
    { name: "status", type: "select", options: ["draft","approved","paid","canceled"] },
    { name: "totalAmountCents", type: "number", aliases: ["payrollTotalCents"] },
    { name: "currency", type: "text" },
    { name: "paidAt", type: "date" },
    { name: "processedByActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "payroll_runs_company_idx", fields: ["companyId"] },
    { name: "payroll_runs_period_idx", fields: ["periodStart"] },
  ],
};
