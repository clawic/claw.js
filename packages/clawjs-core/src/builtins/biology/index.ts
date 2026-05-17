import type { BuiltinFamilyDefinition } from "../_types.ts";

import { ORGANISMS } from "./organisms.ts";
import { BIOLOGY_EXPERIMENTS } from "./biology_experiments.ts";

export const BIOLOGY_FAMILY: BuiltinFamilyDefinition = {
  name: "biology",
  displayName: "Biology",
  description: "Biological organisms/entities, experiments, observations, evidence, and ELN-ready experiment records.",
  collections: [
    ORGANISMS,
    BIOLOGY_EXPERIMENTS,
  ],
};

export { ORGANISMS, BIOLOGY_EXPERIMENTS };
