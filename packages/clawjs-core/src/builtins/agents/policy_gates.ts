import type { BuiltinCollectionDefinition } from "../_types.ts";

export const POLICY_GATES: BuiltinCollectionDefinition = {
  name: "policy_gates",
  displayName: "Policy Gates",
  family: "agents",
  aliases: ["policy","policies","policy_gate","policy_gates"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "actionType", type: "text" },
    { name: "condition", type: "json" },
    { name: "approvalRequired", type: "boolean" },
    { name: "approverRoleIds", type: "json" },
    { name: "enforced", type: "boolean" },
    { name: "description", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "policy_gates_company_idx", fields: ["companyId"] },
    { name: "policy_gates_action_idx", fields: ["actionType"] },
  ],
};
