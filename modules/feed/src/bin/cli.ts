import { buildFeedApp } from "../server/app.ts";
import { FeedApiClient } from "../cli/client.ts";

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq > 2) {
      flags[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[token.slice(2)] = "true";
      continue;
    }
    flags[token.slice(2)] = next;
    index += 1;
  }
  return flags;
}

function positionals(argv: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      values.push(token);
      continue;
    }
    if (token.includes("=")) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) index += 1;
  }
  return values;
}

function parseCsvFlag(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function write(payload: unknown, wantsJson: boolean): void {
  if (wantsJson) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)}\n`);
}

function detectSourceType(url: string): string {
  if (/youtube\.com\/(channel|c\/|@)/.test(url)) return "youtube_channel";
  if (/reddit\.com\/r\//.test(url)) return "reddit_subreddit";
  if (/github\.com\//.test(url)) return "github_repo";
  if (/twitter\.com\/|x\.com\//.test(url)) return "twitter_list";
  if (/\/(rss|feed|atom\.xml)/.test(url)) return "rss";
  return "rss";
}

const argv = process.argv.slice(2);
const flags = parseFlags(argv);
const wantsJson = argv.includes("--json");
const [group, command, subcommand] = positionals(argv);

if (argv.includes("--help") || argv.includes("-h") || !group) {
  process.stdout.write([
    "Usage: feed <command> [options]",
    "",
    "Commands:",
    "  feed serve [--host HOST] [--port PORT] [--data-dir DIR]",
    "  feed login --url URL --email EMAIL --password PASSWORD",
    "",
    "  feed source list [--type TYPE] [--enabled]",
    "  feed source create --name NAME --type TYPE --url URL [--poll-interval 60]",
    "  feed source get <id-or-slug>",
    "  feed source update <id-or-slug> [--name] [--enabled true|false] [--poll-interval N]",
    "  feed source delete <id-or-slug>",
    "  feed source poll <id-or-slug>",
    "",
    "  feed item list [--status unread] [--type tweet] [--source SRC] [--tag TAG] [--importance high] [--limit 50]",
    "  feed item get <id>",
    "  feed item save --url URL [--type bookmark] [--title TITLE] [--tags a,b] [--reason \"...\"]",
    "  feed item update <id> [--status read] [--importance high] [--tags a,b]",
    "  feed item read <id>",
    "  feed item star <id>",
    "  feed item archive <id>",
    "  feed item delete <id>",
    "",
    "  feed annotate <item-id> --type summary --body \"...\"",
    "  feed annotation list <item-id>",
    "  feed annotation delete <id>",
    "",
    "  feed collection list",
    "  feed collection create --name NAME [--description DESC] [--icon ICON]",
    "  feed collection get <id-or-slug>",
    "  feed collection update <id-or-slug> [--name NAME]",
    "  feed collection delete <id-or-slug>",
    "  feed collection add <slug> --items id1,id2",
    "  feed collection remove <slug> --item ID",
    "",
    "  feed search --query QUERY [--type TYPE] [--status STATUS] [--limit 20]",
    "  feed stats [--json]",
    "  feed poll-all",
    "  feed subscribe <url>",
    "",
    "  feed token list|create|revoke",
  ].join("\n") + "\n");
  process.exit(0);
}

async function main() {
  if (group === "serve") {
    const { app } = buildFeedApp({
      config: {
        ...(flags.host ? { host: flags.host } : {}),
        ...(flags.port ? { port: Number(flags.port) } : {}),
        ...(flags["data-dir"] ? { dataDir: flags["data-dir"] } : {}),
        ...(flags["db-path"] ? { dbPath: flags["db-path"] } : {}),
        ...(flags.secret ? { jwtSecret: flags.secret } : {}),
      },
    });
    const address = await app.listen({
      host: flags.host ?? "127.0.0.1",
      port: flags.port ? Number(flags.port) : 4530,
    });
    process.stdout.write(`${address}\n`);
    return;
  }

  const baseUrl = flags.url ?? "http://127.0.0.1:4530";
  const client = new FeedApiClient({ baseUrl, token: flags.token });

  if (group === "login") {
    write(await client.login(flags.email ?? "", flags.password ?? ""), wantsJson);
    return;
  }

  // ── Sources ─────────────────────────────────────────────────────────

  if (group === "source" && command === "list") {
    write(await client.listSources({
      type: flags.type,
      enabled: flags.enabled,
    }), wantsJson);
    return;
  }

  if (group === "source" && command === "create") {
    write(await client.createSource({
      name: flags.name ?? "",
      sourceType: flags.type ?? "rss",
      url: flags.url,
      pollIntervalMinutes: flags["poll-interval"] ? Number(flags["poll-interval"]) : undefined,
      tags: flags.tags ? parseCsvFlag(flags.tags) : undefined,
    }), wantsJson);
    return;
  }

  if (group === "source" && command === "get") {
    write(await client.getSource(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "source" && command === "update") {
    const updates: Record<string, unknown> = {};
    if (flags.name) updates.name = flags.name;
    if (flags.enabled) updates.enabled = flags.enabled === "true";
    if (flags["poll-interval"]) updates.pollIntervalMinutes = Number(flags["poll-interval"]);
    if (flags.tags) updates.tags = parseCsvFlag(flags.tags);
    if (flags.url) updates.url = flags.url;
    write(await client.updateSource(flags.id ?? subcommand ?? "", updates), wantsJson);
    return;
  }

  if (group === "source" && command === "delete") {
    write(await client.deleteSource(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "source" && command === "poll") {
    write(await client.pollSource(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  // ── Items ──────────────────────────────────────────────────────────

  if (group === "item" && command === "list") {
    const opts: Record<string, string> = {};
    if (flags.status) opts.status = flags.status;
    if (flags.type) opts.type = flags.type;
    if (flags.source) opts.source = flags.source;
    if (flags.tag) opts.tag = flags.tag;
    if (flags.importance) opts.importance = flags.importance;
    if (flags.limit) opts.limit = flags.limit;
    if (flags.sort) opts.sort = flags.sort;
    write(await client.listItems(opts), wantsJson);
    return;
  }

  if (group === "item" && command === "get") {
    write(await client.getItem(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "item" && command === "save") {
    write(await client.createItem({
      url: flags.url ?? "",
      itemType: flags.type ?? "bookmark",
      title: flags.title,
      tags: flags.tags ? parseCsvFlag(flags.tags) : undefined,
      saveReason: flags.reason,
    }), wantsJson);
    return;
  }

  if (group === "item" && command === "update") {
    const updates: Record<string, unknown> = {};
    if (flags.status) updates.status = flags.status;
    if (flags.importance) updates.importance = flags.importance;
    if (flags.tags) updates.tags = parseCsvFlag(flags.tags);
    if (flags.title) updates.title = flags.title;
    write(await client.updateItem(flags.id ?? subcommand ?? "", updates), wantsJson);
    return;
  }

  if (group === "item" && command === "read") {
    write(await client.markRead(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "item" && command === "star") {
    write(await client.toggleStar(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "item" && command === "archive") {
    write(await client.archiveItem(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "item" && command === "delete") {
    write(await client.deleteItem(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  // ── Annotations ───────────────────────────────────────────────────

  if (group === "annotate") {
    const itemId = command ?? "";
    write(await client.createAnnotation(itemId, {
      annotationType: flags.type ?? "note",
      body: flags.body ?? "",
      data: flags.data ? JSON.parse(flags.data) : undefined,
      agentId: flags["agent-id"],
    }), wantsJson);
    return;
  }

  if (group === "annotation" && command === "list") {
    write(await client.listAnnotations(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "annotation" && command === "delete") {
    write(await client.deleteAnnotation(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  // ── Collections ───────────────────────────────────────────────────

  if (group === "collection" && command === "list") {
    write(await client.listCollections(), wantsJson);
    return;
  }

  if (group === "collection" && command === "create") {
    write(await client.createCollection({
      name: flags.name ?? "",
      description: flags.description,
      icon: flags.icon,
    }), wantsJson);
    return;
  }

  if (group === "collection" && command === "get") {
    write(await client.getCollection(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "collection" && command === "update") {
    const updates: Record<string, unknown> = {};
    if (flags.name) updates.name = flags.name;
    if (flags.description) updates.description = flags.description;
    if (flags.icon) updates.icon = flags.icon;
    write(await client.updateCollection(flags.id ?? subcommand ?? "", updates), wantsJson);
    return;
  }

  if (group === "collection" && command === "delete") {
    write(await client.deleteCollection(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "collection" && command === "add") {
    const collSlug = subcommand ?? "";
    const itemIds = parseCsvFlag(flags.items);
    write(await client.addItemsToCollection(collSlug, itemIds), wantsJson);
    return;
  }

  if (group === "collection" && command === "remove") {
    const collSlug = subcommand ?? "";
    write(await client.removeItemFromCollection(collSlug, flags.item ?? ""), wantsJson);
    return;
  }

  // ── Search ────────────────────────────────────────────────────────

  if (group === "search") {
    const opts: Record<string, string> = {};
    if (flags.type) opts.type = flags.type;
    if (flags.status) opts.status = flags.status;
    if (flags.limit) opts.limit = flags.limit;
    write(await client.search(flags.query ?? command ?? "", opts), wantsJson);
    return;
  }

  // ── Stats ─────────────────────────────────────────────────────────

  if (group === "stats") {
    write(await client.stats(), wantsJson);
    return;
  }

  // ── Poll all ──────────────────────────────────────────────────────

  if (group === "poll-all") {
    write(await client.pollAll(), wantsJson);
    return;
  }

  // ── Subscribe (shortcut) ──────────────────────────────────────────

  if (group === "subscribe") {
    const feedUrl = command ?? "";
    const sourceType = detectSourceType(feedUrl);
    const name = flags.name ?? feedUrl.replace(/^https?:\/\//, "").split("/").slice(0, 2).join("/");
    write(await client.createSource({
      name,
      sourceType,
      url: feedUrl,
      pollIntervalMinutes: flags["poll-interval"] ? Number(flags["poll-interval"]) : 60,
      tags: flags.tags ? parseCsvFlag(flags.tags) : undefined,
    }), wantsJson);
    return;
  }

  // ── Tokens ────────────────────────────────────────────────────────

  if (group === "token" && command === "list") {
    write(await client.listTokens(), wantsJson);
    return;
  }

  if (group === "token" && command === "create") {
    write(await client.createToken({
      label: flags.label ?? "token",
      operations: parseCsvFlag(flags.operations),
    }), wantsJson);
    return;
  }

  if (group === "token" && command === "revoke") {
    write(await client.revokeToken(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  process.stderr.write("Unknown command.\n");
  process.exit(64);
}

try {
  await main();
  process.exit(0);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
