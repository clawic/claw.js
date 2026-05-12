import type { RuleRecord, RuleScope } from "@clawjs/core";

export const BUILTIN_CLAWJS_RULE_SOURCE = "builtin:clawjs-agent-rules";
export const BUILTIN_CLAWJS_SCOPE_ID = "clawjs";

const BUILTIN_TIMESTAMP = "2026-04-27T00:00:00.000Z";

export const BUILTIN_CLAWJS_RULE_SCOPES: RuleScope[] = [{
  id: BUILTIN_CLAWJS_SCOPE_ID,
  kind: "user",
  name: "global",
  aliases: ["ClawJS", "claw", "clawjs", "default"],
  createdAt: BUILTIN_TIMESTAMP,
  updatedAt: BUILTIN_TIMESTAMP,
}];

function reference(ref: string, label: string): RuleRecord["references"][number] {
  return { kind: "doc", ref, label };
}

function rule(input: {
  id: string;
  title: string;
  content: string;
  priority?: number;
  key?: string;
  references?: RuleRecord["references"];
  applyWhen?: RuleRecord["applyWhen"];
  agentIds?: string[];
  channelIds?: string[];
}): RuleRecord {
  return {
    id: input.id,
    title: input.title,
    kind: "directive",
    status: "active",
    scopeId: BUILTIN_CLAWJS_SCOPE_ID,
    content: input.content,
    aliases: [],
    priority: input.priority ?? 100,
    key: input.key ?? input.id,
    references: input.references ?? [],
    ...(input.applyWhen ? { applyWhen: input.applyWhen } : {}),
    ...(input.agentIds ? { agentIds: input.agentIds } : {}),
    ...(input.channelIds ? { channelIds: input.channelIds } : {}),
    source: BUILTIN_CLAWJS_RULE_SOURCE,
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP,
    approvedAt: BUILTIN_TIMESTAMP,
  };
}

export const BUILTIN_CLAWJS_RULES: RuleRecord[] = [
  rule({
    id: "clawjs-operating-layer",
    title: "ClawJS operating layer",
    key: "clawjs-operating-layer",
    priority: 0,
    content: "Use ClawJS as the operating layer before ad hoc state: tasks for actionable work, notes for durable findings, workspace search/context before asking, and sessions for conversation state.",
    references: [reference("docs/agent-rules/workspace-loop.md", "Workspace loop")],
  }),
  rule({
    id: "clawjs-side-effect-safety",
    title: "Side-effect safety",
    key: "clawjs-side-effect-safety",
    priority: 1,
    content: "Before touching real services, production data, paid APIs, external sends, installs, auth, or destructive actions, isolate with local fixtures/dry-runs or get explicit user confirmation.",
    references: [reference("docs/agent-rules/commands.md", "Command safety")],
  }),
  rule({
    id: "clawjs-secrets-by-reference",
    title: "Secrets by reference",
    key: "clawjs-secrets",
    priority: 2,
    content: "Use secret references and brokered requests only; never request, print, store, or copy literal secret values.",
    references: [reference("docs/agent-rules/secrets.md", "Secrets")],
  }),
  rule({
    id: "clawjs-command-surface",
    title: "Prefer ClawJS commands",
    key: "clawjs-command-surface",
    priority: 3,
    content: "Prefer the SDK/CLI/Relay surface that owns the job; use `claw --json` for machine-readable local operations and check capability/status before assuming support.",
    references: [reference("docs/agent-rules/commands.md", "Command reference")],
  }),
  rule({
    id: "clawjs-telegram-codex",
    title: "Telegram Codex bridge",
    key: "clawjs-channel-telegram",
    priority: 10,
    content: "For Telegram/Codex, answer concisely, preserve channel session context, respect owner/reply policy, and use the bridge action block for outbound media/actions.",
    applyWhen: { channels: ["telegram"] },
    references: [reference("docs/agent-rules/channels.md", "Channels")],
  }),
  rule({
    id: "clawjs-workspace-productivity",
    title: "Workspace productivity",
    key: "clawjs-workspace-productivity",
    priority: 20,
    content: "For work planning, use areas/lists/tasks/goals/projects, blockers/decisions/artifacts, my-work/team-work, reminders/deadlines/events, and workspace-search instead of unmanaged notes.",
    applyWhen: { domains: ["workspace", "productivity", "tasks", "notes", "inbox", "events"] },
    references: [reference("docs/agent-rules/workspace-loop.md", "Workspace loop")],
  }),
  rule({
    id: "clawjs-runtime-auth",
    title: "Runtime and auth",
    key: "clawjs-runtime-auth",
    priority: 30,
    content: "For runtime/auth/model issues, inspect status first, use repair/setup flows before manual edits, and validate host-dependent fixes in the same runtime mode the user uses.",
    applyWhen: { domains: ["runtime", "auth", "models", "providers", "openclaw", "codex"] },
    references: [reference("docs/agent-rules/runtime.md", "Runtime")],
  }),
  rule({
    id: "clawjs-rules-skills-library",
    title: "Rules, skills, and library",
    key: "clawjs-rules-skills-library",
    priority: 40,
    content: "Use rules for always-on behavior, skills for deep task procedures, and library assets for reusable local instructions, bundles, and secret requirements.",
    applyWhen: { domains: ["rules", "soul", "skills", "library", "instructions"] },
    references: [reference("docs/agent-rules/rules-skills-library.md", "Rules, skills, library")],
  }),
  rule({
    id: "clawjs-sessions-inference",
    title: "Sessions and inference",
    key: "clawjs-sessions-inference",
    priority: 50,
    content: "Use sessions for persistent conversations, context blocks for compact structured context, documents for attachments, and direct inference only for bounded one-off text generation.",
    applyWhen: { domains: ["sessions", "inference", "chat", "documents"] },
    references: [reference("docs/agent-rules/commands.md", "Session commands")],
  }),
  rule({
    id: "clawjs-media-browser-relay",
    title: "Media, browser, and Relay",
    key: "clawjs-media-browser-relay",
    priority: 60,
    content: "Use typed image/audio/video/media facades for generated assets, browser/preview share for inspectable local UI, and Relay only for remote client or connector workflows.",
    applyWhen: { domains: ["media", "image", "audio", "video", "browser", "relay"] },
    references: [reference("docs/agent-rules/service-surfaces.md", "Service surfaces")],
  }),
  rule({
    id: "clawjs-service-surfaces",
    title: "Service surfaces",
    key: "clawjs-service-surfaces",
    priority: 70,
    content: "Use the dedicated service surface for time, notify, content, IoT, database, ERP, drive, execution-plane, and delegation-plane instead of inventing local schemas.",
    applyWhen: { domains: ["time", "notify", "content", "iot", "database", "erp", "drive", "execution", "delegation"] },
    references: [reference("docs/agent-rules/service-surfaces.md", "Service surfaces")],
  }),
];

export function isBuiltinClawJSRule(rule: Pick<RuleRecord, "source">): boolean {
  return rule.source === BUILTIN_CLAWJS_RULE_SOURCE;
}
