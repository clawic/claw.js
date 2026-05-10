import type { BuiltinFamilyDefinition } from "../_types.ts";

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
  description: "Agent sessions, run costs, tool invocations, skills, evaluations, policy gates and persistent memory.",
  collections: [
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

export { AGENT_SESSIONS, AGENT_SESSION_ACTIVITIES, AGENT_SESSION_PULL_REQUESTS, RUN_COSTS, TOOL_INVOCATIONS, AGENT_SKILLS, EVALUATIONS, EVAL_DATASETS, EVAL_TEST_CASES, FEEDBACK_LOOPS, POLICY_GATES, MEMORY_BLOCKS, MEMORY_INDICES, KNOWLEDGE_GRAPHS, KNOWLEDGE_GRAPH_RELATIONS, CODING_SANDBOXES };
