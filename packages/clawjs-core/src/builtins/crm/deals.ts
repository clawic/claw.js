import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DEALS: BuiltinCollectionDefinition = {
  name: "deals",
  displayName: "Deals",
  family: "crm",
  aliases: ["deal","deals","opportunity","opportunities"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "pipelineId", type: "relation", relation: { collectionName: "pipelines" } },
    { name: "stageId", type: "relation", relation: { collectionName: "pipeline_stages" } },
    { name: "title", type: "text", required: true },
    { name: "valueCents", type: "number", aliases: ["dealValueCents"] },
    { name: "currency", type: "text" },
    { name: "closeDate", type: "date" },
    { name: "accountId", type: "relation", relation: { collectionName: "accounts" } },
    { name: "contactIds", type: "json" },
    { name: "ownerActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "probability", type: "number" },
    { name: "status", type: "select", options: ["open","won","lost"] },
    { name: "lostReason", type: "text" },
    { name: "properties", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "deals_company_idx", fields: ["companyId"] },
    { name: "deals_stage_idx", fields: ["stageId"] },
    { name: "deals_owner_idx", fields: ["ownerActorId"] },
    { name: "deals_status_idx", fields: ["status"] },
  ],
};
