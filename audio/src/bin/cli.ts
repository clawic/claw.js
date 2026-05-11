import { AudioApiClient } from "@clawjs/audio";

import { buildAudioApp } from "../server/app.ts";

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
const [group, command] = positionals(argv);

if (argv.includes("--help") || argv.includes("-h") || !group) {
  process.stdout.write([
    "Usage: audio <command> [options]",
    "",
    "Commands:",
    "  audio serve [--host HOST] [--port PORT] [--data-dir DIR] [--secret TOKEN]",
    "  audio list  --app APP_ID [--kind K] [--thread T] [--session S] [--device D] [--limit N]",
    "  audio get   --app APP_ID --id AUDIO_ID",
    "  audio delete --app APP_ID --id AUDIO_ID",
  ].join("\n") + "\n");
  process.exit(0);
}

async function main(): Promise<void> {
  if (group === "serve") {
    const { app } = buildAudioApp({
      config: {
        ...(flags.host ? { host: flags.host } : {}),
        ...(flags.port ? { port: Number(flags.port) } : {}),
        ...(flags["data-dir"] ? { dataDir: flags["data-dir"] } : {}),
        ...(flags["db-path"] ? { dbPath: flags["db-path"] } : {}),
        ...(flags["blobs-dir"] ? { blobsDir: flags["blobs-dir"] } : {}),
        ...(flags.secret ? { sharedSecret: flags.secret } : {}),
      },
    });
    const address = await app.listen({
      host: flags.host ?? "127.0.0.1",
      port: flags.port ? Number(flags.port) : 4630,
    });
    process.stdout.write(`${address}\n`);
    return;
  }

  const baseUrl = flags.url ?? "http://127.0.0.1:4630";
  const token = flags.token ?? flags.secret ?? "";
  const client = new AudioApiClient({ baseUrl, token });
  const appId = flags.app ?? "";

  if (group === "list") {
    write(await client.list({
      appId,
      kind: flags.kind as never,
      threadId: flags.thread,
      sessionId: flags.session,
      deviceId: flags.device,
      limit: flags.limit ? Number(flags.limit) : undefined,
    }));
    return;
  }

  if (group === "get") {
    write(await client.get(flags.id ?? "", appId));
    return;
  }

  if (group === "delete") {
    write(await client.delete(flags.id ?? "", appId));
    return;
  }

  void command;
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
