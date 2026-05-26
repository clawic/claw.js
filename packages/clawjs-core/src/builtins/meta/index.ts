import type { BuiltinFamilyDefinition } from "../_types.ts";

import { INSTRUCTIONS } from "./instructions.ts";

export const META_FAMILY: BuiltinFamilyDefinition = {
  name: "meta",
  displayName: "CLI Self-Governance",
  description:
    "System-level collections that hold the CLI's own operational metadata: instruction overrides, agent-proposed rules, and self-governance state.",
  collections: [INSTRUCTIONS],
};

export { INSTRUCTIONS };
