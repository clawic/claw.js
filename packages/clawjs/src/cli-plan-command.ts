import path from "path";

import { semanticPlanSchema } from "@clawjs/core";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { joinedPositionals, parseCsvFlag, parseJsonFlag, readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";
import { readJsonFile } from "./cli-runtime-utils.ts";
import {
  buildFallbackSemanticPlan,
  createDelegationGraphForPlan,
  evaluatePlanPolicy,
  formatPlan,
  nowIso,
  planId,
  readAgentPlanState,
  statusFromDecision,
  writeAgentPlanState,
  type AgentPlanPolicyRule,
  type AgentPlanRecord,
} from "./cli-agent-plan.ts";

type CliContext = {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
};

const PLAN_SUBCOMMANDS = ["create", "list", "show", "run", "approve", "reject", "review", "complete", "fail", "cancel", "policy"] as const;
const PLAN_POLICY_SUBCOMMANDS = ["list", "add", "remove", "test"] as const;

export async function runPlanCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
  agentId: string;
}): Promise<number> {
  const { positionals, flags, argv, context, wantsJson, binName, workspaceRoot, agentId } = input;
  const [, command, subcommand] = positionals;
  const usageExit = writePlanUsageIfInvalid({ command, subcommand, context, wantsJson, binName });
  if (usageExit !== null) return usageExit;
  const state = readAgentPlanState(workspaceRoot);
  const save = () => writeAgentPlanState(workspaceRoot, state);
  const findPlan = (id: string | undefined): AgentPlanRecord => {
    const plan = state.plans.find((candidate) => candidate.id === id);
    if (!plan) throw new CliHandledError("not_found", `Plan not found: ${id ?? ""}`, CLI_EXIT_FAILURE);
    return plan;
  };

  if (command === "create") {
    const objective = joinedPositionals(positionals, 2) ?? flags.objective ?? flags.title;
    if (!objective) {
      context.stderr.write(`Usage: ${binName} plan create "Objective" [--agent ID] [--tags a,b] [--from-file plan.json]\n`);
      return CLI_EXIT_USAGE;
    }
    const creatorAgentId = flags.agent ?? flags["agent-id"] ?? agentId;
    const tags = parseCsvFlag(flags.tags);
    const fromFile = flags["from-file"];
    const parsedFile = fromFile ? readJsonFile<unknown>(path.resolve(context.cwd, fromFile), "--from-file") : null;
    const semanticPlanInput = (
      parsedFile && typeof parsedFile === "object" && !Array.isArray(parsedFile) && "semanticPlan" in parsedFile
        ? (parsedFile as { semanticPlan: unknown }).semanticPlan
        : parsedFile ?? buildFallbackSemanticPlan(objective, creatorAgentId, tags)
    );
    const parsedSemanticPlan = semanticPlanSchema.safeParse(semanticPlanInput);
    if (!parsedSemanticPlan.success) {
      throw new CliHandledError("invalid_semantic_plan", `--from-file must contain a valid semantic plan: ${parsedSemanticPlan.error.issues.map((issue) => issue.path.join(".") || issue.code).join(", ")}`, CLI_EXIT_USAGE, {
        location: "cli.plan.from_file",
        suggestion: "Pass a JSON semantic plan with schemaVersion 1 and a valid intent object.",
        safeNextStep: "Fix the plan file and rerun plan create with --from-file.",
      });
    }
    const semanticPlan = parsedSemanticPlan.data;
    const timestamp = nowIso();
    const policy = evaluatePlanPolicy(state.policies, semanticPlan, { creatorAgentId, tags });
    const plan: AgentPlanRecord = {
      schemaVersion: 1,
      id: flags.id ?? planId(),
      objective,
      status: statusFromDecision(policy.decision),
      creatorAgentId,
      ...(flags.executor ? { executorAgentId: flags.executor } : {}),
      ...(policy.approverAgentId ? { approverAgentId: policy.approverAgentId } : {}),
      ...(policy.reviewerAgentId ? { reviewerAgentId: policy.reviewerAgentId } : {}),
      tags,
      semanticPlan,
      policyDecision: policy.decision,
      ...(policy.ruleId ? { policyRuleId: policy.ruleId } : {}),
      policyReason: policy.reason,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.plans.unshift(plan);
    save();
    if (policy.decision === "auto_run" && !readBooleanFlag(argv, flags, "no-auto-run", false)) {
      try {
        plan.delegationGraphId = await createDelegationGraphForPlan(plan, flags);
        plan.status = "running";
        plan.updatedAt = nowIso();
        save();
      } catch (error) {
        plan.lastRunError = error instanceof Error ? error.message : String(error);
        plan.updatedAt = nowIso();
        save();
      }
    }
    if (wantsJson) writePlanJson(context.stdout, { plan }, command);
    else context.stdout.write(`${plan.id} ${plan.status}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "list") {
    const filtered = state.plans
      .filter((plan) => !flags.status || plan.status === flags.status)
      .filter((plan) => !flags.agent || plan.creatorAgentId === flags.agent || plan.executorAgentId === flags.agent || plan.reviewerAgentId === flags.agent)
      .filter((plan) => !flags.tags || parseCsvFlag(flags.tags).every((tag) => plan.tags.includes(tag)));
    if (wantsJson) writePlanJson(context.stdout, { plans: filtered }, command);
    else context.stdout.write(`${filtered.map((plan) => `${plan.id}\t${plan.status}\t${plan.objective}`).join("\n")}${filtered.length ? "\n" : ""}`);
    return CLI_EXIT_OK;
  }

  if (command === "show") {
    const plan = findPlan(subcommand ?? flags.id);
    if (wantsJson) writePlanJson(context.stdout, { plan }, command);
    else context.stdout.write(`${formatPlan(plan)}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "approve" || command === "reject") {
    const plan = findPlan(subcommand ?? flags.id);
    plan.status = command === "approve" ? "approved" : "rejected";
    plan.policyDecision = command === "approve" ? "auto_run" : "block";
    plan.decisionReason = flags.reason ?? (command === "approve" ? "Approved manually." : "Rejected manually.");
    plan.updatedAt = nowIso();
    save();
    if (wantsJson) writePlanJson(context.stdout, { plan }, command);
    else context.stdout.write(`${plan.id} ${plan.status}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "review") {
    const plan = findPlan(subcommand ?? flags.id);
    const reviewerAgentId = flags.agent ?? plan.reviewerAgentId;
    if (!reviewerAgentId) {
      context.stderr.write(`Usage: ${binName} plan review <planId> --agent AGENT [--decision approve|reject]\n`);
      return CLI_EXIT_USAGE;
    }
    const decision = parsePlanReviewDecision(flags.decision);
    plan.reviewerAgentId = reviewerAgentId;
    plan.reviewReason = flags.reason ?? `${reviewerAgentId} ${decision}d this plan.`;
    plan.status = decision === "approve" ? "approved" : "rejected";
    plan.policyDecision = decision === "approve" ? "auto_run" : "block";
    plan.updatedAt = nowIso();
    save();
    if (wantsJson) writePlanJson(context.stdout, { plan, review: { decision, reason: plan.reviewReason } }, command);
    else context.stdout.write(`${plan.id} ${plan.status}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "run") {
    const plan = findPlan(subcommand ?? flags.id);
    if (plan.status !== "approved" && plan.status !== "running") {
      throw new CliHandledError("plan_not_authorized", `Plan ${plan.id} is ${plan.status}; approve or review it before running.`, CLI_EXIT_FAILURE);
    }
    if (!plan.delegationGraphId) {
      plan.delegationGraphId = await createDelegationGraphForPlan(plan, flags);
    }
    plan.status = "running";
    plan.updatedAt = nowIso();
    save();
    if (wantsJson) writePlanJson(context.stdout, { plan }, command);
    else context.stdout.write(`${plan.id} running ${plan.delegationGraphId}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "complete" || command === "fail" || command === "cancel") {
    const plan = findPlan(subcommand ?? flags.id);
    plan.status = command === "complete" ? "succeeded" : command === "fail" ? "failed" : "cancelled";
    plan.completedAt = nowIso();
    plan.updatedAt = plan.completedAt;
    plan.decisionReason = flags.reason ?? plan.decisionReason;
    save();
    if (wantsJson) writePlanJson(context.stdout, { plan }, command);
    else context.stdout.write(`${plan.id} ${plan.status}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "policy" && subcommand === "list") {
    if (wantsJson) writePlanJson(context.stdout, { policies: state.policies }, "policy.list");
    else context.stdout.write(`${state.policies.map((policy) => `${policy.id}\t${policy.then.decision}`).join("\n")}${state.policies.length ? "\n" : ""}`);
    return CLI_EXIT_OK;
  }

  if (command === "policy" && subcommand === "add") {
    const raw = flags["from-file"]
      ? readJsonFile<unknown>(path.resolve(context.cwd, flags["from-file"]), "--from-file")
      : {
          id: flags.id,
          when: parseJsonFlag<Record<string, unknown>>(flags["when-json"], "--when-json"),
          then: parseJsonFlag<AgentPlanPolicyRule["then"]>(flags["then-json"], "--then-json"),
        };
    const rule = raw as AgentPlanPolicyRule;
    if (!rule.id || !rule.when || !rule.then?.decision) {
      throw new CliHandledError("usage_error", "Policy requires id, when, and then.decision.", CLI_EXIT_USAGE);
    }
    state.policies = [rule, ...state.policies.filter((policy) => policy.id !== rule.id)];
    save();
    if (wantsJson) writePlanJson(context.stdout, { policy: rule }, "policy.add");
    else context.stdout.write(`${rule.id}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "policy" && subcommand === "remove") {
    const id = positionals[3] ?? flags.id;
    state.policies = state.policies.filter((policy) => policy.id !== id);
    save();
    if (wantsJson) writePlanJson(context.stdout, { removed: true, id }, "policy.remove");
    else context.stdout.write(`${id}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "policy" && subcommand === "test") {
    const plan = findPlan(positionals[3] ?? flags.id);
    const decision = evaluatePlanPolicy(state.policies, plan.semanticPlan, { creatorAgentId: plan.creatorAgentId, tags: plan.tags });
    if (wantsJson) writePlanJson(context.stdout, decision, "policy.test");
    else context.stdout.write(`${decision.decision}: ${decision.reason}\n`);
    return CLI_EXIT_OK;
  }

  context.stderr.write(`Usage: ${binName} plan create|list|show|run|approve|reject|review|complete|fail|cancel|policy\n`);
  return CLI_EXIT_USAGE;
}

function writePlanUsageIfInvalid(input: {
  command: string | undefined;
  subcommand: string | undefined;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): number | null {
  const { command, subcommand, context, wantsJson, binName } = input;
  const isValidTopLevel = command !== undefined && (PLAN_SUBCOMMANDS as readonly string[]).includes(command);
  const isValidPolicySubcommand = command !== "policy"
    || (subcommand !== undefined && (PLAN_POLICY_SUBCOMMANDS as readonly string[]).includes(subcommand));
  if (isValidTopLevel && isValidPolicySubcommand) return null;
  if (wantsJson) {
    throw new CliHandledError(
      "unknown_plan_subcommand",
      command ? `Unknown plan subcommand: ${[command, subcommand].filter(Boolean).join(" ")}.` : "Missing plan subcommand.",
      CLI_EXIT_USAGE,
      {
        location: "cli.plan.subcommand",
        suggestion: "Use one of the registered plan subcommands.",
        safeNextStep: `Run ${binName} plan list --json to inspect plans, or ${binName} help plan --json for the plan command surface.`,
        details: {
          received: command ? [command, subcommand].filter(Boolean).join(" ") : null,
          validSubcommands: [...PLAN_SUBCOMMANDS],
        },
      },
    );
  }
  context.stderr.write(`Usage: ${binName} plan create|list|show|run|approve|reject|review|complete|fail|cancel|policy\n`);
  return CLI_EXIT_USAGE;
}

function parsePlanReviewDecision(value: string | undefined): "approve" | "reject" {
  if (value === undefined || value === "approve") return "approve";
  if (value === "reject") return "reject";
  throw new CliHandledError("invalid_plan_review_decision", "--decision must be approve or reject.", CLI_EXIT_USAGE, {
    location: "cli.plan.review.decision",
    details: { flag: "--decision", value },
  });
}

function writePlanJson(stream: NodeJS.WritableStream, data: unknown, subcommand: string | undefined): void {
  writeCommandJsonOk(stream, "plan", data, subcommand ? { subcommand } : {});
}
