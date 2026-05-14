import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { resolveClawPersistentSurfacePath, semanticPlanSchema } from "@clawjs/core";
import type { SemanticPlan } from "@clawjs/core";

export type AgentPlanStatus = "draft" | "pending" | "approved" | "rejected" | "blocked" | "running" | "succeeded" | "failed" | "cancelled";
export type AgentPlanDecision = "auto_run" | "require_approval" | "assign_reviewer" | "block" | "pending";

export interface AgentPlanPolicyRule {
  id: string;
  when: Record<string, unknown>;
  then: {
    decision: AgentPlanDecision;
    approver?: "human_owner" | string;
    reviewerAgentId?: string;
    reason?: string;
  };
}

export interface AgentPlanRecord {
  schemaVersion: 1;
  id: string;
  objective: string;
  status: AgentPlanStatus;
  creatorAgentId: string;
  executorAgentId?: string;
  approverAgentId?: string;
  reviewerAgentId?: string;
  tags: string[];
  semanticPlan: SemanticPlan;
  policyDecision: AgentPlanDecision;
  policyRuleId?: string;
  policyReason: string;
  delegationGraphId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  decisionReason?: string;
  reviewReason?: string;
  lastRunError?: string;
}

export interface AgentPlanState {
  schemaVersion: 1;
  plans: AgentPlanRecord[];
  policies: AgentPlanPolicyRule[];
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function planStatePath(workspaceRoot: string): string {
  return resolveClawPersistentSurfacePath("claw.workspace.data", workspaceRoot, "agent-plans.json");
}

export function readAgentPlanState(workspaceRoot: string): AgentPlanState {
  const filePath = planStatePath(workspaceRoot);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<AgentPlanState>;
    return {
      schemaVersion: 1,
      plans: Array.isArray(parsed.plans) ? parsed.plans as AgentPlanRecord[] : [],
      policies: Array.isArray(parsed.policies) ? parsed.policies as AgentPlanPolicyRule[] : [],
    };
  } catch {
    return { schemaVersion: 1, plans: [], policies: [] };
  }
}

