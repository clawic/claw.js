type CliSurfaceKind = "canonical" | "portal" | "alias";

export const DEFAULT_CLI_BIN = "claw";

interface CliSurfaceEntry {
  name: string;
  kind: CliSurfaceKind;
  summary: string;
  usage?: string;
  advanced?: boolean;
  target?: string;
}

const PUBLIC_CLI_SURFACE: CliSurfaceEntry[] = [
  { name: "host", kind: "canonical", summary: "Host registry, status, services, capabilities, permissions, logs, doctor, daemon lifecycle and domains.", usage: "host list|register|use|status|doctor|domains" },
  { name: "system", kind: "alias", target: "host", summary: "System capabilities alias.", usage: "system capabilities list|grant|revoke" },
  { name: "database", kind: "canonical", summary: "Local database admin surface.", usage: "database serve|login|namespace|collection|record|token|file" },
  { name: "inspect", kind: "canonical", summary: "Read-only persistent surface inspection.", usage: "inspect tree|list|show|database|storage|prefs|render" },
  { name: "db", kind: "alias", target: "database", summary: "Exact alias for local-first database CRUD.", usage: "db <collection> list|get|create|update|delete|schema" },
  { name: "collections", kind: "alias", target: "database", summary: "Database collections shortcut.", usage: "collections <collection> list|get|schema" },
  { name: "records", kind: "alias", target: "database", summary: "Database records shortcut.", usage: "records <collection> list|get|create|update|delete" },
  { name: "work", kind: "canonical", summary: "Work umbrella: tasks, notes, projects, goals, inbox, decisions, assignments, handoffs, approvals and snapshots.", usage: "work agenda|review|export|import|backup" },
  { name: "projects", kind: "canonical", summary: "Unified Claw projects." },
  { name: "tasks", kind: "canonical", summary: "Task records and local-first work items." },
  { name: "notes", kind: "canonical", summary: "Notes and pages." },
  { name: "people", kind: "canonical", summary: "People records." },
  { name: "goals", kind: "canonical", summary: "Goal records." },
  { name: "inbox", kind: "canonical", summary: "Inbox and triage." },
  { name: "approvals", kind: "canonical", summary: "Work approvals." },
  { name: "blockers", kind: "canonical", summary: "Blockers." },
  { name: "decisions", kind: "canonical", summary: "Recorded work decisions." },
  { name: "assignments", kind: "canonical", summary: "Assignments." },
  { name: "handoffs", kind: "canonical", summary: "Handoffs." },
  { name: "artifacts", kind: "canonical", summary: "Work artifacts." },
  { name: "commitments", kind: "canonical", summary: "Promises and follow-ups." },
  { name: "sessions", kind: "canonical", summary: "Agent sessions." },
  { name: "skills", kind: "canonical", summary: "Skill catalog and assignment." },
  { name: "models", kind: "canonical", summary: "Model list/defaults." },
  { name: "providers", kind: "canonical", summary: "Provider catalog and auth state." },
  { name: "auth", kind: "canonical", summary: "Authentication status and login." },
  { name: "time", kind: "canonical", summary: "Time umbrella for calendar, reminders, deadlines, routines, schedule, watch, agenda, timeline and review." },
  { name: "calendar", kind: "canonical", summary: "Calendar items." },
  { name: "reminders", kind: "canonical", summary: "Reminders." },
  { name: "deadlines", kind: "canonical", summary: "Deadlines." },
  { name: "routines", kind: "canonical", summary: "Recurring routines." },
  { name: "schedule", kind: "canonical", summary: "Natural scheduling verb." },
  { name: "watch", kind: "canonical", summary: "Watch rules." },
  { name: "agenda", kind: "canonical", summary: "Agenda view." },
  { name: "timeline", kind: "canonical", summary: "Timeline view." },
  { name: "review", kind: "canonical", summary: "Daily/weekly review." },
  { name: "channels", kind: "canonical", summary: "Communication channels." },
  { name: "telegram", kind: "canonical", summary: "Telegram channel shortcut." },
  { name: "notify", kind: "canonical", summary: "Send and cancel notifications." },
  { name: "messages", kind: "canonical", summary: "Messages resource." },
  { name: "integrations", kind: "canonical", summary: "External integrations." },
  { name: "media", kind: "canonical", summary: "Media umbrella." },
  { name: "documents", kind: "canonical", summary: "Documents." },
  { name: "files", kind: "canonical", summary: "Workspace files." },
  { name: "images", kind: "canonical", summary: "Image generation and media.", target: "image" },
  { name: "audio", kind: "canonical", summary: "Audio media." },
  { name: "video", kind: "canonical", summary: "Video media." },
  { name: "slides", kind: "canonical", summary: "Slide decks." },
  { name: "generations", kind: "canonical", summary: "Generated media records." },
  { name: "templates", kind: "canonical", summary: "Template resources.", target: "template" },
  { name: "styles", kind: "canonical", summary: "Style resources.", target: "style" },
  { name: "references", kind: "canonical", summary: "Reference resources.", target: "ref" },
  { name: "drive", kind: "portal", summary: "Portal to files, documents, media and integrations." },
  { name: "design", kind: "portal", summary: "Portal to styles, templates, references, slides and images." },
  { name: "apps", kind: "portal", summary: "Portal/catalog of Claw apps and openable surfaces." },
  { name: "content", kind: "canonical", summary: "Editorial, publishing and CMS surface." },
  { name: "posts", kind: "portal", target: "content", summary: "Content posts shortcut." },
  { name: "campaigns", kind: "portal", target: "content", summary: "Content campaigns shortcut." },
  { name: "publications", kind: "portal", target: "content", summary: "Content publications shortcut." },
  { name: "knowledge", kind: "portal", target: "memory", summary: "Knowledge portal backed by memory." },
  { name: "profile", kind: "portal", target: "user", summary: "Profile portal backed by user." },
  { name: "user", kind: "canonical", summary: "User model." },
  { name: "health", kind: "portal", target: "user", summary: "User health domain." },
  { name: "travel", kind: "portal", target: "user", summary: "User travel domain." },
  { name: "career", kind: "portal", target: "user", summary: "User career domain." },
  { name: "family", kind: "portal", target: "user", summary: "User family domain." },
  { name: "legal", kind: "portal", target: "user", summary: "User legal domain." },
  { name: "finance", kind: "portal", target: "user", summary: "User finance domain." },
  { name: "location", kind: "portal", target: "user", summary: "User location domain." },
  { name: "accounts", kind: "portal", target: "user", summary: "User accounts domain." },
  { name: "business", kind: "portal", summary: "Business portal." },
  { name: "social", kind: "portal", target: "content/channels", summary: "Social portal." },
  { name: "search", kind: "canonical", summary: "Modern workspace search." },
  { name: "runtime", kind: "canonical", summary: "Runtime adapters and setup." },
  { name: "monitor", kind: "canonical", summary: "Continuous health, uptime and incident monitoring.", advanced: true },
  { name: "logs", kind: "portal", summary: "Global logs portal." },
  { name: "doctor", kind: "canonical", summary: "Diagnostics and repair checks." },
  { name: "diagnostics", kind: "portal", target: "doctor", summary: "Diagnostics portal." },
  { name: "mcp", kind: "canonical", summary: "MCP server catalog.", advanced: true },
  { name: "open", kind: "canonical", summary: "Open local dashboards and surfaces." },
  { name: "context", kind: "canonical", summary: "Context packs.", advanced: true },
  { name: "learning", kind: "canonical", summary: "Learning capture and promotion.", advanced: true },
  { name: "judgment", kind: "canonical", summary: "Reasoned evaluations distinct from work decisions.", advanced: true },
  { name: "outcomes", kind: "canonical", summary: "Outcome tracking.", advanced: true },
  { name: "plan", kind: "canonical", summary: "Semantic planning gate.", advanced: true },
  { name: "code", kind: "canonical", summary: "Engineering agent workflow.", advanced: true },
  { name: "rules", kind: "canonical", summary: "Persistent agent rules.", advanced: true },
  { name: "library", kind: "canonical", summary: "Reusable local skills, instructions and bundles.", advanced: true },
  { name: "soul", kind: "canonical", summary: "Agent identity, posture and persona.", advanced: true },
  { name: "erp", kind: "canonical", summary: "ERP service.", advanced: true },
  { name: "iot", kind: "canonical", summary: "IoT service.", advanced: true },
  { name: "tts", kind: "canonical", summary: "Text-to-speech.", advanced: true },
  { name: "stt", kind: "canonical", summary: "Speech-to-text.", advanced: true },
  { name: "voice-notes", kind: "canonical", summary: "Voice notes.", advanced: true },
  { name: "inference", kind: "canonical", summary: "Generic model inference.", advanced: true },
  { name: "preview", kind: "canonical", summary: "Preview sharing.", usage: "preview share --url http://127.0.0.1:PORT", advanced: true },
  { name: "browser", kind: "canonical", summary: "Relay-backed browser sessions.", usage: "browser status|ensure|share", advanced: true },
  { name: "compat", kind: "canonical", summary: "Advanced compatibility checks.", advanced: true },
];

