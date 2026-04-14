import fs from "node:fs";

import { buildWikiApp } from "../server/app.ts";
import { WikiApiClient } from "../cli/client.ts";

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

const argv = process.argv.slice(2);
const flags = parseFlags(argv);
const wantsJson = argv.includes("--json");
const [group, command, subcommand] = positionals(argv);

if (argv.includes("--help") || argv.includes("-h") || !group) {
  process.stdout.write([
    "Usage: wiki <command> [options]",
    "",
    "Commands:",
    "  wiki serve [--host HOST] [--port PORT] [--data-dir DIR]",
    "  wiki login --url URL --email EMAIL --password PASSWORD",
    "  wiki space list|create|delete",
    "  wiki page list|create|update|delete|get --space SPACE --slug SLUG",
    "  wiki comment add|list --space SPACE --slug SLUG",
    "  wiki search --query QUERY [--mode fts|graph|combined] [--space SPACE]",
    "  wiki link add|remove|list --source-slug SLUG --target-slug SLUG",
    "  wiki revision list|get --space SPACE --slug SLUG",
    "  wiki import --space SPACE --dir PATH",
    "  wiki export --space SPACE --dir PATH",
    "  wiki token list|create|revoke --space SPACE",
  ].join("\n") + "\n");
  process.exit(0);
}

async function main() {
  if (group === "serve") {
    const { app } = buildWikiApp({
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
      port: flags.port ? Number(flags.port) : 4520,
    });
    process.stdout.write(`${address}\n`);
    return;
  }

  const baseUrl = flags.url ?? "http://127.0.0.1:4520";
  const client = new WikiApiClient({ baseUrl, token: flags.token });

  if (group === "login") {
    write(await client.login(flags.email ?? "", flags.password ?? ""), wantsJson);
    return;
  }

  // ── Spaces ─────────────────────────────────────────────────────────

  if (group === "space" && command === "list") {
    write(await client.listSpaces(), wantsJson);
    return;
  }

  if (group === "space" && command === "create") {
    write(await client.createSpace({
      name: flags.name ?? subcommand ?? "",
      slug: flags.slug,
      description: flags.description,
    }), wantsJson);
    return;
  }

  if (group === "space" && command === "delete") {
    write(await client.deleteSpace(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  // ── Pages ──────────────────────────────────────────────────────────

  if (group === "page" && command === "list") {
    write(await client.listPages(flags.space ?? "", { status: flags.status, tag: flags.tag }), wantsJson);
    return;
  }

  if (group === "page" && command === "get") {
    write(await client.getPage(flags.space ?? "", flags.slug ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "page" && command === "create") {
    const body = flags["body-file"] ? fs.readFileSync(flags["body-file"], "utf-8") : flags.body ?? "";
    write(await client.createPage(flags.space ?? "", {
      title: flags.title ?? "",
      slug: flags.slug,
      body,
      parentPageId: flags["parent-id"],
      tags: flags.tags ? parseCsvFlag(flags.tags) : undefined,
      status: flags.status,
    }), wantsJson);
    return;
  }

  if (group === "page" && command === "update") {
    const updates: Record<string, unknown> = {};
    if (flags.title) updates.title = flags.title;
    if (flags["body-file"]) updates.body = fs.readFileSync(flags["body-file"], "utf-8");
    if (flags.body) updates.body = flags.body;
    if (flags.status) updates.status = flags.status;
    if (flags.tags) updates.tags = parseCsvFlag(flags.tags);
    if (flags["change-summary"]) updates.changeSummary = flags["change-summary"];
    write(await client.updatePage(flags.space ?? "", flags.slug ?? subcommand ?? "", updates), wantsJson);
    return;
  }

  if (group === "page" && command === "delete") {
    write(await client.deletePage(flags.space ?? "", flags.slug ?? subcommand ?? ""), wantsJson);
    return;
  }

  // ── Comments ───────────────────────────────────────────────────────

  if (group === "comment" && command === "list") {
    write(await client.listComments(flags.space ?? "", flags.slug ?? ""), wantsJson);
    return;
  }

  if (group === "comment" && command === "add") {
    write(await client.createComment(flags.space ?? "", flags.slug ?? "", {
      body: flags.body ?? "",
      parentCommentId: flags["parent-comment-id"],
      authorAgentId: flags["agent-id"],
      authorUserId: flags["user-id"],
    }), wantsJson);
    return;
  }

  // ── Search ─────────────────────────────────────────────────────────

  if (group === "search") {
    const mode = flags.mode ?? "combined";
    if (mode === "fts") {
      write(await client.searchFts(flags.query ?? command ?? "", flags.space), wantsJson);
    } else {
      write(await client.search({
        query: flags.query ?? command ?? "",
        spaceId: flags.space,
        modes: mode === "combined" ? ["fts", "graph"] : [mode],
      }), wantsJson);
    }
    return;
  }

  // ── Links ──────────────────────────────────────────────────────────

  if (group === "link" && command === "list") {
    write(await client.listLinks(flags.space ?? "", flags.slug ?? ""), wantsJson);
    return;
  }

  if (group === "link" && command === "add") {
    write(await client.createLink({
      sourcePageId: flags["source-id"] ?? "",
      targetPageId: flags["target-id"] ?? "",
      linkType: flags.type ?? "related",
      label: flags.label,
    }), wantsJson);
    return;
  }

  if (group === "link" && command === "remove") {
    write(await client.deleteLink(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  // ── Revisions ──────────────────────────────────────────────────────

  if (group === "revision" && command === "list") {
    write(await client.listRevisions(flags.space ?? "", flags.slug ?? ""), wantsJson);
    return;
  }

  if (group === "revision" && command === "get") {
    write(await client.getRevision(flags.space ?? "", flags.slug ?? "", Number(flags.number ?? subcommand ?? "1")), wantsJson);
    return;
  }

  // ── Import / Export ────────────────────────────────────────────────

  if (group === "import") {
    write(await client.importDir(flags.space ?? "", flags.dir ?? command ?? ""), wantsJson);
    return;
  }

  if (group === "export") {
    const result = await client.exportPages(flags.space ?? "") as { items?: Array<{ slug: string; body: string }> };
    const dir = flags.dir ?? command ?? ".";
    if (result.items) {
      fs.mkdirSync(dir, { recursive: true });
      for (const page of result.items) {
        fs.writeFileSync(`${dir}/${page.slug}.md`, page.body, "utf-8");
      }
      write(`Exported ${result.items.length} pages to ${dir}`, wantsJson);
    }
    return;
  }

  // ── Tokens ─────────────────────────────────────────────────────────

  if (group === "token" && command === "list") {
    write(await client.listTokens(flags.space ?? ""), wantsJson);
    return;
  }

  if (group === "token" && command === "create") {
    write(await client.createToken(flags.space ?? "", {
      label: flags.label ?? "token",
      operations: parseCsvFlag(flags.operations),
    }), wantsJson);
    return;
  }

  if (group === "token" && command === "revoke") {
    write(await client.revokeToken(flags.space ?? "", flags.id ?? subcommand ?? ""), wantsJson);
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
