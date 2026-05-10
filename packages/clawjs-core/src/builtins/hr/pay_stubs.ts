import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PAY_STUBS: BuiltinCollectionDefinition = {
  name: "pay_stubs",
  displayName: "Pay Stubs",
  family: "hr",
  aliases: ["pay_stub","pay_stubs","paystub","paystubs"],
  fields: [
    { name: "payrollRunId", type: "relation", required: true, relation: { collectionName: "payroll_runs" } },
    { name: "employeeId", type: "relation", required: true, relation: { collectionName: "employees" } },
    { name: "grossCents", type: "number" },
    { name: "netCents", type: "number" },
    { name: "deductions", type: "json" },
    { name: "taxes", type: "json" },
    { name: "period", type: "json" },
    { name: "pdfUrl", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "pay_stubs_run_emp_unique", fields: ["payrollRunId","employeeId"], unique: true },
    { name: "pay_stubs_emp_idx", fields: ["employeeId"] },
  ],
};
