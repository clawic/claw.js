import fs from "node:fs";

import { BadgerClient } from "./client.ts";
import { loadConfig } from "../server/config.ts";
import { startServer } from "../bin/server.ts";
import * as workspacesCmd from "./commands/workspaces.ts";
import * as channelsCmd from "./commands/channels.ts";
import * as postsCmd from "./commands/posts.ts";
import * as mediaCmd from "./commands/media.ts";
import * as queuesCmd from "./commands/queues.ts";
import * as webhooksCmd from "./commands/webhooks.ts";
import * as systemCmd from "./commands/system.ts";
import * as miscCmd from "./commands/misc.ts";

interface CliHost {
  stdout: { write: (s: string) => void };
  stderr: { write: (s: string) => void };
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  resolveCwd: (path: string) => string;
}

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string>;
  bools: Record<string, boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const bools: Record<string, boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const eq = token.indexOf("=");
    if (eq > 2) {
      flags[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const name = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      bools[name] = true;
      continue;
    }
    flags[name] = next;
    i += 1;
  }
  return { positional, flags, bools };
}

export function loadToken(flags: Record<string, string>): string | undefined {
  if (flags.token) return flags.token;
  if (process.env.BADGER_TOKEN) return process.env.BADGER_TOKEN;
  const tokenPath = flags["token-file"] ?? loadConfig().tokenStorePath;
  try {
    return fs.readFileSync(tokenPath, "utf8").trim();
  } catch {
    return undefined;
  }
}

function usage(): string {
  return `Usage: badger <group> <command> [options]

Auth + identity
  badger login [--url URL] [--token TOKEN]
  badger workspaces list|create|use [--name NAME] [--slug SLUG]
  badger token create|list|revoke [--name NAME] [--scope SCOPE]

Channels
  badger families list|capabilities <FAMILY>
  badger channels list|add|probe|remove|connect
       (add: --family <id> [--name NAME])
       (connect: --family <id> --identifier USER --password PASS  /  --instance-url URL --access-token TKN)

Posts
  badger posts create|get|list|update|delete|duplicate|schedule|schedule-now|unschedule|cancel|retry|approve
       (create: --file post.json   OR   --body "..." --account ca_...)
       (schedule: <id> --at ISO --tz TZ)
       (variants set: <id> --account ca_... --file variant.json)

Media
  badger media upload <PATH> [--alt "..."]
  badger media list [--mime image/*]
  badger media get <id>

Calendar / queues
  badger calendar month|week --date YYYY-MM
  badger queues list|create|pause|resume
  badger queues slots add --queue <id> --day mon --time 09:00
  badger queues attach --queue <id> --account <id>
  badger queues enqueue <post-id> --queue <id>
  badger blackouts add --from ISO --to ISO [--account <id>]

Recurrence, templates, evergreen, A/B
  badger recurrence create|list|cancel --rrule "FREQ=WEEKLY;..." [--template <id>]
  badger templates create|list|apply --file tmpl.json
  badger evergreen pool create|add
  badger ab create|add-arm

Campaigns, labels, UTM
  badger campaigns create|list|add-post
  badger labels create|list
  badger utm create|list

Inbox / approvals
  badger inbox list|show|reply --thread <id> --body "..."
  badger approvals workflows create --file wf.json
  badger approvals start --post <id> --workflow <id>

Analytics
  badger metrics accounts|posts|top
  badger reports create|run|list
  badger suggest-time --account <id> [--top 5]

Webhooks
  badger webhooks create --url URL --events post.published,post.failed
  badger webhooks list|deliveries|replay

System
  badger serve [--host HOST] [--port PORT]
  badger doctor
  badger logs tail
  badger db backup --out FILE | restore --in FILE
  badger import csv <path> | json <path> | rss <url>
  badger export json --workspace <id> --out FILE

Common flags
  --url      Base URL (default http://127.0.0.1:4640)
  --token    Bearer token (defaults to ~/.config/clawjs-badger/token)
  --workspace <id>  Workspace context for operations
  --json     Always emit JSON
`;
}

