import type { BuiltinFamilyDefinition } from "../_types.ts";

import { PRODUCT_BOMS } from "./product_boms.ts";
import { PRODUCT_REQUIREMENTS } from "./product_requirements.ts";
import { PRODUCT_REVISIONS } from "./product_revisions.ts";
import { PRODUCT_SPECS } from "./product_specs.ts";

export const PRODUCT_FAMILY: BuiltinFamilyDefinition = {
  name: "product",
  displayName: "Product / PIM / PLM",
  description: "Product specifications, revisions, requirements, BOMs, evidence, and gaps for lifecycle management.",
  collections: [
    PRODUCT_SPECS,
    PRODUCT_REVISIONS,
    PRODUCT_REQUIREMENTS,
    PRODUCT_BOMS,
  ],
};

export { PRODUCT_BOMS, PRODUCT_REQUIREMENTS, PRODUCT_REVISIONS, PRODUCT_SPECS };
