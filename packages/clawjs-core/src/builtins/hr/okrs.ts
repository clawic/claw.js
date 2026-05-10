import type { BuiltinCollectionDefinition } from "../_types.ts";

export const OKRS: BuiltinCollectionDefinition = {
  name: "okrs",
  displayName: "OKRs",
  family: "hr",
  aliases: ["okr","okrs"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "title", type: "text", required: true },
    { name: "level", type: "select", options: ["company","team","personal"] },
    { name: "ownerActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "teamId", type: "relation", relation: { collectionName: "teams" } },
    { name: "keyResults", type: "json" },
    { name: "cycle", type: "text" },
    { name: "cycleYear", type: "number" },
    { name: "progress", type: "number" },
    { name: "status", type: "select", options: ["draft","active","on_track","at_risk","off_track","achieved","missed","cancelled"] },
    { name: "cascadeFromOkrId", type: "relation", relation: { collectionName: "okrs" } },
    { name: "linkedGoalId", type: "relation", relation: { collectionName: "goals" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "okrs_company_idx", fields: ["companyId"] },
    { name: "okrs_cycle_idx", fields: ["cycle","cycleYear"] },
    { name: "okrs_status_idx", fields: ["status"] },
  ],
};
