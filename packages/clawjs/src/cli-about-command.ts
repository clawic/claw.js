import type { CliContext } from "./index.ts";
import { CLI_EXIT_OK } from "./cli-errors.ts";
import { writeCommandJsonOk } from "./cli-json.ts";

export interface RunCliAboutCommandInput {
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}

interface CapabilityGroup {
  id: string;
  label: string;
  oneLiner: string;
  commands: string[];
}

const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    id: "capture",
    label: "Capture",
    oneLiner: "Quick capture and triage of incoming items, notes and decisions.",
    commands: ["inbox", "notes", "decisions"],
  },
  {
    id: "work",
    label: "Manage work",
    oneLiner: "Tasks, projects, goals, blockers and stewardship.",
    commands: ["tasks", "projects", "goals", "blockers", "assignments", "handoffs", "approvals"],
  },
  {
    id: "time",
    label: "Plan time",
    oneLiner: "Calendar, reminders, deadlines, routines and agenda.",
    commands: ["agenda", "calendar", "reminders", "deadlines", "routines", "schedule"],
  },
  {
    id: "memory",
    label: "Remember",
    oneLiner: "Knowledge, learnings, outcomes and reusable context for agents.",
    commands: ["knowledge", "learning", "outcomes", "context", "library"],
  },
  {
    id: "discovery",
    label: "Find your way",
    oneLiner: "When you do not know what to type.",
    commands: ["router", "about", "search", "inspect"],
  },
  {
    id: "database",
    label: "Database (fallback)",
    oneLiner: "Generic CRUD for collections without a dedicated command, or schema/migration work.",
    commands: ["db", "collections"],
  },
  {
    id: "host",
    label: "Mac and host control",
    oneLiner: "Permissions, app and window control, system telemetry.",
    commands: ["mac", "permissions", "system", "host"],
  },
  {
    id: "scaffolding",
    label: "Starting a project",
    oneLiner: "Bootstrap a new Claw app, agent, server or workspace.",
    commands: ["new", "generate", "add", "setup", "modules"],
  },
];

export async function runCliAboutCommand(input: RunCliAboutCommandInput): Promise<number> {
  if (input.wantsJson) {
    writeCommandJsonOk(
      input.context.stdout,
      "about",
      {
        headline: "Claw is the operational memory CLI for AI agents.",
        purpose: "It owns the storage, search and tools that agents use to capture, recall, plan and reason. Most agent work goes through dedicated commands, not the generic database.",
        entryCommands: [
          { command: "about", purpose: "30-second explanation of what Claw is for." },
          { command: "router", purpose: "Map free-form intent to the right dedicated command." },
          { command: "inspect", purpose: "Registry view of commands, schemas, surfaces and routes." },
        ],
        capabilityGroups: CAPABILITY_GROUPS,
        agentTips: [
          "If you do not know which command to use, run: " + input.binName + " router <one or more keywords>.",
          "Prefer the dedicated command (claw tasks, claw notes, claw decisions, ...) over the generic claw db. The dedicated command applies the right schema, indexing and broker behavior.",
          "Pass --json to any command for a parseable envelope.",
        ],
      },
      {
        schemaVersion: 1,
        canonicalCommand: "about",
      },
    );
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${renderHumanAbout(input.binName)}\n`);
  return CLI_EXIT_OK;
}

function renderHumanAbout(binName: string): string {
  const lines: string[] = [];
  lines.push("Claw is the operational memory CLI for AI agents.");
  lines.push("");
  lines.push("It owns the storage, search and tools that agents use to capture,");
  lines.push("recall, plan and reason. Most agent work flows through dedicated");
  lines.push("commands, not the generic database.");
  lines.push("");
  lines.push("What it gives you:");
  for (const group of CAPABILITY_GROUPS) {
    lines.push(`  ${group.label.padEnd(22)} ${group.commands.map((command) => `${binName} ${command}`).join(", ")}`);
    lines.push(`  ${" ".repeat(22)} ${group.oneLiner}`);
  }
  lines.push("");
  lines.push("If you do not know which command to use, run:");
  lines.push(`  ${binName} router <one or more keywords about your intent>`);
  lines.push("");
  lines.push("Other entry points:");
  lines.push(`  ${binName} inspect commands --json     full programmatic registry`);
  lines.push(`  ${binName} search query <text> --json  content/data search`);
  lines.push(`  ${binName} --help --all                 full public surface`);
  lines.push("");
  lines.push("Prefer the dedicated command over the generic database:");
  lines.push(`  ${binName} tasks ...     not  ${binName} db tasks ...`);
  lines.push(`  ${binName} notes ...     not  ${binName} db pages ...`);
  lines.push(`  ${binName} decisions ... not  ${binName} db decisions ...`);
  return lines.join("\n");
}
