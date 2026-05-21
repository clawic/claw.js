import { SessionsApiClient, buildSessionsApp } from "@clawjs/sessions";

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

function write(payload: unknown): void {
  process.stdout.write(`${typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)}\n`);
}

const argv = process.argv.slice(2);
const flags = parseFlags(argv);
const [group] = positionals(argv);

if (argv.includes("--help") || argv.includes("-h") || !group) {
  process.stdout.write([
    "Usage: sessions <command> [options]",
    "",
    "Commands:",
    "  sessions serve [--host HOST] [--port PORT] [--data-dir DIR] [--secret TOKEN]",
    "  sessions list   [--agent A] [--project P] [--archived true|false] [--limit N]",
    "  sessions read   --id ID [--include-messages] [--limit N]",
    "  sessions search --q QUERY [--agent A] [--limit N]",
    "  sessions pin    --id ID [--off]",
    "  sessions archive --id ID [--off]",
    "  sessions visibility --id ID --visible true|false",
    "  sessions project --id ID [--path PATH | --clear]",
    "  sessions delete --id ID",
    "  sessions import codex [--dir CODEX_SESSIONS_DIR] [--force]",
    "",
    "Service flags shared by client commands:",
    "  --url URL (default http://127.0.0.1:24101)",
    "  --token TOKEN (or --secret)",
  ].join("\n") + "\n");
  process.exit(0);
}

async function main(): Promise<void> {
  if (group === "serve") {
    const { app } = buildSessionsApp({
      config: {
        ...(flags.host ? { host: flags.host } : {}),
        ...(flags.port ? { port: Number(flags.port) } : {}),
        ...(flags["data-dir"] ? { dataDir: flags["data-dir"] } : {}),
        ...(flags["db-path"] ? { dbPath: flags["db-path"] } : {}),
        ...(flags.secret ? { sharedSecret: flags.secret } : {}),
      },
    });
    const address = await app.listen({
      host: flags.host ?? "127.0.0.1",
      port: flags.port ? Number(flags.port) : 24101,
    });
    process.stdout.write(`${address}\n`);
    return;
  }

  const baseUrl = flags.url ?? "http://127.0.0.1:24101";
  const token = flags.token ?? flags.secret ?? "";
  const client = new SessionsApiClient({ baseUrl, token });

  if (group === "list") {
    write(await client.list({
      agent: flags.agent,
      projectPath: flags.project,
      archived: flags.archived ? flags.archived === "true" : undefined,
      pinned: flags.pinned ? flags.pinned === "true" : undefined,
      sidebarVisible: flags["sidebar-visible"] ? flags["sidebar-visible"] === "true" : undefined,
      limit: flags.limit ? Number(flags.limit) : undefined,
    }));
    return;
  }

  if (group === "read") {
    const id = flags.id;
    if (!id) throw new Error("--id required");
    if (flags["include-messages"]) {
      write(await client.getSessionWithMessages(id, flags.limit ? Number(flags.limit) : undefined));
    } else {
      write(await client.getSession(id));
    }
    return;
  }

  if (group === "search") {
    const query = flags.q ?? flags.query;
    if (!query) throw new Error("--q required");
    write(await client.search({
      query,
      agent: flags.agent,
      projectPath: flags.project,
      limit: flags.limit ? Number(flags.limit) : undefined,
    }));
    return;
  }

  if (group === "pin") {
    const id = flags.id;
    if (!id) throw new Error("--id required");
    write(await client.update(id, { pinned: !flags.off }));
    return;
  }

  if (group === "archive") {
    const id = flags.id;
    if (!id) throw new Error("--id required");
    write(await client.update(id, { archived: !flags.off }));
    return;
  }

  if (group === "visibility") {
    const id = flags.id;
    if (!id) throw new Error("--id required");
    const visible = flags.visible !== "false";
    write(await client.update(id, { sidebarVisible: visible }));
    return;
  }

  if (group === "project") {
    const id = flags.id;
    if (!id) throw new Error("--id required");
    const projectPath: string | null = flags.clear ? null : flags.path ?? null;
    write(await client.update(id, { projectPath }));
    return;
  }

  if (group === "delete") {
    const id = flags.id;
    if (!id) throw new Error("--id required");
    write(await client.delete(id));
    return;
  }

  if (group === "import") {
    write(await client.importCodex({
      dir: flags.dir,
      forceReimport: flags.force === "true" || flags.force === "",
      machine: flags.machine,
    }));
    return;
  }

  process.stderr.write(`Unknown command: ${group}\n`);
  process.exit(64);
}

try {
  await main();
  process.exit(0);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
