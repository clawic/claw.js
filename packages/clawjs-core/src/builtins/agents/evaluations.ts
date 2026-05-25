import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EVALUATIONS: BuiltinCollectionDefinition = {
  name: "evaluations",
  displayName: "Evaluations",
  family: "agents",
  aliases: ["eval","evals","evaluation","evaluations"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "evalDatasetId", type: "relation", relation: { collectionName: "eval_datasets" } },
    { name: "agentId", type: "relation", relation: { collectionName: "agents" } },
    { name: "skillId", type: "relation", relation: { collectionName: "agent_skills" } },
    { name: "metric", type: "select", required: true, options: ["accuracy","latency","cost","safety","tool_use_correctness","hallucination_rate","completeness","consistency","human_preference","rouge","bleu","custom"] },
    { name: "score", type: "number" },
    { name: "benchmarkRef", type: "text" },
    { name: "runId", type: "relation", relation: { collectionName: "agent_runs" } },
    { name: "computedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "evals_dataset_idx", fields: ["evalDatasetId"] },
    { name: "evals_agent_idx", fields: ["agentId"] },
    { name: "evals_metric_idx", fields: ["metric"] },
  ],
};
