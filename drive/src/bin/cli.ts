import fs from "node:fs";

import { buildDriveApp } from "../server/app.ts";
import { DriveApiClient } from "../sdk/client.ts";
import type { DriveNativeContent, DriveOperation } from "../shared/types.ts";

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

function parseCsv(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function parseJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
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
    "Usage: drive <command> [options]",
    "",
    "Commands:",
    "  drive serve [--host HOST] [--port PORT] [--data-dir DIR]",
    "  drive auth login --url URL --email EMAIL --password PASSWORD",
    "  drive folder create --name NAME [--parent ID]",
    "  drive doc|sheet|slide create --name NAME [--parent ID]",
    "  drive doc|sheet|slide save --id ITEM_ID --content-file PATH [--base-revision ID]",
    "  drive item list|read|move|copy|star|trash|restore|delete",
    "  drive upload --file PATH [--parent ID]",
    "  drive download --id ITEM_ID --out PATH",
    "  drive preview --id ITEM_ID",
    "  drive search --query QUERY",
    "  drive share create|revoke --id ITEM_ID",
    "  drive token list|create|revoke",
  ].join("\n") + "\n");
  process.exit(0);
}

async function main() {
  if (group === "serve") {
    const { app, config } = buildDriveApp({
      config: {
        ...(flags.host ? { host: flags.host } : {}),
        ...(flags.port ? { port: Number(flags.port) } : {}),
        ...(flags["data-dir"] ? { dataDir: flags["data-dir"] } : {}),
        ...(flags["db-path"] ? { dbPath: flags["db-path"] } : {}),
        ...(flags.secret ? { jwtSecret: flags.secret } : {}),
        ...(flags["converter-mode"] === "mock" ? { converterMode: "mock" } : {}),
      },
    });
    const address = await app.listen({
      host: config.host,
      port: config.port,
    });
    process.stdout.write(`${address}\n`);
    return;
  }

  const baseUrl = flags.url ?? "http://127.0.0.1:4620";
  const client = new DriveApiClient({ baseUrl, token: flags.token });

  if (group === "auth" && command === "login") {
    write(await client.login(flags.email ?? "", flags.password ?? ""), wantsJson);
    return;
  }

  if (group === "folder" && command === "create") {
    write(await client.createItem({ kind: "folder", name: flags.name ?? "Untitled folder", parentId: flags.parent ?? null }), wantsJson);
    return;
  }

  if ((group === "doc" || group === "sheet" || group === "slide") && command === "create") {
    write(await client.createItem({
      kind: group,
      name: flags.name ?? `Untitled ${group}`,
      parentId: flags.parent ?? null,
    }), wantsJson);
    return;
  }

  if ((group === "doc" || group === "sheet" || group === "slide") && command === "save") {
    const content = parseJsonFile<DriveNativeContent>(flags["content-file"] ?? "");
    write(await client.saveContent(flags.id ?? "", {
      baseRevisionId: flags["base-revision"] ?? null,
      content,
      summary: flags.summary ?? null,
    }), wantsJson);
    return;
  }

  if (group === "item" && command === "list") {
    write(await client.listItems({
      view: (flags.view as "my-drive" | "recent" | "starred" | "shared" | "trash" | undefined) ?? "my-drive",
      parentId: flags.parent ?? null,
      query: flags.query,
    }), wantsJson);
    return;
  }

  if (group === "item" && command === "read") {
    write(await client.getItem(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "item" && command === "move") {
    write(await client.moveItem(flags.id ?? "", flags.parent ?? null), wantsJson);
    return;
  }

  if (group === "item" && command === "copy") {
    write(await client.copyItem(flags.id ?? "", flags.parent ?? null), wantsJson);
    return;
  }

  if (group === "item" && command === "star") {
    write(await client.updateItem(flags.id ?? "", { starred: flags.value !== "false" }), wantsJson);
    return;
  }

  if (group === "item" && command === "trash") {
    write(await client.trashItem(flags.id ?? ""), wantsJson);
    return;
  }

  if (group === "item" && command === "restore") {
    write(await client.restoreItem(flags.id ?? ""), wantsJson);
    return;
  }

  if (group === "item" && command === "delete") {
    write(await client.deleteItem(flags.id ?? ""), wantsJson);
    return;
  }

  if (group === "upload") {
    write(await client.uploadFile({ filePath: flags.file ?? "", parentId: flags.parent ?? null }), wantsJson);
    return;
  }

  if (group === "download") {
    const buffer = await client.download(flags.id ?? "");
    const outPath = flags.out ?? command ?? ".";
    fs.writeFileSync(outPath, buffer);
    write(`Downloaded ${flags.id ?? ""} to ${outPath}`, wantsJson);
    return;
  }

  if (group === "preview") {
    write(await client.getItem(flags.id ?? ""), wantsJson);
    return;
  }

  if (group === "search") {
    write(await client.search(flags.query ?? command ?? ""), wantsJson);
    return;
  }

  if (group === "share" && command === "create") {
    write(await client.createShare(flags.id ?? "", flags.label ?? "Share link"), wantsJson);
    return;
  }

  if (group === "share" && command === "revoke") {
    write(await client.revokeShare(flags.id ?? "", flags["share-id"] ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "token" && command === "list") {
    write(await client.listTokens(), wantsJson);
    return;
  }

  if (group === "token" && command === "create") {
    write(await client.createToken(flags.label ?? "Agent token", parseCsv(flags.operations) as DriveOperation[]), wantsJson);
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
