import type {
  DistillerSynthesizer,
  NudgeSynthesizer,
  UserModelSynthesizer,
  UserModelSynthesizerAction,
} from "../types.ts";

function slugify(text: string, fallback: string): string {
  const base = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 64);
  return base || fallback;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export const heuristicDistillerSynthesizer: DistillerSynthesizer = async ({ session, messages }) => {
  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  if (userMessages.length === 0 || assistantMessages.length === 0) return null;

  const firstUser = userMessages[0]?.contentText ?? "";
  const lastAssistant = assistantMessages[assistantMessages.length - 1]?.contentText ?? "";
  const toolMessages = messages.filter((m) => m.role === "tool" || (m.toolCalls && m.toolCalls.length > 0));

  const seed = (firstUser.split(/\n|\.|\?/)[0] ?? "").trim() || session.title;
  const slug = `distilled-${slugify(seed, `session-${session.id.slice(0, 8)}`)}`;
  const name = `Distilled: ${truncate(seed, 80)}`;
  const description = truncate(firstUser, 240);

  const stepBullets = toolMessages
    .map((m, idx) => `  ${idx + 1}. ${truncate(m.contentText.replace(/\s+/g, " "), 200)}`)
    .join("\n");

  const body = [
    `# ${name}`,
    "",
    "## Context",
    truncate(firstUser, 800),
    "",
    "## Steps observed",
    stepBullets || "  (no tool messages detected; capture procedural insight manually)",
    "",
    "## Outcome",
    truncate(lastAssistant, 800),
    "",
    "## When to use",
    "Replay this procedure when a similar request is detected. Distilled by heuristic synthesizer; refine before promoting.",
  ].join("\n");

  const messageCount = messages.length;
  const toolCount = toolMessages.length;
  const confidence = Math.min(0.85, 0.3 + Math.min(toolCount, 8) * 0.05 + (messageCount > 6 ? 0.15 : 0));

  return {
    slug,
    name,
    description,
    body,
    confidence: Number(confidence.toFixed(2)),
    tags: ["distilled"],
  };
};

const NUDGE_PATTERNS: Array<{ regex: RegExp; classification: string }> = [
  { regex: /^\s*(i\s+prefer|i\s+like|i\s+want|i\s+need)\b/i, classification: "preference" },
  { regex: /^\s*(don'?t|do\s+not|never|avoid)\b/i, classification: "constraint" },
  { regex: /^\s*(always|whenever|every\s+time)\b/i, classification: "rule" },
  { regex: /\b(remember|save\s+this|note\s+this|important)\b/i, classification: "explicit_save" },
  { regex: /\b(my\s+project|i'?m\s+working\s+on|currently\s+building)\b/i, classification: "project_context" },
  { regex: /\b(i\s+know|experienced\s+with|expert\s+in|i'?m\s+a\b)\b/i, classification: "expertise" },
];

export const heuristicNudgeSynthesizer: NudgeSynthesizer = async ({ messages }) => {
  const items: Awaited<ReturnType<NudgeSynthesizer>> = [];
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = message.contentText.trim();
    if (!text) continue;
    for (const pattern of NUDGE_PATTERNS) {
      if (pattern.regex.test(text)) {
        items.push({
          triggerMessageId: message.id,
          observation: truncate(text, 320),
          classification: pattern.classification,
        });
        break;
      }
    }
  }
  return items;
};

const USER_MODEL_PATTERNS: Array<{
  regex: RegExp;
  section: Extract<UserModelSynthesizerAction, { kind: "upsert" }>["section"];
  topicGroup?: number;
}> = [
  { regex: /\bi\s+prefer\s+([^.,;\n]{3,200})/i, section: "preference", topicGroup: 1 },
  { regex: /\bi\s+like\s+([^.,;\n]{3,200})/i, section: "preference", topicGroup: 1 },
  { regex: /\b(?:don'?t|do\s+not|never)\s+([^.,;\n]{3,200})/i, section: "edge_case", topicGroup: 1 },
  { regex: /\balways\s+([^.,;\n]{3,200})/i, section: "preference", topicGroup: 1 },
  { regex: /\b(?:i'?m|i\s+am)\s+working\s+on\s+([^.,;\n]{3,200})/i, section: "project", topicGroup: 1 },
  { regex: /\b(?:currently\s+building|my\s+project\s+is)\s+([^.,;\n]{3,200})/i, section: "project", topicGroup: 1 },
  { regex: /\b(?:my\s+goal\s+is|i\s+want\s+to)\s+([^.,;\n]{3,200})/i, section: "goal", topicGroup: 1 },
  { regex: /\b(?:expert\s+in|experienced\s+with|i\s+know)\s+([^.,;\n]{3,200})/i, section: "expertise", topicGroup: 1 },
  { regex: /\b(?:blocked\s+by|stuck\s+on|can'?t\s+because)\s+([^.,;\n]{3,200})/i, section: "blocker", topicGroup: 1 },
];

export const heuristicUserModelSynthesizer: UserModelSynthesizer = async ({ sessions, existingItems }) => {
  const actions: UserModelSynthesizerAction[] = [];
  const seen = new Set(existingItems.map((item) => `${item.section}::${item.contentText.toLowerCase().trim()}`));
  for (const { session, messages } of sessions) {
    for (const message of messages) {
      if (message.role !== "user") continue;
      const text = message.contentText;
      for (const pattern of USER_MODEL_PATTERNS) {
        const match = text.match(pattern.regex);
        if (!match) continue;
        const captured = pattern.topicGroup ? match[pattern.topicGroup] : match[0];
        if (!captured) continue;
        const trimmed = captured.trim().replace(/\s+/g, " ");
        if (trimmed.length < 3) continue;
        const dedupeKey = `${pattern.section}::${trimmed.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        actions.push({
          kind: "upsert",
          section: pattern.section,
          contentText: trimmed,
          topic: null,
          confidence: 0.5,
          sourceSessionId: session.id,
        });
      }
    }
  }
  return actions;
};
