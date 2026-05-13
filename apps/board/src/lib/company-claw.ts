/**
 * ClawJS bridge for the Company app.
 *
 * Owns its own `createClaw()` instance rooted at `~/.claw/apps/board`, so
 * company sessions never mix with the demo's chat workspace. Every employee
 * maps to a unique conversation session inside this workspace, and the
 * agent's AGENTS.md (instructions) is supplied as the systemPrompt on every
 * streaming call.
 */

import os from "node:os";
import path from "node:path";

import { createClaw, resolveOpenClawContext } from "@clawjs/claw";

import type {
  Company,
  CompanyAgent,
  Issue,
  IssueComment,
} from "./company-types";

type ClawInstance = Awaited<ReturnType<typeof createClaw>>;

export interface CompanyClawSession {
  sessionId: string;
  title: string;
}

let clawPromise: Promise<ClawInstance> | null = null;

function resolveHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function envPath(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw ? resolveHome(raw) : fallback;
}

export function resolveCompanyWorkspaceDir(): string {
  return envPath(
    "CLAW_COMPANY_WORKSPACE_DIR",
    path.join(os.homedir(), ".claw", "apps", "company", "workspace"),
  );
}

export function resolveOpenClawStateDir(): string {
  return envPath("OPENCLAW_STATE_DIR", path.join(os.homedir(), ".openclaw"));
}

export function resolveOpenClawConfigPath(): string {
  return envPath("OPENCLAW_CONFIG_PATH", path.join(resolveOpenClawStateDir(), "openclaw.json"));
}

/**
 * Which openclaw agent entry (from `~/.openclaw/openclaw.json`) the Company
 * app borrows at runtime. Defaults to `clawjs-demo` because that agent ships
 * with a usable model config out of the box; override with
 * CLAW_COMPANY_OPENCLAW_AGENT_ID to point at a dedicated openclaw agent.
 */
export function resolveCompanyOpenClawAgentId(): string {
  return process.env.CLAW_COMPANY_OPENCLAW_AGENT_ID?.trim() || "clawjs-demo";
}

/**
 * Lazily boot the ClawJS instance used by every company agent.
 *
 * The openclaw runtime is shared with the demo (we borrow its configured
 * agent so model + provider auth Just Work), but conversations are stored
 * in a dedicated workspace at `~/.claw/apps/board/workspace` so company
 * sessions never mix with the chat's conversation store.
 */
export async function getCompanyClaw(): Promise<ClawInstance> {
  if (!clawPromise) {
    clawPromise = (async () => {
      const workspaceDir = resolveCompanyWorkspaceDir();
      const stateDir = resolveOpenClawStateDir();
      const configPath = resolveOpenClawConfigPath();
      const openclawAgentId = resolveCompanyOpenClawAgentId();
      const runtimeCtx = resolveOpenClawContext({
        agentId: openclawAgentId,
        configPath,
        stateDir,
      });
      const agentDir = runtimeCtx.agentDir;
      const claw = await createClaw({
        runtime: {
          adapter: "openclaw",
          homeDir: stateDir,
          configPath,
          agentDir,
          env: {
            ...process.env,
            OPENCLAW_STATE_DIR: stateDir,
            OPENCLAW_CONFIG_PATH: configPath,
            OPENCLAW_WORKSPACE_DIR: workspaceDir,
            OPENCLAW_AGENT_DIR: agentDir,
          },
        },
        workspace: {
          appId: "clawjs-company",
          workspaceId: "clawjs-company",
          agentId: openclawAgentId,
          rootDir: workspaceDir,
        },
      });
      await claw.workspace.init();
      return claw;
    })();
  }
  return clawPromise;
}

/**
 * Build the AGENTS.md-style instructions markdown for an employee.
 */