export async function runCli(argv: string[], host: CliHost): Promise<number> {
  const args = parseArgs(argv);
  if (args.bools.help || args.bools.h || (!args.positional.length && !args.bools.version)) {
    host.stdout.write(usage());
    return args.positional.length ? 0 : 0;
  }
  if (args.bools.version) {
    host.stdout.write("clawjs-badger 0.1.0\n");
    return 0;
  }

  const [group, command, sub] = args.positional;
  const baseUrl = (args.flags.url ?? process.env.BADGER_URL ?? "http://127.0.0.1:4640").replace(/\/$/, "");

  // Local serve
  if (group === "serve") {
    const built = await startServer({
      config: {
        ...(args.flags.host ? { host: args.flags.host } : {}),
        ...(args.flags.port ? { port: Number(args.flags.port) } : {}),
        ...(args.flags["data-dir"] ? { dataDir: args.flags["data-dir"] } : {}),
      },
    });
    host.stdout.write(`badger listening on http://${built.config.host}:${built.config.port}\n`);
    host.stdout.write(`admin token: ${built.services.auth.getEphemeralAdminToken()}\n`);
    return 0;
  }

  const client = new BadgerClient(baseUrl, loadToken(args.flags));
  const wantsJson = args.bools.json || !(host.stdout as { isTTY?: boolean }).isTTY;

  const ctx = { client, args, host, wantsJson };

  try {
    if (group === "login") return systemCmd.login(ctx);
    if (group === "doctor") return systemCmd.doctor(ctx);
    if (group === "logs") return systemCmd.logs(ctx);
    if (group === "db") return systemCmd.db(ctx);
    if (group === "import") return systemCmd.importCmd(ctx);
    if (group === "export") return systemCmd.exportCmd(ctx);
    if (group === "families") return channelsCmd.families(ctx);
    if (group === "channels") return channelsCmd.channels(ctx);
    if (group === "workspaces") return workspacesCmd.workspaces(ctx);
    if (group === "token") return workspacesCmd.token(ctx);
    if (group === "posts") return postsCmd.posts(ctx);
    if (group === "media") return mediaCmd.media(ctx);
    if (group === "calendar") return queuesCmd.calendar(ctx);
    if (group === "queues") return queuesCmd.queues(ctx);
    if (group === "blackouts") return queuesCmd.blackouts(ctx);
    if (group === "recurrence") return miscCmd.recurrence(ctx);
    if (group === "templates") return miscCmd.templates(ctx);
    if (group === "evergreen") return miscCmd.evergreen(ctx);
    if (group === "ab") return miscCmd.ab(ctx);
    if (group === "campaigns") return miscCmd.campaigns(ctx);
    if (group === "labels") return miscCmd.labels(ctx);
    if (group === "utm") return miscCmd.utm(ctx);
    if (group === "inbox") return miscCmd.inbox(ctx);
    if (group === "approvals") return miscCmd.approvals(ctx);
    if (group === "metrics") return miscCmd.metrics(ctx);
    if (group === "reports") return miscCmd.reports(ctx);
    if (group === "suggest-time") return miscCmd.suggestTime(ctx);
    if (group === "webhooks") return webhooksCmd.webhooks(ctx);
    host.stderr.write(`unknown command: ${group}\n`);
    return 64;
  } catch (err) {
    host.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

export interface CliContext {
  client: BadgerClient;
  args: ParsedArgs;
  host: CliHost;
  wantsJson: boolean;
}

export function out(ctx: CliContext, value: unknown): void {
  ctx.host.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function readFileFlag(ctx: CliContext, flagName: string): unknown {
  const filePath = ctx.args.flags[flagName];
  if (!filePath) return null;
  return JSON.parse(ctx.host.readFile(filePath));
}
