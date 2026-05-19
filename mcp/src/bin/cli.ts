import { MCPApiClient, buildMCPApp } from "@clawjs/mcp";

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq > 2) { flags[token.slice(2, eq)] = token.slice(eq + 1); continue; }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) { flags[token.slice(2)] = "true"; continue; }
    flags[token.slice(2)] = next;
    index += 1;
  }
  return flags;
}

function positionals(argv: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) { values.push(token); continue; }
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

if (argv.includes("--help") || !group) {
  process.stdout.write([
    "Usage: mcp <command> [options]",
    "  mcp serve [--port N] [--secret TOKEN]",
    "  mcp servers add --name N --transport http|sse|stdio --endpoint URL",
    "  mcp servers list",
    "  mcp servers remove --id ID",
    "  mcp servers refresh --id ID",
    "  mcp tools list [--server ID]",
    "  mcp tools call --name PREFIXED_NAME --args JSON --control-plane JSON --agent-policy JSON",
    "  mcp exposed",
    "  mcp custom-app-sdk",
  ].join("\n") + "\n");
  process.exit(0);
}

async function main(): Promise<void> {
  if (group === "serve") {
    const { app } = buildMCPApp({
      config: {
        ...(flags.host ? { host: flags.host } : {}),
        ...(flags.port ? { port: Number(flags.port) } : {}),
        ...(flags.secret ? { sharedSecret: flags.secret } : {}),
      },
    });
    const address = await app.listen({ host: flags.host ?? "127.0.0.1", port: flags.port ? Number(flags.port) : 4680 });
    process.stdout.write(`${address}\n`);
    return;
  }
  const baseUrl = flags.url ?? "http://127.0.0.1:4680";
  const token = flags.token ?? flags.secret ?? "";
  const client = new MCPApiClient({ baseUrl, token });

  if (group === "servers" && sub === "add") {
    write(await client.registerServer({ name: flags.name, transport: flags.transport as "stdio" | "http" | "sse", endpoint: flags.endpoint }));
    return;
  }
  if (group === "servers" && sub === "list") { write(await client.listServers()); return; }
  if (group === "servers" && sub === "remove") { write(await client.removeServer(flags.id)); return; }
  if (group === "servers" && sub === "refresh") { write(await client.refreshServer(flags.id)); return; }
  if (group === "tools" && sub === "list") { write(await client.listTools(flags.server)); return; }
  if (group === "tools" && sub === "call") {
    if (!flags["control-plane"]) throw new Error("mcp tools call requires --control-plane JSON");
    write(await client.callTool(
      flags.name,
      flags.args ? JSON.parse(flags.args) : {},
      JSON.parse(flags["control-plane"]),
      flags["agent-policy"] ? JSON.parse(flags["agent-policy"]) : undefined,
    ));
    return;
  }
  if (group === "exposed") { write(await client.exposed()); return; }
  if (group === "custom-app-sdk") { write(await client.customAppSDK()); return; }
  process.stderr.write(`Unknown command: ${group} ${sub ?? ""}\n`);
  process.exit(64);
}

try {
  await main();
  process.exit(0);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
