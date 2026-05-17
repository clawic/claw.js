import type { BuiltinFamilyDefinition } from "../_types.ts";

import { AGENCIES } from "./agencies.ts";
import { PERMITS } from "./permits.ts";
import { PUBLIC_CASES } from "./public_cases.ts";
import { PUBLIC_FILINGS } from "./public_filings.ts";

export const GOVERNMENT_FAMILY: BuiltinFamilyDefinition = {
  name: "government",
  displayName: "Government",
  description: "Agencies, public cases, permits, filings, evidence, and gaps for public-administration workflows.",
  collections: [
    AGENCIES,
    PUBLIC_CASES,
    PERMITS,
    PUBLIC_FILINGS,
  ],
};

export { AGENCIES, PERMITS, PUBLIC_CASES, PUBLIC_FILINGS };
