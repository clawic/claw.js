import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EVAL_DATASETS: BuiltinCollectionDefinition = {
  name: "eval_datasets",
  displayName: "Eval Datasets",
  family: "agents",
  aliases: ["eval_dataset","eval_datasets","dataset","datasets"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "category", type: "select", options: ["swe","web","research","customer_support","qa","tool_use","reasoning","summarization","translation","custom"] },
    { name: "version", type: "text" },
    { name: "testCaseCount", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "eval_datasets_company_idx", fields: ["companyId"] },
  ],
};
