import { SandboxApiClient, buildSandboxApp, type SandboxBackend } from "@clawjs/sandbox";

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
const all = positionals(argv);
const [group] = all;
const remainder = all.slice(1);

if (argv.includes("--help") || argv.includes("-h") || !group) {
  process.stdout.write([
    "Usage: sandbox <command> [options]",
    "",
    "Commands:",
    "  sandbox serve [--host HOST] [--port PORT] [--data-dir DIR] [--secret TOKEN]",
    "  sandbox run --backend local|docker|ssh [--cwd DIR] [--env KEY=VAL ...] [--timeout MS] [--image IMG] [--host HOST] -- <command> [args...]",
    "  sandbox runs [--backend B] [--status S] [--host H] [--limit N]",
    "  sandbox get --id ID",
    "",
    "Service flags for client commands:",
    "  --url URL (default http://127.0.0.1:4670)",
    "  --token TOKEN (or --secret)",
  ].join("\n") + "\n");
  process.exit(0);
}

async function main(): Promise<void> {
  if (group === "serve") {
    const { app } = buildSandboxApp({
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
      port: flags.port ? Number(flags.port) : 4670,
    });
    process.stdout.write(`${address}\n`);
    return;
  }

  const baseUrl = flags.url ?? "http://127.0.0.1:4670";
  const token = flags.token ?? flags.secret ?? "";
  const client = new SandboxApiClient({ baseUrl, token });

  if (group === "run") {
    const backend = flags.backend as SandboxBackend;
    const command = remainder[0];
    const args = remainder.slice(1);
    if (!backend || !command) throw new Error("--backend and command required");
    const env: Record<string, string> = {};
    const envFlags = Array.isArray(flags.env) ? flags.env : flags.env ? [flags.env] : [];
    for (const entry of envFlags) {
      const eq = entry.indexOf("=");
      if (eq > 0) env[entry.slice(0, eq)] = entry.slice(eq + 1);
    }
    write(await client.run({
      backend,
      command,
      args,
      cwd: flags.cwd ?? null,
      env: Object.keys(env).length ? env : null,
      timeoutMs: flags.timeout ? Number(flags.timeout) : null,
      image: flags.image ?? null,
      host: flags.host ?? null,
      identityFile: flags["identity-file"] ?? null,
    }));
    return;
  }

  if (group === "runs") {
    write(await client.listRuns({
      backend: flags.backend as SandboxBackend | undefined,
      status: flags.status as "running" | "completed" | "failed" | "timeout" | "cancelled" | undefined,
      host: flags.host,
      limit: flags.limit ? Number(flags.limit) : undefined,
    }));
    return;
  }

  if (group === "get") {
    const id = flags.id;
    if (!id) throw new Error("--id required");
    write(await client.getRun(id));
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
