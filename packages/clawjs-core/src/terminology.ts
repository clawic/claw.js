export const CLAW_CANONICAL_TERMS = {
  runtimeAdapter: "runtime adapter",
  workspace: "workspace",
  agent: "agent",
  agentProfile: "agent profile",
  provider: "provider",
  model: "model",
  gateway: "gateway",
} as const;

export type ClawCanonicalTermKey = keyof typeof CLAW_CANONICAL_TERMS;
export type ClawCanonicalTerm = typeof CLAW_CANONICAL_TERMS[ClawCanonicalTermKey];

export const CLAW_CANONICAL_HIERARCHY = [
  "runtimeAdapter",
  "workspace",
  "agent",
  "agentProfile",
  "provider",
  "model",
  "gateway",
] as const satisfies readonly ClawCanonicalTermKey[];

export const CLAW_NON_SYNONYMS = {
  gateway: ["runtime adapter"],
  workspace: ["agent"],
  provider: ["model"],
} as const satisfies Partial<Record<ClawCanonicalTermKey, readonly ClawCanonicalTerm[]>>;
