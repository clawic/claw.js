import type { BuiltinFamilyDefinition } from "../_types.ts";

import { CASE_EVIDENCE } from "./case_evidence.ts";
import { LEGAL_CASES } from "./legal_cases.ts";
import { LEGAL_CLIENTS } from "./legal_clients.ts";

export const LEGAL_FAMILY: BuiltinFamilyDefinition = {
  name: "legal",
  displayName: "Legal",
  description: "Matters, cases, evidence, filings, deadlines, and legal documents.",
  collections: [LEGAL_CASES, LEGAL_CLIENTS, CASE_EVIDENCE],
};

export { CASE_EVIDENCE, LEGAL_CASES, LEGAL_CLIENTS };
