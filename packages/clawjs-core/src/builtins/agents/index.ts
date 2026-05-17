import type { BuiltinFamilyDefinition } from "../_types.ts";

import {
  AGENTS,
  AGENT_ASSIGNMENTS,
  AGENT_EXECUTION_PROFILES,
  AGENT_RESOURCE_GRANTS,
  AGENT_MEMORY_POLICIES,
  AGENT_BUDGETS,
  AGENT_CONFIG_REVISIONS,
  AGENT_EVALUATIONS,
  AGENT_INCIDENTS,
  AGENT_BLUEPRINTS,
  AGENT_RUNS,
} from "./agent_v1_collections.ts";
import { AGENT_SESSIONS } from "./agent_sessions.ts";
import { AGENT_SESSION_ACTIVITIES } from "./agent_session_activities.ts";
import { AGENT_SESSION_PULL_REQUESTS } from "./agent_session_pull_requests.ts";
import { RUN_COSTS } from "./run_costs.ts";
import { TOOL_INVOCATIONS } from "./tool_invocations.ts";
import { AGENT_SKILLS } from "./agent_skills.ts";
import { EVALUATIONS } from "./evaluations.ts";
import { EVAL_DATASETS } from "./eval_datasets.ts";
import { EVAL_TEST_CASES } from "./eval_test_cases.ts";
import { FEEDBACK_LOOPS } from "./feedback_loops.ts";
import { POLICY_GATES } from "./policy_gates.ts";
import { MEMORY_BLOCKS } from "./memory_blocks.ts";
import { MEMORY_INDICES } from "./memory_indices.ts";
import { KNOWLEDGE_GRAPHS } from "./knowledge_graphs.ts";
import { KNOWLEDGE_GRAPH_RELATIONS } from "./knowledge_graph_relations.ts";
import { CODING_SANDBOXES } from "./coding_sandboxes.ts";

export const AGENTS_FAMILY: BuiltinFamilyDefinition = {
  name: "agents",
  displayName: "Agent Infrastructure",
  description: "Canonical Agents V1 definitions, assignments, grants, execution profiles, runs, sessions, skills, evaluations, incidents, policy gates and persistent memory.",
  collections: [
    AGENTS,
    AGENT_ASSIGNMENTS,
    AGENT_EXECUTION_PROFILES,
    AGENT_RESOURCE_GRANTS,
    AGENT_MEMORY_POLICIES,
    AGENT_BUDGETS,
    AGENT_CONFIG_REVISIONS,
    AGENT_EVALUATIONS,
    AGENT_INCIDENTS,
    AGENT_BLUEPRINTS,
    AGENT_RUNS,
    AGENT_SESSIONS,
    AGENT_SESSION_ACTIVITIES,
    AGENT_SESSION_PULL_REQUESTS,
    RUN_COSTS,
    TOOL_INVOCATIONS,
    AGENT_SKILLS,
    EVALUATIONS,
    EVAL_DATASETS,
    EVAL_TEST_CASES,
    FEEDBACK_LOOPS,
    POLICY_GATES,
    MEMORY_BLOCKS,
    MEMORY_INDICES,
    KNOWLEDGE_GRAPHS,
    KNOWLEDGE_GRAPH_RELATIONS,
    CODING_SANDBOXES,
  ],
};

export {
  AGENTS,
  AGENT_ASSIGNMENTS,
  AGENT_EXECUTION_PROFILES,
  AGENT_RESOURCE_GRANTS,
  AGENT_MEMORY_POLICIES,
  AGENT_BUDGETS,
  AGENT_CONFIG_REVISIONS,
  AGENT_EVALUATIONS,
  AGENT_INCIDENTS,
  AGENT_BLUEPRINTS,
  AGENT_RUNS,
  AGENT_SESSIONS,
  AGENT_SESSION_ACTIVITIES,
  AGENT_SESSION_PULL_REQUESTS,
  RUN_COSTS,
  TOOL_INVOCATIONS,
  AGENT_SKILLS,
  EVALUATIONS,
  EVAL_DATASETS,
  EVAL_TEST_CASES,
  FEEDBACK_LOOPS,
  POLICY_GATES,
  MEMORY_BLOCKS,
  MEMORY_INDICES,
  KNOWLEDGE_GRAPHS,
  KNOWLEDGE_GRAPH_RELATIONS,
  CODING_SANDBOXES,
};
