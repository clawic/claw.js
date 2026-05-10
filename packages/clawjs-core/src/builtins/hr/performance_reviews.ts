import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PERFORMANCE_REVIEWS: BuiltinCollectionDefinition = {
  name: "performance_reviews",
  displayName: "Performance Reviews",
  family: "hr",
  aliases: ["review","reviews","performance_review","performance_reviews"],
  fields: [
    { name: "employeeId", type: "relation", required: true, relation: { collectionName: "employees" } },
    { name: "reviewerEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "cycleName", type: "text" },
    { name: "rating", type: "text" },
    { name: "feedback", type: "text" },
    { name: "goalsReviewed", type: "json" },
    { name: "status", type: "select", options: ["draft","in_progress","submitted","shared","completed"] },
    { name: "completedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "perf_reviews_emp_idx", fields: ["employeeId"] },
    { name: "perf_reviews_cycle_idx", fields: ["cycleName"] },
  ],
};
