import type { BuiltinFamilyDefinition } from "../_types.ts";

import { COMPLIANCE_CONTROLS } from "./compliance_controls.ts";
import { COMPLIANCE_OBLIGATIONS } from "./compliance_obligations.ts";
import { CONTROL_ASSESSMENTS } from "./control_assessments.ts";
import { COMPLIANCE_FINDINGS } from "./compliance_findings.ts";

export const COMPLIANCE_FAMILY: BuiltinFamilyDefinition = {
  name: "compliance",
  displayName: "Compliance / GRC",
  description: "Controls, obligations, assessments, findings, evidence, remediation, and gaps.",
  collections: [
    COMPLIANCE_CONTROLS,
    COMPLIANCE_OBLIGATIONS,
    CONTROL_ASSESSMENTS,
    COMPLIANCE_FINDINGS,
  ],
};

export { COMPLIANCE_CONTROLS, COMPLIANCE_OBLIGATIONS, CONTROL_ASSESSMENTS, COMPLIANCE_FINDINGS };
