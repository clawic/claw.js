import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DEPARTMENTS: BuiltinCollectionDefinition = {
  name: "departments",
  displayName: "Departments",
  family: "hr",
  aliases: ["department","departments"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "managerEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "budgetCents", type: "number" },
    { name: "parentDepartmentId", type: "relation", relation: { collectionName: "departments" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "departments_company_idx", fields: ["companyId"] },
    { name: "departments_parent_idx", fields: ["parentDepartmentId"] },
  ],
};