export function buildAgentInstructions(input: {
  company: Pick<Company, "name" | "description" | "issuePrefix">;
  agent: Pick<CompanyAgent, "name" | "role" | "title" | "capabilities">;
  reportsToTitle?: string;
  goalTitles?: string[];
}): string {
  const { company, agent, reportsToTitle, goalTitles } = input;
  const goalsBlock = goalTitles && goalTitles.length > 0
    ? goalTitles.map((title) => `- ${title}`).join("\n")
    : "- No active company goals yet.";
  const reportsBlock = reportsToTitle
    ? `You report to: **${reportsToTitle}**.`
    : "You report directly to the board (the human user).";
  const capabilities = agent.capabilities?.trim() || "General purpose work.";

  return [
    `# ${agent.title} (${agent.role})`,
    "",
    `You are **${agent.name}**, the ${agent.title} of **${company.name}**.`,
    "",
    company.description ? `## Company\n${company.description}\n` : "",
    "## Reporting line",
    reportsBlock,
    "",
    "## Capabilities",
    capabilities,
    "",
    "## Active company goals",
    goalsBlock,
    "",
    "## Operating principles",
    "- You collaborate inside an issue tracker. Each task you receive is an issue with an identifier such as " +
      `\`${company.issuePrefix}-1\`.`,
    "- When asked to work on an issue, deliver a concrete, actionable response that can be posted as a comment on the issue.",
    "- Be concise but specific. Prefer numbered or bulleted plans over prose.",
    "- If you need information you don't have, state the assumption you are making and proceed.",
    "- End every response with a single status line: `STATUS: <todo|in_progress|blocked|in_review|done>`.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Format an issue (with its prior comments) into a single user message that
 * the agent can respond to.
 */
export function buildIssuePrompt(input: {
  issue: Issue;
  comments: IssueComment[];
  agent: CompanyAgent;
}): string {
  const { issue, comments } = input;
  const lines: string[] = [];
  lines.push(`# Issue ${issue.identifier}: ${issue.title}`);
  lines.push("");
  lines.push(`Status: ${issue.status} · Priority: ${issue.priority}`);
  lines.push("");
  if (issue.description?.trim()) {
    lines.push("## Description");
    lines.push(issue.description.trim());
    lines.push("");
  }
  if (comments.length > 0) {
    lines.push("## Conversation so far");
    for (const comment of comments) {
      const author = comment.authorAgentId ? `agent:${comment.authorAgentId}` : (comment.authorUserId || "user");
      lines.push(`### ${author}`);
      lines.push(comment.body.trim());
      lines.push("");
    }
  }
  lines.push("## Your task");
  lines.push("Read the issue and the conversation, then write your next comment. Focus on advancing the issue.");
  return lines.join("\n");
}

const COMPANY_SESSION_PREFIX = "company-issue::";

/**
 * Resolve (or create) the conversation session for a (company, agent, issue)
 * triple. We deterministically derive a session title so the same issue
 * reuses the same session across runs.
 */
export async function getOrCreateIssueSession(input: {
  companyId: string;
  agent: CompanyAgent;
  issue: Issue;
}): Promise<CompanyClawSession> {
  const claw = await getCompanyClaw();
  const title = `${COMPANY_SESSION_PREFIX}${input.companyId}::${input.agent.id}::${input.issue.id}`;
  let existing: Array<{ sessionId: string; title?: string }> = [];
  try {
    existing = claw.sessions.listSessions() as Array<{ sessionId: string; title?: string }>;
  } catch {
    existing = [];
  }
  const found = existing.find((session) => session.title === title);
  if (found) {
    return { sessionId: found.sessionId, title };
  }
  const created = claw.sessions.createSession(title);
  return { sessionId: created.sessionId, title };
}

/**
 * Stream an agent reply for a given (issue, agent) and return the full text
 * once the stream finishes. Yields incremental deltas through `onDelta`.
 */
export async function streamAgentReply(input: {
  agent: CompanyAgent;
  systemPrompt: string;
  userMessage: string;
  sessionId: string;
  onDelta?: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<{ text: string; sessionId: string }> {
  const claw = await getCompanyClaw();
  claw.sessions.appendMessage(input.sessionId, {
    role: "user",
    content: input.userMessage,
  });
  let fullText = "";
  for await (const event of claw.sessions.streamAssistantReplyEvents({
    sessionId: input.sessionId,
    systemPrompt: input.systemPrompt,
    transport: "auto",
    chunkSize: 24,
    signal: input.signal,
  })) {
    if (event.type === "chunk") {
      fullText += event.chunk.delta;
      input.onDelta?.(event.chunk.delta);
    }
  }
  return { text: fullText, sessionId: input.sessionId };
}