const PUBLIC_CLI_SURFACE_BY_NAME = new Map(PUBLIC_CLI_SURFACE.map((entry) => [entry.name, entry]));

function surfaceRows(entries: CliSurfaceEntry[]): string[] {
  return entries.map((entry) => {
    const target = entry.target ? ` -> ${entry.target}` : "";
    return `  ${entry.name.padEnd(14)} ${entry.kind.padEnd(9)} ${entry.summary}${target}`;
  });
}

export function buildCliUsage(binName = DEFAULT_CLI_BIN, options: { all?: boolean } = {}): string {
  const primary = PUBLIC_CLI_SURFACE.filter((entry) => !entry.advanced);
  const advanced = PUBLIC_CLI_SURFACE.filter((entry) => entry.advanced);
  return [
    `Usage: ${binName} <command> [options]`,
    "",
    "Primary commands and portals:",
    ...surfaceRows(primary),
    "",
    "Project scaffolding:",
    `  ${binName} new app|agent|server|workspace|skill|plugin <name> [--dir PATH] [--template NAME] [--package-manager npm|pnpm] [--git] [--install] [--yes]`,
    `  ${binName} generate skill|plugin|provider|channel|command <name> [--project PATH]`,
    `  ${binName} add provider|channel|telegram|scheduler|memory|workspace [name] [--project PATH]`,
    ...(options.all ? ["", "Advanced commands:", ...surfaceRows(advanced)] : ["", `Run \`${binName} --help --all\` for advanced commands.`]),
    "",
    "Global options:",
    "  --runtime demo|openclaw|codex|zeroclaw|picoclaw|nanobot|nanoclaw|nullclaw|ironclaw|nemoclaw|hermes",
    "  --workspace PATH",
    "  --json",
    "  --dry-run",
  ].join("\n");
}

