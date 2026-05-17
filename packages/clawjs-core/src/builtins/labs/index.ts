import type { BuiltinFamilyDefinition } from "../_types.ts";

import { SAMPLES } from "./samples.ts";
import { ASSAYS } from "./assays.ts";

export const LABS_FAMILY: BuiltinFamilyDefinition = {
  name: "labs",
  displayName: "Labs / LIMS",
  description: "Samples, assays, provenance, custody, measured results, and lab quality gaps.",
  collections: [
    SAMPLES,
    ASSAYS,
  ],
};

export { SAMPLES, ASSAYS };
