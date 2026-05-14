import { CORE_PRODUCTIVITY_DB_COLLECTIONS, LOCAL_FIRST_PRODUCTIVITY_GROUPS } from "./cli-constants.ts";
import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { joinedPositionals, parseCsvFlag } from "./cli-flag-parsers.ts";
import { parseLooseCliValue, parseObjectFlag, parseSetFlags } from "./cli-value-utils.ts";

export function coreProductivityCollection(rawCollection: string | undefined): string | null {
  if (!rawCollection) return null;
  return CORE_PRODUCTIVITY_DB_COLLECTIONS[rawCollection.trim().toLowerCase()] ?? null;
}

export function singularCoreCollection(collectionName: string): string {
  if (collectionName === "people") return "person";
  if (collectionName.endsWith("s")) return collectionName.slice(0, -1);
  return collectionName;
}

export function pickCoreTitle(collectionName: string, payload: Record<string, unknown>, fallback?: string): string | undefined {
  const primary = collectionName === "people" ? "displayName" : ["projects", "cycles", "saved_views", "custom_fields", "templates"].includes(collectionName) ? "name" : collectionName === "field_values" ? "fieldId" : collectionName === "comments" ? "body" : "title";
  const value = payload[primary] ?? payload.title ?? payload.name ?? payload.displayName ?? fallback;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
  "after-ms",
  "if-no",
  "then",
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

export function assertAllowedLocalFlags(group: string | undefined, argv: string[]): void {
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

export function mergeCoreDbInput(
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
