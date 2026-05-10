import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BENEFITS_ENROLLMENTS: BuiltinCollectionDefinition = {
  name: "benefits_enrollments",
  displayName: "Benefits Enrollments",
  family: "hr",
  aliases: ["benefit","benefits","benefits_enrollment","benefits_enrollments"],
  fields: [
    { name: "employeeId", type: "relation", required: true, relation: { collectionName: "employees" } },
    { name: "planId", type: "text" },
    { name: "elections", type: "json" },
    { name: "enrolledAt", type: "date" },
    { name: "effectiveAt", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "benefits_emp_idx", fields: ["employeeId"] },
  ],
};