export function writeAgentPlanState(workspaceRoot: string, state: AgentPlanState): void {
  const filePath = planStatePath(workspaceRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function planId(): string {
  return `plan_${randomBytes(8).toString("hex")}`;
}

export function riskRank(risk: string | undefined): number {
  if (risk === "high") return 3;
  if (risk === "medium") return 2;
  if (risk === "low") return 1;
  return 0;
}

export function maxSemanticPlanRisk(plan: SemanticPlan): "low" | "medium" | "high" {
  const risks = [
    ...plan.actions.map((action) => action.risk),
    ...plan.effects.map((effect) => effect.risk),
    ...plan.permissions.map((permission) => permission.risk),
  ];
  if (risks.some((risk) => risk === "high")) return "high";
  if (risks.some((risk) => risk === "medium")) return "medium";
  return "low";
}

export function planRequiresHumanApproval(plan: SemanticPlan): boolean {
  return plan.actions.some((action) => action.requiresHumanApproval)
    || plan.permissions.some((permission) => permission.requiresHumanApproval);
}

export function conditionValues(plan: SemanticPlan, key: string, record: Pick<AgentPlanRecord, "creatorAgentId" | "tags">): string[] {
  if (key === "actions.type") return plan.actions.map((action) => action.type);
  if (key === "effects.kind") return plan.effects.map((effect) => effect.kind);
  if (key === "permissions.capability") return plan.permissions.map((permission) => permission.capability);
  if (key === "objects.kind") return plan.objects.map((object) => object.kind);
  if (key === "agent") return [record.creatorAgentId];
  if (key === "tags") return record.tags;
  return [];
}

export function planMatchesPolicy(rule: AgentPlanPolicyRule, plan: SemanticPlan, record: Pick<AgentPlanRecord, "creatorAgentId" | "tags">): boolean {
  for (const [key, rawExpected] of Object.entries(rule.when)) {
    if (key === "maxRisk") {
      if (riskRank(maxSemanticPlanRisk(plan)) > riskRank(String(rawExpected))) return false;
      continue;
    }
    if (key === "requiresHumanApproval") {
      if (planRequiresHumanApproval(plan) !== Boolean(rawExpected)) return false;
      continue;
    }
    const expected = Array.isArray(rawExpected) ? rawExpected.map(String) : [String(rawExpected)];
    const values = conditionValues(plan, key, record);
    if (!expected.some((value) => values.includes(value))) return false;
  }
  return true;
}

export function defaultPlanDecision(plan: SemanticPlan): { decision: AgentPlanDecision; reason: string; approver?: string } {
  const maxRisk = maxSemanticPlanRisk(plan);
  if (maxRisk === "high" || planRequiresHumanApproval(plan)) {
    return { decision: "require_approval", approver: "human_owner", reason: "High risk or explicit approval requirement." };
  }
  if (maxRisk === "medium") {
    return { decision: "pending", reason: "Medium risk plans require review by default." };
  }
  return { decision: "auto_run", reason: "Low risk plan with no explicit approval requirement." };
}

export function evaluatePlanPolicy(
  policies: AgentPlanPolicyRule[],
  plan: SemanticPlan,
  record: Pick<AgentPlanRecord, "creatorAgentId" | "tags">,
): { decision: AgentPlanDecision; reason: string; ruleId?: string; approverAgentId?: string; reviewerAgentId?: string } {
  const matched = policies.find((rule) => planMatchesPolicy(rule, plan, record));
  if (matched) {
    const approver = matched.then.approver === "human_owner" ? undefined : matched.then.approver;
    return {
      decision: matched.then.decision,
      reason: matched.then.reason ?? `Matched policy ${matched.id}.`,
      ruleId: matched.id,
      approverAgentId: matched.then.decision === "require_approval" ? approver : undefined,
      reviewerAgentId: matched.then.reviewerAgentId ?? (matched.then.decision === "assign_reviewer" ? approver : undefined),
    };
  }
  const fallback = defaultPlanDecision(plan);
  return { decision: fallback.decision, reason: fallback.reason, approverAgentId: fallback.approver === "human_owner" ? undefined : fallback.approver };
}

export function statusFromDecision(decision: AgentPlanDecision): AgentPlanStatus {
  if (decision === "auto_run") return "approved";
  if (decision === "block") return "blocked";
  return "pending";
}

export function buildFallbackSemanticPlan(objective: string, creatorAgentId: string, tags: string[]): SemanticPlan {
  const publishLike = /\b(deploy|publish|push|release|ship)\b/i.test(objective);
  const designLike = tags.includes("design") || tags.includes("web") || /\b(ui|design|frontend|home|page|screen)\b/i.test(objective);
  const risk = publishLike ? "high" : designLike ? "medium" : "low";
  return semanticPlanSchema.parse({
    schemaVersion: 1,
    intent: {
      id: "intent-main",
      summary: objective,
      requestedBy: creatorAgentId,
      constraints: publishLike ? ["publishing requires approval"] : [],
    },
    objects: [
      { id: "workspace", kind: "repository", label: "Current workspace" },
      { id: "work", kind: "task", label: objective },
    ],
    actions: [
      {
        id: "inspect",
        type: "inspect",
        label: "Inspect relevant context",
        objectIds: ["workspace"],
        effectIds: ["read-workspace"],
        permissionIds: ["workspace-read"],
        risk: "low",
      },
      {
        id: "propose",
        type: "propose",
        label: "Prepare proposed work",
        objectIds: ["work"],
        effectIds: ["prepare-work"],
        permissionIds: ["workspace-write"],
        risk,
        requiresHumanApproval: publishLike,
      },
    ],
    effects: [
      {
        id: "read-workspace",
        kind: "read",
        description: "Read local workspace context",
        objectIds: ["workspace"],
        reversible: true,
        risk: "low",
      },
      {
        id: "prepare-work",
        kind: publishLike ? "publication" : "write",
        description: publishLike ? "May publish or deploy externally" : "May prepare local changes",
        objectIds: ["work"],
        reversible: !publishLike,
        risk,
      },
    ],
    permissions: [
      {
        id: "workspace-read",
        capability: "workspace.read",
        scope: "current workspace",
        risk: "low",
      },
      {
        id: "workspace-write",
        capability: publishLike ? "workspace.publish" : "workspace.write",
        scope: "current workspace",
        risk,
        requiresHumanApproval: publishLike,
      },
    ],
    receipts: [],
    provenance: ["claw plan create"],
  });
}

export function formatPlan(plan: AgentPlanRecord): string {
  return [
    `${plan.id} ${plan.status}`,
    `objective: ${plan.objective}`,
    `agent: ${plan.creatorAgentId}`,
    `decision: ${plan.policyDecision} (${plan.policyReason})`,
    `risk: ${maxSemanticPlanRisk(plan.semanticPlan)}`,
    "actions:",
    ...plan.semanticPlan.actions.map((action) => `- ${action.type}: ${action.label} [${action.risk}${action.requiresHumanApproval ? ", approval" : ""}]`),
    "effects:",
    ...plan.semanticPlan.effects.map((effect) => `- ${effect.kind}: ${effect.description} [${effect.risk}]`),
    "permissions:",
    ...plan.semanticPlan.permissions.map((permission) => `- ${permission.capability} (${permission.scope}) [${permission.risk}${permission.requiresHumanApproval ? ", approval" : ""}]`),
    ...(plan.delegationGraphId ? [`delegation: ${plan.delegationGraphId}`] : []),
  ].join("\n");
}

export async function createDelegationGraphForPlan(plan: AgentPlanRecord, flags: Record<string, string>): Promise<string> {
  const url = (flags["delegation-url"] ?? process.env.DELEGATION_PLANE_URL ?? "http://127.0.0.1:4520").replace(/\/$/, "");
  const response = await fetch(`${url}/v1/graphs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objective: plan.objective,
      creator: plan.creatorAgentId,
      semanticPlan: plan.semanticPlan,
      root: {
        agentType: plan.executorAgentId ?? plan.creatorAgentId,
        adapter: flags.adapter ?? "deterministic",
      },
    }),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) as { graph?: { id?: string }; error?: string } : {};
  if (!response.ok || !parsed.graph?.id) throw new Error(parsed.error ?? text ?? `HTTP ${response.status}`);
  return parsed.graph.id;
}