export const CLI_USAGE = buildCliUsage();

const REMOVED_PUBLIC_COMMANDS = new Map<string, string>([
  ["data", "Use `claw database ...` for technical database operations or `claw work export|import|backup ...` for productivity snapshots."],
  ["app-state", "App state is internal. Use `claw host ...`, `claw doctor`, or diagnostics surfaces instead."],
  ["life", "Use real user-domain portals such as `health`, `travel`, `career`, `family`, `legal`, `finance`, `location`, or `accounts`."],
  ["ops", "Use `claw logs`, `claw doctor`, `claw monitor`, or `claw host ...`."],
  ["infra", "`infra` is not a public Claw namespace. Use `claw host`, `claw monitor`, or `claw logs`."],
  ["workspace-search", "Use `claw search query ...`."],
  ["workspace-index", "Use `claw search rebuild`."],
  ["export", "Use `claw work export ...`."],
  ["import", "Use `claw work import ...`."],
  ["backup", "Use `claw work backup ...` or `claw database ...` for technical database backups."],
]);

export const REMOVED_RUNTIME_COMMANDS = new Set(["queue", "job", "event", "retention"]);
export const REMOVED_V1_CRUD_COMMANDS = new Set(["upsert", "list", "get", "delete"]);

const PLURAL_MEDIA_COMMAND_ALIASES = new Map<string, string>([
  ["images", "image"],
  ["styles", "style"],
  ["templates", "template"],
  ["references", "ref"],
]);

const SINGULAR_MEDIA_COMMAND_ALIASES = new Map<string, string>([
  ["image", "images"],
  ["style", "styles"],
  ["template", "templates"],
  ["ref", "references"],
]);

export const PUBLIC_PORTAL_HELP_ONLY = new Set([
  "drive",
  "design",
  "apps",
  "business",
  "social",
  "monitor",
  "logs",
  "diagnostics",
  "health",
  "travel",
  "career",
  "family",
  "legal",
  "finance",
  "location",
  "accounts",
]);

function cliSurfaceEntry(name: string | undefined): CliSurfaceEntry | undefined {
  return name ? PUBLIC_CLI_SURFACE_BY_NAME.get(name) : undefined;
}

export function buildCommandHelp(binName: string, group: string): string | null {
  const entry = cliSurfaceEntry(group) ?? cliSurfaceEntry(SINGULAR_MEDIA_COMMAND_ALIASES.get(group));
  if (!entry) return null;
  return [
    `Usage: ${binName} ${entry.usage ?? `${group} [command] [options]`}`,
    "",
    `${entry.kind}: ${entry.summary}`,
    ...(entry.target ? [`Routes to: ${entry.target}`] : []),
    "",
    `Run \`${binName} --help --all\` to see the full public surface.`,
  ].join("\n");
}

export function removedPublicCommandMessage(group: string, binName: string): string | null {
  const message = REMOVED_PUBLIC_COMMANDS.get(group);
  if (!message) return null;
  return `\`${binName} ${group}\` is not part of the public Claw CLI surface. ${message}`;
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

export function normalizePublicCliArgv(argv: string[], stderr: NodeJS.WritableStream, binName: string): string[] {
  const positionals = extractPositionals(argv);
  const group = positionals[0];
  const pluralTarget = group ? PLURAL_MEDIA_COMMAND_ALIASES.get(group) : undefined;
  if (pluralTarget && (argv.includes("--help") || argv.includes("-h"))) {
    return argv;
  }
  if (group && pluralTarget) {
    let replaced = false;
    return argv.map((token) => {
      if (!replaced && token === group) {
        replaced = true;
        return pluralTarget;
      }
      return token;
    });
  }
  const canonical = group ? SINGULAR_MEDIA_COMMAND_ALIASES.get(group) : undefined;
  if (canonical && !argv.includes("--json")) {
    stderr.write(`Alias: \`${binName} ${group}\` maps to canonical \`${binName} ${canonical}\`.\n`);
  }
  return argv;
}
