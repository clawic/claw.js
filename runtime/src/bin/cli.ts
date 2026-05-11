import { RuntimeApiClient, buildRuntimeApp } from "@clawjs/runtime";

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
const [group, sub] = positionals(argv);

if (argv.includes("--help") || argv.includes("-h") || !group) {
  process.stdout.write([
    "Usage: runtime <command> [options]",
    "",
    "Commands:",
    "  runtime serve [--host HOST] [--port PORT] [--data-dir DIR] [--secret TOKEN]",
    "  runtime distill --session ID [--force] [--min-tool-calls N] [--reason TEXT]",
    "  runtime nudge --session ID [--since-message MID] [--lookback-min N] [--max N]",
    "  runtime user-model refresh [--reason TEXT] [--agent A] [--max-sessions N]",
    "  runtime status",
    "  runtime distillations [--session ID] [--limit N]",
    "  runtime nudges [--session ID] [--limit N]",
    "  runtime jobs [--kind distill|nudge|user_model_refresh] [--limit N]",
    "",
    "Service flags for client commands:",
    "  --url URL (default http://127.0.0.1:4660)",
    "  --token TOKEN (or --secret)",
  ].join("\n") + "\n");
  process.exit(0);
}

async function main(): Promise<void> {
  if (group === "serve") {
    const { app } = buildRuntimeApp({
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
      port: flags.port ? Number(flags.port) : 4660,
    });
    process.stdout.write(`${address}\n`);
    return;
  }

  const baseUrl = flags.url ?? "http://127.0.0.1:4660";
  const token = flags.token ?? flags.secret ?? "";
  const client = new RuntimeApiClient({ baseUrl, token });

  if (group === "distill") {
    const sessionId = flags.session;
    if (!sessionId) throw new Error("--session required");
    write(await client.distill({
      sessionId,
      forceRedistill: flags.force === "true" || flags.force === "",
      minToolCalls: flags["min-tool-calls"] ? Number(flags["min-tool-calls"]) : undefined,
      reason: flags.reason,
    }));
    return;
  }

  if (group === "nudge") {
    const sessionId = flags.session;
    if (!sessionId) throw new Error("--session required");
    write(await client.nudge({
      sessionId,
      sinceMessageId: flags["since-message"] ?? null,
      lookbackMinutes: flags["lookback-min"] ? Number(flags["lookback-min"]) : undefined,
      maxMessages: flags.max ? Number(flags.max) : undefined,
    }));
    return;
  }

  if (group === "user-model" && sub === "refresh") {
    write(await client.refreshUserModel({
      reason: flags.reason,
      agent: flags.agent,
      maxSessions: flags["max-sessions"] ? Number(flags["max-sessions"]) : undefined,
    }));
    return;
  }

  if (group === "status") {
    write(await client.status());
    return;
  }

  if (group === "distillations") {
    write(await client.listDistillations(flags.session, flags.limit ? Number(flags.limit) : undefined));
    return;
  }

  if (group === "nudges") {
    write(await client.listNudges(flags.session, flags.limit ? Number(flags.limit) : undefined));
    return;
  }

  if (group === "jobs") {
    const kind = flags.kind as "distill" | "nudge" | "user_model_refresh" | undefined;
    write(await client.listJobs(kind, flags.limit ? Number(flags.limit) : undefined));
    return;
  }

  process.stderr.write(`Unknown command: ${group}${sub ? " " + sub : ""}\n`);
  process.exit(64);
}

try {
  await main();
  process.exit(0);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
