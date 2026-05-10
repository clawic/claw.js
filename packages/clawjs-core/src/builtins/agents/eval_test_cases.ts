import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EVAL_TEST_CASES: BuiltinCollectionDefinition = {
  name: "eval_test_cases",
  displayName: "Eval Test Cases",
  family: "agents",
  aliases: ["test_case","test_cases","eval_test_case","eval_test_cases"],
  fields: [
    { name: "evalDatasetId", type: "relation", required: true, relation: { collectionName: "eval_datasets" } },
    { name: "input", type: "json" },
    { name: "expectedOutput", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "eval_cases_dataset_idx", fields: ["evalDatasetId"] },
  ],
};
