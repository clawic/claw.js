import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

import {
  buildCodexCommand,
  buildSetDefaultModelCommand,
  createClaw,
  createLocalLibraryStore,
  discoverWorkspaces,
  getRuntimeAdapter,
  normalizeLibraryId,
  redactSecrets,
} from "@clawjs/claw";
import type { ClawInstance, ImageOperation, ImageProvenance, ImageType, TelegramSendMediaInput, TelegramSendMessageInput, VoiceNoteStatus } from "@clawjs/claw";
import { createWorkspaceClaw } from "@clawjs/workspace";
import type { WorkspaceClawInstance } from "@clawjs/workspace";
import type { RuntimeAdapterId, TemporalItem } from "@clawjs/core";
import { runEmbeddedDatabaseCli } from "./database-advanced.ts";
import { runMagicDbCli } from "./database-magic.ts";
import { runMemoryCli } from "./memory-local.ts";
import {
  addProjectIntegration,
  collectProjectInfo,
  generateProjectResource,
  locateProjectRoot,
  readProjectConfig,
  type ClawIntegrationType,
  type ClawProjectType,
  type ClawResourceType,
} from "./project.ts";
import {
  createPackageName,
  createPascalCase,
  createTitle,
  detectPackageManager,
  scaffoldProject,
  type SupportedPackageManager,
} from "./scaffold.ts";

export interface CliContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
  binName?: string;
  runCommand?: (command: string, args: string[], options: { cwd: string }) => Promise<void>;
}

export const CLI_EXIT_OK = 0;
export const CLI_EXIT_FAILURE = 1;
export const CLI_EXIT_DEGRADED = 2;
export const CLI_EXIT_USAGE = 64;
export const DEFAULT_CLI_BIN = "claw";

class CliHandledError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(code: string, message: string, exitCode = CLI_EXIT_FAILURE) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

const RUNTIME_ADAPTER_IDS = new Set([
  "demo",
  "openclaw",
  "codex",
  "zeroclaw",
  "picoclaw",
  "nanobot",
  "nanoclaw",
  "nullclaw",
  "ironclaw",
  "nemoclaw",
  "hermes",
]);

const CORE_PRODUCTIVITY_DB_COLLECTIONS: Record<string, string> = {
  task: "tasks",
  tasks: "tasks",
  list: "lists",
  lists: "lists",
  section: "sections",
  sections: "sections",
  project: "projects",
  projects: "projects",
  goal: "goals",
  goals: "goals",
  comment: "comments",
  comments: "comments",
  attachment: "attachments",
  attachments: "attachments",
  view: "saved_views",
  views: "saved_views",
  saved_view: "saved_views",
  saved_views: "saved_views",
  recurrence: "recurrences",
  recurrences: "recurrences",
  cycle: "cycles",
  cycles: "cycles",
  sprint: "cycles",
  sprints: "cycles",
  epic: "epics",
  epics: "epics",
  initiative: "epics",
  initiatives: "epics",
  custom_field: "custom_fields",
  custom_fields: "custom_fields",
  field_value: "field_values",
  field_values: "field_values",
  template: "templates",
  templates: "templates",
  reminder: "reminders",
  reminders: "reminders",
  deadline: "deadlines",
  deadlines: "deadlines",
  note: "notes",
  notes: "notes",
  person: "people",
  people: "people",
  event: "events",
  events: "events",
};

const LOCAL_FIRST_PRODUCTIVITY_GROUPS = new Set([
  "areas",
  "lists",
  "sections",
  "tasks",
  "goals",
  "projects",
  "comments",
  "attachments",
  "saved-views",
  "recurrences",
  "cycles",
  "sprints",
  "epics",
  "initiatives",
  "custom-fields",
  "field-values",
  "templates",
  "milestones",
  "activity",
  "blockers",
  "artifacts",
  "decisions",
  "work-sessions",
  "assignments",
  "handoffs",
  "approvals",
  "capacity",
  "reminders",
  "deadlines",
  "notes",
  "people",
  "inbox",
  "events",
  "my-work",
  "timeline",
  "workspace-search",
]);

export function buildCliUsage(binName = DEFAULT_CLI_BIN): string {
  return [
    `Usage: ${binName} <command> [options]`,
    "",
    "Primary workflow:",
    `  ${binName} db <collection> <title>`,
    `  ${binName} db <collection> list|get|create|update|delete|schema`,
    `  ${binName} tasks|notes|people|projects|goals|reminders|deadlines|events ...`,
    "",
    "Project commands:",
    `  ${binName} new app|agent|server|workspace|skill|plugin <name> [--dir PATH] [--template NAME] [--package-manager npm|pnpm] [--git] [--install] [--yes]`,
    `  ${binName} generate skill|plugin|provider|channel|command <name> [--project PATH]`,
    `  ${binName} add provider|channel|telegram|scheduler|memory|workspace [name] [--project PATH]`,
    `  ${binName} info [--project PATH] [--json]`,
    `  ${binName} doctor [--workspace PATH] [--json]`,
    "",
    "Advanced command groups:",
    `  ${binName} runtime status|install|uninstall|repair|setup-workspace`,
    `  ${binName} workspace init|attach|inspect|discover|validate|reset|repair`,
    `  ${binName} files read|write|inspect|diff|sync|apply-template-pack`,
    `  ${binName} auth status|login|remove`,
    `  ${binName} models list|default|set-default`,
    `  ${binName} providers list|catalog|auth-state`,
    `  ${binName} secrets list|describe|types|capabilities|broker http|leases list`,
    `  ${binName} scheduler list|run|enable|disable`,
    `  ${binName} time list|get|create|update|delete|pause|resume|run|executions|calendar|timeline`,
    `  ${binName} schedule at|every|after ...`,
    `  ${binName} memory save|list|get|update|delete|search|context|status|capabilities`,
    `  ${binName} areas|tasks|goals|projects|milestones|activity ...`,
    `  ${binName} blockers|artifacts|decisions|work-sessions ...`,
    `  ${binName} assignments|handoffs|approvals|capacity ...`,
    `  ${binName} reminders|deadlines|notes|people|inbox|events ...`,
    `  ${binName} my-work | team-work | agenda | review daily|weekly`,
    `  ${binName} timeline day|week --start ISO [--project-id ID]`,
    `  ${binName} export <file> | import <file> [--replace] | backup <dir>`,
    `  ${binName} workspace-search query | workspace-index rebuild`,
    `  ${binName} skills list|inspect|sync|sources|search|install`,
    `  ${binName} library list|inspect|create|update|remove|import-skill|assign|unassign|resolve|sync`,
    `  ${binName} channels list|status|telegram|processors|listen|codex-processor|targets|messages|permissions|commands`,
    `  ${binName} browser status|ensure|share --relay-url URL --access-token TOKEN --tenant-id ID --agent-id ID --workspace-id ID`,
    `  ${binName} telegram connect|status|webhook set|clear|polling start|stop|commands set|get|chats list|inspect|send`,
    `  ${binName} sessions create|list|search|read|stream|generate-title`,
    `  ${binName} documents list|read|search|upload|register|download`,
    `  ${binName} inference generate-text`,
    `  ${binName} tts synthesize|config|set-config|providers|catalog`,
    `  ${binName} stt transcribe|config|set-config|providers`,
    `  ${binName} voice-notes add|list|get|transcribe`,
    `  ${binName} image create|edit|import|list|show|delete|backends`,
    `  ${binName} audio generate|list|read|delete|backends`,
    `  ${binName} video generate|list|read|delete|backends`,
    `  ${binName} generations backends|register-command|remove-backend|create|list|read|delete`,
    `  ${binName} notify send|cancel|subscriptions upsert|delete`,
    `  ${binName} database serve|login|namespace|collection|record|token|file  # advanced admin surface`,
    `  ${binName} content serve|login|brand|destination|campaign|entry|variant|approval|publish|token`,
    `  ${binName} erp serve|login|tenant|company|localization|gl|ar|ap|sales|purchase|inventory|mrp|projects|hr|payroll|support|docs|reports|agents|approvals`,
    `  ${binName} iot serve|homes|areas|things|state|lights|climate|scenes|automations|approvals|raw`,
    `  ${binName} compat [--refresh] [--json]`,
    "",
    "Global options:",
    "  --runtime demo|openclaw|codex|zeroclaw|picoclaw|nanobot|nanoclaw|nullclaw|ironclaw|nemoclaw|hermes",
    "  --workspace PATH",
    "  --json",
    "  --dry-run",
  ].join("\n");
}

export const CLI_USAGE = buildCliUsage();

const CLI_TEMPLATE_ROOT = fileURLToPath(new URL("../templates", import.meta.url));

function writeJson(stream: NodeJS.WritableStream, payload: unknown): void {
  stream.write(`${JSON.stringify(redactSecrets(payload), null, 2)}\n`);
}

function writeJsonLine(stream: NodeJS.WritableStream, payload: unknown): void {
  stream.write(`${JSON.stringify(redactSecrets(payload))}\n`);
}

function writeCliError(stream: NodeJS.WritableStream, error: unknown): void {
  const handled = error instanceof CliHandledError
    ? error
    : new CliHandledError("internal_error", error instanceof Error ? error.message : String(error));
  writeJson(stream, {
    ok: false,
    error: {
      code: handled.code,
      message: handled.message,
    },
  });
}

function cliErrorFromUnknown(error: unknown): CliHandledError {
  return error instanceof CliHandledError
    ? error
    : new CliHandledError("internal_error", error instanceof Error ? error.message : String(error));
}

function parseContextBlock(value?: string): { title: string; content: string }[] | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const separatorIndex = trimmed.indexOf("::");
  if (separatorIndex === -1) {
    return [{ title: "Context", content: trimmed }];
  }
  return [{
    title: trimmed.slice(0, separatorIndex).trim() || "Context",
    content: trimmed.slice(separatorIndex + 2).trim(),
  }];
}

function parseJsonFlag<TValue>(value: string | undefined, label: string): TValue | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as TValue;
  } catch (error) {
    throw new CliHandledError("invalid_json", `Invalid JSON for ${label}: ${error instanceof Error ? error.message : "parse error"}`);
  }
}

function parseCsvFlag(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function writeProgress(stream: NodeJS.WritableStream, event: { phase: string; status: string; percent?: number; message?: string }): void {
  const suffix = typeof event.percent === "number" ? ` ${event.percent}%` : "";
  const message = event.message ? ` ${event.message}` : "";
  stream.write(`${event.phase} ${event.status}${suffix}${message}\n`);
}

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const equalsIndex = token.indexOf("=");
    if (equalsIndex > 2) {
      flags[token.slice(2, equalsIndex)] = token.slice(equalsIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) continue;
    flags[token.slice(2)] = next;
  }
  return flags;
}

function readBooleanFlag(argv: string[], flags: Record<string, string>, name: string, fallback = false): boolean {
  if (argv.includes(`--${name}`)) return true;
  const value = flags[name];
  if (value === undefined) return fallback;
  return value === "true";
}

function extractPositionals(argv: string[]): string[] {
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    if (token.includes("=")) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      index += 1;
    }
  }
  return positionals;
}

function joinedPositionals(positionals: string[], startIndex: number): string | undefined {
  const value = positionals.slice(startIndex).join(" ").trim();
  return value || undefined;
}

function parseLooseCliValue(rawValue: string): unknown {
  if (!rawValue.length) return "";
  if ((rawValue.startsWith("{") && rawValue.endsWith("}")) || (rawValue.startsWith("[") && rawValue.endsWith("]"))) {
    try {
      return JSON.parse(rawValue) as unknown;
    } catch {
      return rawValue;
    }
  }
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  if (rawValue === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(rawValue)) return Number(rawValue);
  return rawValue;
}

function parseSetFlags(argv: string[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--set") continue;
    const pair = argv[index + 1];
    if (!pair || pair.startsWith("--")) {
      throw new CliHandledError("usage_error", "--set requires key=value", CLI_EXIT_USAGE);
    }
    const equalsIndex = pair.indexOf("=");
    if (equalsIndex <= 0) {
      throw new CliHandledError("usage_error", "--set requires key=value", CLI_EXIT_USAGE);
    }
    values[pair.slice(0, equalsIndex)] = parseLooseCliValue(pair.slice(equalsIndex + 1));
    index += 1;
  }
  return values;
}

function parseObjectFlag(value: string | undefined, label: string): Record<string, unknown> {
  if (!value?.trim()) return {};
  const parsed = parseJsonFlag<unknown>(value, label);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliHandledError("invalid_json", `${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function coreProductivityCollection(rawCollection: string | undefined): string | null {
  if (!rawCollection) return null;
  return CORE_PRODUCTIVITY_DB_COLLECTIONS[rawCollection.trim().toLowerCase()] ?? null;
}

function singularCoreCollection(collectionName: string): string {
  if (collectionName === "people") return "person";
  if (collectionName.endsWith("s")) return collectionName.slice(0, -1);
  return collectionName;
}

function pickCoreTitle(collectionName: string, payload: Record<string, unknown>, fallback?: string): string | undefined {
  const primary = collectionName === "people" ? "displayName" : ["projects", "cycles", "saved_views", "custom_fields", "templates"].includes(collectionName) ? "name" : collectionName === "field_values" ? "fieldId" : collectionName === "comments" ? "body" : "title";
  const value = payload[primary] ?? payload.title ?? payload.name ?? payload.displayName ?? fallback;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseSimpleDurationMs(value: string | undefined): number | null {
  const match = value?.trim().match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const unit = match[2];
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

function channelListenerId(provider: string, accountId?: string): string {
  return `${provider}:${accountId?.trim() || "default"}`;
}

function channelListenerPaths(workspaceRoot: string, provider: string, accountId?: string): { runDir: string; pidPath: string; stopPath: string; logPath: string } {
  const safeId = channelListenerId(provider, accountId).replace(/[^A-Za-z0-9._-]+/g, "_");
  const runDir = path.join(workspaceRoot, ".clawjs", "run", "channels");
  return {
    runDir,
    pidPath: path.join(runDir, `${safeId}.pid`),
    stopPath: path.join(runDir, `${safeId}.stop`),
    logPath: path.join(runDir, `${safeId}.log`),
  };
}

function isProcessRunning(pid: number | undefined): boolean {
  if (!pid || !Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readListenerPid(pidPath: string): number | undefined {
  try {
    const value = Number(fs.readFileSync(pidPath, "utf8").trim());
    return Number.isSafeInteger(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function waitForListenerPid(pidPath: string, timeoutMs = 5_000): Promise<number | undefined> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const pid = readListenerPid(pidPath);
    if (pid && isProcessRunning(pid)) return pid;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return undefined;
}

function readTail(filePath: string, lines: number): string {
  try {
    return fs.readFileSync(filePath, "utf8").split(/\r?\n/).slice(-Math.max(1, lines)).join("\n");
  } catch {
    return "";
  }
}

const LOCAL_CLI_ALLOWED_FLAGS = new Set([
  "json",
  "workspace",
  "workspace-id",
  "agent-id",
  "app-id",
  "runtime",
  "runtime-workspace",
  "agent-dir",
  "home-dir",
  "config-path",
  "auth-store",
  "gateway-url",
  "gateway-token",
  "gateway-port",
  "gateway-config",
  "template-pack",
  "time-url",
  "time-token",
  "timezone",
  "url",
  "token",
  "namespace",
  "id",
  "data",
  "set",
  "limit",
  "include-archived",
  "include-completed",
  "include-done",
  "force",
  "cascade",
  "title",
  "name",
  "description",
  "summary",
  "content",
  "status",
  "priority",
  "type",
  "rank",
  "labels",
  "tags",
  "area-id",
  "list-id",
  "section-id",
  "project-id",
  "goal-id",
  "cycle-id",
  "epic-id",
  "owner-person-id",
  "owner-agent-id",
  "lead-agent-id",
  "assignee",
  "watchers",
  "reporter-person-id",
  "start-at",
  "defer-until",
  "due-at",
  "deadline-at",
  "snoozed-until",
  "recurrence-rule",
  "trigger-at",
  "starts-at",
  "ends-at",
  "before",
  "after",
  "end",
  "anchor-at",
  "location",
  "attendees",
  "anchor-type",
  "anchor-id",
  "channel",
  "email",
  "phone",
  "handle",
  "external-id",
  "kind",
  "role",
  "organization",
  "query",
  "strategy",
  "domains",
  "domain",
  "blocked",
  "overdue",
  "has-reminder",
  "ids",
  "depends-on",
  "child-task-ids",
  "comment-ids",
  "attachment-ids",
  "checklist-json",
  "estimate-minutes",
  "actual-minutes",
  "story-points",
  "blocked-reason",
  "waiting-on",
  "started-at",
  "completed-at",
  "cancelled-at",
  "event-id",
  "parent-task-id",
  "parent-id",
  "parent-goal-id",
  "company-id",
  "portfolio-id",
  "portfolio-item-id",
  "target-date",
  "start-date",
  "review-at",
  "deadline-at",
  "archive-reason",
  "template-id",
  "status-category",
  "default-section-ids",
  "start",
  "milestone-ids",
  "health-status",
  "level",
  "metric-key",
  "metric-label",
  "target-value",
  "current-value",
  "unit",
  "period",
  "timeframe-start",
  "timeframe-end",
  "review-cadence",
  "metric-direction",
  "upcoming-only",
  "unread-only",
  "thread",
  "subject",
  "participants",
  "task-title",
  "note-title",
  "reminder-title",
  "entity-type",
  "entity-id",
  "task-id",
  "thread-id",
  "decision-id",
  "dependency-task-ids",
  "evidence-ids",
  "artifact-ids",
  "blocker-ids",
  "task-ids",
  "timebox-minutes",
  "objective",
  "outcome",
  "uri",
  "rationale",
  "alternatives",
  "assigned-to-agent-id",
  "assigned-by",
  "assigned-by-agent-id",
  "reviewer-agent-id",
  "from-agent-id",
  "to-agent-id",
  "next-step",
  "due-reason",
  "approver-agent-id",
  "requested-by-agent-id",
  "policy-reason",
  "approval-id",
  "handoff-id",
  "decision-ids",
  "availability",
  "team-id",
  "agent-id",
  "max-wip",
  "current-wip",
  "queue-depth",
  "blocked-count",
  "overdue-count",
  "response-latency-minutes",
  "utilization",
  "assigned-task-ids",
  "pending-approval-ids",
  "pending-handoff-ids",
  "snapshot-at",
  "field-id",
  "field-type",
  "filter",
  "filters",
  "sort",
  "group-by",
  "favorite",
  "rule",
  "next-run-at",
  "last-run-at",
  "starts-at",
  "ends-at",
  "capacity-points",
  "entity-type",
  "entity-id",
  "visibility",
  "author-person-id",
  "author-agent-id",
  "mime-type",
  "size-bytes",
  "preview",
  "uploaded-by",
  "value",
  "required",
  "options",
  "body",
  "path",
  "replace",
]);

function collectFlagNames(argv: string[]): string[] {
  return argv
    .filter((token) => token.startsWith("--"))
    .map((token) => {
      const withoutPrefix = token.slice(2);
      const equalsIndex = withoutPrefix.indexOf("=");
      return equalsIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, equalsIndex);
    });
}

function assertAllowedLocalFlags(group: string | undefined, argv: string[]): void {
  if (!group || (group !== "db" && group !== "export" && group !== "import" && group !== "backup" && group !== "agenda" && group !== "review" && group !== "team-work" && !LOCAL_FIRST_PRODUCTIVITY_GROUPS.has(group))) return;
  for (const flag of collectFlagNames(argv)) {
    if (!LOCAL_CLI_ALLOWED_FLAGS.has(flag)) {
      throw new CliHandledError("usage_error", `Unknown flag --${flag}`, CLI_EXIT_USAGE);
    }
  }
}

function camelCaseFlag(flag: string): string {
  return flag.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function mergeCoreDbInput(
  action: "create" | "update",
  collectionName: string,
  positionals: string[],
  flags: Record<string, string>,
  argv: string[],
): { recordId?: string; payload: Record<string, unknown> } {
  const reservedFlags = new Set([
    "app-id",
    "workspace",
    "workspace-id",
    "agent-id",
    "runtime",
    "url",
    "token",
    "namespace",
    "json",
    "id",
    "data",
    "set",
    "limit",
    "include-archived",
    "force",
    "cascade",
  ]);
  const payload: Record<string, unknown> = {
    ...parseObjectFlag(flags.data, "--data"),
    ...parseSetFlags(argv),
  };
  for (const [flag, value] of Object.entries(flags)) {
    if (reservedFlags.has(flag)) continue;
    payload[camelCaseFlag(flag)] ??= parseLooseCliValue(value);
  }
  const titleStart = action === "create" ? 3 : 4;
  const fallbackTitle = joinedPositionals(positionals, titleStart);
  const title = pickCoreTitle(collectionName, payload, fallbackTitle);
  if (title) {
    if (collectionName === "people") payload.displayName ??= title;
    else if (["projects", "cycles", "saved_views", "custom_fields", "templates"].includes(collectionName)) payload.name ??= title;
    else if (collectionName === "field_values") payload.fieldId ??= title;
    else if (collectionName === "comments") payload.body ??= title;
    else payload.title ??= title;
  }
  if (typeof payload.labels === "string") payload.labels = parseCsvFlag(payload.labels);
  if (typeof payload.tags === "string") payload.tags = parseCsvFlag(payload.tags);
  if (typeof payload.watchers === "string") payload.watcherPersonIds = parseCsvFlag(payload.watchers);
  if (typeof payload.attendees === "string") payload.attendeePersonIds = parseCsvFlag(payload.attendees);
  if (typeof payload.taskIds === "string") payload.taskIds = parseCsvFlag(payload.taskIds);
  if (typeof payload.commentIds === "string") payload.commentIds = parseCsvFlag(payload.commentIds);
  if (typeof payload.attachmentIds === "string") payload.attachmentIds = parseCsvFlag(payload.attachmentIds);
  if (typeof payload.defaultSectionIds === "string") payload.defaultSectionIds = parseCsvFlag(payload.defaultSectionIds);
  if (typeof payload.email === "string") payload.emails = parseCsvFlag(payload.email);
  if (typeof payload.phone === "string") payload.phones = parseCsvFlag(payload.phone);
  if (typeof payload.handle === "string") payload.handles = parseCsvFlag(payload.handle);
  return action === "create"
    ? { payload }
    : { recordId: positionals[3] || flags.id, payload };
}

function pathSafeBasename(value: string): string {
  const normalized = value.replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "clawjs-workspace";
}

function timelineRange(mode: "day" | "week", startValue?: string): { start: string; end: string } {
  const start = startValue ? new Date(startValue) : new Date();
  if (!Number.isFinite(start.getTime())) {
    throw new CliHandledError("usage_error", "Invalid --start value for timeline.", CLI_EXIT_USAGE);
  }
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (mode === "week" ? 7 : 1));
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function resolveRuntimeAdapterId(flags: Record<string, string>): RuntimeAdapterId {
  const runtime = flags.runtime?.trim() || "openclaw";
  if (!RUNTIME_ADAPTER_IDS.has(runtime)) {
    throw new CliHandledError("invalid_enum", `Invalid --runtime "${runtime}". Allowed values: ${Array.from(RUNTIME_ADAPTER_IDS).join(", ")}.`, CLI_EXIT_USAGE);
  }
  return runtime as RuntimeAdapterId;
}

type MediaKind = "image" | "audio" | "video";

function inferMimeTypeFromPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".txt":
      return "text/plain";
    case ".md":
      return "text/markdown";
    case ".json":
      return "application/json";
    case ".csv":
      return "text/csv";
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "application/octet-stream";
  }
}

function inferAudioExtension(mimeType: string): string {
  switch (mimeType) {
    case "audio/mpeg":
      return ".mp3";
    case "audio/wav":
      return ".wav";
    default:
      return ".bin";
  }
}

function parseInferenceMessages(
  flags: Record<string, string>,
): Array<{ role: "user" | "system" | "assistant" | "tool"; content: string }> | null {
  const parsed = parseJsonFlag<Array<{ role: "user" | "system" | "assistant" | "tool"; content: string }>>(flags["messages-json"], "--messages-json");
  if (parsed?.length) {
    return parsed;
  }
  const prompt = flags.prompt ?? flags.message ?? flags.text;
  if (!prompt?.trim()) {
    return null;
  }
  return [{ role: "user", content: prompt.trim() }];
}

type TelegramCodexReplyPolicy = "all" | "mention_or_reply" | "commands";

interface TelegramCodexBridgeState {
  schemaVersion: 1;
  ownerUserId?: string;
  replyPolicy: TelegramCodexReplyPolicy;
  authorizedTargets: Array<{
    provider: string;
    accountId: string;
    targetId: string;
    threadId?: string | number;
    authorizedByUserId: string;
    authorizedAt: string;
  }>;
  sessions: Record<string, string>;
}

interface TelegramCodexProcessorEvent {
  type?: string;
  provider?: string;
  accountId?: string;
  targetId?: string;
  message?: {
    id?: string;
    text?: string;
    targetId?: string;
    threadId?: string | number;
    senderId?: string;
    senderLabel?: string;
    providerMessageId?: string;
    metadata?: Record<string, unknown>;
    raw?: Record<string, unknown>;
  };
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("error", reject);
    process.stdin.on("end", () => resolve(input));
  });
}

function runForegroundProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  },
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => options.stdout.write(chunk));
    child.stderr?.on("data", (chunk) => options.stderr.write(chunk));
    child.on("error", (error) => {
      options.stderr.write(`${error.message}\n`);
      resolve(CLI_EXIT_FAILURE);
    });
    child.on("close", (exitCode) => resolve(exitCode ?? CLI_EXIT_FAILURE));
  });
}

function sanitizeStableId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "default";
}

function hashStableId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function normalizeTelegramCodexReplyPolicy(value?: string): TelegramCodexReplyPolicy {
  return value === "mention_or_reply" || value === "commands" || value === "all" ? value : "all";
}

function telegramCodexStatePath(workspaceRoot: string, flags: Record<string, string>): string {
  return path.resolve(flags["bridge-state"] || path.join(workspaceRoot, ".clawjs", "telegram-codex-bridge.json"));
}

function readTelegramCodexBridgeState(statePath: string, replyPolicy: TelegramCodexReplyPolicy): TelegramCodexBridgeState {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as Partial<TelegramCodexBridgeState>;
    return {
      schemaVersion: 1,
      ...(typeof parsed.ownerUserId === "string" ? { ownerUserId: parsed.ownerUserId } : {}),
      replyPolicy: normalizeTelegramCodexReplyPolicy(parsed.replyPolicy ?? replyPolicy),
      authorizedTargets: Array.isArray(parsed.authorizedTargets) ? parsed.authorizedTargets.filter((entry) => (
        entry
        && typeof entry.provider === "string"
        && typeof entry.accountId === "string"
        && typeof entry.targetId === "string"
        && typeof entry.authorizedByUserId === "string"
        && typeof entry.authorizedAt === "string"
      )) as TelegramCodexBridgeState["authorizedTargets"] : [],
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions as Record<string, string> : {},
    };
  } catch {
    return {
      schemaVersion: 1,
      replyPolicy,
      authorizedTargets: [],
      sessions: {},
    };
  }
}

function writeTelegramCodexBridgeState(statePath: string, state: TelegramCodexBridgeState): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function telegramCodexTargetKey(input: { provider: string; accountId: string; targetId: string; threadId?: string | number }): string {
  return [input.provider, input.accountId, input.targetId, input.threadId ? `topic:${String(input.threadId)}` : "chat"].join(":");
}

function isTelegramPrivateMessage(event: TelegramCodexProcessorEvent): boolean {
  const rawMessage = event.message?.raw?.message as Record<string, unknown> | undefined;
  const chat = rawMessage?.chat as Record<string, unknown> | undefined;
  return chat?.type === "private";
}

function isTelegramReplyToBot(event: TelegramCodexProcessorEvent): boolean {
  const rawMessage = event.message?.raw?.message as Record<string, unknown> | undefined;
  const reply = rawMessage?.reply_to_message as Record<string, unknown> | undefined;
  const from = reply?.from as Record<string, unknown> | undefined;
  return from?.is_bot === true;
}

function shouldReplyToTelegramCodexMessage(
  event: TelegramCodexProcessorEvent,
  policy: TelegramCodexReplyPolicy,
  botUsername?: string,
): boolean {
  if (policy === "all") return true;
  const text = event.message?.text?.trim() ?? "";
  if (text.startsWith("/codex") || text.startsWith("/start")) return true;
  if (policy === "commands") return false;
  if (isTelegramReplyToBot(event)) return true;
  return !!(botUsername && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`));
}

