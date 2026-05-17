import type { BuiltinFamilyDefinition } from "../_types.ts";

import { ADVERSE_EVENTS } from "./adverse_events.ts";
import { BATCH_RECORDS } from "./batch_records.ts";
import { DRUG_PRODUCTS } from "./drug_products.ts";
import { LOT_RELEASES } from "./lot_releases.ts";

export const PHARMA_FAMILY: BuiltinFamilyDefinition = {
  name: "pharma",
  displayName: "Pharma",
  description: "Drug products, batch records, lot releases, adverse events, evidence, and gaps for regulated pharma workflows.",
  collections: [
    DRUG_PRODUCTS,
    BATCH_RECORDS,
    LOT_RELEASES,
    ADVERSE_EVENTS,
  ],
};

export { ADVERSE_EVENTS, BATCH_RECORDS, DRUG_PRODUCTS, LOT_RELEASES };
