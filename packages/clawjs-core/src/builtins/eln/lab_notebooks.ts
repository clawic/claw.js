import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LAB_NOTEBOOKS: BuiltinCollectionDefinition = {
  name: "lab_notebooks",
  displayName: "Lab Notebooks",
  family: "eln",
  aliases: ["lab-notebook", "lab-notebooks", "lab_notebook", "lab_notebooks", "eln-notebook", "eln-notebooks"],
  catalog: {
    purpose: "Electronic lab notebook center for study, experiment, ownership, entries, protocol runs, observations, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use studyId and biologyExperimentId to anchor the notebook without duplicating experiment records; entries, protocol runs, and observations carry the day-to-day ELN evidence.",
    notes: "This is the ELN notebook layer over research, biology, and labs, not a replacement for studies, biology experiments, samples, or assays.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "notebookName"] },
    { name: "studyId", type: "relation", relation: { collectionName: "studies" } },
    { name: "biologyExperimentId", type: "relation", relation: { collectionName: "biology_experiments" } },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "ownerEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "status", type: "select", options: ["draft", "active", "locked", "archived", "unknown"] },
    { name: "openedAt", type: "date" },
    { name: "closedAt", type: "date" },
    { name: "purpose", type: "markdown" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "lab_notebooks_title_idx", fields: ["title"] },
    { name: "lab_notebooks_study_idx", fields: ["studyId"] },
    { name: "lab_notebooks_experiment_idx", fields: ["biologyExperimentId"] },
    { name: "lab_notebooks_company_idx", fields: ["companyId"] },
    { name: "lab_notebooks_status_idx", fields: ["status"] },
  ],
};