function stripTelegramCodexCommand(text: string, botUsername?: string): string {
  let next = text.trim();
  next = next.replace(/^\/codex(?:@\w+)?\s*/i, "");
  if (botUsername) {
    next = next.replace(new RegExp(`@${botUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "ig"), "").trim();
  }
  return next || text.trim();
}

function formatTelegramCodexPrompt(event: TelegramCodexProcessorEvent, text: string): string {
  const metadata = event.message?.metadata ?? {};
  if (!metadata.voiceNoteId) return text;
  return [
    "The user sent a Telegram voice note. It has already been downloaded and transcribed by ClawJS STT.",
    "Treat the transcript below as the user's actual message. Do not say you cannot hear or access audio.",
    "",
    "Voice note transcript:",
    text,
  ].join("\n");
}

function splitTelegramMessage(text: string, maxLength = 3900): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chunks: string[] = [];
  let remaining = trimmed;
  while (remaining.length > maxLength) {
    let index = remaining.lastIndexOf("\n", maxLength);
    if (index < Math.floor(maxLength * 0.5)) index = remaining.lastIndexOf(" ", maxLength);
    if (index < Math.floor(maxLength * 0.5)) index = maxLength;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function runTelegramCodexProcessor(input: {
  context: CliContext;
  flags: Record<string, string>;
  argv: string[];
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
}): Promise<number> {
  const raw = await readStdin();
  const event = JSON.parse(raw || "{}") as TelegramCodexProcessorEvent;
  const provider = event.provider || "telegram";
  const accountId = event.accountId || "default";
  const targetId = event.targetId || event.message?.targetId;
  const threadId = event.message?.threadId;
  const senderId = event.message?.senderId;
  const rawText = event.message?.text?.trim();
  if (!targetId || !senderId || !rawText) {
    writeJson(input.context.stdout, { actions: [{ type: "ignore", reason: "missing target, sender, or text" }] });
    return CLI_EXIT_OK;
  }

  const replyPolicy = normalizeTelegramCodexReplyPolicy(input.flags["reply-policy"]);
  const botUsername = input.flags["bot-username"];
  const statePath = telegramCodexStatePath(input.workspaceRoot, input.flags);
  const state = readTelegramCodexBridgeState(statePath, replyPolicy);
  state.replyPolicy = replyPolicy;

  const isPrivate = isTelegramPrivateMessage(event);
  const key = telegramCodexTargetKey({ provider, accountId, targetId, ...(threadId ? { threadId } : {}) });
  const now = new Date().toISOString();
  let changed = false;

  if (!state.ownerUserId) {
    state.ownerUserId = senderId;
    changed = true;
  }

  const isOwner = state.ownerUserId === senderId;
  const authorized = state.authorizedTargets.some((target) => telegramCodexTargetKey(target) === key);
  if (!authorized && (isPrivate || isOwner)) {
    state.authorizedTargets.push({
      provider,
      accountId,
      targetId,
      ...(threadId ? { threadId } : {}),
      authorizedByUserId: senderId,
      authorizedAt: now,
    });
    changed = true;
  }

  const nowAuthorized = authorized || isPrivate || isOwner;
  if (!isOwner && !nowAuthorized) {
    if (changed) writeTelegramCodexBridgeState(statePath, state);
    writeJson(input.context.stdout, { actions: [{ type: "ignore", reason: "target not authorized by owner" }] });
    return CLI_EXIT_OK;
  }
  if (!shouldReplyToTelegramCodexMessage(event, state.replyPolicy, botUsername)) {
    if (changed) writeTelegramCodexBridgeState(statePath, state);
    writeJson(input.context.stdout, { actions: [{ type: "ignore", reason: "reply policy did not match" }] });
    return CLI_EXIT_OK;
  }

  let sessionId = state.sessions[key] ?? `telegram-${sanitizeStableId(targetId)}-${hashStableId(key)}`;
  if (changed) writeTelegramCodexBridgeState(statePath, state);

  const prompt = formatTelegramCodexPrompt(event, stripTelegramCodexCommand(rawText, botUsername));
  const targetLabel = threadId ? `${targetId} topic ${threadId}` : targetId;
  const systemPrompt = input.flags["system-prompt"] || [
    "You are Codex responding through a Telegram bot.",
    "Be concise, useful, and clear.",
    "You are running on the Kappa Mac mini for the ClawJS dev workflow.",
  ].join(" ");
  const claw = await createCliClaw(input.runtimeAdapterId, input.flags, input.workspaceRoot, input.appId, input.workspaceId, input.agentId, input.argv);
  const resolvedSession = claw.sessions.resolveChannelSession({
    provider,
    accountId,
    targetId,
    ...(threadId ? { threadId } : {}),
  });
  sessionId = resolvedSession.sessionId;
  if (state.sessions[key] !== sessionId) {
    state.sessions[key] = sessionId;
    writeTelegramCodexBridgeState(statePath, state);
  }
  claw.sessions.backfillChannelSession({
    provider,
    accountId,
    targetId,
    ...(threadId ? { threadId } : {}),
  });
  const userMessage = claw.sessions.appendChannelMessage({
    provider,
    accountId,
    targetId,
    ...(threadId ? { threadId } : {}),
    direction: "inbound",
    role: "user",
    content: prompt,
    ...(event.message?.providerMessageId ? { providerMessageId: event.message.providerMessageId } : {}),
    senderId,
    ...(event.message?.senderLabel ? { senderLabel: event.message.senderLabel } : {}),
    metadata: {
      source: "telegram-codex-bridge",
      ...(event.message?.metadata ?? {}),
    },
  });
  if (!userMessage.appended) {
    writeJson(input.context.stdout, { actions: [{ type: "ignore", reason: "duplicate message" }] });
    return CLI_EXIT_OK;
  }
  const session = claw.sessions.getSession(sessionId);
  const result = await claw.inference.generateText({
    systemPrompt,
    contextBlocks: [
      { title: "Telegram", content: `provider=${provider}\naccount=${accountId}\ntarget=${targetLabel}\nsender=${event.message?.senderLabel ?? senderId}` },
    ],
    messages: session?.messages ?? [{ role: "user", content: prompt }],
    transport: (input.flags.transport as "auto" | "gateway" | "cli" | undefined) ?? "auto",
    ...(input.flags.model ? { model: input.flags.model } : {}),
    ...(input.flags["gateway-retries"] ? { gatewayRetries: Number(input.flags["gateway-retries"]) } : { gatewayRetries: 1 }),
  });
  if (result.text) {
    claw.sessions.appendChannelMessage({
      provider,
      accountId,
      targetId,
      ...(threadId ? { threadId } : {}),
      direction: "outbound",
      role: "assistant",
      content: result.text,
      metadata: {
        source: "telegram-codex-bridge",
        transport: result.transport,
        fallback: result.fallback,
      },
    });
  }

  const chunks = splitTelegramMessage(result.text);
  const actions = chunks.length > 0
    ? [
        {
          type: "grant_permission",
          targetId,
          agentId: input.agentId,
          permissions: ["write"],
          priority: 100,
          metadata: {
            source: "telegram-codex-bridge",
            ownerUserId: state.ownerUserId,
          },
        },
        ...chunks.map((text) => ({
          type: "send_message",
          targetId,
          text,
          ...(threadId ? { threadId } : {}),
          agentId: input.agentId,
          metadata: {
            sessionId,
            transport: result.transport,
            fallback: result.fallback,
            ownerUserId: state.ownerUserId,
          },
        })),
      ]
    : [{ type: "ignore", reason: "codex returned empty response" }];
  writeJson(input.context.stdout, {
    actions,
  });
  return CLI_EXIT_OK;
}

function buildMediaMetadata(
  kind: MediaKind,
  flags: Record<string, string>,
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = { ...(metadata ?? {}) };

  if (kind === "image") {
    if (flags.size) merged.size = flags.size;
    if (flags.quality) merged.quality = flags.quality;
    if (flags.background) merged.background = flags.background;
    if (flags["output-format"]) merged.outputFormat = flags["output-format"];
    if (flags.style) merged.style = flags.style;
    if (flags.resolution) merged.resolution = flags.resolution;
    if (flags["aspect-ratio"]) merged.aspectRatio = flags["aspect-ratio"];
    const inputImages = parseCsvFlag(flags["input-images"]);
    if (inputImages.length > 0) merged.inputImages = inputImages;
  }

  if (kind === "audio" && flags.voice) {
    merged.voice = flags.voice;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildImageMetadata(flags: Record<string, string>): Record<string, unknown> | undefined {
  return buildMediaMetadata("image", flags, parseJsonFlag<Record<string, unknown>>(flags["metadata-json"], "--metadata-json"));
}

function buildImageCommonInput(flags: Record<string, string>) {
  return {
    title: flags.title,
    model: flags.model,
    profileId: flags.profile,
    secretRef: flags["secret-ref"],
    openaiBaseUrl: flags["openai-base-url"],
    negativePrompt: flags["negative-prompt"],
    imageType: flags.type as "logo" | "icon" | "illustration" | "photo" | "mockup" | "diagram" | "texture" | "screenshot" | "avatar" | "other" | undefined,
    tags: parseCsvFlag(flags.tags),
    collections: parseCsvFlag(flags.collections),
    project: flags.project,
    topic: flags.topic,
    metadata: buildImageMetadata(flags),
  };
}

function parseImageOperation(value: string | undefined): ImageOperation | undefined {
  if (value === "create" || value === "edit" || value === "import") {
    return value;
  }
  return undefined;
}

function parseImageType(value: string | undefined): ImageType | undefined {
  if (
    value === "logo"
    || value === "icon"
    || value === "illustration"
    || value === "photo"
    || value === "mockup"
    || value === "diagram"
    || value === "texture"
    || value === "screenshot"
    || value === "avatar"
    || value === "other"
  ) {
    return value;
  }
  return undefined;
}

function parseImageProvenance(value: string | undefined): ImageProvenance | undefined {
  if (
    value === "generated-by-system"
    || value === "imported-codex"
    || value === "imported-chatgpt"
    || value === "imported-manual"
    || value === "command-backend"
    || value === "custom"
  ) {
    return value;
  }
  return undefined;
}

async function createCliClaw(
  runtimeAdapter: RuntimeAdapterId,
  flags: Record<string, string>,
  workspaceRoot: string,
  appId: string,
  workspaceId: string,
  agentId: string,
  argv: string[] = [],
) {
  const explicitVaultBackend = flags["vault-url"] || flags["vault-token"] || flags["vault-tenant-id"] ? "vault" : undefined;
  return createClaw({
    runtime: {
      adapter: runtimeAdapter,
      agentDir: flags["agent-dir"],
      homeDir: flags["home-dir"],
      configPath: flags["config-path"],
      workspacePath: flags["runtime-workspace"],
      authStorePath: flags["auth-store"],
      gateway: {
        url: flags["gateway-url"],
        token: flags["gateway-token"],
        ...(flags["gateway-port"] ? { port: Number(flags["gateway-port"]) } : {}),
        configPath: flags["gateway-config"],
      },
    },
    workspace: {
      appId,
      workspaceId,
      agentId,
      rootDir: workspaceRoot,
    },
    secrets: (
      flags["secrets-backend"]
      || flags["vault-url"]
      || flags["vault-token"]
      || flags["vault-tenant-id"]
      || process.env.CLAWJS_SECRETS_BACKEND
      || process.env.VAULT_BASE_URL
      || process.env.VAULT_TOKEN
      || process.env.VAULT_TENANT_ID
    ) ? {
      backend: (flags["secrets-backend"] || explicitVaultBackend || process.env.CLAWJS_SECRETS_BACKEND) as "local_proxy" | "vault" | undefined,
      baseUrl: flags["vault-url"] || process.env.VAULT_BASE_URL,
      credential: flags["vault-token"] || process.env.VAULT_TOKEN,
      tenantId: flags["vault-tenant-id"] || process.env.VAULT_TENANT_ID,
      sidecarPath: flags["vault-sidecar"] || process.env.CLAWJS_VAULT_SIDECAR_PATH,
    } : undefined,
    templates: {
      pack: flags["template-pack"],
    },
    library: {
      rootDir: flags["library-dir"],
    },
    images: {
      rootDir: flags["image-library"],
      allowEnvCredentials: readBooleanFlag(argv, flags, "allow-env-credentials", false),
      openaiBaseUrl: flags["openai-base-url"],
      env: {
        ...process.env,
        ...(flags["secret-ref"] ? { CLAWJS_OPENAI_IMAGE_SECRET_REF: flags["secret-ref"] } : {}),
        ...(flags["openai-base-url"] ? { CLAWJS_OPENAI_IMAGE_BASE_URL: flags["openai-base-url"] } : {}),
      },
    },
    notify: flags["notify-url"]
      ? {
        baseUrl: flags["notify-url"],
        sourceToken: flags["notify-source-token"],
        clientToken: flags["notify-client-token"],
      }
      : undefined,
    time: flags["time-url"] || process.env.CLAWJS_TIME_URL
      ? {
        baseUrl: flags["time-url"] || process.env.CLAWJS_TIME_URL || "",
        token: flags["time-token"] || process.env.CLAWJS_TIME_TOKEN,
      }
      : undefined,
  });
}

async function createCliWorkspaceClaw(
  runtimeAdapter: RuntimeAdapterId,
  flags: Record<string, string>,
  workspaceRoot: string,
  appId: string,
  workspaceId: string,
  agentId: string,
  _contextCwd: string,
): Promise<WorkspaceClawInstance> {
  return createWorkspaceClaw({
    runtime: {
      adapter: runtimeAdapter,
      agentDir: flags["agent-dir"],
      homeDir: flags["home-dir"],
      configPath: flags["config-path"],
      workspacePath: flags["runtime-workspace"],
      authStorePath: flags["auth-store"],
      gateway: {
        url: flags["gateway-url"],
        token: flags["gateway-token"],
        ...(flags["gateway-port"] ? { port: Number(flags["gateway-port"]) } : {}),
        configPath: flags["gateway-config"],
      },
    },
    workspace: {
      appId,
      workspaceId,
      agentId,
      rootDir: workspaceRoot,
    },
    templates: {
      pack: flags["template-pack"],
    },
    time: flags["time-url"] || process.env.CLAWJS_TIME_URL
      ? {
        baseUrl: flags["time-url"] || process.env.CLAWJS_TIME_URL || "",
        token: flags["time-token"] || process.env.CLAWJS_TIME_TOKEN,
      }
      : undefined,
  });
}

async function runCoreProductivityDbCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  workspaceRoot: string;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  wantsJson: boolean;
  appId: string;
  workspaceId: string;
  agentId: string;
  contextCwd: string;
}): Promise<number> {
  const { argv, flags, workspaceRoot, stdout, stderr, wantsJson, appId, workspaceId, agentId, contextCwd } = input;
  let { positionals } = input;
  const collectionName = coreProductivityCollection(positionals[1]);
  if (!collectionName) {
    throw new CliHandledError("usage_error", "Unknown productivity collection.", CLI_EXIT_USAGE);
  }
  const rawAction = positionals[2];
  const dbActions = new Set(["list", "get", "create", "update", "delete", "schema"]);
  const action = dbActions.has(rawAction || "") ? rawAction! : "create";
  if (!dbActions.has(rawAction || "")) {
    positionals = [positionals[0], positionals[1], "create", ...positionals.slice(2)];
  }
  const claw = await createCliWorkspaceClaw(resolveRuntimeAdapterId(flags), flags, workspaceRoot, appId, workspaceId, agentId, contextCwd);
  if (!wantsJson) stderr.write("Using local database for this project\n");

  const apiName = ({
    people: "people",
    saved_views: "savedViews",
    custom_fields: "customFields",
    field_values: "fieldValues",
  } as Record<string, string>)[collectionName] ?? collectionName;
  const api = (claw as unknown as Record<string, any>)[apiName];
  if (!api) {
    throw new CliHandledError("usage_error", `Unsupported productivity collection "${collectionName}".`, CLI_EXIT_USAGE);
  }

  if (action === "schema") {
    const primary = collectionName === "people" ? "displayName" : ["projects", "cycles", "saved_views", "custom_fields", "templates"].includes(collectionName) ? "name" : collectionName === "field_values" ? "fieldId" : collectionName === "comments" ? "body" : "title";
    writeJson(stdout, {
      exists: true,
      collection: {
        name: collectionName,
        builtin: true,
        protected: true,
        fields: [
          { name: "id", type: "text", required: true },
          { name: primary, type: "text", required: true },
          { name: "status", type: "text" },
          { name: "createdAt", type: "datetime" },
          { name: "updatedAt", type: "datetime" },
          { name: "archivedAt", type: "datetime" },
        ],
      },
      autoCreateOnWrite: false,
    });
    return CLI_EXIT_OK;
  }

  if (action === "list") {
    const items = await api.list({
      ...(flags.status ? { status: parseCsvFlag(flags.status) } : {}),
      ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
      ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
      ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
      ...(flags["anchor-id"] ? { anchorId: flags["anchor-id"] } : {}),
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
    });
    if (wantsJson) writeJson(stdout, items);
    else stdout.write(`${items.map((item: any) => `${item.status ?? ""} ${item.id} ${item.title ?? item.name ?? item.displayName ?? ""}`.trim()).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "get") {
    const id = positionals[3] || flags.id;
    if (!id) throw new CliHandledError("usage_error", "Usage: claw db <collection> get <id>", CLI_EXIT_USAGE);
    const item = collectionName === "people" ? await claw.people.get(id) : await api.get(id);
    if (!item) throw new CliHandledError("not_found", `${collectionName} record not found: ${id}`);
    if (wantsJson) writeJson(stdout, item);
    else stdout.write(`${Object.entries(item).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "delete") {
    const id = positionals[3] || flags.id;
    if (!id) throw new CliHandledError("usage_error", "Usage: claw db <collection> delete <id> [--force]", CLI_EXIT_USAGE);
    if (collectionName === "people") {
      throw new CliHandledError("unsupported_operation", "People records do not support delete through the productivity API.");
    }
    const force = readBooleanFlag(argv, flags, "force", false);
    if (force) {
      const removed = await api.remove(id);
      if (!removed) throw new CliHandledError("not_found", `${collectionName} record not found: ${id}`);
      if (wantsJson) writeJson(stdout, { ok: true, deleted: true, archived: false });
      else stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    const archived = await api.archive(id);
    if (wantsJson) writeJson(stdout, { ok: true, deleted: false, archived: true, record: archived });
    else stdout.write(`${archived.id}\n`);
    return CLI_EXIT_OK;
  }

  const { recordId, payload } = mergeCoreDbInput(action as "create" | "update", collectionName, positionals, flags, argv);
  if (action === "update" && !recordId) {
    throw new CliHandledError("usage_error", "Usage: claw db <collection> update <id> [--set key=value ...]", CLI_EXIT_USAGE);
  }

  let result: unknown;
  if (collectionName === "people") {
    const displayName = pickCoreTitle(collectionName, payload);
    if (!displayName) throw new CliHandledError("usage_error", "Usage: claw db people create <display-name>", CLI_EXIT_USAGE);
    result = await claw.people.upsert({
      id: action === "update" ? recordId : typeof payload.id === "string" ? payload.id : undefined,
      displayName,
      kind: payload.kind as "human" | "agent" | "org" | undefined,
      emails: Array.isArray(payload.emails) ? payload.emails as string[] : undefined,
      phones: Array.isArray(payload.phones) ? payload.phones as string[] : undefined,
      handles: Array.isArray(payload.handles) ? payload.handles as string[] : undefined,
      role: typeof payload.role === "string" ? payload.role : undefined,
      organization: typeof payload.organization === "string" ? payload.organization : undefined,
    });
  } else if (action === "create") {
    const requiredTitle = pickCoreTitle(collectionName, payload);
    if (!requiredTitle) throw new CliHandledError("usage_error", `Usage: claw db ${collectionName} create <title>`, CLI_EXIT_USAGE);
    result = await api.create(payload);
  } else {
    const current = await api.get(recordId);
    if (!current) throw new CliHandledError("not_found", `${collectionName} record not found: ${recordId}`);
    result = await api.update(recordId, payload);
  }

  if (wantsJson) writeJson(stdout, result);
  else {
    const record = result as { id?: string; title?: string; name?: string; displayName?: string };
    stdout.write(`${action === "create" ? "Created" : "Updated"} ${singularCoreCollection(collectionName)} ${record.id ?? ""} "${record.title ?? record.name ?? record.displayName ?? ""}"\n`);
  }
  return CLI_EXIT_OK;
}

async function archiveOrRemoveProductivityRecord(
  api: { archive: (id: string) => Promise<unknown>; remove: (id: string) => Promise<boolean> },
  id: string,
  argv: string[],
  flags: Record<string, string>,
  label: string,
): Promise<{ ok: true; deleted: boolean; archived: boolean; record?: unknown }> {
  if (readBooleanFlag(argv, flags, "force", false)) {
    const removed = await api.remove(id);
    if (!removed) throw new CliHandledError("not_found", `${label} record not found: ${id}`);
    return { ok: true, deleted: true, archived: false };
  }
  const record = await api.archive(id);
  return { ok: true, deleted: false, archived: true, record };
}

function resolveCliPackageVersion(): string | null {
  try {
    const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version?: string };
    return packageJson.version ?? null;
  } catch {
    return null;
  }
}

function resolveDatabaseDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["database-dir"]) {
    return path.resolve(contextCwd, flags["database-dir"]);
  }
  if (process.env.CLAWJS_DATABASE_DIR?.trim()) {
    return path.resolve(process.env.CLAWJS_DATABASE_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../database", import.meta.url)));
}

function resolveIotDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["iot-dir"]) {
    return path.resolve(contextCwd, flags["iot-dir"]);
  }
  if (process.env.CLAWJS_IOT_DIR?.trim()) {
    return path.resolve(process.env.CLAWJS_IOT_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../iot", import.meta.url)));
}

function resolveErpDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["erp-dir"]) {
    return path.resolve(contextCwd, flags["erp-dir"]);
  }
  if (process.env.CLAWJS_ERP_DIR?.trim()) {
    return path.resolve(process.env.CLAWJS_ERP_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../erp", import.meta.url)));
}

function resolveContentDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["content-dir"]) {
    return path.resolve(contextCwd, flags["content-dir"]);
  }
  if (process.env.CLAWJS_CONTENT_DIR?.trim()) {
    return path.resolve(process.env.CLAWJS_CONTENT_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../content", import.meta.url)));
}

async function runDelegatedDatabaseCli(
  argv: string[],
  flags: Record<string, string>,
  context: CliContext,
): Promise<number> {
  if (!flags["database-dir"] && !process.env.CLAWJS_DATABASE_DIR?.trim()) {
    return await runEmbeddedDatabaseCli({
      argv: argv.slice(1),
      flags,
      stdout: context.stdout,
      stderr: context.stderr,
    });
  }
  const databaseDir = resolveDatabaseDirectory(flags, context.cwd);
  if (!fs.existsSync(path.join(databaseDir, "package.json"))) {
    context.stderr.write(`Database CLI not found at ${databaseDir}\n`);
    return CLI_EXIT_FAILURE;
  }

  const distCliPath = path.join(databaseDir, "dist", "cli.js");
  const command = fs.existsSync(distCliPath) ? process.execPath : "npm";
  const args = fs.existsSync(distCliPath)
    ? [distCliPath, ...argv.slice(1)]
    : ["--prefix", databaseDir, "run", "cli", "--silent", "--", ...argv.slice(1)];

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: context.cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? CLI_EXIT_FAILURE);
    });
  });
}

async function runDelegatedIotCli(
  argv: string[],
  flags: Record<string, string>,
  context: CliContext,
): Promise<number> {
  const iotDir = resolveIotDirectory(flags, context.cwd);
  if (!fs.existsSync(path.join(iotDir, "package.json"))) {
    context.stderr.write(`IoT CLI not found at ${iotDir}\n`);
    return CLI_EXIT_FAILURE;
  }

  const distCliPath = path.join(iotDir, "dist", "cli.js");
  const command = fs.existsSync(distCliPath) ? process.execPath : "npm";
  const args = fs.existsSync(distCliPath)
    ? [distCliPath, ...argv.slice(1)]
    : ["--prefix", iotDir, "run", "cli", "--silent", "--", ...argv.slice(1)];

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: context.cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? CLI_EXIT_FAILURE);
    });
  });
}

async function runDelegatedErpCli(
  argv: string[],
  flags: Record<string, string>,
  context: CliContext,
): Promise<number> {
  const erpDir = resolveErpDirectory(flags, context.cwd);
  if (!fs.existsSync(path.join(erpDir, "package.json"))) {
    context.stderr.write(`ERP CLI not found at ${erpDir}\n`);
    return CLI_EXIT_FAILURE;
  }

  const distCliPath = path.join(erpDir, "dist", "cli.js");
  const command = fs.existsSync(distCliPath) ? process.execPath : "npm";
  const args = fs.existsSync(distCliPath)
    ? [distCliPath, ...argv.slice(1)]
    : ["--prefix", erpDir, "run", "cli", "--silent", "--", ...argv.slice(1)];

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: context.cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? CLI_EXIT_FAILURE);
    });
  });
}

async function runDelegatedContentCli(
  argv: string[],
  flags: Record<string, string>,
  context: CliContext,
): Promise<number> {
  const contentDir = resolveContentDirectory(flags, context.cwd);
  if (!fs.existsSync(path.join(contentDir, "package.json"))) {
    context.stderr.write(`Content CLI not found at ${contentDir}\n`);
    return CLI_EXIT_FAILURE;
  }

  const distCliPath = path.join(contentDir, "dist", "cli.js");
  const command = fs.existsSync(distCliPath) ? process.execPath : "npm";
  const args = fs.existsSync(distCliPath)
    ? [distCliPath, ...argv.slice(1)]
    : ["--prefix", contentDir, "run", "cli", "--silent", "--", ...argv.slice(1)];

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: context.cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? CLI_EXIT_FAILURE);
    });
  });
}

function resolveRelayBaseUrl(flags: Record<string, string>): string {
  const raw = flags["relay-url"] ?? process.env.CLAWJS_RELAY_URL ?? process.env.RELAY_URL ?? "";
  if (!raw.trim()) {
    throw new Error("--relay-url is required");
  }
  const trimmed = raw.trim().replace(/\/$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function requireRelayBrowserConfig(flags: Record<string, string>): {
  baseUrl: string;
  accessToken: string;
  tenantId: string;
  agentId: string;
  workspaceId: string;
} {
  const accessToken = (flags["access-token"] ?? process.env.CLAWJS_RELAY_ACCESS_TOKEN ?? "").trim();
  const tenantId = (flags["tenant-id"] ?? process.env.CLAWJS_RELAY_TENANT_ID ?? "").trim();
  const agentId = (flags["agent-id"] ?? process.env.CLAWJS_RELAY_AGENT_ID ?? "").trim();
  const workspaceId = (flags["workspace-id"] ?? process.env.CLAWJS_RELAY_WORKSPACE_ID ?? "").trim();
  if (!accessToken) throw new Error("--access-token is required");
  if (!tenantId) throw new Error("--tenant-id is required");
  if (!agentId) throw new Error("--agent-id is required");
  if (!workspaceId) throw new Error("--workspace-id is required");
  return {
    baseUrl: resolveRelayBaseUrl(flags),
    accessToken,
    tenantId,
    agentId,
    workspaceId,
  };
}

async function relayBrowserRequest<T>(
  flags: Record<string, string>,
  input: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
  },
): Promise<T> {
  const { baseUrl, accessToken } = requireRelayBrowserConfig(flags);
  const response = await fetch(`${baseUrl}${input.path}`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Relay browser request failed: ${response.status}`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

function parsePackageManager(value: string | undefined): SupportedPackageManager {
  if (!value || value === "npm") return "npm";
  if (value === "pnpm") return "pnpm";
  throw new CliHandledError("invalid_enum", `Invalid package manager "${value}". Allowed values: npm, pnpm.`, CLI_EXIT_USAGE);
}

function resolveTemplateName(type: ClawProjectType, value: string | undefined): string {
  if (value?.trim()) return value.trim();
  if (type === "app") return "next";
  return "node";
}

function resolveTemplateDirectory(type: ClawProjectType, templateName: string): string {
  const templateDir = path.join(CLI_TEMPLATE_ROOT, type);
  if (type === "app" && templateName !== "next") {
    throw new Error(`Unsupported template for ${type}: ${templateName}`);
  }
  if (type !== "app" && templateName !== "node") {
    throw new Error(`Unsupported template for ${type}: ${templateName}`);
  }
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Missing CLI template for ${type}.`);
  }
  return templateDir;
}

function buildScaffoldNextSteps(type: ClawProjectType, packageManager: SupportedPackageManager): string[] {
  if (type === "agent") {
    return [
      `${packageManager} run claw:init`,
      `${packageManager} run agent:report`,
      `${packageManager} run agent:reply -- "Say hello"`,
    ];
  }
  if (type === "skill") {
    return [
      `${packageManager} test`,
      `${packageManager} run skill:check`,
    ];
  }
  if (type === "plugin") {
    return [
      `${packageManager} test`,
      `${packageManager} run plugin:check`,
    ];
  }
  if (type === "workspace") {
    return [
      `${packageManager} run claw:init`,
      `${packageManager} run claw:info`,
    ];
  }
  return [
    `${packageManager} run claw:init`,
    `${packageManager} run dev`,
  ];
}

function buildScaffoldCompletionNote(type: ClawProjectType): string {
  if (type === "workspace") {
    return "The generated workspace is intentionally minimal. Add capabilities over time with `claw generate` and `claw add`.";
  }
  if (type === "skill") {
    return "The generated package is intentionally narrow: one skill, one contract, one harness, ready to reuse across agents.";
  }
  if (type === "plugin") {
    return "The generated package is broader than a skill: it combines config, hooks, compatibility metadata, and bundled logic in one distributable plugin.";
  }
  return "The generated project uses the demo adapter by default. Switch scripts and helpers to openclaw when you want a real runtime.";
}

function registerGeneratedSkillInLibrary(input: {
  id: string;
  title: string;
  sourcePath: string;
  flags: Record<string, string>;
}): void {
  const store = createLocalLibraryStore({ rootDir: input.flags["library-dir"] });
  const assetId = normalizeLibraryId(input.id, "skill");
  const existing = store.get(assetId);
  const payload = {
    title: input.title,
    source: {
      source: "local",
      path: input.sourcePath,
    },
  };
  if (existing) {
    store.update(assetId, payload);
    return;
  }
  store.create({
    id: assetId,
    kind: "skill",
    title: input.title,
    tags: parseCsvFlag(input.flags.tags),
    source: payload.source,
  });
}

function resolveProjectRootOrThrow(startDir: string, explicitProject?: string): string {
  const root = explicitProject ? path.resolve(startDir, explicitProject) : locateProjectRoot(startDir);
  if (!root) {
    throw new Error("No Claw project found. Run `claw new ...` first or pass --project to a folder that contains claw.project.json.");
  }
  if (!readProjectConfig(root)) {
    throw new Error(`Missing or invalid claw.project.json at ${root}.`);
  }
  return root;
}

async function runCliUnsafe(argv: string[], context: CliContext): Promise<number> {
  const positionals = extractPositionals(argv);
  const [group, command, subcommand] = positionals;
  const wantsJson = argv.includes("--json");
  const flags = parseFlags(argv);
  const binName = context.binName?.trim() || DEFAULT_CLI_BIN;
  const usage = buildCliUsage(binName);
  const wantsHelp = argv.includes("--help") || argv.includes("-h");

  if (group === "database" && wantsHelp) {
    try {
      return await runDelegatedDatabaseCli(argv, flags, context);
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "db" && wantsHelp) {
    return await runMagicDbCli({
      argv,
      positionals,
      flags,
      workspaceRoot: flags.workspace || context.cwd,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      binName,
    });
  }

  if (group === "memory") {
    const memoryWorkspaceRoot = flags.workspace || context.cwd;
    const memoryWorkspaceId = flags["workspace-id"] || pathSafeBasename(memoryWorkspaceRoot);
    const memoryAgentId = flags["agent-id"] || memoryWorkspaceId;
    const memoryRuntimeAdapterId = resolveRuntimeAdapterId(flags);
    return await runMemoryCli({
      argv,
      positionals,
      flags,
      workspaceRoot: memoryWorkspaceRoot,
      workspaceId: memoryWorkspaceId,
      agentId: memoryAgentId,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      binName,
      runtime: {
        list: async () => {
          const claw = await createCliClaw(memoryRuntimeAdapterId, flags, memoryWorkspaceRoot, flags["app-id"] || "clawjs-app", memoryWorkspaceId, memoryAgentId);
          return await claw.memory.list();
        },
        search: async (query) => {
          const claw = await createCliClaw(memoryRuntimeAdapterId, flags, memoryWorkspaceRoot, flags["app-id"] || "clawjs-app", memoryWorkspaceId, memoryAgentId);
          return await claw.memory.search(query);
        },
      },
    });
  }

  if (wantsHelp || group === "help") {
    context.stdout.write(`${usage}\n`);
    return CLI_EXIT_OK;
  }

  assertAllowedLocalFlags(group, argv);

  if (group === "database") {
    try {
      return await runDelegatedDatabaseCli(argv, flags, context);
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "db") {
    const dbWorkspaceRoot = flags.workspace || context.cwd;
    const dbCollection = coreProductivityCollection(positionals[1]);
    if (dbCollection && !flags.url) {
      return await runCoreProductivityDbCli({
        argv,
        positionals,
        flags,
        workspaceRoot: dbWorkspaceRoot,
        stdout: context.stdout,
        stderr: context.stderr,
        wantsJson,
        appId: flags["app-id"] || "clawjs-app",
        workspaceId: flags["workspace-id"] || pathSafeBasename(dbWorkspaceRoot),
        agentId: flags["agent-id"] || flags["workspace-id"] || pathSafeBasename(dbWorkspaceRoot),
        contextCwd: context.cwd,
      });
    }
    return await runMagicDbCli({
      argv,
      positionals,
      flags,
      workspaceRoot: dbWorkspaceRoot,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      binName,
    });
  }

  if (group === "content") {
    try {
      return await runDelegatedContentCli(argv, flags, context);
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "erp") {
    try {
      return await runDelegatedErpCli(argv, flags, context);
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "iot") {
    try {
      return await runDelegatedIotCli(argv, flags, context);
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "notify" && command === "send") {
    try {
      const claw = await createCliClaw(resolveRuntimeAdapterId(flags), flags, context.cwd, "notify-cli", "notify-cli", "notify-cli");
      const input = {
        ...(flags["idempotency-key"] ? { idempotencyKey: flags["idempotency-key"] } : {}),
        ...(flags.priority ? { priority: flags.priority as "passive" | "normal" | "time-sensitive" | "critical" } : {}),
        ...(parseJsonFlag<Record<string, unknown>>(flags["audience-json"], "--audience-json") ? { audience: parseJsonFlag<Record<string, unknown>>(flags["audience-json"], "--audience-json") } : {}),
        context: parseJsonFlag<Record<string, unknown>>(flags["context-json"], "--context-json")
          ?? {
            tenantId: flags["tenant-id"] ?? "",
            ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
            ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
            ...(flags["workspace-id"] ? { workspaceId: flags["workspace-id"] } : {}),
            ...(flags["event-type"] ? { eventType: flags["event-type"] } : {}),
            ...(flags.severity ? { severity: flags.severity } : {}),
          },
        delivery: parseJsonFlag<Record<string, unknown>>(flags["delivery-json"], "--delivery-json")
          ?? {
            ...(flags.mode ? { mode: flags.mode } : {}),
            ...(flags.title ? { title: flags.title } : {}),
            ...(flags.body ? { body: flags.body } : {}),
            ...(flags["target-client-app-id"] ? { targetClientAppId: flags["target-client-app-id"] } : {}),
          },
        ...(parseJsonFlag<Record<string, unknown>>(flags["receipt-policy-json"], "--receipt-policy-json")
          ? { receiptPolicy: parseJsonFlag<Record<string, unknown>>(flags["receipt-policy-json"], "--receipt-policy-json") }
          : {}),
      } as unknown as Parameters<typeof claw.notify.send>[0];
      const payload = await claw.notify.send(input);
      if (wantsJson) {
        writeJson(context.stdout, payload);
      } else {
        context.stdout.write(`${payload.notification.id}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "notify" && command === "cancel") {
    try {
      const notificationId = subcommand || flags["notification-id"];
      if (!notificationId) {
        context.stderr.write(`Usage: ${binName} notify cancel <notification-id> --notify-url URL --notify-source-token TOKEN\n`);
        return CLI_EXIT_USAGE;
      }
      const claw = await createCliClaw(resolveRuntimeAdapterId(flags), flags, context.cwd, "notify-cli", "notify-cli", "notify-cli");
      const payload = await claw.notify.cancel(notificationId);
      if (wantsJson) {
        writeJson(context.stdout, payload);
      } else {
        context.stdout.write(`${payload.notification.status}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "notify" && command === "subscriptions" && subcommand === "upsert") {
    try {
      const claw = await createCliClaw(resolveRuntimeAdapterId(flags), flags, context.cwd, "notify-cli", "notify-cli", "notify-cli");
      const payload = await claw.notify.subscriptions.upsert({
        ...(flags.id ? { id: flags.id } : {}),
        ...(flags["source-app-id"] ? { sourceAppId: flags["source-app-id"] } : {}),
        ...(flags["client-app-id"] ? { clientAppId: flags["client-app-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        ...(flags["workspace-id"] ? { workspaceId: flags["workspace-id"] } : {}),
        ...(flags["event-type"] ? { eventType: flags["event-type"] } : {}),
        ...(flags.severity ? { severity: flags.severity } : {}),
        ...(flags["min-priority"] ? { minPriority: flags["min-priority"] as "passive" | "normal" | "time-sensitive" | "critical" } : {}),
        ...(flags.action ? { action: flags.action as "allow" | "mute" } : {}),
        ...(readBooleanFlag(argv, flags, "installation-scoped", false) ? { installationScoped: true } : {}),
      });
      if (wantsJson) {
        writeJson(context.stdout, payload);
      } else {
        context.stdout.write(`${payload.subscription.id}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "notify" && command === "subscriptions" && subcommand === "delete") {
    try {
      const id = extractPositionals(argv)[3] || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} notify subscriptions delete <id> --notify-url URL --notify-client-token TOKEN\n`);
        return CLI_EXIT_USAGE;
      }
      const claw = await createCliClaw(resolveRuntimeAdapterId(flags), flags, context.cwd, "notify-cli", "notify-cli", "notify-cli");
      const payload = await claw.notify.subscriptions.remove(id);
      if (wantsJson) {
        writeJson(context.stdout, payload);
      } else {
        context.stdout.write(`${payload.ok}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  const workspaceRoot = flags.workspace || context.cwd;
  const appId = flags["app-id"] || "clawjs-app";
  const workspaceId = flags["workspace-id"] || pathSafeBasename(workspaceRoot);
  const agentId = flags["agent-id"] || workspaceId;
  const runtimeAdapterId = resolveRuntimeAdapterId(flags);
  const runtimeAdapter = getRuntimeAdapter(runtimeAdapterId);
  const mediaGroup = group === "image" || group === "audio" || group === "video" ? group : null;

  async function getTypedGenerationFacade(kind: MediaKind) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
    switch (kind) {
      case "image":
        return { claw, media: claw.image };
      case "audio":
        return { claw, media: claw.audio };
      case "video":
        return { claw, media: claw.video };
    }
  }

  async function getImageGenerationFacade(): Promise<{ claw: ClawInstance; media: ClawInstance["image"] }> {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
    return { claw, media: claw.image };
  }

  if (group === "new") {
    const type = command as ClawProjectType | undefined;
    const projectName = subcommand;
    const supportedTypes: ClawProjectType[] = ["app", "agent", "server", "workspace", "skill", "plugin"];
    if (!type || !supportedTypes.includes(type) || !projectName) {
      context.stderr.write(`Usage: ${binName} new app|agent|server|workspace|skill|plugin <name> [--dir PATH] [--template NAME] [--package-manager npm|pnpm] [--git] [--install] [--yes]\n`);
      return CLI_EXIT_USAGE;
    }

    const templateName = resolveTemplateName(type, flags.template);
    const targetPath = path.resolve(context.cwd, flags.dir || projectName);
    const slug = createPackageName(projectName, `claw-${type}`);
    const title = createTitle(slug, `Claw ${createPascalCase(type, "Project")}`);
    const packageManager = flags["package-manager"] || flags.pm
      ? parsePackageManager(flags["package-manager"] || flags.pm)
      : detectPackageManager();
    const install = readBooleanFlag(argv, flags, "install", !argv.includes("--no-install") && !argv.includes("--skip-install"));
    const git = readBooleanFlag(argv, flags, "git", false);

    try {
      const scaffoldContext = wantsJson ? { ...context, stdout: context.stderr } : context;
      await scaffoldProject({
        context: scaffoldContext,
        targetPath,
        templateDir: resolveTemplateDirectory(type, templateName),
        replacements: {
          "__APP_NAME__": slug,
          "__APP_SLUG__": slug,
          "__APP_TITLE__": title,
          "__APP_PASCAL__": createPascalCase(slug, "ClawProject"),
        },
        packageManager,
        install,
        git,
        successLabel: `${type} ${slug}`,
        nextSteps: buildScaffoldNextSteps(type, packageManager),
        completionNote: buildScaffoldCompletionNote(type),
      });
      let libraryAsset: unknown;
      if (type === "skill" && !argv.includes("--no-library")) {
        registerGeneratedSkillInLibrary({
          id: slug,
          title,
          sourcePath: targetPath,
          flags,
        });
        libraryAsset = { id: slug, path: targetPath };
      }
      if (wantsJson) {
        writeJson(context.stdout, {
          ok: true,
          type,
          name: slug,
          targetPath,
          template: templateName,
          packageManager,
          install,
          git,
          ...(libraryAsset ? { libraryAsset } : {}),
        });
      }
      return CLI_EXIT_OK;
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "generate") {
    const resource = command as ClawResourceType | undefined;
    const resourceName = subcommand;
    const supportedResources: ClawResourceType[] = ["skill", "plugin", "provider", "channel", "command"];
    if (!resource || !supportedResources.includes(resource) || !resourceName) {
      context.stderr.write(`Usage: ${binName} generate skill|plugin|provider|channel|command <name> [--project PATH]\n`);
      return CLI_EXIT_USAGE;
    }

    try {
      const projectRoot = resolveProjectRootOrThrow(context.cwd, flags.project);
      const config = readProjectConfig(projectRoot);
      if (!config) {
        throw new Error(`Missing or invalid claw.project.json at ${projectRoot}.`);
      }
      const created = await generateProjectResource(projectRoot, config, resource, resourceName);
      let libraryAsset: unknown;
      if (resource === "skill" && !argv.includes("--no-library")) {
        registerGeneratedSkillInLibrary({
          id: created.id,
          title: createTitle(created.id, created.id),
          sourcePath: path.join(projectRoot, created.path),
          flags,
        });
        libraryAsset = { id: created.id, path: path.join(projectRoot, created.path) };
      }
      if (wantsJson) {
        writeJson(context.stdout, {
          ok: true,
          projectRoot,
          resource,
          created,
          ...(libraryAsset ? { libraryAsset } : {}),
        });
      } else {
        context.stdout.write(`generated ${resource} ${created.id} -> ${created.path}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "add") {
    const integration = command as ClawIntegrationType | undefined;
    const supportedIntegrations: ClawIntegrationType[] = ["provider", "channel", "telegram", "scheduler", "memory", "workspace"];
    if (!integration || !supportedIntegrations.includes(integration)) {
      context.stderr.write(`Usage: ${binName} add provider|channel|telegram|scheduler|memory|workspace [name] [--project PATH]\n`);
      return CLI_EXIT_USAGE;
    }

    try {
      const projectRoot = resolveProjectRootOrThrow(context.cwd, flags.project);
      const config = readProjectConfig(projectRoot);
      if (!config) {
        throw new Error(`Missing or invalid claw.project.json at ${projectRoot}.`);
      }
      const packageManager = flags["package-manager"] || flags.pm
        ? parsePackageManager(flags["package-manager"] || flags.pm)
        : detectPackageManager();
      const result = await addProjectIntegration(projectRoot, config, integration, {
        name: subcommand || flags.name,
        packageManager,
        runCommand: context.runCommand,
      });
      if (wantsJson) {
        writeJson(context.stdout, {
          ok: true,
          projectRoot,
          integration,
          ...result,
        });
      } else {
        context.stdout.write(`added ${integration} ${result.created.id} -> ${result.created.path}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "info") {
    try {
      const projectRoot = flags.project ? path.resolve(context.cwd, flags.project) : locateProjectRoot(context.cwd);
      const info: {
        projectRoot: string | null;
        project: unknown;
        packageJson: unknown;
        installedSdkVersion: string | null;
        workspace: unknown;
      } = projectRoot
        ? await collectProjectInfo(projectRoot) as {
          projectRoot: string | null;
          project: unknown;
          packageJson: unknown;
          installedSdkVersion: string | null;
          workspace: unknown;
        }
        : { projectRoot: null, project: null, packageJson: null, installedSdkVersion: null, workspace: null };
      const payload: {
        cli: { binName: string; package: string; version: string | null };
        projectRoot: string | null;
        project: unknown;
        packageJson: unknown;
        installedSdkVersion: string | null;
        workspace: unknown;
      } = {
        cli: {
          binName,
          package: "@clawjs/cli",
          version: resolveCliPackageVersion(),
        },
        ...info,
      };
      if (wantsJson) {
        writeJson(context.stdout, payload);
      } else {
        context.stdout.write(`cli: ${payload.cli.version ?? "unknown"}\n`);
        const project = (payload.project as { type?: string; name?: string; runtime?: { adapter?: string } } | null) ?? null;
        if (project) {
          context.stdout.write(`project: ${project.type ?? "unknown"} ${project.name ?? "unnamed"}\n`);
          context.stdout.write(`runtime: ${project.runtime?.adapter ?? "unknown"}\n`);
        } else {
          context.stdout.write("project: not detected\n");
        }
        const workspace = payload.workspace as { manifestPath?: string } | null;
        context.stdout.write(`workspace: ${workspace?.manifestPath ?? "not initialized"}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "runtime" && command === "status") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.runtime.status();
    if (wantsJson) {
      writeJson(context.stdout, status);
    } else {
      context.stdout.write(`runtime: ${status.runtimeName}\n`);
      context.stdout.write(`adapter: ${status.adapter}\n`);
      context.stdout.write(`cliAvailable: ${status.cliAvailable}\n`);
      context.stdout.write(`version: ${status.version ?? "unknown"}\n`);
    }
    return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "runtime" && command === "install") {
    const installer = flags.installer === "pnpm" ? "pnpm" : "npm";
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const installCommand = claw.runtime.installCommand(installer);
    if (argv.includes("--dry-run")) {
      if (wantsJson) {
        writeJson(context.stdout, { ...installCommand, plan: claw.runtime.installPlan(installer), adapter: runtimeAdapterId });
      } else {
        context.stdout.write(`${installCommand.command} ${installCommand.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    await claw.runtime.install(installer, (event) => {
      if (!wantsJson) writeProgress(context.stdout, event);
    });
    if (wantsJson) writeJson(context.stdout, { ok: true, adapter: runtimeAdapterId });
    return CLI_EXIT_OK;
  }

  if (group === "runtime" && command === "uninstall") {
    const installer = flags.installer === "pnpm" ? "pnpm" : "npm";
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const uninstallCommand = claw.runtime.uninstallCommand(installer);
    if (argv.includes("--dry-run")) {
      if (wantsJson) {
        writeJson(context.stdout, { ...uninstallCommand, plan: claw.runtime.uninstallPlan(installer), adapter: runtimeAdapterId });
      } else {
        context.stdout.write(`${uninstallCommand.command} ${uninstallCommand.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    await claw.runtime.uninstall(installer, (event) => {
      if (!wantsJson) writeProgress(context.stdout, event);
    });
    if (wantsJson) writeJson(context.stdout, { ok: true, adapter: runtimeAdapterId });
    return CLI_EXIT_OK;
  }

  if (group === "runtime" && command === "repair") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (argv.includes("--dry-run")) {
      if (wantsJson) {
        writeJson(context.stdout, { ...claw.runtime.repairCommand(), plan: claw.runtime.repairPlan(), adapter: runtimeAdapterId });
      } else {
        const commandSpec = claw.runtime.repairCommand();
        context.stdout.write(`${commandSpec.command} ${commandSpec.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    await claw.runtime.repair((event) => {
      if (!wantsJson) writeProgress(context.stdout, event);
    });
    if (wantsJson) writeJson(context.stdout, { ok: true, adapter: runtimeAdapterId });
    return CLI_EXIT_OK;
  }

  if (group === "runtime" && command === "setup-workspace") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const setupCommand = claw.runtime.setupWorkspaceCommand();
    if (argv.includes("--dry-run")) {
      if (wantsJson) {
        writeJson(context.stdout, { ...setupCommand, plan: claw.runtime.setupWorkspacePlan(), adapter: runtimeAdapterId });
      } else {
        context.stdout.write(`${setupCommand.command} ${setupCommand.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    await claw.runtime.setupWorkspace((event) => {
      if (!wantsJson) writeProgress(context.stdout, event);
    });
    if (wantsJson) {
      writeJson(context.stdout, { ok: true, ...setupCommand, adapter: runtimeAdapterId });
    } else {
      context.stdout.write("ok\n");
    }
    return CLI_EXIT_OK;
  }

  if (group === "compat") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (argv.includes("--refresh")) {
      const snapshot = await claw.compat.refresh();
      const status = await claw.runtime.status();
      const compat = runtimeAdapter.buildCompatReport(status);
      if (wantsJson) {
        writeJson(context.stdout, { compat, snapshot, adapter: runtimeAdapterId });
      } else {
        context.stdout.write(`degraded: ${compat.degraded}\n`);
        context.stdout.write(`snapshot: ${snapshot.runtimeVersion ?? "unknown"}\n`);
      }
      return compat.degraded ? CLI_EXIT_DEGRADED : CLI_EXIT_OK;
    }
    const status = await claw.runtime.status();
    const compat = runtimeAdapter.buildCompatReport(status);
    if (wantsJson) {
      writeJson(context.stdout, { compat, snapshot: claw.compat.read(), adapter: runtimeAdapterId });
    } else {
      context.stdout.write(`degraded: ${compat.degraded}\n`);
      if (compat.issues.length > 0) {
        context.stdout.write(`${compat.issues.join("\n")}\n`);
      }
    }
    return compat.degraded ? CLI_EXIT_DEGRADED : CLI_EXIT_OK;
  }

  if (group === "browser" && (command === "status" || command === "ensure" || command === "share")) {
    try {
      const relay = requireRelayBrowserConfig(flags);
      const browserPath = `/tenants/${relay.tenantId}/agents/${relay.agentId}/workspaces/${relay.workspaceId}/browser/session`;
      const payload = command === "status"
        ? await relayBrowserRequest<{
            session: Record<string, unknown>;
            sharePath: string;
            shareUrl: string;
          }>(flags, {
            method: "GET",
            path: browserPath,
          })
        : await relayBrowserRequest<{
            session: Record<string, unknown>;
            sharePath: string;
            shareUrl: string;
          }>(flags, {
            method: "POST",
            path: browserPath,
            ...(flags.url?.trim() ? { body: { initialUrl: flags.url.trim() } } : {}),
          });
      if (wantsJson) {
        writeJson(context.stdout, payload);
      } else if (command === "share") {
        context.stdout.write(`${payload.shareUrl}\n`);
      } else if (command === "status") {
        context.stdout.write(`${String((payload.session as { status?: string })?.status ?? "unknown")}\n`);
      } else {
        context.stdout.write(`${payload.shareUrl}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "doctor") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const doctor = await claw.doctor.run();
    const projectRoot = locateProjectRoot(context.cwd);
    const project = projectRoot ? readProjectConfig(projectRoot) : null;
    const payload = {
      ...doctor,
      cli: {
        package: "@clawjs/cli",
        version: resolveCliPackageVersion(),
        binName,
        projectRoot,
        projectType: project?.type ?? null,
      },
    };
    if (wantsJson) {
      writeJson(context.stdout, payload);
    } else {
      context.stdout.write(`ok: ${doctor.ok}\n`);
      if (project) {
        context.stdout.write(`project: ${project.type} ${project.name}\n`);
      }
      if (doctor.issues.length > 0) {
        context.stdout.write(`${doctor.issues.map((issue) => issue.message).join("\n")}\n`);
      }
    }
    return doctor.ok ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "workspace" && command === "init") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    await claw.workspace.init();
    const inspected = await claw.workspace.inspect();
    if (wantsJson) {
      writeJson(context.stdout, {
        manifestPath: inspected.manifestPath,
        runtimeAdapter: runtimeAdapterId,
        canonicalPaths: claw.workspace.canonicalPaths(),
      });
    } else {
      context.stdout.write(`${inspected.manifestPath}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "workspace" && command === "attach") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const manifest = await claw.workspace.attach();
    if (wantsJson) {
      writeJson(context.stdout, manifest);
    } else {
      context.stdout.write(`${manifest?.workspaceId ?? "missing"}\n`);
    }
    return manifest ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "workspace" && command === "inspect") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const workspaceClaw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    const inspected = await claw.workspace.inspect();
    const productivity = await workspaceClaw.productivity.inspect();
    const hasLocalProductivityState = fs.existsSync(productivity.dataPath);
    if (wantsJson) {
      writeJson(context.stdout, { ...inspected, productivity });
    } else {
      context.stdout.write(`manifest: ${inspected.manifest ? "present" : "missing"}\n`);
      context.stdout.write(`compatSnapshot: ${inspected.compatSnapshot ? "present" : "missing"}\n`);
      context.stdout.write(`productivityDb: ${productivity.dataPath}\n`);
      context.stdout.write(`productivitySchema: ${productivity.schemaVersion}\n`);
    }
    return inspected.manifest || hasLocalProductivityState ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "workspace" && command === "discover") {
    const roots = flags.root ? [flags.root] : [workspaceRoot];
    const discovered = discoverWorkspaces({
      roots,
      ...(flags["max-depth"] ? { maxDepth: Number(flags["max-depth"]) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, discovered);
    } else {
      context.stdout.write(`${discovered.map((entry) => entry.rootDir).join("\n")}\n`);
    }
    return discovered.length > 0 ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "workspace" && command === "validate") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const validation = await claw.workspace.validate();
    if (wantsJson) {
      writeJson(context.stdout, validation);
    } else {
      context.stdout.write(`ok: ${validation.ok}\n`);
      if (validation.missingFiles.length > 0) {
        context.stdout.write(`missingFiles: ${validation.missingFiles.join(", ")}\n`);
      }
    }
    return validation.ok ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "workspace" && command === "reset") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const resetOptions = {
      removeManifest: readBooleanFlag(argv, flags, "remove-manifest", true),
      removeCompat: readBooleanFlag(argv, flags, "remove-compat", true),
      removeProjections: readBooleanFlag(argv, flags, "remove-projections", readBooleanFlag(argv, flags, "remove-bindings", true)),
      removeObserved: readBooleanFlag(argv, flags, "remove-observed", readBooleanFlag(argv, flags, "remove-state", true)),
      removeIntents: readBooleanFlag(argv, flags, "remove-intents", true),
      removeSessions: readBooleanFlag(argv, flags, "remove-sessions", true),
      removeAudit: readBooleanFlag(argv, flags, "remove-audit", true),
      removeBackups: readBooleanFlag(argv, flags, "remove-backups", false),
      removeLocks: readBooleanFlag(argv, flags, "remove-locks", false),
      removeRuntimeFiles: readBooleanFlag(argv, flags, "remove-runtime-files", false),
    };
    if (argv.includes("--dry-run")) {
      const plan = await claw.workspace.previewReset(resetOptions);
      if (wantsJson) {
        writeJson(context.stdout, plan);
      } else {
        context.stdout.write(`${plan.targets.map((target) => `${target.exists ? "remove" : "skip"} ${target.path}`).join("\n")}\n`);
      }
      return CLI_EXIT_OK;
    }
    const result = await claw.workspace.reset(resetOptions);
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      context.stdout.write(`removed=${result.removedPaths.length} preserved=${result.preservedPaths.length}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "workspace" && command === "repair") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const workspaceClaw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    const repaired = await claw.workspace.repair();
    const productivity = await workspaceClaw.productivity.repair();
    if (wantsJson) {
      writeJson(context.stdout, { ...repaired, productivity });
    } else {
      context.stdout.write(`createdDirectories=${repaired.createdDirectories.length} createdRuntimeFiles=${repaired.createdRuntimeFiles.length}\n`);
      context.stdout.write(`repairedRecords=${productivity.repairedRecords} reindexed=${productivity.reindexed}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "models" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const models = await claw.models.list();
    if (wantsJson) {
      writeJson(context.stdout, models);
    } else {
      context.stdout.write(`${models.map((model) => `${model.isDefault ? "*" : "-"} ${model.id}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "models" && command === "default") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const model = await claw.models.getDefault();
    if (wantsJson) {
      writeJson(context.stdout, model);
    } else {
      context.stdout.write(`${model?.modelId ?? "none"}\n`);
    }
    return model ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "models" && command === "set-default") {
    const target = flags.model;
    if (!target) {
      context.stderr.write("--model is required\n");
      return CLI_EXIT_USAGE;
    }
    if (argv.includes("--dry-run")) {
      if (runtimeAdapterId !== "openclaw") {
        const commandSpec = runtimeAdapterId === "zeroclaw"
          ? { command: "write-config", args: [`default_model=${target}`] }
          : { command: "picoclaw", args: ["model", target] };
        if (wantsJson) {
          writeJson(context.stdout, { ...commandSpec, modelId: target, adapter: runtimeAdapterId });
        } else {
          context.stdout.write(`${commandSpec.command} ${commandSpec.args.join(" ")}\n`);
        }
        return CLI_EXIT_OK;
      }
      const commandSpec = buildSetDefaultModelCommand(target, agentId);
      if (wantsJson) {
        writeJson(context.stdout, {
          command: "openclaw",
          args: commandSpec.args,
          modelId: commandSpec.modelId,
          adapter: runtimeAdapterId,
        });
      } else {
        context.stdout.write(`openclaw ${commandSpec.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const modelId = await claw.models.setDefault(target);
    if (wantsJson) {
      writeJson(context.stdout, { modelId, adapter: runtimeAdapterId });
    } else {
      context.stdout.write(`${modelId}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "providers" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const providers = await claw.providers.list();
    if (wantsJson) {
      writeJson(context.stdout, providers);
    } else {
      context.stdout.write(`${providers.map((provider) => `${provider.id}:${provider.local ? "local" : "remote"}`).join("\n")}\n`);
    }
    return providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "providers" && command === "catalog") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const catalog = await claw.providers.catalog();
    if (wantsJson) {
      writeJson(context.stdout, catalog);
    } else {
      context.stdout.write(`${catalog.providers.map((provider) => provider.id).join("\n")}\n`);
    }
    return catalog.providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "providers" && command === "auth-state") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const state = await claw.providers.authState();
    if (wantsJson) {
      writeJson(context.stdout, state);
    } else {
      context.stdout.write(`${Object.entries(state.providers).map(([provider, summary]) => `${provider}:${summary.hasAuth ? "ready" : "missing"}`).join("\n")}\n`);
    }
    return Object.keys(state.providers).length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "secrets" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const secrets = await claw.secrets.list(flags.search);
    if (wantsJson) {
      writeJson(context.stdout, secrets);
    } else {
      context.stdout.write(`${secrets.map((secret) => `${secret.name}${secret.typeId ? ` [${secret.typeId}]` : ""}`).join("\n")}\n`);
    }
    return secrets.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "secrets" && command === "describe") {
    const name = flags.name || flags.id;
    if (!name) {
      context.stderr.write("--name is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const secret = await claw.secrets.describe(name);
    if (wantsJson) {
      writeJson(context.stdout, secret);
    } else {
      context.stdout.write(`${secret ? `${secret.name}${secret.typeId ? ` [${secret.typeId}]` : ""}` : "missing"}\n`);
    }
    return secret ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "secrets" && command === "types") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const types = await claw.secrets.types(flags.search);
    if (wantsJson) {
      writeJson(context.stdout, types);
    } else {
      context.stdout.write(`${types.map((type) => `${type.typeId} ${type.label}`).join("\n")}\n`);
    }
    return types.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "secrets" && command === "capabilities") {
    const name = flags.name || flags.id;
    if (!name) {
      context.stderr.write("--name is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const payload = await claw.secrets.capabilities(name);
    if (wantsJson) {
      writeJson(context.stdout, payload);
    } else {
      context.stdout.write(`${payload.capabilities.map((entry) => `${entry.capability}:${entry.allowed ? "allow" : "deny"}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "secrets" && command === "broker" && subcommand === "http") {
    const url = flags.url;
    if (!url) {
      context.stderr.write("--url is required\n");
      return CLI_EXIT_USAGE;
    }
    const method = flags.method || "GET";
    const headers = parseJsonFlag<Record<string, string>>(flags["headers-json"], "--headers-json");
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const payload = await claw.secrets.brokerHttp({
      method,
      url,
      ...(headers ? { headers } : {}),
      ...(flags.body ? { body: flags.body } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, payload);
    } else {
      context.stdout.write(`${payload.status}\n${payload.bodyText}\n`);
    }
    return payload.ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "secrets" && command === "leases" && subcommand === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const leases = await claw.secrets.leases();
    if (wantsJson) {
      writeJson(context.stdout, leases);
    } else {
      context.stdout.write(`${leases.map((lease) => `${lease.secretName} ${lease.mode} ${lease.revokedAt ? "revoked" : lease.consumedAt ? "consumed" : "active"}`).join("\n")}\n`);
    }
    return leases.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "auth" && command === "status") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const auth = await claw.auth.status();
    if (wantsJson) {
      writeJson(context.stdout, auth);
    } else {
      context.stdout.write(`${Object.values(auth).map((summary) => `${summary.provider}:${summary.authType ?? "none"}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "auth" && command === "login") {
    const provider = flags.provider || (runtimeAdapterId === "codex" ? "openai-codex" : undefined);
    if (!provider) {
      context.stderr.write("--provider is required\n");
      return CLI_EXIT_USAGE;
    }
    if (runtimeAdapterId === "codex" && readBooleanFlag(argv, flags, "force", false) && !argv.includes("--dry-run")) {
      const logoutCommand = buildCodexCommand(["logout"], {
        homeDir: flags["home-dir"],
        env: process.env,
      });
      const logoutExitCode = await runForegroundProcess(logoutCommand.command, logoutCommand.args, {
        cwd: workspaceRoot,
        env: logoutCommand.env,
        stdout: context.stdout,
        stderr: context.stderr,
      });
      if (logoutExitCode !== CLI_EXIT_OK) return logoutExitCode;
    }
    if (argv.includes("--dry-run")) {
      const launched = await runtimeAdapter.login(provider, {
        spawnDetachedPty(command, args) {
          return { pid: undefined, command, args };
        },
      }, {
        adapter: runtimeAdapterId,
        agentId,
        agentDir: flags["agent-dir"],
        cwd: workspaceRoot,
        setDefault: flags["set-default"] !== "false",
      } as never);
      if (wantsJson) {
        writeJson(context.stdout, launched);
      } else {
        context.stdout.write(`${launched.command ?? ""} ${(launched.args ?? []).join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const launched = await claw.auth.login(provider, {
      setDefault: flags["set-default"] !== "false",
    });
    if (wantsJson) {
      writeJson(context.stdout, launched);
    } else {
      context.stdout.write(
        launched.status === "reused"
          ? `${launched.provider} reused\n`
          : `${launched.provider} ${launched.pid ?? "unknown"}\n`,
      );
    }
    return CLI_EXIT_OK;
  }

  if (group === "auth" && command === "remove") {
    const provider = flags.provider || (runtimeAdapterId === "codex" ? "openai-codex" : undefined);
    if (!provider) {
      context.stderr.write("--provider is required\n");
      return CLI_EXIT_USAGE;
    }
    if (runtimeAdapterId === "codex") {
      const logoutCommand = buildCodexCommand(["logout"], {
        homeDir: flags["home-dir"],
        env: process.env,
      });
      return await runForegroundProcess(logoutCommand.command, logoutCommand.args, {
        cwd: workspaceRoot,
        env: logoutCommand.env,
        stdout: context.stdout,
        stderr: context.stderr,
      });
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const removed = claw.auth.removeProvider(provider);
    if (wantsJson) {
      writeJson(context.stdout, { removed });
    } else {
      context.stdout.write(`${removed}\n`);
    }
    return removed > 0 ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "scheduler" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const schedulers = await claw.scheduler.list();
    if (wantsJson) {
      writeJson(context.stdout, schedulers);
    } else {
      context.stdout.write(`${schedulers.map((entry) => `${entry.enabled ? "*" : "-"} ${entry.id}`).join("\n")}\n`);
    }
    return schedulers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "scheduler" && (command === "run" || command === "enable" || command === "disable")) {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (command === "run") await claw.scheduler.run(id);
    if (command === "enable") await claw.scheduler.enable(id);
    if (command === "disable") await claw.scheduler.disable(id);
    if (wantsJson) {
      writeJson(context.stdout, { ok: true, id, command });
    } else {
      context.stdout.write("ok\n");
    }
    return CLI_EXIT_OK;
  }

  if (group === "time") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (command === "list") {
      const payload = await claw.time.list({
        kind: flags.kind as TemporalItem["kind"] | undefined,
        status: flags.status as TemporalItem["status"] | undefined,
        workspaceId: flags["workspace-id"] || workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        ...(flags["owner-id"] ? { ownerId: flags["owner-id"] } : {}),
        ...(flags["source-provider"] ? { sourceProvider: flags["source-provider"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.items.map((item) => `${item.id} ${item.kind} ${item.status} ${item.title}`).join("\n")}\n`);
      return payload.items.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw time get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.time.get(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.item.id} ${payload.item.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const kind = (subcommand || flags.kind) as "event" | "routine" | "reminder" | "deadline" | "follow_up" | undefined;
      const title = extractPositionals(argv)[3] || flags.title;
      if (!kind || !title) {
        context.stderr.write("Usage: claw time create <kind> <title> [--starts-at ISO|--cron EXPR|--rrule RRULE|--after 24h --anchor-type thread --anchor-id ID --anchor-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.time.create({
        kind,
        title,
        description: flags.description,
        location: flags.location,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        ...(flags.timezone ? { timezone: flags.timezone } : {}),
        ...(flags.cron || flags.rrule || flags["after"]
          ? {
              schedule: {
                mode: flags["after"] ? "relative" : flags.rrule ? "rrule" : flags.cron ? "cron" : "one_off",
                timezone: flags.timezone || "UTC",
                ...(flags.cron ? { cron: flags.cron } : {}),
                ...(flags.rrule ? { rrule: flags.rrule } : {}),
                ...(flags["after"]
                  ? {
                      relative: {
                        anchorType: (flags["anchor-type"] || "thread") as NonNullable<TemporalItem["anchorType"]>,
                        anchorId: flags["anchor-id"] || "",
                        anchorAt: flags["anchor-at"] || new Date().toISOString(),
                        offsetMs: Number(flags["after-ms"] || 0),
                        ...(flags["cancel-on"] ? { cancelOn: flags["cancel-on"] as "reply_received" | "task_completed" | "event_started" | "execution_succeeded" } : {}),
                      },
                    }
                  : {}),
              },
            }
          : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.item.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw time update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.time.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "cancelled" | "completed" | undefined,
        location: flags.location,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        ...(flags.timezone ? { timezone: flags.timezone } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.item.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw time delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.time.delete(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.ok}\n`);
      return payload.ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
    }
    if (command === "pause" || command === "resume" || command === "run") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw time ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const payload = command === "pause"
        ? await claw.time.pause(id)
        : command === "resume"
          ? await claw.time.resume(id)
          : await claw.time.runNow(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${"item" in payload ? payload.item.id : "ok"}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "executions") {
      const payload = await claw.time.listExecutions(flags["item-id"]);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.executions.map((entry) => `${entry.itemId} ${entry.status} ${entry.scheduledFor}`).join("\n")}\n`);
      return payload.executions.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "calendar") {
      const payload = await claw.time.calendarView({ start: flags.start, end: flags.end });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.items.map((item) => `${item.title} ${item.startsAt || item.nextRunAt}`).join("\n")}\n`);
      return payload.items.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "timeline") {
      const payload = await claw.time.timelineView({ start: flags.start, end: flags.end });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.items.map((item) => `${item.title} ${item.startsAt || item.nextRunAt}`).join("\n")}\n`);
      return payload.items.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "schedule" && (command === "at" || command === "every" || command === "after")) {
    const expression = subcommand;
    const title = joinedPositionals(positionals, 3) || flags.title;
    if (!expression || !title) {
      context.stderr.write("Usage: claw schedule at|every|after <expression> <title> [--anchor-type TYPE --anchor-id ID --anchor-at ISO]\n");
      return CLI_EXIT_USAGE;
    }
    const durationMs = parseSimpleDurationMs(expression);
    if ((command === "after" || command === "every") && durationMs === null) {
      throw new CliHandledError("invalid_duration", `Unsupported duration "${expression}". Use simple durations like 30m, 24h, or 2d.`, CLI_EXIT_USAGE);
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const payload = await claw.time.create({
      kind: command === "at" ? "event" : command === "every" ? "routine" : "follow_up",
      title,
      description: flags.description,
      workspaceId,
      ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
      ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      natural: {
        command,
        expression,
        timezone: flags.timezone,
        anchorType: flags["anchor-type"] as NonNullable<TemporalItem["anchorType"]> | undefined,
        anchorId: flags["anchor-id"],
        anchorAt: flags["anchor-at"] ?? (command === "after" && durationMs !== null ? new Date(Date.now() + durationMs).toISOString() : undefined),
      },
    });
    if (wantsJson) writeJson(context.stdout, payload);
    else context.stdout.write(`${payload.item.id}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "export" || group === "import" || group === "backup" || group === "agenda" || group === "review" || group === "my-work" || group === "team-work" || group === "timeline") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (group === "export") {
      const targetPath = command || subcommand || flags.path;
      if (!targetPath) {
        context.stderr.write("Usage: claw export <file>\n");
        return CLI_EXIT_USAGE;
      }
      const snapshot = await claw.productivity.exportSnapshot();
      const absolutePath = path.resolve(context.cwd, targetPath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, JSON.stringify(snapshot, null, 2));
      if (wantsJson) writeJson(context.stdout, { path: absolutePath });
      else context.stdout.write(`${absolutePath}\n`);
      return CLI_EXIT_OK;
    }
    if (group === "import") {
      const sourcePath = command || subcommand || flags.path;
      if (!sourcePath) {
        context.stderr.write("Usage: claw import <file> [--replace]\n");
        return CLI_EXIT_USAGE;
      }
      const absolutePath = path.resolve(context.cwd, sourcePath);
      const payload = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as Record<string, unknown>;
      const imported = await claw.productivity.importSnapshot(payload, {
        replace: readBooleanFlag(argv, flags, "replace", false),
      });
      if (wantsJson) writeJson(context.stdout, imported);
      else context.stdout.write(`${Object.values(imported.importedCollections).reduce((sum, value) => sum + value, 0)}\n`);
      return CLI_EXIT_OK;
    }
    if (group === "backup") {
      const targetDir = command || subcommand || flags.path;
      if (!targetDir) {
        context.stderr.write("Usage: claw backup <directory>\n");
        return CLI_EXIT_USAGE;
      }
      const backup = await claw.productivity.backup(targetDir);
      if (wantsJson) writeJson(context.stdout, backup);
      else context.stdout.write(`${backup.files.join("\n")}\n`);
      return backup.files.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (group === "agenda") {
      const agenda = await claw.agenda.list({
        start: flags.start,
        end: flags.end,
        includeCompleted: readBooleanFlag(argv, flags, "include-completed", false),
      });
      if (wantsJson) writeJson(context.stdout, agenda);
      else context.stdout.write(`${agenda.items.map((item) => `${item.when} ${item.domain} ${item.status} ${item.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (group === "timeline") {
      const mode = (command || "week") as "day" | "week";
      if (mode !== "day" && mode !== "week") {
        context.stderr.write("Usage: claw timeline day|week [--start ISO] [--project-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const range = timelineRange(mode, flags.start);
      const timeline = await claw.productivity.timeline({
        ...range,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        includeDone: readBooleanFlag(argv, flags, "include-done", readBooleanFlag(argv, flags, "include-completed", false)),
      });
      if (wantsJson) writeJson(context.stdout, timeline);
      else {
        const lines = [
          `now=${timeline.now.primary?.title ?? "none"}`,
          ...timeline.projects.map((project) => `${project.title}: tasks=${project.tasks.length} milestones=${project.milestones.length} deadlines=${project.deadlines.length} cycles=${project.cycles.length}`),
        ];
        context.stdout.write(`${lines.join("\n")}\n`);
      }
      return CLI_EXIT_OK;
    }
    if (group === "review") {
      const cadence = (command || "daily") as "daily" | "weekly";
      if (cadence !== "daily" && cadence !== "weekly") {
        context.stderr.write("Usage: claw review daily|weekly\n");
        return CLI_EXIT_USAGE;
      }
      const review = cadence === "weekly" ? await claw.review.weekly() : await claw.review.daily();
      if (wantsJson) writeJson(context.stdout, review);
      else context.stdout.write(`blocked=${review.summary.blockedTasks} overdue=${review.summary.overdueTasks} goals=${review.summary.activeGoals} projects=${review.summary.activeProjects}\n`);
      return CLI_EXIT_OK;
    }
    if (group === "my-work") {
      const myWork = await claw.productivity.myWork({
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, myWork);
      else context.stdout.write(`triage=${myWork.summary.triageThreads} ready=${myWork.summary.readyTasks} blocked=${myWork.summary.blockedTasks} blockers=${myWork.summary.activeBlockers} decisions=${myWork.summary.pendingDecisions}\n`);
      return CLI_EXIT_OK;
    }
    if (group === "team-work") {
      const teamWork = await claw.productivity.teamWork({
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, teamWork);
      else context.stdout.write(`assignments=${teamWork.summary.activeAssignments} handoffs=${teamWork.summary.pendingHandoffs} approvals=${teamWork.summary.pendingApprovals} overloaded=${teamWork.summary.overloadedAgents}\n`);
      return CLI_EXIT_OK;
    }
  }

  const genericProductivityGroupMap: Record<string, string> = {
    lists: "lists",
    sections: "sections",
    comments: "comments",
    attachments: "attachments",
    "saved-views": "saved_views",
    recurrences: "recurrences",
    cycles: "cycles",
    sprints: "cycles",
    epics: "epics",
    initiatives: "epics",
    "custom-fields": "custom_fields",
    "field-values": "field_values",
    templates: "templates",
  };
  if (group && genericProductivityGroupMap[group]) {
    return await runCoreProductivityDbCli({
      argv,
      positionals: ["db", genericProductivityGroupMap[group], ...positionals.slice(1)],
      flags,
      workspaceRoot,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      appId,
      workspaceId,
      agentId,
      contextCwd: context.cwd,
    });
  }

  if (group === "areas") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const areas = await claw.areas.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "paused" | "archived"> } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, areas);
      else context.stdout.write(`${areas.map((area) => `${area.status} ${area.id} ${area.name}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw areas get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const area = await claw.areas.get(id);
      if (!area) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, area);
      else context.stdout.write(`${area.status} ${area.id} ${area.name}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const name = joinedPositionals(positionals, 2) || flags.name || flags.title;
      if (!name) {
        context.stderr.write("Usage: claw areas create <name> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const area = await claw.areas.create({
        name,
        description: flags.description,
        status: flags.status as "active" | "paused" | "archived" | undefined,
        color: flags.color,
        ownerPersonId: flags["owner-person-id"],
      });
      if (wantsJson) writeJson(context.stdout, area);
      else context.stdout.write(`${area.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw areas update <id> [--name TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const area = await claw.areas.update(id, {
        name: flags.name || flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "archived" | undefined,
        color: flags.color,
        ownerPersonId: flags["owner-person-id"],
      });
      if (wantsJson) writeJson(context.stdout, area);
      else context.stdout.write(`${area.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw areas delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.areas, id, argv, flags, "areas");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw areas search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.areas.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "tasks") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const tasks = await claw.tasks.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"todo" | "in_progress" | "blocked" | "done" | "cancelled"> } : {}),
        ...(flags.assignee ? { assigneePersonId: flags.assignee } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
        ...(flags["list-id"] ? { listId: flags["list-id"] } : {}),
        ...(flags["section-id"] ? { sectionId: flags["section-id"] } : {}),
        ...(flags["cycle-id"] ? { cycleId: flags["cycle-id"] } : {}),
        ...(flags["epic-id"] ? { epicId: flags["epic-id"] } : {}),
        ...(argv.includes("--blocked") ? { blocked: readBooleanFlag(argv, flags, "blocked", true) } : {}),
        ...(argv.includes("--overdue") ? { overdue: readBooleanFlag(argv, flags, "overdue", true) } : {}),
        ...(argv.includes("--has-reminder") ? { hasReminder: readBooleanFlag(argv, flags, "has-reminder", true) } : {}),
        ...(flags.ids ? { ids: parseCsvFlag(flags.ids) } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, tasks);
      else context.stdout.write(`${tasks.map((task) => `${task.status} ${task.id} ${task.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw tasks get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const task = await claw.tasks.get(id);
      if (!task) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, task);
      else context.stdout.write(`${task.status} ${task.id} ${task.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw tasks create <title> [--description TEXT] [--status STATUS] [--priority PRIORITY] [--labels a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const task = await claw.tasks.create({
        title,
        description: flags.description,
        status: flags.status as "todo" | "in_progress" | "blocked" | "done" | "cancelled" | undefined,
        type: flags.type as "todo" | "task" | "bug" | "story" | "feature" | "chore" | undefined,
        priority: flags.priority as "low" | "medium" | "high" | "urgent" | undefined,
        ...(flags.rank ? { rank: Number(flags.rank) } : {}),
        labels: parseCsvFlag(flags.labels),
        areaId: flags["area-id"],
        listId: flags["list-id"],
        sectionId: flags["section-id"],
        assigneePersonId: flags.assignee,
        reporterPersonId: flags["reporter-person-id"],
        watcherPersonIds: parseCsvFlag(flags.watchers),
        startAt: flags["start-at"],
        deferUntil: flags["defer-until"],
        dueAt: flags["due-at"],
        deadlineAt: flags["deadline-at"],
        snoozedUntil: flags["snoozed-until"],
        recurrenceRule: flags["recurrence-rule"],
        ...(flags["estimate-minutes"] ? { estimateMinutes: Number(flags["estimate-minutes"]) } : {}),
        ...(flags["actual-minutes"] ? { actualMinutes: Number(flags["actual-minutes"]) } : {}),
        ...(flags["story-points"] ? { storyPoints: Number(flags["story-points"]) } : {}),
        blockedReason: flags["blocked-reason"],
        waitingOn: flags["waiting-on"],
        startedAt: flags["started-at"],
        completedAt: flags["completed-at"],
        cancelledAt: flags["cancelled-at"],
        eventId: flags["event-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        cycleId: flags["cycle-id"],
        epicId: flags["epic-id"],
        parentTaskId: flags["parent-task-id"],
        childTaskIds: parseCsvFlag(flags["child-task-ids"]),
        dependsOnTaskIds: parseCsvFlag(flags["depends-on"]),
        commentIds: parseCsvFlag(flags["comment-ids"]),
        attachmentIds: parseCsvFlag(flags["attachment-ids"]),
        checklist: parseJsonFlag<Array<{ id?: string; text: string; completed?: boolean }>>(flags["checklist-json"], "--checklist-json"),
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
      });
      if (wantsJson) writeJson(context.stdout, task);
      else context.stdout.write(`${task.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw tasks update <id> [--title TEXT] [--description TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const task = await claw.tasks.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "todo" | "in_progress" | "blocked" | "done" | "cancelled" | undefined,
        type: flags.type as "todo" | "task" | "bug" | "story" | "feature" | "chore" | undefined,
        priority: flags.priority as "low" | "medium" | "high" | "urgent" | undefined,
        ...(flags.rank ? { rank: Number(flags.rank) } : {}),
        ...(flags.labels ? { labels: parseCsvFlag(flags.labels) } : {}),
        areaId: flags["area-id"],
        listId: flags["list-id"],
        sectionId: flags["section-id"],
        assigneePersonId: flags.assignee,
        reporterPersonId: flags["reporter-person-id"],
        ...(flags.watchers ? { watcherPersonIds: parseCsvFlag(flags.watchers) } : {}),
        startAt: flags["start-at"],
        deferUntil: flags["defer-until"],
        dueAt: flags["due-at"],
        deadlineAt: flags["deadline-at"],
        snoozedUntil: flags["snoozed-until"],
        recurrenceRule: flags["recurrence-rule"],
        ...(flags["estimate-minutes"] ? { estimateMinutes: Number(flags["estimate-minutes"]) } : {}),
        ...(flags["actual-minutes"] ? { actualMinutes: Number(flags["actual-minutes"]) } : {}),
        ...(flags["story-points"] ? { storyPoints: Number(flags["story-points"]) } : {}),
        blockedReason: flags["blocked-reason"],
        waitingOn: flags["waiting-on"],
        startedAt: flags["started-at"],
        completedAt: flags["completed-at"],
        cancelledAt: flags["cancelled-at"],
        eventId: flags["event-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        cycleId: flags["cycle-id"],
        epicId: flags["epic-id"],
        parentTaskId: flags["parent-task-id"],
        ...(flags["child-task-ids"] ? { childTaskIds: parseCsvFlag(flags["child-task-ids"]) } : {}),
        ...(flags["depends-on"] ? { dependsOnTaskIds: parseCsvFlag(flags["depends-on"]) } : {}),
        ...(flags["comment-ids"] ? { commentIds: parseCsvFlag(flags["comment-ids"]) } : {}),
        ...(flags["attachment-ids"] ? { attachmentIds: parseCsvFlag(flags["attachment-ids"]) } : {}),
        ...(flags["checklist-json"] ? { checklist: parseJsonFlag<Array<{ id?: string; text: string; completed?: boolean }>>(flags["checklist-json"], "--checklist-json") } : {}),
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
      });
      if (wantsJson) writeJson(context.stdout, task);
      else context.stdout.write(`${task.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "complete") {
      const ids = parseCsvFlag(flags.ids);
      const allIds = ids.length > 0 ? ids : [subcommand || flags.id].filter(Boolean) as string[];
      if (allIds.length === 0) {
        context.stderr.write("Usage: claw tasks complete <id> | --ids a,b\n");
        return CLI_EXIT_USAGE;
      }
      const tasks = await Promise.all(allIds.map((id) => claw.tasks.complete(id)));
      if (wantsJson) writeJson(context.stdout, tasks.length === 1 ? tasks[0] : tasks);
      else context.stdout.write(`${tasks.map((task) => task.id).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "move") {
      const ids = parseCsvFlag(flags.ids);
      if (ids.length === 0) {
        context.stderr.write("Usage: claw tasks move --ids a,b [--project-id ID] [--goal-id ID] [--area-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const tasks = await Promise.all(ids.map((id) => claw.tasks.update(id, {
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        areaId: flags["area-id"],
      })));
      if (wantsJson) writeJson(context.stdout, tasks);
      else context.stdout.write(`${tasks.map((task) => task.id).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw tasks search <query> [--strategy auto|keyword|semantic|hybrid]\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.tasks.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "goals") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const goals = await claw.goals.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "paused" | "done"> } : {}),
        ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, goals);
      else context.stdout.write(`${goals.map((goal) => `${goal.status} ${goal.id} ${goal.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw goals get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const goal = await claw.goals.get(id);
      if (!goal) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, goal);
      else context.stdout.write(`${goal.status} ${goal.id} ${goal.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw goals create <title> [--status STATUS] [--project-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const goal = await claw.goals.create({
        title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | undefined,
        level: flags.level as "company" | "team" | "personal" | undefined,
        areaId: flags["area-id"],
        projectId: flags["project-id"],
        parentId: flags["parent-id"],
        parentGoalId: flags["parent-goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
        metricKey: flags["metric-key"],
        metricLabel: flags["metric-label"],
        ...(flags["target-value"] ? { targetValue: Number(flags["target-value"]) } : {}),
        ...(flags["current-value"] ? { currentValue: Number(flags["current-value"]) } : {}),
        unit: flags.unit,
        period: flags.period,
        timeframeStart: flags["timeframe-start"],
        timeframeEnd: flags["timeframe-end"],
        reviewCadence: flags["review-cadence"] as "daily" | "weekly" | "monthly" | "quarterly" | undefined,
        metricDirection: flags["metric-direction"] as "increase" | "decrease" | "maintain" | undefined,
        healthStatus: flags["health-status"] as "green" | "yellow" | "red" | "unknown" | undefined,
      });
      if (wantsJson) writeJson(context.stdout, goal);
      else context.stdout.write(`${goal.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw goals update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const goal = await claw.goals.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | undefined,
        level: flags.level as "company" | "team" | "personal" | undefined,
        areaId: flags["area-id"],
        projectId: flags["project-id"],
        parentId: flags["parent-id"],
        parentGoalId: flags["parent-goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
        metricKey: flags["metric-key"],
        metricLabel: flags["metric-label"],
        ...(flags["target-value"] ? { targetValue: Number(flags["target-value"]) } : {}),
        ...(flags["current-value"] ? { currentValue: Number(flags["current-value"]) } : {}),
        unit: flags.unit,
        period: flags.period,
        timeframeStart: flags["timeframe-start"],
        timeframeEnd: flags["timeframe-end"],
        reviewCadence: flags["review-cadence"] as "daily" | "weekly" | "monthly" | "quarterly" | undefined,
        metricDirection: flags["metric-direction"] as "increase" | "decrease" | "maintain" | undefined,
        healthStatus: flags["health-status"] as "green" | "yellow" | "red" | "unknown" | undefined,
      });
      if (wantsJson) writeJson(context.stdout, goal);
      else context.stdout.write(`${goal.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw goals delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.goals, id, argv, flags, "goals");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw goals search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.goals.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "projects") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const projects = await claw.projects.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"draft" | "in_progress" | "paused" | "done" | "archived"> } : {}),
        ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, projects);
      else context.stdout.write(`${projects.map((project) => `${project.status} ${project.id} ${project.name}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw projects get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const project = await claw.projects.get(id);
      if (!project) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, project);
      else context.stdout.write(`${project.status} ${project.id} ${project.name}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const name = joinedPositionals(positionals, 2) || flags.name || flags.title;
      if (!name) {
        context.stderr.write("Usage: claw projects create <name> [--status STATUS] [--goal-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const project = await claw.projects.create({
        name,
        description: flags.description,
        status: flags.status as "draft" | "in_progress" | "paused" | "done" | "archived" | undefined,
        areaId: flags["area-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        leadAgentId: flags["lead-agent-id"],
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
        color: flags.color,
        kind: flags.kind as "delivery" | "growth" | "ops" | "research" | "migration" | "other" | undefined,
        ...(flags.rank ? { rank: Number(flags.rank) } : {}),
        statusCategory: flags["status-category"] as "active" | "someday" | "planned" | "done" | "archived" | undefined,
        healthStatus: flags["health-status"] as "green" | "yellow" | "red" | "unknown" | undefined,
        startAt: flags["start-at"],
        startDate: flags["start-date"],
        targetDate: flags["target-date"],
        deadlineAt: flags["deadline-at"],
        milestoneIds: parseCsvFlag(flags["milestone-ids"]),
        defaultSectionIds: parseCsvFlag(flags["default-section-ids"]),
        templateId: flags["template-id"],
        reviewAt: flags["review-at"],
        reviewCadence: flags["review-cadence"] as "daily" | "weekly" | "monthly" | "quarterly" | undefined,
        archiveReason: flags["archive-reason"],
        completedAt: flags["completed-at"],
      });
      if (wantsJson) writeJson(context.stdout, project);
      else context.stdout.write(`${project.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw projects update <id> [--name TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const project = await claw.projects.update(id, {
        name: flags.name || flags.title,
        description: flags.description,
        status: flags.status as "draft" | "in_progress" | "paused" | "done" | "archived" | undefined,
        areaId: flags["area-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        leadAgentId: flags["lead-agent-id"],
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
        color: flags.color,
        kind: flags.kind as "delivery" | "growth" | "ops" | "research" | "migration" | "other" | undefined,
        ...(flags.rank ? { rank: Number(flags.rank) } : {}),
        statusCategory: flags["status-category"] as "active" | "someday" | "planned" | "done" | "archived" | undefined,
        healthStatus: flags["health-status"] as "green" | "yellow" | "red" | "unknown" | undefined,
        startAt: flags["start-at"],
        startDate: flags["start-date"],
        targetDate: flags["target-date"],
        deadlineAt: flags["deadline-at"],
        ...(flags["milestone-ids"] ? { milestoneIds: parseCsvFlag(flags["milestone-ids"]) } : {}),
        ...(flags["default-section-ids"] ? { defaultSectionIds: parseCsvFlag(flags["default-section-ids"]) } : {}),
        templateId: flags["template-id"],
        reviewAt: flags["review-at"],
        reviewCadence: flags["review-cadence"] as "daily" | "weekly" | "monthly" | "quarterly" | undefined,
        archiveReason: flags["archive-reason"],
        completedAt: flags["completed-at"],
      });
      if (wantsJson) writeJson(context.stdout, project);
      else context.stdout.write(`${project.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "archive") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw projects archive <id> [--cascade]\n");
        return CLI_EXIT_USAGE;
      }
      const project = await claw.projects.archive(id);
      if (readBooleanFlag(argv, flags, "cascade", false)) {
        const anchoredReminders = await claw.reminders.list({ anchorId: id, includeArchived: true, limit: Number.MAX_SAFE_INTEGER });
        const anchoredDeadlines = await claw.deadlines.list({ anchorId: id, includeArchived: true, limit: Number.MAX_SAFE_INTEGER });
        await Promise.all(anchoredReminders.filter((item) => item.status === "active").map((item) => claw.reminders.pause(item.id)));
        await Promise.all(anchoredDeadlines.filter((item) => item.status === "active").map((item) => claw.deadlines.pause(item.id)));
      }
      if (wantsJson) writeJson(context.stdout, project);
      else context.stdout.write(`${project.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw projects delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.projects, id, argv, flags, "projects");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw projects search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.projects.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "milestones") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const milestones = await claw.milestones.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"planned" | "active" | "done" | "archived"> } : {}),
        ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, milestones);
      else context.stdout.write(`${milestones.map((milestone) => `${milestone.status} ${milestone.id} ${milestone.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw milestones get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const milestone = await claw.milestones.get(id);
      if (!milestone) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, milestone);
      else context.stdout.write(`${milestone.status} ${milestone.id} ${milestone.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw milestones create <title> [--project-id ID] [--area-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const milestone = await claw.milestones.create({
        title,
        description: flags.description,
        status: flags.status as "planned" | "active" | "done" | "archived" | undefined,
        areaId: flags["area-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        targetDate: flags["target-date"],
        completedAt: flags["completed-at"],
      });
      if (wantsJson) writeJson(context.stdout, milestone);
      else context.stdout.write(`${milestone.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw milestones update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const milestone = await claw.milestones.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "planned" | "active" | "done" | "archived" | undefined,
        areaId: flags["area-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        targetDate: flags["target-date"],
        completedAt: flags["completed-at"],
      });
      if (wantsJson) writeJson(context.stdout, milestone);
      else context.stdout.write(`${milestone.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw milestones delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.milestones, id, argv, flags, "milestones");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw milestones search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.milestones.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "activity") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const activity = await claw.activity.list({
        entityType: flags["entity-type"] as any,
        entityId: flags["entity-id"],
        projectId: flags["project-id"],
        taskId: flags["task-id"],
        threadId: flags["thread-id"],
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, activity);
      else context.stdout.write(`${activity.map((entry) => `${entry.kind} ${entry.id} ${entry.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw activity get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const entry = await claw.activity.get(id);
      if (!entry) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, entry);
      else context.stdout.write(`${entry.kind} ${entry.id} ${entry.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw activity search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.activity.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "blockers") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const blockers = await claw.blockers.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "resolved" | "cancelled"> } : {}),
        ...(flags.kind ? { kind: parseCsvFlag(flags.kind) as Array<"waiting_human" | "waiting_agent" | "waiting_system" | "missing_context" | "policy_block"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, blockers);
      else context.stdout.write(`${blockers.map((blocker) => `${blocker.status} ${blocker.id} ${blocker.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw blockers get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const blocker = await claw.blockers.get(id);
      if (!blocker) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, blocker);
      else context.stdout.write(`${blocker.status} ${blocker.id} ${blocker.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags.kind) {
        context.stderr.write("Usage: claw blockers create <title> --kind waiting_human|waiting_agent|waiting_system|missing_context|policy_block\n");
        return CLI_EXIT_USAGE;
      }
      const blocker = await claw.blockers.create({
        title,
        description: flags.description,
        kind: flags.kind as "waiting_human" | "waiting_agent" | "waiting_system" | "missing_context" | "policy_block",
        status: flags.status as "active" | "resolved" | "cancelled" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        dependencyTaskIds: parseCsvFlag(flags["dependency-task-ids"]),
        evidenceIds: parseCsvFlag(flags["evidence-ids"]),
        resolvedAt: flags["resolved-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, blocker);
      else context.stdout.write(`${blocker.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw blockers update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const blocker = await claw.blockers.update(id, {
        title: flags.title,
        description: flags.description,
        kind: flags.kind as "waiting_human" | "waiting_agent" | "waiting_system" | "missing_context" | "policy_block" | undefined,
        status: flags.status as "active" | "resolved" | "cancelled" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        ...(flags["dependency-task-ids"] ? { dependencyTaskIds: parseCsvFlag(flags["dependency-task-ids"]) } : {}),
        ...(flags["evidence-ids"] ? { evidenceIds: parseCsvFlag(flags["evidence-ids"]) } : {}),
        resolvedAt: flags["resolved-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, blocker);
      else context.stdout.write(`${blocker.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw blockers delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.blockers, id, argv, flags, "blockers");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw blockers search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.blockers.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "artifacts") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const artifacts = await claw.artifacts.list({
        ...(flags.kind ? { kind: parseCsvFlag(flags.kind) as Array<"link" | "file" | "command" | "test" | "screenshot" | "message" | "note"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["thread-id"] ? { threadId: flags["thread-id"] } : {}),
        ...(flags["decision-id"] ? { decisionId: flags["decision-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, artifacts);
      else context.stdout.write(`${artifacts.map((artifact) => `${artifact.kind} ${artifact.id} ${artifact.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw artifacts get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const artifact = await claw.artifacts.get(id);
      if (!artifact) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, artifact);
      else context.stdout.write(`${artifact.kind} ${artifact.id} ${artifact.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags.kind) {
        context.stderr.write("Usage: claw artifacts create <title> --kind link|file|command|test|screenshot|message|note\n");
        return CLI_EXIT_USAGE;
      }
      const artifact = await claw.artifacts.create({
        title,
        kind: flags.kind as "link" | "file" | "command" | "test" | "screenshot" | "message" | "note",
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        threadId: flags["thread-id"],
        decisionId: flags["decision-id"],
        uri: flags.uri,
        summary: flags.summary,
        content: flags.content,
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, artifact);
      else context.stdout.write(`${artifact.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw artifacts update <id> [--title TEXT] [--kind KIND]\n");
        return CLI_EXIT_USAGE;
      }
      const artifact = await claw.artifacts.update(id, {
        title: flags.title,
        kind: flags.kind as "link" | "file" | "command" | "test" | "screenshot" | "message" | "note" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        threadId: flags["thread-id"],
        decisionId: flags["decision-id"],
        uri: flags.uri,
        summary: flags.summary,
        content: flags.content,
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, artifact);
      else context.stdout.write(`${artifact.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw artifacts delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.artifacts, id, argv, flags, "artifacts");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw artifacts search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.artifacts.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "decisions") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const decisions = await claw.decisions.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"proposed" | "accepted" | "rejected" | "superseded"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["owner-person-id"] ? { ownerPersonId: flags["owner-person-id"] } : {}),
        ...(flags["owner-agent-id"] ? { ownerAgentId: flags["owner-agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, decisions);
      else context.stdout.write(`${decisions.map((decision) => `${decision.status} ${decision.id} ${decision.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw decisions get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const decision = await claw.decisions.get(id);
      if (!decision) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, decision);
      else context.stdout.write(`${decision.status} ${decision.id} ${decision.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw decisions create <title> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const decision = await claw.decisions.create({
        title,
        summary: flags.summary,
        status: flags.status as "proposed" | "accepted" | "rejected" | "superseded" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        outcome: flags.outcome,
        rationale: flags.rationale,
        alternatives: parseCsvFlag(flags.alternatives),
        artifactIds: parseCsvFlag(flags["artifact-ids"]),
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, decision);
      else context.stdout.write(`${decision.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw decisions update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const decision = await claw.decisions.update(id, {
        title: flags.title,
        summary: flags.summary,
        status: flags.status as "proposed" | "accepted" | "rejected" | "superseded" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        outcome: flags.outcome,
        rationale: flags.rationale,
        ...(flags.alternatives ? { alternatives: parseCsvFlag(flags.alternatives) } : {}),
        ...(flags["artifact-ids"] ? { artifactIds: parseCsvFlag(flags["artifact-ids"]) } : {}),
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, decision);
      else context.stdout.write(`${decision.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw decisions delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.decisions, id, argv, flags, "decisions");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw decisions search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.decisions.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "work-sessions") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const sessions = await claw.workSessions.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "completed" | "cancelled"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, sessions);
      else context.stdout.write(`${sessions.map((session) => `${session.status} ${session.id} ${session.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw work-sessions get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const session = await claw.workSessions.get(id);
      if (!session) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, session);
      else context.stdout.write(`${session.status} ${session.id} ${session.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw work-sessions create <title> [--task-ids a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const session = await claw.workSessions.create({
        title,
        status: flags.status as "active" | "completed" | "cancelled" | undefined,
        objective: flags.objective,
        taskIds: parseCsvFlag(flags["task-ids"]),
        blockerIds: parseCsvFlag(flags["blocker-ids"]),
        startedAt: flags["started-at"],
        endedAt: flags["ended-at"],
        outcome: flags.outcome,
        ...(flags["timebox-minutes"] ? { timeboxMinutes: Number(flags["timebox-minutes"]) } : {}),
        ownerAgentId: flags["owner-agent-id"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, session);
      else context.stdout.write(`${session.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw work-sessions update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const session = await claw.workSessions.update(id, {
        title: flags.title,
        status: flags.status as "active" | "completed" | "cancelled" | undefined,
        objective: flags.objective,
        ...(flags["task-ids"] ? { taskIds: parseCsvFlag(flags["task-ids"]) } : {}),
        ...(flags["blocker-ids"] ? { blockerIds: parseCsvFlag(flags["blocker-ids"]) } : {}),
        startedAt: flags["started-at"],
        endedAt: flags["ended-at"],
        outcome: flags.outcome,
        ...(flags["timebox-minutes"] ? { timeboxMinutes: Number(flags["timebox-minutes"]) } : {}),
        ownerAgentId: flags["owner-agent-id"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, session);
      else context.stdout.write(`${session.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "complete" || command === "cancel") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw work-sessions ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const session = command === "complete"
        ? await claw.workSessions.complete(id, flags.outcome)
        : await claw.workSessions.cancel(id);
      if (wantsJson) writeJson(context.stdout, session);
      else context.stdout.write(`${session.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw work-sessions delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.workSessions, id, argv, flags, "work-sessions");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw work-sessions search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.workSessions.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "assignments") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const assignments = await claw.assignments.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"proposed" | "accepted" | "rejected" | "released" | "completed"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["assigned-to-agent-id"] ? { assignedToAgentId: flags["assigned-to-agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, assignments);
      else context.stdout.write(`${assignments.map((assignment) => `${assignment.status} ${assignment.id} ${assignment.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw assignments get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const assignment = await claw.assignments.get(id);
      if (!assignment) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, assignment);
      else context.stdout.write(`${assignment.status} ${assignment.id} ${assignment.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      const assignedToAgentId = flags["assigned-to-agent-id"];
      if (!title || !assignedToAgentId) {
        context.stderr.write("Usage: claw assignments create <title> --assigned-to-agent-id ID\n");
        return CLI_EXIT_USAGE;
      }
      const assignment = await claw.assignments.create({
        title,
        status: flags.status as "proposed" | "accepted" | "rejected" | "released" | "completed" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        assignedToAgentId,
        assignedBy: flags["assigned-by"],
        delegatedBy: flags["delegated-by"],
        reviewerAgentId: flags["reviewer-agent-id"],
        rationale: flags.rationale,
        rejectionReason: flags["rejection-reason"],
        acceptedAt: flags["accepted-at"],
        rejectedAt: flags["rejected-at"],
        completedAt: flags["completed-at"],
        dueAt: flags["due-at"],
        priority: flags.priority as "low" | "medium" | "high" | "urgent" | undefined,
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, assignment);
      else context.stdout.write(`${assignment.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw assignments update <id> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const assignment = await claw.assignments.update(id, {
        title: flags.title,
        status: flags.status as "proposed" | "accepted" | "rejected" | "released" | "completed" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        assignedToAgentId: flags["assigned-to-agent-id"],
        assignedBy: flags["assigned-by"],
        delegatedBy: flags["delegated-by"],
        reviewerAgentId: flags["reviewer-agent-id"],
        rationale: flags.rationale,
        rejectionReason: flags["rejection-reason"],
        acceptedAt: flags["accepted-at"],
        rejectedAt: flags["rejected-at"],
        completedAt: flags["completed-at"],
        dueAt: flags["due-at"],
        priority: flags.priority as "low" | "medium" | "high" | "urgent" | undefined,
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, assignment);
      else context.stdout.write(`${assignment.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw assignments delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.assignments, id, argv, flags, "assignments");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw assignments search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.assignments.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "handoffs") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const handoffs = await claw.handoffs.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"proposed" | "accepted" | "rejected" | "returned" | "completed"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["from-agent-id"] ? { fromAgentId: flags["from-agent-id"] } : {}),
        ...(flags["to-agent-id"] ? { toAgentId: flags["to-agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, handoffs);
      else context.stdout.write(`${handoffs.map((handoff) => `${handoff.status} ${handoff.id} ${handoff.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw handoffs get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const handoff = await claw.handoffs.get(id);
      if (!handoff) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, handoff);
      else context.stdout.write(`${handoff.status} ${handoff.id} ${handoff.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags["from-agent-id"] || !flags["to-agent-id"]) {
        context.stderr.write("Usage: claw handoffs create <title> --from-agent-id ID --to-agent-id ID\n");
        return CLI_EXIT_USAGE;
      }
      const handoff = await claw.handoffs.create({
        title,
        status: flags.status as "proposed" | "accepted" | "rejected" | "returned" | "completed" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        fromAgentId: flags["from-agent-id"],
        toAgentId: flags["to-agent-id"],
        objective: flags.objective,
        currentState: flags["current-state"],
        contextSummary: flags["context-summary"],
        nextStep: flags["next-step"],
        riskSummary: flags["risk-summary"],
        artifactIds: parseCsvFlag(flags["artifact-ids"]),
        blockerIds: parseCsvFlag(flags["blocker-ids"]),
        approvalId: flags["approval-id"],
        rejectionReason: flags["rejection-reason"],
        acceptedAt: flags["accepted-at"],
        completedAt: flags["completed-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, handoff);
      else context.stdout.write(`${handoff.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw handoffs update <id> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const handoff = await claw.handoffs.update(id, {
        title: flags.title,
        status: flags.status as "proposed" | "accepted" | "rejected" | "returned" | "completed" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        fromAgentId: flags["from-agent-id"],
        toAgentId: flags["to-agent-id"],
        objective: flags.objective,
        currentState: flags["current-state"],
        contextSummary: flags["context-summary"],
        nextStep: flags["next-step"],
        riskSummary: flags["risk-summary"],
        ...(flags["artifact-ids"] ? { artifactIds: parseCsvFlag(flags["artifact-ids"]) } : {}),
        ...(flags["blocker-ids"] ? { blockerIds: parseCsvFlag(flags["blocker-ids"]) } : {}),
        approvalId: flags["approval-id"],
        rejectionReason: flags["rejection-reason"],
        acceptedAt: flags["accepted-at"],
        completedAt: flags["completed-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, handoff);
      else context.stdout.write(`${handoff.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw handoffs delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.handoffs, id, argv, flags, "handoffs");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw handoffs search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.handoffs.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "approvals") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const approvals = await claw.approvals.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"pending" | "approved" | "rejected" | "cancelled"> } : {}),
        ...(flags.kind ? { kind: parseCsvFlag(flags.kind) as Array<"deploy" | "publish" | "delete" | "external_send" | "spend" | "policy_gate" | "other"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["handoff-id"] ? { handoffId: flags["handoff-id"] } : {}),
        ...(flags["approver-agent-id"] ? { approverAgentId: flags["approver-agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, approvals);
      else context.stdout.write(`${approvals.map((approval) => `${approval.status} ${approval.id} ${approval.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw approvals get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const approval = await claw.approvals.get(id);
      if (!approval) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, approval);
      else context.stdout.write(`${approval.status} ${approval.id} ${approval.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags.kind || !flags["policy-reason"]) {
        context.stderr.write("Usage: claw approvals create <title> --kind publish|deploy|delete|external_send|spend|policy_gate|other --policy-reason TEXT\n");
        return CLI_EXIT_USAGE;
      }
      const approval = await claw.approvals.create({
        title,
        status: flags.status as "pending" | "approved" | "rejected" | "cancelled" | undefined,
        kind: flags.kind as "deploy" | "publish" | "delete" | "external_send" | "spend" | "policy_gate" | "other",
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        handoffId: flags["handoff-id"],
        requestedByAgentId: flags["requested-by-agent-id"],
        approverAgentId: flags["approver-agent-id"],
        policyReason: flags["policy-reason"],
        evidenceIds: parseCsvFlag(flags["evidence-ids"]),
        decisionIds: parseCsvFlag(flags["decision-ids"]),
        approvedBy: flags["approved-by"],
        outcome: flags.outcome,
        approvedAt: flags["approved-at"],
        rejectedAt: flags["rejected-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, approval);
      else context.stdout.write(`${approval.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw approvals update <id> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const approval = await claw.approvals.update(id, {
        title: flags.title,
        status: flags.status as "pending" | "approved" | "rejected" | "cancelled" | undefined,
        kind: flags.kind as "deploy" | "publish" | "delete" | "external_send" | "spend" | "policy_gate" | "other" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        handoffId: flags["handoff-id"],
        requestedByAgentId: flags["requested-by-agent-id"],
        approverAgentId: flags["approver-agent-id"],
        policyReason: flags["policy-reason"],
        ...(flags["evidence-ids"] ? { evidenceIds: parseCsvFlag(flags["evidence-ids"]) } : {}),
        ...(flags["decision-ids"] ? { decisionIds: parseCsvFlag(flags["decision-ids"]) } : {}),
        approvedBy: flags["approved-by"],
        outcome: flags.outcome,
        approvedAt: flags["approved-at"],
        rejectedAt: flags["rejected-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, approval);
      else context.stdout.write(`${approval.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw approvals delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.approvals, id, argv, flags, "approvals");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw approvals search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.approvals.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "capacity") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const capacity = await claw.capacity.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "limited" | "overloaded" | "offline"> } : {}),
        ...(flags.availability ? { availability: parseCsvFlag(flags.availability) as Array<"available" | "busy" | "away" | "offline"> } : {}),
        ...(flags["team-id"] ? { teamId: flags["team-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, capacity);
      else context.stdout.write(`${capacity.map((snapshot) => `${snapshot.status} ${snapshot.id} ${snapshot.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw capacity get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const snapshot = await claw.capacity.get(id);
      if (!snapshot) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, snapshot);
      else context.stdout.write(`${snapshot.status} ${snapshot.id} ${snapshot.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      const agentIdFlag = flags["agent-id"];
      if (!title || !agentIdFlag) {
        context.stderr.write("Usage: claw capacity create <title> --agent-id ID\n");
        return CLI_EXIT_USAGE;
      }
      const snapshot = await claw.capacity.create({
        title,
        status: flags.status as "active" | "limited" | "overloaded" | "offline" | undefined,
        agentId: agentIdFlag,
        teamId: flags["team-id"],
        role: flags.role,
        availability: flags.availability as "available" | "busy" | "away" | "offline" | undefined,
        ...(flags["max-wip"] ? { maxWip: Number(flags["max-wip"]) } : {}),
        ...(flags["current-wip"] ? { currentWip: Number(flags["current-wip"]) } : {}),
        ...(flags["queue-depth"] ? { queueDepth: Number(flags["queue-depth"]) } : {}),
        ...(flags["blocked-count"] ? { blockedCount: Number(flags["blocked-count"]) } : {}),
        ...(flags["overdue-count"] ? { overdueCount: Number(flags["overdue-count"]) } : {}),
        ...(flags["response-latency-minutes"] ? { responseLatencyMinutes: Number(flags["response-latency-minutes"]) } : {}),
        ...(flags.utilization ? { utilization: Number(flags.utilization) } : {}),
        assignedTaskIds: parseCsvFlag(flags["assigned-task-ids"]),
        pendingApprovalIds: parseCsvFlag(flags["pending-approval-ids"]),
        pendingHandoffIds: parseCsvFlag(flags["pending-handoff-ids"]),
        snapshotAt: flags["snapshot-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, snapshot);
      else context.stdout.write(`${snapshot.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw capacity update <id>\n");
        return CLI_EXIT_USAGE;
      }
      const snapshot = await claw.capacity.update(id, {
        title: flags.title,
        status: flags.status as "active" | "limited" | "overloaded" | "offline" | undefined,
        agentId: flags["agent-id"],
        teamId: flags["team-id"],
        role: flags.role,
        availability: flags.availability as "available" | "busy" | "away" | "offline" | undefined,
        ...(flags["max-wip"] ? { maxWip: Number(flags["max-wip"]) } : {}),
        ...(flags["current-wip"] ? { currentWip: Number(flags["current-wip"]) } : {}),
        ...(flags["queue-depth"] ? { queueDepth: Number(flags["queue-depth"]) } : {}),
        ...(flags["blocked-count"] ? { blockedCount: Number(flags["blocked-count"]) } : {}),
        ...(flags["overdue-count"] ? { overdueCount: Number(flags["overdue-count"]) } : {}),
        ...(flags["response-latency-minutes"] ? { responseLatencyMinutes: Number(flags["response-latency-minutes"]) } : {}),
        ...(flags.utilization ? { utilization: Number(flags.utilization) } : {}),
        ...(flags["assigned-task-ids"] ? { assignedTaskIds: parseCsvFlag(flags["assigned-task-ids"]) } : {}),
        ...(flags["pending-approval-ids"] ? { pendingApprovalIds: parseCsvFlag(flags["pending-approval-ids"]) } : {}),
        ...(flags["pending-handoff-ids"] ? { pendingHandoffIds: parseCsvFlag(flags["pending-handoff-ids"]) } : {}),
        snapshotAt: flags["snapshot-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, snapshot);
      else context.stdout.write(`${snapshot.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw capacity delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.capacity, id, argv, flags, "capacity");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw capacity search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.capacity.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "reminders") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const reminders = await claw.reminders.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "paused" | "done" | "cancelled"> } : {}),
        ...(flags["anchor-id"] ? { anchorId: flags["anchor-id"] } : {}),
        ...(flags.before ? { before: flags.before } : {}),
        ...(flags.after ? { after: flags.after } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, reminders);
      else context.stdout.write(`${reminders.map((reminder) => `${reminder.status} ${reminder.id} ${reminder.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw reminders get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const reminder = await claw.reminders.get(id);
      if (!reminder) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, reminder);
      else context.stdout.write(`${reminder.status} ${reminder.id} ${reminder.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags["trigger-at"]) {
        context.stderr.write("Usage: claw reminders create <title> --trigger-at ISO [--anchor-type TYPE --anchor-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const reminder = await claw.reminders.create({
        title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | "cancelled" | undefined,
        triggerAt: flags["trigger-at"],
        anchorType: flags["anchor-type"] as "task" | "project" | "goal" | "event" | "thread" | "standalone" | undefined,
        anchorId: flags["anchor-id"],
        channel: flags.channel,
      });
      if (wantsJson) writeJson(context.stdout, reminder);
      else context.stdout.write(`${reminder.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw reminders update <id> [--title TEXT] [--trigger-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const reminder = await claw.reminders.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | "cancelled" | undefined,
        triggerAt: flags["trigger-at"],
        anchorType: flags["anchor-type"] as "task" | "project" | "goal" | "event" | "thread" | "standalone" | undefined,
        anchorId: flags["anchor-id"],
        channel: flags.channel,
      });
      if (wantsJson) writeJson(context.stdout, reminder);
      else context.stdout.write(`${reminder.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "pause" || command === "resume") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw reminders ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const reminder = command === "pause"
        ? await claw.reminders.pause(id)
        : await claw.reminders.resume(id);
      if (wantsJson) writeJson(context.stdout, reminder);
      else context.stdout.write(`${reminder.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw reminders delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.reminders, id, argv, flags, "reminders");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw reminders search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.reminders.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "deadlines") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const deadlines = await claw.deadlines.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "paused" | "done" | "cancelled"> } : {}),
        ...(flags["anchor-id"] ? { anchorId: flags["anchor-id"] } : {}),
        ...(flags.before ? { before: flags.before } : {}),
        ...(flags.after ? { after: flags.after } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, deadlines);
      else context.stdout.write(`${deadlines.map((deadline) => `${deadline.status} ${deadline.id} ${deadline.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw deadlines get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const deadline = await claw.deadlines.get(id);
      if (!deadline) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, deadline);
      else context.stdout.write(`${deadline.status} ${deadline.id} ${deadline.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags["due-at"]) {
        context.stderr.write("Usage: claw deadlines create <title> --due-at ISO [--anchor-type TYPE --anchor-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const deadline = await claw.deadlines.create({
        title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | "cancelled" | undefined,
        dueAt: flags["due-at"],
        anchorType: flags["anchor-type"] as "task" | "project" | "goal" | "event" | "thread" | "standalone" | undefined,
        anchorId: flags["anchor-id"],
      });
      if (wantsJson) writeJson(context.stdout, deadline);
      else context.stdout.write(`${deadline.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw deadlines update <id> [--title TEXT] [--due-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const deadline = await claw.deadlines.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | "cancelled" | undefined,
        dueAt: flags["due-at"],
        anchorType: flags["anchor-type"] as "task" | "project" | "goal" | "event" | "thread" | "standalone" | undefined,
        anchorId: flags["anchor-id"],
      });
      if (wantsJson) writeJson(context.stdout, deadline);
      else context.stdout.write(`${deadline.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "pause" || command === "resume") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw deadlines ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const deadline = command === "pause"
        ? await claw.deadlines.pause(id)
        : await claw.deadlines.resume(id);
      if (wantsJson) writeJson(context.stdout, deadline);
      else context.stdout.write(`${deadline.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw deadlines delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.deadlines, id, argv, flags, "deadlines");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw deadlines search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.deadlines.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "notes") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const notes = await claw.notes.list({
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, notes);
      else context.stdout.write(`${notes.map((note) => `${note.id} ${note.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw notes get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const note = await claw.notes.get(id);
      if (!note) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, note);
      else context.stdout.write(`${note.id} ${note.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw notes create <title> [--content TEXT] [--tags a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const note = await claw.notes.create({
        title,
        content: flags.content,
        tags: parseCsvFlag(flags.tags),
        summary: flags.summary,
      });
      if (wantsJson) writeJson(context.stdout, note);
      else context.stdout.write(`${note.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw notes update <id> [--title TEXT] [--content TEXT] [--tags a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const note = await claw.notes.update(id, {
        title: flags.title,
        content: flags.content,
        ...(flags.tags ? { tags: parseCsvFlag(flags.tags) } : {}),
        summary: flags.summary,
      });
      if (wantsJson) writeJson(context.stdout, note);
      else context.stdout.write(`${note.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw notes search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.notes.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "people") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const people = await claw.people.list({
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, people);
      else context.stdout.write(`${people.map((person) => `${person.id} ${person.displayName}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw people get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const person = await claw.people.get(id);
      if (!person) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, person);
      else context.stdout.write(`${person.id} ${person.displayName}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "upsert") {
      const displayName = joinedPositionals(positionals, 2) || flags.name || flags.title;
      if (!displayName) {
        context.stderr.write("Usage: claw people upsert <display-name> [--kind human|agent|org] [--email a@b.com]\n");
        return CLI_EXIT_USAGE;
      }
      const person = await claw.people.upsert({
        id: flags.id,
        displayName,
        kind: flags.kind as "human" | "agent" | "org" | undefined,
        emails: parseCsvFlag(flags.email),
        phones: parseCsvFlag(flags.phone),
        handles: parseCsvFlag(flags.handle),
        identities: flags.channel && flags.handle
          ? [{ channel: flags.channel, handle: parseCsvFlag(flags.handle)[0] || flags.handle, externalId: flags["external-id"], label: displayName }]
          : undefined,
        role: flags.role,
        organization: flags.organization,
      });
      if (wantsJson) writeJson(context.stdout, person);
      else context.stdout.write(`${person.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw people search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.people.search(query, {
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "inbox") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const threads = await claw.inbox.list({
        unreadOnly: readBooleanFlag(argv, flags, "unread-only", false),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, threads);
      else context.stdout.write(`${threads.map((thread) => `${thread.status} ${thread.id} ${thread.subject ?? ""}`.trim()).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "read") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw inbox read <thread-id>\n");
        return CLI_EXIT_USAGE;
      }
      const thread = await claw.inbox.readThread(id);
      if (!thread) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, thread);
      else context.stdout.write(`${thread.thread.id} ${thread.messages.length}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw inbox search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.inbox.search(query, {
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "draft") {
      const content = flags.content || subcommand;
      const channel = flags.channel || "local";
      if (!content) {
        context.stderr.write("Usage: claw inbox draft <content> [--thread THREAD_ID] [--channel CHANNEL]\n");
        return CLI_EXIT_USAGE;
      }
      const thread = await claw.inbox.createDraft({
        threadId: flags.thread,
        channel,
        subject: flags.subject,
        content,
        participantPersonIds: parseCsvFlag(flags.participants),
      });
      if (wantsJson) writeJson(context.stdout, thread);
      else context.stdout.write(`${thread.thread.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "archive") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw inbox archive <thread-id>\n");
        return CLI_EXIT_USAGE;
      }
      const thread = await claw.inbox.archive(id);
      if (wantsJson) writeJson(context.stdout, thread);
      else context.stdout.write(`${thread.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "process") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw inbox process <thread-id> [--task-title TEXT] [--note-title TEXT] [--reminder-title TEXT --trigger-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const processed = await claw.inbox.process(id, {
        taskTitle: flags["task-title"],
        noteTitle: flags["note-title"],
        reminderTitle: flags["reminder-title"],
        reminderAt: flags["trigger-at"],
        areaId: flags["area-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
      });
      if (wantsJson) writeJson(context.stdout, processed);
      else context.stdout.write(`${processed.thread.id}\n`);
      return CLI_EXIT_OK;
    }
  }

  if (group === "events") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const events = await claw.events.list({
        upcomingOnly: readBooleanFlag(argv, flags, "upcoming-only", false),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, events);
      else context.stdout.write(`${events.map((event) => `${event.id} ${event.title} ${event.startsAt}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw events get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const event = await claw.events.get(id);
      if (!event) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, event);
      else context.stdout.write(`${event.id} ${event.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = subcommand || flags.title;
      if (!title || !flags["starts-at"]) {
        context.stderr.write("Usage: claw events create <title> --starts-at ISO [--ends-at ISO] [--location TEXT]\n");
        return CLI_EXIT_USAGE;
      }
      const event = await claw.events.create({
        title,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        location: flags.location,
        description: flags.description,
        attendeePersonIds: parseCsvFlag(flags.attendees),
      });
      if (wantsJson) writeJson(context.stdout, event);
      else context.stdout.write(`${event.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw events update <id> [--title TEXT] [--starts-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const event = await claw.events.update(id, {
        title: flags.title,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        location: flags.location,
        description: flags.description,
        ...(flags.attendees ? { attendeePersonIds: parseCsvFlag(flags.attendees) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, event);
      else context.stdout.write(`${event.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw events search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.events.search(query, {
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "workspace-search" && command === "query") {
    const query = subcommand || flags.query;
    if (!query) {
      context.stderr.write("Usage: claw workspace-search query <query> [--domains tasks,notes,...]\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    const results = await claw.search.query({
      query,
      domains: parseCsvFlag(flags.domains) as Array<"areas" | "tasks" | "goals" | "projects" | "milestones" | "activity" | "blockers" | "artifacts" | "decisions" | "work_sessions" | "assignments" | "handoffs" | "approvals" | "capacity" | "reminders" | "deadlines" | "notes" | "people" | "inbox" | "events">,
      strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
    });
    if (wantsJson) writeJson(context.stdout, results);
    else context.stdout.write(`${results.map((result) => `${result.domain} ${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
    return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "workspace-index" && command === "rebuild") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    const result = await claw.workspaceIndex.rebuild();
    if (wantsJson) writeJson(context.stdout, result);
    else context.stdout.write(`reindexed=${result.reindexed} embeddings=${result.embeddings}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "library") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const targetAgentId = flags.agent || agentId;
    const targetWorkspaceId = flags.workspaceId || flags["workspace-id"] || workspaceId;
    const tags = parseCsvFlag(flags.tags);
    const requiredSecrets = parseCsvFlag(flags["required-secret"] || flags["required-secrets"]).map((name) => ({ name }));
    const availableSecrets = parseCsvFlag(flags.secret || flags.secrets);

    try {
      if (command === "list") {
        const assets = claw.library.list();
        if (wantsJson) writeJson(context.stdout, { assets });
        else context.stdout.write(`${assets.map((asset) => `${asset.kind} ${asset.id} ${asset.title}`).join("\n")}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "inspect") {
        const asset = subcommand ? claw.library.get(subcommand) : null;
        if (!asset) throw new CliHandledError("not_found", `Library asset not found: ${subcommand ?? ""}`, CLI_EXIT_FAILURE);
        if (wantsJson) writeJson(context.stdout, asset);
        else context.stdout.write(`${asset.kind} ${asset.id}\n${asset.title}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "create") {
        const id = subcommand || flags.id;
        const kind = flags.kind as "skill" | "instruction" | "bundle" | undefined;
        if (!kind || !["skill", "instruction", "bundle"].includes(kind)) {
          context.stderr.write("Usage: claw library create <id> --kind skill|instruction|bundle [--title TEXT] [--content TEXT] [--projection agents|soul|identity|tools] [--ref REF] [--assets a,b]\n");
          return CLI_EXIT_USAGE;
        }
        const asset = claw.library.create({
          ...(id ? { id } : {}),
          kind,
          title: flags.title,
          description: flags.description,
          tags,
          version: flags.version,
          requiredSecrets,
          autoApplyTags: parseCsvFlag(flags["auto-apply-tags"]),
          ...(kind === "skill" ? { source: { source: flags.source, installRef: flags.ref, path: flags.path } } : {}),
          ...(kind === "instruction" ? {
            content: flags.content ?? "",
            projection: {
              target: (flags.projection || "agents") as "soul" | "identity" | "agents" | "tools" | "heartbeat" | "user",
              ...(flags["block-id"] ? { blockId: flags["block-id"] } : {}),
            },
          } : {}),
          ...(kind === "bundle" ? { bundleAssetIds: parseCsvFlag(flags.assets) } : {}),
        });
        if (wantsJson) writeJson(context.stdout, asset);
        else context.stdout.write(`created ${asset.kind} ${asset.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "update") {
        const id = subcommand || flags.id;
        if (!id) {
          context.stderr.write("Usage: claw library update <id> [--title TEXT] [--content TEXT] [--tags a,b]\n");
          return CLI_EXIT_USAGE;
        }
        const asset = claw.library.update(id, {
          ...(flags.title !== undefined ? { title: flags.title } : {}),
          ...(flags.description !== undefined ? { description: flags.description } : {}),
          ...(flags.tags !== undefined ? { tags } : {}),
          ...(flags.version !== undefined ? { version: flags.version } : {}),
          ...(flags.content !== undefined ? { content: flags.content } : {}),
          ...(flags["required-secret"] !== undefined || flags["required-secrets"] !== undefined ? { requiredSecrets } : {}),
          ...(flags["auto-apply-tags"] !== undefined ? { autoApplyTags: parseCsvFlag(flags["auto-apply-tags"]) } : {}),
          ...(flags.assets !== undefined ? { bundleAssetIds: parseCsvFlag(flags.assets) } : {}),
        });
        if (wantsJson) writeJson(context.stdout, asset);
        else context.stdout.write(`updated ${asset.kind} ${asset.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "remove") {
        const id = subcommand || flags.id;
        if (!id) {
          context.stderr.write("Usage: claw library remove <id>\n");
          return CLI_EXIT_USAGE;
        }
        const removed = claw.library.remove(id);
        if (wantsJson) writeJson(context.stdout, { removed });
        else context.stdout.write(`${removed ? "removed" : "not found"} ${id}\n`);
        return removed ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
      }

      if (command === "import-skill") {
        const ref = subcommand || flags.ref || "";
        const asset = claw.library.importSkill(ref, {
          id: flags.id,
          title: flags.title,
          source: flags.source,
          path: flags.path,
          tags,
        });
        if (wantsJson) writeJson(context.stdout, asset);
        else context.stdout.write(`imported skill ${asset.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "assign" || command === "unassign") {
        const assetId = subcommand || flags.id;
        const assignmentWorkspaceId = flags["target-workspace"];
        const targetId = flags.agent || assignmentWorkspaceId || "";
        if (!assetId || !targetId) {
          context.stderr.write(`Usage: claw library ${command} <asset> --agent ID|--target-workspace ID [--exclude]\n`);
          return CLI_EXIT_USAGE;
        }
        const payload = {
          assetId,
          scope: assignmentWorkspaceId ? "workspace" as const : "agent" as const,
          targetId,
          mode: readBooleanFlag(argv, flags, "exclude", false) ? "exclude" as const : "include" as const,
        };
        const result = command === "assign" ? claw.library.assign(payload) : claw.library.unassign(payload);
        if (wantsJson) writeJson(context.stdout, result);
        else context.stdout.write(`${command === "assign" ? "assigned" : "unassigned"} ${assetId}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "resolve" || command === "sync") {
        const input = {
          agentId: targetAgentId,
          workspaceId: targetWorkspaceId,
          tags,
          availableSecrets,
          ...(readBooleanFlag(argv, flags, "allow-missing-secrets", false) ? { allowMissingSecrets: true } : {}),
        };
        if (command === "sync") {
          const result = await claw.library.sync(input);
          if (wantsJson) writeJson(context.stdout, result);
          else context.stdout.write(`synced ${result.resolved.assets.length} library assets\n`);
        } else {
          const result = claw.library.resolve(input);
          if (wantsJson) writeJson(context.stdout, result);
          else context.stdout.write(`${result.assets.map((asset) => `${asset.kind} ${asset.id}`).join("\n")}\n`);
        }
        return CLI_EXIT_OK;
      }
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }

    context.stderr.write("Usage: claw library list|inspect|create|update|remove|import-skill|assign|unassign|resolve|sync\n");
    return CLI_EXIT_USAGE;
  }

  if (group === "skills" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const skills = await claw.skills.list();
    if (wantsJson) {
      writeJson(context.stdout, skills);
    } else {
      context.stdout.write(`${skills.map((entry) => `${entry.enabled ? "*" : "-"} ${entry.id}`).join("\n")}\n`);
    }
    return skills.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "skills" && command === "sources") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const sources = await claw.skills.sources();
    if (wantsJson) {
      writeJson(context.stdout, sources);
    } else {
      context.stdout.write(`${sources.map((entry) => {
        const caps = Object.entries(entry.capabilities)
          .filter(([, enabled]) => enabled)
          .map(([name]) => name)
          .join(",");
        return `${entry.status === "ready" ? "*" : "-"} ${entry.id} ${entry.status}${caps ? ` ${caps}` : ""}`;
      }).join("\n")}\n`);
    }
    return sources.some((entry) => entry.status === "ready") ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "skills" && command === "search") {
    const query = flags.query;
    if (!query) {
      context.stderr.write("--query is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = await claw.skills.search(query, {
      source: flags.source,
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      if (result.entries.length === 0) {
        context.stdout.write("no matches\n");
      } else {
        context.stdout.write(`${result.entries.map((entry) => {
          const summary = entry.summary ? ` ${entry.summary}` : "";
          return `${entry.source}:${entry.slug} ${entry.label}${summary}`;
        }).join("\n")}\n`);
      }
      if (result.omittedSources?.length) {
        context.stdout.write(`${result.omittedSources.map((entry) => `omitted ${entry.source}: ${entry.reason}`).join("\n")}\n`);
      }
    }
    return result.entries.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "skills" && (command === "sync" || command === "inspect")) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const skills = command === "sync" ? await claw.skills.sync() : await claw.skills.list();
    if (wantsJson) {
      writeJson(context.stdout, skills);
    } else {
      context.stdout.write(`${skills.map((entry) => entry.id).join("\n")}\n`);
    }
    return skills.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "skills" && command === "install") {
    const ref = subcommand;
    if (!ref) {
      context.stderr.write("Usage: claw skills install <ref> [--source clawhub|skills.sh] [--json]\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = await claw.skills.install(ref, {
      source: flags.source,
    });
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      const synced = result.syncedSkills ? ` synced=${result.syncedSkills.length}` : "";
      context.stdout.write(`installed ${result.source}:${result.slug} visibility=${result.runtimeVisibility}${synced}\n`);
      if (result.installedPaths?.length) {
        context.stdout.write(`${result.installedPaths.join("\n")}\n`);
      }
      if (result.warnings?.length) {
        context.stdout.write(`${result.warnings.join("\n")}\n`);
      }
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && (command === "list" || command === "status")) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const channels = await claw.channels.list();
    if (wantsJson) {
      writeJson(context.stdout, channels);
    } else {
      context.stdout.write(`${channels.map((entry) => `${entry.id}:${entry.status}`).join("\n")}\n`);
    }
    return channels.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "channels" && command === "telegram" && subcommand === "connect") {
    const secretName = flags["secret-name"] || flags.secret;
    if (!secretName) {
      context.stderr.write("--secret-name is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const secret = await claw.telegram.provisionSecretReference({
      secretName,
      apiBaseUrl: flags["api-base-url"],
    });
    if (secret.status !== "configured") {
      if (wantsJson) {
        writeJson(context.stdout, secret);
      } else {
        context.stderr.write(`${secret.instructions.summary}\n`);
      }
      return CLI_EXIT_DEGRADED;
    }
    const account = await claw.channels.accounts.registerTelegramBot({
      accountId: flags.account,
      label: flags.name,
      secretName,
      apiBaseUrl: flags["api-base-url"],
      webhookUrl: flags["webhook-url"],
      webhookSecretToken: flags["webhook-secret-token"],
      allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
      ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, account);
    } else {
      context.stdout.write(`${account.id} ${account.status}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "processors") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (subcommand === "add" || subcommand === "register") {
      const id = flags.id || extractPositionals(argv)[3];
      const processorCommand = flags.command || flags.cmd;
      if (!id || !processorCommand) {
        context.stderr.write("--id and --command are required\n");
        return CLI_EXIT_USAGE;
      }
      const processor = claw.channels.processors.register({
        id,
        command: processorCommand,
        label: flags.name,
        cwd: flags.cwd,
        agentId: flags.agent || flags["agent-id"],
      });
      if (wantsJson) writeJson(context.stdout, processor);
      else context.stdout.write(`${processor.id}\n`);
      return CLI_EXIT_OK;
    }
    if (subcommand === "list" || !subcommand) {
      const processors = claw.channels.processors.list();
      if (wantsJson) writeJson(context.stdout, processors);
      else context.stdout.write(`${processors.map((entry) => `${entry.id} ${entry.command}`).join("\n")}\n`);
      return processors.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (subcommand === "remove") {
      const id = flags.id || extractPositionals(argv)[3];
      if (!id) {
        context.stderr.write("--id is required\n");
        return CLI_EXIT_USAGE;
      }
      const removed = claw.channels.processors.remove(id);
      if (wantsJson) writeJson(context.stdout, { removed });
      else context.stdout.write(`${removed}\n`);
      return removed ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "channels" && command === "listen") {
    const provider = flags.provider || flags.channel || "telegram";
    const account = flags.account;
    const paths = channelListenerPaths(workspaceRoot, provider, account);

    if (subcommand === "run") {
      const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
      const listener = await claw.channels.listen.run({
        provider,
        accountId: account,
        processorId: flags.processor,
        once: argv.includes("--once"),
        intervalMs: flags["interval-ms"] ? Number(flags["interval-ms"]) : undefined,
        timeoutSeconds: flags.timeout ? Number(flags.timeout) : undefined,
        processorTimeoutMs: flags["processor-timeout-ms"] ? Number(flags["processor-timeout-ms"]) : undefined,
        pidPath: paths.pidPath,
        stopPath: paths.stopPath,
        logPath: paths.logPath,
        mode: readBooleanFlag(argv, flags, "background", false) ? "background" : "foreground",
      });
      if (wantsJson) writeJson(context.stdout, listener);
      else context.stdout.write(`${listener.status}\n`);
      return CLI_EXIT_OK;
    }

    if (subcommand === "start") {
      fs.mkdirSync(paths.runDir, { recursive: true });
      fs.rmSync(paths.stopPath, { force: true });
      if (!readBooleanFlag(argv, flags, "background", false)) {
        const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
        const listener = await claw.channels.listen.run({
          provider,
          accountId: account,
          processorId: flags.processor,
          once: argv.includes("--once"),
          intervalMs: flags["interval-ms"] ? Number(flags["interval-ms"]) : undefined,
          timeoutSeconds: flags.timeout ? Number(flags.timeout) : undefined,
          processorTimeoutMs: flags["processor-timeout-ms"] ? Number(flags["processor-timeout-ms"]) : undefined,
          pidPath: paths.pidPath,
          stopPath: paths.stopPath,
          logPath: paths.logPath,
          mode: "foreground",
        });
        if (wantsJson) writeJson(context.stdout, listener);
        else context.stdout.write(`${listener.status}\n`);
        return CLI_EXIT_OK;
      }

      const entry = fileURLToPath(import.meta.url);
      const packagedBin = path.resolve(path.dirname(entry), "..", "bin", "clawjs.mjs");
      const cliEntry = fs.existsSync(packagedBin) ? packagedBin : entry;
      const args = [
        cliEntry,
        "channels",
        "listen",
        "run",
        "--provider",
        provider,
        "--workspace",
        workspaceRoot,
        "--runtime",
        runtimeAdapterId,
        "--background",
      ];
      if (account) args.push("--account", account);
      if (flags.processor) args.push("--processor", flags.processor);
      if (flags["interval-ms"]) args.push("--interval-ms", flags["interval-ms"]);
      if (flags.timeout) args.push("--timeout", flags.timeout);
      if (flags["processor-timeout-ms"]) args.push("--processor-timeout-ms", flags["processor-timeout-ms"]);
      const logFd = fs.openSync(paths.logPath, "a");
      const child = spawn(process.execPath, args, {
        cwd: context.cwd,
        env: process.env,
        detached: true,
        stdio: ["ignore", logFd, logFd],
      });
      fs.closeSync(logFd);
      child.unref();
      const pid = await waitForListenerPid(paths.pidPath);
      const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
      const listener = claw.channels.listeners.upsert({
        provider,
        accountId: account,
        processorId: flags.processor,
        mode: "background",
        status: pid ? "running" : "stale",
        pid: pid ?? child.pid,
        pidPath: paths.pidPath,
        stopPath: paths.stopPath,
        logPath: paths.logPath,
        startedAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
      });
      if (wantsJson) writeJson(context.stdout, listener);
      else context.stdout.write(`${listener.status} ${listener.pid ?? "unknown"}\n`);
      return pid ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }

    if (subcommand === "status" || !subcommand) {
      const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
      const listener = claw.channels.listeners.get(provider, account);
      const pid = listener?.pid ?? readListenerPid(paths.pidPath);
      const running = isProcessRunning(pid);
      const normalized = listener
        ? claw.channels.listeners.upsert({
          ...listener,
          provider,
          accountId: account,
          mode: listener.mode,
          status: running ? listener.status === "stopped" ? "stopped" : "running" : listener.status === "stopped" ? "stopped" : "stale",
          pid,
        })
        : null;
      if (wantsJson) writeJson(context.stdout, normalized ?? { provider, accountId: account ?? "default", status: running ? "running" : "stopped", pid });
      else context.stdout.write(`${normalized?.status ?? (running ? "running" : "stopped")} ${pid ?? "unknown"}\n`);
      return running ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }

    if (subcommand === "stop") {
      fs.mkdirSync(paths.runDir, { recursive: true });
      fs.writeFileSync(paths.stopPath, `${Date.now()}\n`);
      const pid = readListenerPid(paths.pidPath);
      const startedAt = Date.now();
      while (pid && isProcessRunning(pid) && Date.now() - startedAt < 5_000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (pid && isProcessRunning(pid)) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // already stopped
        }
      }
      const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
      const listener = claw.channels.listeners.upsert({
        provider,
        accountId: account,
        processorId: flags.processor,
        mode: "background",
        status: "stopped",
        pid,
        pidPath: paths.pidPath,
        stopPath: paths.stopPath,
        logPath: paths.logPath,
        stoppedAt: new Date().toISOString(),
      });
      if (wantsJson) writeJson(context.stdout, listener);
      else context.stdout.write("stopped\n");
      return CLI_EXIT_OK;
    }

    if (subcommand === "logs") {
      const lines = flags.lines ? Number(flags.lines) : 80;
      const output = readTail(paths.logPath, lines);
      if (wantsJson) writeJson(context.stdout, { log: output });
      else context.stdout.write(output ? `${output}\n` : "");
      return output ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "channels" && command === "codex-processor") {
    if (subcommand && subcommand !== "run") {
      context.stderr.write(`Usage: ${binName} channels codex-processor run --runtime codex --workspace PATH\n`);
      return CLI_EXIT_USAGE;
    }
    return await runTelegramCodexProcessor({
      context,
      flags,
      argv,
      workspaceRoot,
      appId,
      workspaceId,
      agentId,
      runtimeAdapterId,
    });
  }

  if (group === "channels" && command === "accounts" && subcommand === "add") {
    const provider = extractPositionals(argv)[3] || flags.provider || flags.channel;
    if (provider !== "telegram") {
      context.stderr.write("only telegram accounts are supported\n");
      return CLI_EXIT_USAGE;
    }
    const secretName = flags["secret-name"] || flags.secret;
    if (!secretName) {
      context.stderr.write("--secret-name is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const account = await claw.channels.accounts.registerTelegramBot({
      accountId: flags.account,
      label: flags.name,
      secretName,
      apiBaseUrl: flags["api-base-url"],
      webhookUrl: flags["webhook-url"],
      webhookSecretToken: flags["webhook-secret-token"],
      allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
      ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, account);
    } else {
      context.stdout.write(`${account.id} ${account.status}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "accounts" && (subcommand === "list" || subcommand === "status")) {
    const provider = flags.provider || flags.channel;
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const accounts = subcommand === "status"
      ? await claw.channels.accounts.status(provider)
      : claw.channels.accounts.list(provider);
    if (wantsJson) {
      writeJson(context.stdout, accounts);
    } else {
      context.stdout.write(`${accounts.map((entry) => `${entry.id}:${entry.status}`).join("\n")}\n`);
    }
    return accounts.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "channels" && command === "accounts" && subcommand === "remove") {
    const provider = flags.provider || flags.channel || extractPositionals(argv)[3];
    if (!provider) {
      context.stderr.write("--provider is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const accounts = await claw.channels.accounts.remove(provider, flags.account);
    if (wantsJson) {
      writeJson(context.stdout, accounts);
    } else {
      context.stdout.write(`${accounts.map((entry) => entry.id).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "targets" && subcommand === "register") {
    const provider = flags.provider || flags.channel || "telegram";
    const targetId = flags["target-id"] || flags.target || flags["chat-id"];
    if (!targetId) {
      context.stderr.write("--target-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const target = claw.channels.targets.register({
      provider,
      accountId: flags.account,
      targetId,
      kind: (flags.kind as "dm" | "group" | "supergroup" | "channel" | "topic" | "unknown" | undefined) ?? "unknown",
      label: flags.label || flags.title || flags.username,
      title: flags.title,
      username: flags.username,
      parentTargetId: flags["parent-target-id"],
      threadId: flags["thread-id"] || flags["message-thread-id"],
    });
    if (wantsJson) {
      writeJson(context.stdout, target);
    } else {
      context.stdout.write(`${target.id}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "targets" && subcommand === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const targets = claw.channels.targets.list({
      provider: flags.provider || flags.channel,
      accountId: flags.account,
      query: flags.query,
    });
    if (wantsJson) {
      writeJson(context.stdout, targets);
    } else {
      context.stdout.write(`${targets.map((entry) => `${entry.id} ${entry.label ?? ""}`.trim()).join("\n")}\n`);
    }
    return targets.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "channels" && command === "targets" && (subcommand === "inspect" || subcommand === "get")) {
    const provider = flags.provider || flags.channel || "telegram";
    const targetId = flags["target-id"] || flags.target || flags["chat-id"] || extractPositionals(argv)[3];
    if (!targetId) {
      context.stderr.write("--target-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const target = claw.channels.targets.get(provider, flags.account, targetId, flags["thread-id"] || flags["message-thread-id"]);
    if (wantsJson) {
      writeJson(context.stdout, target ?? { targetId, found: false });
    } else if (target) {
      context.stdout.write(`${target.id} ${target.kind}${target.metadata?.instructions ? " instructions" : ""}\n`);
    }
    return target ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "channels" && command === "targets" && (subcommand === "update" || subcommand === "set")) {
    const provider = flags.provider || flags.channel || "telegram";
    const targetId = flags["target-id"] || flags.target || flags["chat-id"] || extractPositionals(argv)[3];
    if (!targetId) {
      context.stderr.write("--target-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const threadId = flags["thread-id"] || flags["message-thread-id"];
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const existing = claw.channels.targets.get(provider, flags.account, targetId, threadId);
    const metadata = parseJsonFlag<Record<string, unknown>>(flags.metadata, "--metadata") ?? {};
    if (flags.instructions !== undefined) metadata.instructions = flags.instructions;
    const target = claw.channels.targets.register({
      provider,
      accountId: flags.account,
      targetId,
      kind: (flags.kind as "dm" | "group" | "supergroup" | "channel" | "topic" | "unknown" | undefined) ?? existing?.kind ?? (threadId ? "topic" : "unknown"),
      label: flags.label || flags.title || flags.username || existing?.label,
      title: flags.title || existing?.title,
      username: flags.username || existing?.username,
      parentTargetId: flags["parent-target-id"] || existing?.parentTargetId,
      threadId: threadId ?? existing?.threadId,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...metadata,
      },
    });
    if (wantsJson) {
      writeJson(context.stdout, target);
    } else {
      context.stdout.write(`${target.id}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "permissions" && subcommand === "grant") {
    if (!flags.agent) {
      context.stderr.write("--agent is required\n");
      return CLI_EXIT_USAGE;
    }
    const permissions = parseCsvFlag(flags.permissions || flags.permission);
    if (permissions.length === 0) {
      context.stderr.write("--permissions is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const binding = claw.channels.bindings.grant({
      agentId: flags.agent,
      provider: flags.provider || flags.channel,
      accountId: flags.account,
      targetId: flags["target-id"] || flags.target || flags["chat-id"],
      permissions: permissions as Array<"read" | "write" | "ingest" | "admin">,
      ...(flags.priority ? { priority: Number(flags.priority) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, binding);
    } else {
      context.stdout.write(`${binding.id}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "permissions" && subcommand === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const bindings = claw.channels.bindings.list({
      agentId: flags.agent,
      provider: flags.provider || flags.channel,
      accountId: flags.account,
      targetId: flags["target-id"] || flags.target || flags["chat-id"],
    });
    if (wantsJson) {
      writeJson(context.stdout, bindings);
    } else {
      context.stdout.write(`${bindings.map((entry) => `${entry.id} ${entry.permissions.join(",")}`).join("\n")}\n`);
    }
    return bindings.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "channels" && command === "permissions" && subcommand === "revoke") {
    const id = flags.id || extractPositionals(argv)[3];
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const removed = claw.channels.bindings.revoke(id);
    if (wantsJson) {
      writeJson(context.stdout, { removed });
    } else {
      context.stdout.write(`${removed}\n`);
    }
    return removed ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "channels" && command === "messages" && subcommand === "send") {
    const targetId = flags["target-id"] || flags.target || flags["chat-id"];
    if (!targetId) {
      context.stderr.write("--target-id is required\n");
      return CLI_EXIT_USAGE;
    }
    if (!flags.text && !flags.media) {
      context.stderr.write("--text or --media is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const message = await claw.channels.messages.send({
      provider: flags.provider || flags.channel || "telegram",
      accountId: flags.account,
      targetId,
      text: flags.text,
      media: flags.media,
      threadId: flags["thread-id"] || flags["message-thread-id"],
      parseMode: flags["parse-mode"] as "HTML" | "Markdown" | "MarkdownV2" | undefined,
      agentId: flags.agent,
    });
    if (wantsJson) {
      writeJson(context.stdout, message);
    } else {
      context.stdout.write(`${message.id}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "messages" && subcommand === "sync") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const messages = await claw.channels.messages.sync({
      provider: flags.provider || flags.channel || "telegram",
      accountId: flags.account,
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      ...(flags.timeout ? { timeoutSeconds: Number(flags.timeout) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, messages);
    } else {
      context.stdout.write(`${messages.map((entry) => entry.id).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "messages" && subcommand === "read") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const messages = claw.channels.messages.read({
      provider: flags.provider || flags.channel,
      accountId: flags.account,
      targetId: flags["target-id"] || flags.target || flags["chat-id"],
      agentId: flags.agent,
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, messages);
    } else {
      context.stdout.write(`${messages.map((entry) => `${entry.id} ${entry.text ?? ""}`.trim()).join("\n")}\n`);
    }
    return messages.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "channels" && command === "commands" && (subcommand === "set" || subcommand === "get")) {
    const provider = (flags.provider || flags.channel || "telegram") as "telegram";
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = subcommand === "set"
      ? await claw.channels.commands.set(provider, parseJsonFlag<Array<{ command: string; description: string }>>(flags.commands, "--commands") ?? [], { accountId: flags.account })
      : await claw.channels.commands.get(provider, { accountId: flags.account });
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      context.stdout.write(`${result.map((entry) => `${entry.command}: ${entry.description}`).join("\n")}\n`);
    }
    return result.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "telegram" && command === "connect") {
    const secretName = flags["secret-name"];
    if (!secretName) {
      context.stderr.write("--secret-name is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.telegram.connectBot({
      secretName,
      apiBaseUrl: flags["api-base-url"],
      webhookUrl: flags["webhook-url"],
      webhookSecretToken: flags["webhook-secret-token"],
      allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
      ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, status);
    } else {
      context.stdout.write(`${status.channel.status} ${status.transport.mode}\n`);
    }
    return status.channel.status === "connected" ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "telegram" && command === "status") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.telegram.status();
    if (wantsJson) {
      writeJson(context.stdout, status);
    } else {
      context.stdout.write(`status: ${status.channel.status}\n`);
      context.stdout.write(`mode: ${status.transport.mode}\n`);
      context.stdout.write(`bot: ${status.botProfile?.username ?? "unknown"}\n`);
    }
    return status.channel.status === "connected" ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "telegram" && command === "webhook" && subcommand === "set") {
    const url = flags.url || flags["webhook-url"];
    if (!url) {
      context.stderr.write("--url is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.telegram.configureWebhook({
      url,
      secretToken: flags["webhook-secret-token"],
      allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
      ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
      ...(flags["max-connections"] ? { maxConnections: Number(flags["max-connections"]) } : {}),
      ...(flags["ip-address"] ? { ipAddress: flags["ip-address"] } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, status);
    } else {
      context.stdout.write(`${status.transport.webhook?.url ?? "configured"}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "telegram" && command === "webhook" && subcommand === "clear") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.telegram.disableWebhook({
      ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, status);
    } else {
      context.stdout.write(`${status.transport.mode}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "telegram" && command === "polling" && subcommand === "start") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.telegram.startPolling({
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      ...(flags.timeout ? { timeoutSeconds: Number(flags.timeout) } : {}),
      ...(flags["allowed-updates"] ? { allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates") } : {}),
      ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, status);
    } else {
      context.stdout.write(`${status.transport.mode}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "telegram" && command === "polling" && subcommand === "stop") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.telegram.stopPolling();
    if (wantsJson) {
      writeJson(context.stdout, status);
    } else {
      context.stdout.write(`${status.transport.active}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "telegram" && command === "commands" && subcommand === "set") {
    const commands = parseJsonFlag<Array<{ command: string; description: string }>>(flags.commands, "--commands");
    if (!commands) {
      context.stderr.write("--commands is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const saved = await claw.telegram.setCommands(commands);
    if (wantsJson) {
      writeJson(context.stdout, saved);
    } else {
      context.stdout.write(`${saved.map((entry) => entry.command).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "telegram" && command === "commands" && subcommand === "get") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const commands = await claw.telegram.getCommands();
    if (wantsJson) {
      writeJson(context.stdout, commands);
    } else {
      context.stdout.write(`${commands.map((entry) => `${entry.command}: ${entry.description}`).join("\n")}\n`);
    }
    return commands.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "telegram" && command === "chats" && subcommand === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const chats = await claw.telegram.listChats(flags.query);
    if (wantsJson) {
      writeJson(context.stdout, chats);
    } else {
      context.stdout.write(`${chats.map((entry) => `${entry.id} ${entry.title ?? entry.username ?? entry.firstName ?? ""}`.trim()).join("\n")}\n`);
    }
    return chats.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "telegram" && command === "chats" && subcommand === "inspect") {
    const chatId = flags["chat-id"];
    if (!chatId) {
      context.stderr.write("--chat-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const chat = await claw.telegram.getChat(chatId);
    if (wantsJson) {
      writeJson(context.stdout, chat);
    } else {
      context.stdout.write(`${chat.id} ${chat.type}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "telegram" && command === "send") {
    const chatId = flags["chat-id"];
    if (!chatId) {
      context.stderr.write("--chat-id is required\n");
      return CLI_EXIT_USAGE;
    }
    if (!flags.media && !flags.text) {
      context.stderr.write("--text or --media is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const response = flags.media
      ? await claw.telegram.sendMedia({
        type: (flags.type as TelegramSendMediaInput["type"] | undefined) ?? "photo",
        chatId,
        media: flags.media,
        caption: flags.caption,
        ...(flags["parse-mode"] ? { parseMode: flags["parse-mode"] as TelegramSendMediaInput["parseMode"] } : {}),
        ...(flags["reply-to-message-id"] ? { replyToMessageId: Number(flags["reply-to-message-id"]) } : {}),
        ...(flags["message-thread-id"] ? { messageThreadId: Number(flags["message-thread-id"]) } : {}),
      })
      : await claw.telegram.sendMessage({
        chatId,
        text: flags.text ?? "",
        ...(flags["parse-mode"] ? { parseMode: flags["parse-mode"] as TelegramSendMessageInput["parseMode"] } : {}),
        ...(flags["reply-to-message-id"] ? { replyToMessageId: Number(flags["reply-to-message-id"]) } : {}),
        ...(flags["message-thread-id"] ? { messageThreadId: Number(flags["message-thread-id"]) } : {}),
      });
    if (wantsJson) {
      writeJson(context.stdout, response);
    } else {
      context.stdout.write("ok\n");
    }
    return CLI_EXIT_OK;
  }

  if (group === "files" && command === "diff") {
    const targetFile = flags.file;
    const blockId = flags["block-id"];
    const settingsKey = flags.key || "value";
    const value = flags.value ?? "";
    if (!targetFile || !blockId) {
      context.stderr.write("--file and --block-id are required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const diff = claw.files.diffBinding({
      id: `${targetFile}:${blockId}`,
      targetFile,
      mode: "managed_block",
      blockId,
      settingsPath: settingsKey,
    }, { [settingsKey]: value }, (settings) => `${settingsKey}=${String((settings as Record<string, unknown>)[settingsKey] ?? "")}`);
    if (wantsJson) {
      writeJson(context.stdout, diff);
    } else {
      context.stdout.write(`${diff.changed}\n`);
    }
    return diff.changed ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "files" && command === "apply-template-pack") {
    const templatePackPath = flags["template-pack"];
    if (!templatePackPath) {
      context.stderr.write("--template-pack is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = await claw.files.applyTemplatePack(templatePackPath);
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      context.stdout.write(`${result.filter((entry) => entry.changed).length}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "files" && command === "read") {
    const targetFile = flags.file;
    if (!targetFile) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const content = claw.files.readWorkspaceFile(targetFile);
    if (wantsJson) {
      writeJson(context.stdout, { file: targetFile, content });
    } else {
      context.stdout.write(`${content ?? ""}`);
    }
    return content === null ? CLI_EXIT_FAILURE : CLI_EXIT_OK;
  }

  if (group === "files" && command === "write") {
    const targetFile = flags.file;
    const value = flags.value ?? "";
    if (!targetFile) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = claw.files.writeWorkspaceFile(targetFile, value);
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      context.stdout.write(`${result.filePath}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "files" && command === "inspect") {
    const targetFile = flags.file;
    if (!targetFile) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const inspection = claw.files.inspectWorkspaceFile(targetFile);
    if (wantsJson) {
      writeJson(context.stdout, inspection);
    } else {
      context.stdout.write(`${inspection.filePath}\n`);
    }
    return inspection.exists ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "files" && command === "sync") {
    const targetFile = flags.file;
    const blockId = flags["block-id"];
    const settingsKey = flags.key || "value";
    const value = flags.value ?? "";
    if (!targetFile || !blockId) {
      context.stderr.write("--file and --block-id are required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const syncResult = claw.files.syncBinding({
      id: `${targetFile}:${blockId}`,
      targetFile,
      mode: "managed_block",
      blockId,
      settingsPath: settingsKey,
    }, { [settingsKey]: value }, (settings) => `${settingsKey}=${String((settings as Record<string, unknown>)[settingsKey] ?? "")}`);
    if (wantsJson) {
      writeJson(context.stdout, syncResult);
    } else {
      context.stdout.write(`${syncResult.filePath}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "sessions" && command === "create") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const title = flags.title;
    const session = claw.sessions.createSession(title);
    if (wantsJson) {
      writeJson(context.stdout, session);
    } else {
      context.stdout.write(`${session.sessionId}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "sessions" && command === "read") {
    const sessionId = flags["session-id"];
    if (!sessionId) {
      context.stderr.write("--session-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const session = claw.sessions.getSession(sessionId);
    if (wantsJson) {
      writeJson(context.stdout, session);
    } else {
      context.stdout.write(`${session?.title ?? "missing"}\n`);
    }
    return session ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "sessions" && command === "generate-title") {
    const sessionId = flags["session-id"];
    if (!sessionId) {
      context.stderr.write("--session-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const title = await claw.sessions.generateTitle({
      sessionId,
      transport: (flags.transport as "auto" | "gateway" | "cli" | undefined) ?? "auto",
    });
    if (wantsJson) {
      writeJson(context.stdout, { sessionId, title });
    } else {
      context.stdout.write(`${title}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "sessions" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const sessions = claw.sessions.listSessions();
    if (wantsJson) {
      writeJson(context.stdout, sessions);
    } else {
      context.stdout.write(`${sessions.map((session) => `${session.sessionId} ${session.title}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "sessions" && command === "search") {
    const query = flags.query || subcommand;
    if (!query?.trim()) {
      context.stderr.write("--query is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const results = await claw.sessions.searchSessions({
      query: query.trim(),
      strategy: (flags.strategy as "auto" | "local" | "openclaw-memory" | undefined) ?? "auto",
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      ...(flags["min-score"] ? { minScore: Number(flags["min-score"]) } : {}),
      includeMessages: argv.includes("--no-messages") ? false : readBooleanFlag(argv, flags, "include-messages", true),
      fallbackToLocal: argv.includes("--no-local-fallback") ? false : readBooleanFlag(argv, flags, "fallback-to-local", true),
    });
    if (wantsJson) {
      writeJson(context.stdout, results);
    } else {
      context.stdout.write(`${results.map((result) => `${result.sessionId} ${result.title}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "sessions" && command === "stream") {
    const sessionId = flags["session-id"];
    if (!sessionId) {
      context.stderr.write("--session-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const transport = (flags.transport as "auto" | "gateway" | "cli" | undefined) ?? "auto";
    const baseInput = {
      sessionId,
      systemPrompt: flags["system-prompt"],
      contextBlocks: parseContextBlock(flags.context),
      transport,
      ...(flags["chunk-size"] ? { chunkSize: Number(flags["chunk-size"]) } : {}),
      ...(flags["gateway-retries"] ? { gatewayRetries: Number(flags["gateway-retries"]) } : {}),
    };

    if (argv.includes("--events")) {
      const events: unknown[] = [];
      let exitCode = 0;
      for await (const event of claw.sessions.streamAssistantReplyEvents(baseInput)) {
        if (event.type === "error" || event.type === "aborted") {
          exitCode = 1;
        }
        if (wantsJson) {
          events.push(event.type === "error" ? { ...event, error: event.error.message } : event);
          continue;
        }
        if (event.type === "chunk") {
          context.stdout.write(event.chunk.delta);
          continue;
        }
        writeJsonLine(context.stdout, event.type === "error" ? { ...event, error: event.error.message } : event);
      }
      if (wantsJson) {
        writeJson(context.stdout, events);
      }
      return exitCode;
    }

    const chunks: string[] = [];
    for await (const chunk of claw.sessions.streamAssistantReply(baseInput)) {
      if (chunk.done) continue;
      chunks.push(chunk.delta);
      if (!wantsJson) {
        context.stdout.write(chunk.delta);
      }
    }

    if (wantsJson) {
      writeJson(context.stdout, {
        sessionId,
        text: chunks.join(""),
        chunks,
      });
    }
    return CLI_EXIT_OK;
  }

  if (group === "documents" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const documents = await claw.documents.list(flags["session-id"] ? { sessionId: flags["session-id"] } : undefined);
    if (wantsJson) {
      writeJson(context.stdout, documents);
    } else {
      context.stdout.write(`${documents.map((document) => `${document.documentId} ${document.name}`).join("\n")}\n`);
    }
    return documents.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "documents" && command === "read") {
    const documentId = flags["document-id"] ?? flags.id;
    if (!documentId) {
      context.stderr.write("--document-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const document = await claw.documents.get(documentId);
    if (wantsJson) {
      writeJson(context.stdout, document);
    } else {
      context.stdout.write(`${document?.name ?? "missing"}\n`);
    }
    return document ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "documents" && command === "search") {
    const query = flags.query || subcommand;
    if (!query?.trim()) {
      context.stderr.write("--query is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const results = await claw.documents.search({
      query: query.trim(),
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      ...(flags["session-id"] ? { sessionId: flags["session-id"] } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, results);
    } else {
      context.stdout.write(`${results.map((document) => `${document.documentId} ${document.name}`).join("\n")}\n`);
    }
    return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "documents" && command === "upload") {
    const sourceFile = flags.file;
    if (!sourceFile) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const filePath = path.resolve(context.cwd, sourceFile);
    const data = fs.readFileSync(filePath);
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const document = await claw.documents.upload({
      name: flags.name || path.basename(filePath),
      mimeType: flags["mime-type"] || inferMimeTypeFromPath(filePath),
      data: data.toString("base64"),
      ...(flags["session-id"] ? { sessionId: flags["session-id"] } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, document);
    } else {
      context.stdout.write(`${document.documentId}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "documents" && command === "register") {
    const sourceFile = flags.file;
    if (!sourceFile) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const filePath = path.resolve(context.cwd, sourceFile);
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const document = await claw.documents.register({
      filePath,
      ...(flags.name ? { name: flags.name } : {}),
      ...(flags["mime-type"] ? { mimeType: flags["mime-type"] } : {}),
      ...(flags["session-id"] ? { sessionId: flags["session-id"] } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, document);
    } else {
      context.stdout.write(`${document.documentId}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "documents" && command === "download") {
    const documentId = flags["document-id"] ?? flags.id;
    if (!documentId) {
      context.stderr.write("--document-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const download = await claw.documents.download(documentId);
    if (!download) {
      if (wantsJson) {
        writeJson(context.stdout, null);
      } else {
        context.stdout.write("missing\n");
      }
      return CLI_EXIT_FAILURE;
    }
    const outputPath = path.resolve(
      context.cwd,
      flags.out || flags.output || download.document.name,
    );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, download.buffer);
    if (wantsJson) {
      writeJson(context.stdout, {
        document: download.document,
        outputPath,
        sizeBytes: download.buffer.length,
      });
    } else {
      context.stdout.write(`${outputPath}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "inference" && command === "generate-text") {
    const messages = parseInferenceMessages(flags);
    if (!messages) {
      context.stderr.write("--prompt, --message, --text, or --messages-json is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = await claw.inference.generateText({
      messages,
      sessionId: flags["session-id"],
      systemPrompt: flags["system-prompt"],
      contextBlocks: parseContextBlock(flags.context),
      transport: (flags.transport as "auto" | "gateway" | "cli" | undefined) ?? "auto",
      ...(flags.model ? { model: flags.model } : {}),
      ...(flags["chunk-size"] ? { chunkSize: Number(flags["chunk-size"]) } : {}),
      ...(flags["gateway-retries"] ? { gatewayRetries: Number(flags["gateway-retries"]) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      context.stdout.write(`${result.text}\n`);
    }
    return result.text ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "tts" && command === "providers") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const providers = claw.tts.providers();
    if (wantsJson) {
      writeJson(context.stdout, providers);
    } else {
      context.stdout.write(`${providers.map((provider) => provider.id).join("\n")}\n`);
    }
    return providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "tts" && command === "catalog") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const catalog = claw.tts.catalog();
    if (wantsJson) {
      writeJson(context.stdout, catalog);
    } else {
      context.stdout.write(`${catalog.providers.map((provider) => provider.id).join("\n")}\n`);
    }
    return catalog.providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "tts" && command === "config") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const config = claw.tts.config();
    if (wantsJson) {
      writeJson(context.stdout, config);
    } else {
      context.stdout.write(`${config.provider ?? "local"}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "tts" && command === "set-config") {
    const config = parseJsonFlag<Record<string, unknown>>(flags["config-json"], "--config-json") ?? {
      ...(flags.provider ? { provider: flags.provider } : {}),
      ...(flags.enabled !== undefined || argv.includes("--enabled") ? { enabled: readBooleanFlag(argv, flags, "enabled", false) } : {}),
      ...(flags["auto-read"] !== undefined || argv.includes("--auto-read") ? { autoRead: readBooleanFlag(argv, flags, "auto-read", false) } : {}),
      ...(flags["api-key"] ? { apiKey: flags["api-key"] } : {}),
      ...(flags.voice ? { voice: flags.voice } : {}),
      ...(flags.model ? { model: flags.model } : {}),
      ...(flags.speed ? { speed: Number(flags.speed) } : {}),
      ...(flags.stability ? { stability: Number(flags.stability) } : {}),
      ...(flags["similarity-boost"] ? { similarityBoost: Number(flags["similarity-boost"]) } : {}),
    };
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const next = claw.tts.setConfig(config);
    if (wantsJson) {
      writeJson(context.stdout, next);
    } else {
      context.stdout.write(`${next.provider ?? "local"}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "tts" && command === "synthesize") {
    const text = flags.text ?? flags.prompt ?? subcommand;
    if (!text?.trim()) {
      context.stderr.write("--text is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = await claw.tts.synthesize({
      text: text.trim(),
      ...(flags.lang ? { lang: flags.lang } : {}),
      ...(flags.provider ? { provider: flags.provider as "local" | "openai" | "elevenlabs" | "deepgram" } : {}),
      ...(flags["api-key"] ? { apiKey: flags["api-key"] } : {}),
      ...(flags.voice ? { voice: flags.voice } : {}),
      ...(flags.model ? { model: flags.model } : {}),
      ...(flags.speed ? { speed: Number(flags.speed) } : {}),
      ...(flags.stability ? { stability: Number(flags.stability) } : {}),
      ...(flags["similarity-boost"] ? { similarityBoost: Number(flags["similarity-boost"]) } : {}),
    });
    const outputPath = path.resolve(
      context.cwd,
      flags.out || flags.output || `tts-${Date.now()}${inferAudioExtension(result.mimeType)}`,
    );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, result.audio);
    if (wantsJson) {
      writeJson(context.stdout, {
        outputPath,
        mimeType: result.mimeType,
        sizeBytes: result.audio.length,
      });
    } else {
      context.stdout.write(`${outputPath}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "stt" && command === "providers") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const providers = claw.stt.providers();
    if (wantsJson) {
      writeJson(context.stdout, providers);
    } else {
      context.stdout.write(`${providers.map((provider) => provider.id).join("\n")}\n`);
    }
    return providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "stt" && command === "config") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const config = claw.stt.config();
    if (wantsJson) {
      writeJson(context.stdout, config);
    } else {
      context.stdout.write(`${config.provider ?? "local-whisper"}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "stt" && command === "set-config") {
    const config = parseJsonFlag<Record<string, unknown>>(flags["config-json"], "--config-json") ?? {
      provider: "local-whisper",
      ...(flags.enabled !== undefined || argv.includes("--enabled") ? { enabled: readBooleanFlag(argv, flags, "enabled", false) } : {}),
      ...(flags["binary-path"] ? { binaryPath: flags["binary-path"] } : {}),
      ...(flags["ffmpeg-path"] ? { ffmpegPath: flags["ffmpeg-path"] } : {}),
      ...(flags["model-path"] ? { modelPath: flags["model-path"] } : {}),
      ...(flags.language || flags.lang ? { language: flags.language ?? flags.lang } : {}),
      ...(flags.translate !== undefined || argv.includes("--translate") ? { translate: readBooleanFlag(argv, flags, "translate", false) } : {}),
      ...(flags.threads ? { threads: Number(flags.threads) } : {}),
    };
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const next = claw.stt.setConfig(config);
    if (wantsJson) {
      writeJson(context.stdout, next);
    } else {
      context.stdout.write(`${next.provider ?? "local-whisper"}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "stt" && command === "transcribe") {
    const filePath = flags.file || flags.input || subcommand;
    if (!filePath?.trim()) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = await claw.stt.transcribe({
      filePath: path.resolve(context.cwd, filePath),
      provider: "local-whisper",
      ...(flags["binary-path"] ? { binaryPath: flags["binary-path"] } : {}),
      ...(flags["ffmpeg-path"] ? { ffmpegPath: flags["ffmpeg-path"] } : {}),
      ...(flags["model-path"] ? { modelPath: flags["model-path"] } : {}),
      ...(flags.language || flags.lang ? { language: flags.language ?? flags.lang } : {}),
      ...(flags.translate !== undefined || argv.includes("--translate") ? { translate: readBooleanFlag(argv, flags, "translate", false) } : {}),
      ...(flags.threads ? { threads: Number(flags.threads) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      context.stdout.write(`${result.text}\n`);
    }
    return result.text ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "voice-notes" && (command === "add" || command === "create")) {
    const filePath = flags.file || flags.input || subcommand;
    if (!filePath?.trim()) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const note = claw.voiceNotes.registerPath({
      filePath: path.resolve(context.cwd, filePath),
      mimeType: flags["mime-type"] || inferMimeTypeFromPath(filePath),
      fileName: flags.name,
      durationSeconds: flags.duration ? Number(flags.duration) : undefined,
      source: {
        origin: flags.origin || "cli",
        provider: flags.provider,
        accountId: flags.account,
        targetId: flags["target-id"],
        threadId: flags["thread-id"],
        providerMessageId: flags["message-id"],
        senderId: flags["sender-id"],
        senderLabel: flags["sender-label"],
        metadata: parseJsonFlag<Record<string, unknown>>(flags["metadata-json"], "--metadata-json") ?? undefined,
      },
      tags: parseCsvFlag(flags.tags),
    });
    if (wantsJson) {
      writeJson(context.stdout, note);
    } else {
      context.stdout.write(`${note.id}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "voice-notes" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const notes = claw.voiceNotes.list({
      origin: flags.origin,
      provider: flags.provider,
      accountId: flags.account,
      targetId: flags["target-id"],
      threadId: flags["thread-id"],
      status: flags.status as VoiceNoteStatus | undefined,
      query: flags.query,
      limit: flags.limit ? Number(flags.limit) : undefined,
    });
    if (wantsJson) {
      writeJson(context.stdout, notes);
    } else {
      context.stdout.write(`${notes.map((note) => `${note.id}\t${note.status}\t${note.source.origin}\t${note.transcript?.text ?? ""}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "voice-notes" && (command === "get" || command === "read" || command === "inspect")) {
    const id = subcommand || flags.id;
    if (!id) {
      context.stderr.write("voice note id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const note = claw.voiceNotes.get(id);
    if (!note) {
      context.stderr.write(`voice note not found: ${id}\n`);
      return CLI_EXIT_DEGRADED;
    }
    if (wantsJson) {
      writeJson(context.stdout, note);
    } else {
      context.stdout.write(`${note.transcript?.text ?? note.id}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "voice-notes" && command === "transcribe") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const id = subcommand || flags.id;
    if (!id && !(flags.file || flags.input)) {
      context.stderr.write("voice note id or --file is required\n");
      return CLI_EXIT_USAGE;
    }
    const note = id
      ? await claw.voiceNotes.transcribe(id, {
        provider: "local-whisper",
        ...(flags["binary-path"] ? { binaryPath: flags["binary-path"] } : {}),
        ...(flags["ffmpeg-path"] ? { ffmpegPath: flags["ffmpeg-path"] } : {}),
        ...(flags["model-path"] ? { modelPath: flags["model-path"] } : {}),
        ...(flags.language || flags.lang ? { language: flags.language ?? flags.lang } : {}),
        ...(flags.translate !== undefined || argv.includes("--translate") ? { translate: readBooleanFlag(argv, flags, "translate", false) } : {}),
        ...(flags.threads ? { threads: Number(flags.threads) } : {}),
      })
      : await (async () => {
        const created = claw.voiceNotes.registerPath({
          filePath: path.resolve(context.cwd, flags.file || flags.input),
          mimeType: flags["mime-type"] || inferMimeTypeFromPath(flags.file || flags.input),
          source: { origin: flags.origin || "cli", provider: flags.provider },
        });
        return claw.voiceNotes.transcribe(created.id, {
          provider: "local-whisper",
          ...(flags["binary-path"] ? { binaryPath: flags["binary-path"] } : {}),
          ...(flags["ffmpeg-path"] ? { ffmpegPath: flags["ffmpeg-path"] } : {}),
          ...(flags["model-path"] ? { modelPath: flags["model-path"] } : {}),
          ...(flags.language || flags.lang ? { language: flags.language ?? flags.lang } : {}),
          ...(flags.translate !== undefined || argv.includes("--translate") ? { translate: readBooleanFlag(argv, flags, "translate", false) } : {}),
          ...(flags.threads ? { threads: Number(flags.threads) } : {}),
        });
      })();
    if (wantsJson) {
      writeJson(context.stdout, note);
    } else {
      context.stdout.write(`${note.transcript?.text ?? ""}\n`);
    }
    return note.status === "transcribed" ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "generations" && command === "backends") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const backends = claw.generations.backends();
    if (wantsJson) {
      writeJson(context.stdout, backends);
    } else {
      context.stdout.write(`${backends.map((backend) => {
        const prefix = backend.available ? "*" : "-";
        const kinds = backend.supportedKinds.length > 0 ? ` ${backend.supportedKinds.join(",")}` : "";
        const reason = backend.reason ? ` ${backend.reason}` : "";
        return `${prefix} ${backend.id} [${backend.source}]${kinds}${reason}`;
      }).join("\n")}\n`);
    }
    return backends.some((backend) => backend.available) ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (mediaGroup && command === "backends") {
    const { media } = await getTypedGenerationFacade(mediaGroup);
    const backends = media.backends();
    if (wantsJson) {
      writeJson(context.stdout, backends);
    } else {
      context.stdout.write(`${backends.map((backend: { available: boolean; reason?: string; id: string; source: string }) => {
        const prefix = backend.available ? "*" : "-";
        const reason = backend.reason ? ` ${backend.reason}` : "";
        return `${prefix} ${backend.id} [${backend.source}]${reason}`;
      }).join("\n")}\n`);
    }
    return backends.some((backend: { available: boolean }) => backend.available) ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "image" && command === "create") {
    const prompt = flags.prompt;
    if (!prompt) {
      context.stderr.write("--prompt is required\n");
      return CLI_EXIT_USAGE;
    }
    const { media } = await getImageGenerationFacade();
    const record = await media.generate({
      prompt,
      ...buildImageCommonInput(flags),
      backendId: flags.backend,
      command: flags.command,
      args: parseJsonFlag<string[]>(flags["args-json"], "--args-json"),
      cwd: flags.cwd,
      env: parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json"),
      outputExtension: flags.ext,
      mimeType: flags["mime-type"],
      allowEnvCredentials: readBooleanFlag(argv, flags, "allow-env-credentials", false),
    });
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
    }
    return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "image" && command === "edit") {
    const prompt = flags.prompt;
    const parentId = flags.id || flags["parent-id"];
    if (!prompt || !parentId) {
      context.stderr.write("--id and --prompt are required\n");
      return CLI_EXIT_USAGE;
    }
    const { media } = await getImageGenerationFacade();
    const record = await media.edit({
      parentId,
      prompt,
      ...buildImageCommonInput(flags),
      sourceImageIds: parseCsvFlag(flags["source-image-ids"]),
      backendId: flags.backend,
      command: flags.command,
      args: parseJsonFlag<string[]>(flags["args-json"], "--args-json"),
      cwd: flags.cwd,
      env: parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json"),
      outputExtension: flags.ext,
      mimeType: flags["mime-type"],
      allowEnvCredentials: readBooleanFlag(argv, flags, "allow-env-credentials", false),
    });
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
    }
    return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "image" && command === "import") {
    const filePath = flags.file || flags.path;
    if (!filePath) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const { media } = await getImageGenerationFacade();
    const record = media.import({
      filePath,
      prompt: flags.prompt,
      ...buildImageCommonInput(flags),
      provider: flags.provider,
      requestId: flags["request-id"],
      parentId: flags["parent-id"],
      sourceImageIds: parseCsvFlag(flags["source-image-ids"]),
      provenance: (flags.provenance as "generated-by-system" | "imported-codex" | "imported-chatgpt" | "imported-manual" | "command-backend" | "custom" | undefined) ?? "imported-manual",
      externalGenerator: flags["external-generator"],
      backendId: flags.backend,
      backendLabel: flags["backend-label"],
    });
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "image" && command === "show") {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const { media } = await getImageGenerationFacade();
    const record = media.get(id);
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record?.output?.filePath ?? "missing"}\n`);
    }
    return record ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (mediaGroup && command === "generate") {
    const prompt = flags.prompt;
    if (!prompt) {
      context.stderr.write("--prompt is required\n");
      return CLI_EXIT_USAGE;
    }
    if (mediaGroup === "image") {
      const { media } = await getImageGenerationFacade();
      const record = await media.generate({
        prompt,
        ...buildImageCommonInput(flags),
        backendId: flags.backend,
        command: flags.command,
        args: parseJsonFlag<string[]>(flags["args-json"], "--args-json"),
        cwd: flags.cwd,
        env: parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json"),
        outputExtension: flags.ext,
        mimeType: flags["mime-type"],
        allowEnvCredentials: readBooleanFlag(argv, flags, "allow-env-credentials", false),
      });
      if (wantsJson) {
        writeJson(context.stdout, record);
      } else {
        context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
      }
      return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
    }
    const metadata = buildMediaMetadata(
      mediaGroup,
      flags,
      parseJsonFlag<Record<string, unknown>>(flags["metadata-json"], "--metadata-json"),
    );
    const { media } = await getTypedGenerationFacade(mediaGroup);
    const record = await media.generate({
      prompt,
      title: flags.title,
      backendId: flags.backend,
      model: flags.model,
      metadata,
      command: flags.command,
      args: parseJsonFlag<string[]>(flags["args-json"], "--args-json"),
      cwd: flags.cwd,
      env: parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json"),
      outputExtension: flags.ext,
      mimeType: flags["mime-type"],
    });
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
    }
    return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (mediaGroup && command === "list") {
    if (mediaGroup === "image") {
      const { media } = await getImageGenerationFacade();
      const records = media.list({
        ...(flags.backend ? { backendId: flags.backend } : {}),
        ...(flags.status ? { status: flags.status as "succeeded" | "failed" } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        ...(flags.query ? { query: flags.query } : {}),
        ...(parseImageType(flags.type) ? { imageType: parseImageType(flags.type) } : {}),
        ...(flags.project ? { project: flags.project } : {}),
        ...(flags.provider ? { provider: flags.provider } : {}),
        ...(flags.model ? { model: flags.model } : {}),
        ...(parseImageProvenance(flags.provenance) ? { provenance: parseImageProvenance(flags.provenance) } : {}),
        ...(flags.tag ? { tag: flags.tag } : {}),
        ...(parseImageOperation(flags.operation) ? { operation: parseImageOperation(flags.operation) } : {}),
      });
      if (wantsJson) {
        writeJson(context.stdout, records);
      } else {
        context.stdout.write(`${records.map((record: { id: string; status: string; title: string }) => `${record.id} ${record.status} ${record.title}`).join("\n")}\n`);
      }
      return records.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    const { media } = await getTypedGenerationFacade(mediaGroup);
    const records = media.list({
      ...(flags.backend ? { backendId: flags.backend } : {}),
      ...(flags.status ? { status: flags.status as "succeeded" | "failed" } : {}),
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, records);
    } else {
      context.stdout.write(`${records.map((record: { id: string; status: string; title: string }) => `${record.id} ${record.status} ${record.title}`).join("\n")}\n`);
    }
    return records.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (mediaGroup && command === "read") {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const { media } = await getTypedGenerationFacade(mediaGroup);
    const record = media.get(id);
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record?.output?.filePath ?? "missing"}\n`);
    }
    return record ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (mediaGroup && command === "delete") {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const { media } = await getTypedGenerationFacade(mediaGroup);
    const removed = media.remove(id);
    if (wantsJson) {
      writeJson(context.stdout, { removed, id });
    } else {
      context.stdout.write(`${removed}\n`);
    }
    return removed ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "generations" && command === "register-command") {
    const id = flags.id;
    const commandValue = flags.command;
    if (!id || !commandValue) {
      context.stderr.write("--id and --command are required\n");
      return CLI_EXIT_USAGE;
    }
    const kinds = parseCsvFlag(flags.kinds);
    if (kinds.length === 0) {
      context.stderr.write("--kinds is required\n");
      return CLI_EXIT_USAGE;
    }
    const args = parseJsonFlag<string[]>(flags["args-json"], "--args-json") ?? [];
    const env = parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json");
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const backend = claw.generations.registerCommandBackend({
      id,
      label: flags.label || id,
      supportedKinds: kinds as Array<"image" | "video" | "audio" | "document">,
      command: commandValue,
      args,
      cwd: flags.cwd,
      env,
      outputExtension: flags.ext,
      mimeType: flags["mime-type"],
    });
    if (wantsJson) {
      writeJson(context.stdout, backend);
    } else {
      context.stdout.write(`${backend.id}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "generations" && command === "remove-backend") {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const removed = claw.generations.removeBackend(id);
    if (wantsJson) {
      writeJson(context.stdout, { removed, id });
    } else {
      context.stdout.write(`${removed}\n`);
    }
    return removed ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "generations" && command === "create") {
    const kind = (flags.kind as "image" | "video" | "audio" | "document" | undefined) ?? "image";
    const prompt = flags.prompt;
    if (!prompt) {
      context.stderr.write("--prompt is required\n");
      return CLI_EXIT_USAGE;
    }
    const args = parseJsonFlag<string[]>(flags["args-json"], "--args-json");
    const env = parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json");
    const metadata = parseJsonFlag<Record<string, unknown>>(flags["metadata-json"], "--metadata-json");
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const record = await claw.generations.create({
      kind,
      prompt,
      title: flags.title,
      backendId: flags.backend,
      model: flags.model,
      metadata,
      command: flags.command,
      args,
      cwd: flags.cwd,
      env,
      outputExtension: flags.ext,
      mimeType: flags["mime-type"],
    });
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
    }
    return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "generations" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const records = claw.generations.list({
      ...(flags.kind ? { kind: flags.kind as "image" | "video" | "audio" | "document" } : {}),
      ...(flags.backend ? { backendId: flags.backend } : {}),
      ...(flags.status ? { status: flags.status as "succeeded" | "failed" } : {}),
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, records);
    } else {
      context.stdout.write(`${records.map((record) => `${record.id} ${record.kind} ${record.status} ${record.title}`).join("\n")}\n`);
    }
    return records.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "generations" && command === "read") {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const record = claw.generations.get(id);
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record?.output?.filePath ?? "missing"}\n`);
    }
    return record ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "generations" && command === "delete") {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const removed = claw.generations.remove(id);
    if (wantsJson) {
      writeJson(context.stdout, { removed, id });
    } else {
      context.stdout.write(`${removed}\n`);
    }
    return removed ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

    context.stderr.write(`${usage}\n`);
    return CLI_EXIT_USAGE;
  }

export async function runCli(argv: string[], context: CliContext): Promise<number> {
  const wantsJson = argv.includes("--json");
  try {
    return await runCliUnsafe(argv, context);
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) {
      writeCliError(context.stdout, handled);
    } else {
      context.stderr.write(`${handled.message}\n`);
    }
    return handled.exitCode;
  }
}
