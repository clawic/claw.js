import type { BuiltinFamilyDefinition } from "../_types.ts";

import { EXPERIMENT_OBSERVATIONS } from "./experiment_observations.ts";
import { LAB_NOTEBOOKS } from "./lab_notebooks.ts";
import { NOTEBOOK_ENTRIES } from "./notebook_entries.ts";
import { PROTOCOL_RUNS } from "./protocol_runs.ts";

export const ELN_FAMILY: BuiltinFamilyDefinition = {
  name: "eln",
  displayName: "Electronic Lab Notebook / ELN",
  description: "Lab notebooks, authored entries, protocol runs, experiment observations, evidence, and gaps over research/biology/labs records.",
  collections: [
    LAB_NOTEBOOKS,
    NOTEBOOK_ENTRIES,
    PROTOCOL_RUNS,
    EXPERIMENT_OBSERVATIONS,
  ],
};

export { EXPERIMENT_OBSERVATIONS, LAB_NOTEBOOKS, NOTEBOOK_ENTRIES, PROTOCOL_RUNS };
