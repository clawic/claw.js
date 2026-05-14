// Public schemas exported by @clawjs/agents. They mirror the Wire types
// the macOS app uses (`WireAgent`, `WirePersonality`, ...) so the
// framework, the daemon bridge and the client all agree on the on-disk
// shape of an agent record. Every field that is not user-facing-required
// carries an explicit default in `defaultAgent` so partial records on
// disk hydrate cleanly.

export type AgentRuntimeKind =
  | "codex"
  | "openclaude"
  | "hermes"
  | "claw"
  | "demo";

export type AgentAutonomyLevel =
  | "observe"
  | "suggest"
  | "act_limited"
  | "act_full";

export type AgentAvatarKind = "logoTint" | "customImage";

export interface AgentAvatar {
  kind: AgentAvatarKind;
  tintHex: string;
  imageRelativePath?: string;
}

export interface AgentAutonomyOverride {
  action: string;
  level: AgentAutonomyLevel;
}

export type AgentBindingDirection = "inbound" | "outbound" | "both";

export interface AgentIntegrationBinding {
  id: string;
  connectionId: string;
  channelRef: string;
  direction: AgentBindingDirection;
  label?: string;
}

export interface AgentDelegation {
  reportsTo?: string;
  allowedSubagents: string[];
  scopeInherits: boolean;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  runtime: AgentRuntimeKind;
  model: string;
  avatar: AgentAvatar;

  instructionsFreeText: string;

  personalityIds: string[];
  skillAllowlist: string[];
  skillCollectionIds: string[];
  secretAllowlist: string[];
  secretTags: string[];
  projectIds: string[];
  integrationBindings: AgentIntegrationBinding[];

  autonomyLevel: AgentAutonomyLevel;
  autonomyOverrides: AgentAutonomyOverride[];
  delegation: AgentDelegation;

  createdAt: string;
  updatedAt: string;
  isBuiltin: boolean;
}

export interface Personality {
  id: string;
  name: string;
  description: string;
  promptMarkdown: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SkillCollection {
  id: string;
  name: string;
  description: string;
  includedTags: string[];
  createdAt: string;
  updatedAt: string;
}

export type ConnectionService =
  | "telegram"
  | "slack"
  | "discord"
  | "email"
  | "sms"
  | "webhook"
  | "custom";

export interface Connection {
  id: string;
  service: ConnectionService;
  label: string;
  scopes: string[];
  /** Opaque reference to a secret in the canonical Secrets vault. */
  secretRef?: string;
  lastSyncAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentAuditEntry {
  id: string;
  timestamp: string;
  actorAgentId: string;
  subjectAgentId?: string;
  action: string;
  result: string;
  note?: string;
}

export const DEFAULT_CODEX_AGENT_ID = "agent.default.codex";

export function defaultAgent(partial: Partial<Agent> & { id: string; name: string }): Agent {
  const now = new Date().toISOString();
  return {
    id: partial.id,
    name: partial.name,
    role: partial.role ?? "",
    runtime: partial.runtime ?? "codex",
    model: partial.model ?? "gpt-5.1",
    avatar: partial.avatar ?? { kind: "logoTint", tintHex: "#7C9CFF" },
    instructionsFreeText: partial.instructionsFreeText ?? "",
    personalityIds: partial.personalityIds ?? [],
    skillAllowlist: partial.skillAllowlist ?? [],
    skillCollectionIds: partial.skillCollectionIds ?? [],
    secretAllowlist: partial.secretAllowlist ?? [],
    secretTags: partial.secretTags ?? [],
    projectIds: partial.projectIds ?? [],
    integrationBindings: partial.integrationBindings ?? [],
    autonomyLevel: partial.autonomyLevel ?? "act_limited",
    autonomyOverrides: partial.autonomyOverrides ?? [],
    delegation: partial.delegation ?? { allowedSubagents: [], scopeInherits: false },
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    isBuiltin: partial.isBuiltin ?? false,
  };
}
