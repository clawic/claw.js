// Public surface of @clawjs/agents.
//
// The package is intentionally lean: the macOS app keeps the
// filesystem (`~/.claw/agents/<id>/`) as the source of truth, the
// daemon mirrors it through this store to surface agent identity over
// the bridge protocol, and the SQL projection lives in
// `@clawjs/database` (collections `company_agents`, `personalities`,
// `skill_collections`, `connections`, `integration_bindings`,
// `agent_audit_log`).

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
