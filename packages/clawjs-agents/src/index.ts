// Public surface of @clawjs/agents.
//
// The package is intentionally lean: the macOS app keeps the
// filesystem (`~/.claw/agents/<id>/`) as the source of truth, the
// daemon mirrors it through this store to surface agent identity over
// the bridge protocol, and the SQL projection lives in
// `@clawjs/database` (collections `agents`, `agent_assignments`,
// `agent_resource_grants`, `agent_execution_profiles`, `personalities`,
// `skill_collections`, `connections`, `integration_bindings`,
// `agent_audit_log`).
// TODO(instructions): when this package owns a tool-call dispatch path with an
// existing transcript/event channel, evaluate pre-tool-call and post-tool-call
// instruction triggers there. Do not invent a channel in this storage facade.

export * from "./schemas.js";
export * from "./store.js";
export {
  emitSimpleYaml,
  parseSimpleYaml,
  yamlBool,
  yamlInt,
  yamlString,
  yamlStringArray,
} from "./yaml.js";
