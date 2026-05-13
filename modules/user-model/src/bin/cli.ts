import { UserModelApiClient, buildUserModelApp, type UserModelSection } from "@clawjs/user-model";

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
    "Usage: user-model <command> [options]",
    "",
    "Commands:",
    "  user-model serve [--host HOST] [--port PORT] [--data-dir DIR] [--secret TOKEN]",
    "  user-model show [--by-section]",
    "  user-model counts",
    "  user-model add --section SECTION --text TEXT [--topic T] [--confidence 0..1] [--source S]",
    "  user-model edit --id ID [--text TEXT] [--topic T] [--confidence N]",
    "  user-model delete --id ID",
    "  user-model forget [--about TEXT] [--section S] [--topic T] [--ids id1,id2]",
    "  user-model refresh [--reason TEXT]",
    "  user-model snapshot [--reason TEXT]",
    "  user-model history [--limit N]",
    "",
    "Sections: communication_style, expertise, project, edge_case, preference, goal, blocker",
    "",
    "Service flags for client commands:",
    "  --url URL (default http://127.0.0.1:4650)",
    "  --token TOKEN (or --secret)",
  ].join("\n") + "\n");
  process.exit(0);
}

async function main(): Promise<void> {
  if (group === "serve") {
    const { app } = buildUserModelApp({
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
      port: flags.port ? Number(flags.port) : 4650,
    });
    process.stdout.write(`${address}\n`);
    return;
  }

  const baseUrl = flags.url ?? "http://127.0.0.1:4650";
  const token = flags.token ?? flags.secret ?? "";
  const client = new UserModelApiClient({ baseUrl, token });

  if (group === "show") {
    if (flags["by-section"]) write(await client.bySection());
    else write(await client.snapshot());
    return;
  }

  if (group === "counts") {
    write(await client.counts());
    return;
  }

  if (group === "add") {
    const section = flags.section as UserModelSection | undefined;
    const text = flags.text;
    if (!section || !text) throw new Error("--section and --text required");
    write(await client.upsertItem({
      section,
      contentText: text,
      topic: flags.topic ?? null,
      confidence: flags.confidence ? Number(flags.confidence) : null,
      source: flags.source ?? "manual",
    }));
    return;
  }

  if (group === "edit") {
    const id = flags.id;
    if (!id) throw new Error("--id required");
    write(await client.updateItem(id, {
      contentText: flags.text,
      topic: flags.topic,
      confidence: flags.confidence ? Number(flags.confidence) : undefined,
    }));
    return;
  }

  if (group === "delete") {
    const id = flags.id;
    if (!id) throw new Error("--id required");
    write(await client.deleteItem(id));
    return;
  }

  if (group === "forget") {
    const ids = flags.ids ? flags.ids.split(",").filter(Boolean) : undefined;
    write(await client.forget({
      about: flags.about,
      section: flags.section as UserModelSection | undefined,
      topic: flags.topic,
      ids,
    }));
    return;
  }

  if (group === "refresh") {
    write(await client.refresh(flags.reason));
    return;
  }

  if (group === "snapshot") {
    write(await client.commitSnapshot({ reason: flags.reason ?? null }));
    return;
  }

  if (group === "history") {
    write(await client.history(flags.limit ? Number(flags.limit) : undefined));
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
