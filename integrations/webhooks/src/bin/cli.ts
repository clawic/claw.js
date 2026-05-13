import { ChannelApiClient } from "@clawjs/channel-base";
import { buildWebhooksApp } from "../server/app.ts";

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]; if (!token?.startsWith("--")) continue;
    const eq = token.indexOf("="); if (eq > 2) { flags[token.slice(2, eq)] = token.slice(eq + 1); continue; }
    const next = argv[i + 1]; if (!next || next.startsWith("--")) { flags[token.slice(2)] = "true"; continue; }
    flags[token.slice(2)] = next; i++;
  }
  return flags;
}
function positionals(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]; if (!token.startsWith("--")) { out.push(token); continue; }
    if (token.includes("=")) continue; const next = argv[i + 1]; if (next && !next.startsWith("--")) i++;
  }
  return out;
}
function write(payload: unknown): void { process.stdout.write(`${typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)}\n`); }

const argv = process.argv.slice(2);
const flags = parseFlags(argv);
const [group, sub] = positionals(argv);
if (!group || argv.includes("--help")) {
  process.stdout.write([
    "Usage: webhooks <command> [options]",
    "  webhooks serve [--port N] [--secret TOKEN]",
    "  webhooks accounts add --name N [--credentials-ref SECRET]",
    "  webhooks accounts list",
    "  webhooks accounts remove --id ID",
    "  webhooks routing assign --account ID --target T --agent A",
    "  webhooks routing list [--account ID] [--agent A]",
    "  webhooks send --account ID --target T --content TEXT",
    "  webhooks messages [--account ID] [--target T] [--direction inbound|outbound]",
  ].join("\n") + "\n");
  process.exit(0);
}
async function main() {
  if (group === "serve") {
    const { app } = buildWebhooksApp({ config: { ...(flags.port ? { port: Number(flags.port) } : {}), ...(flags.secret ? { sharedSecret: flags.secret } : {}) } });
    const addr = await app.listen({ host: flags.host ?? "127.0.0.1", port: flags.port ? Number(flags.port) : 4700 });
    process.stdout.write(`${addr}\n`); return;
  }
  const baseUrl = flags.url ?? "http://127.0.0.1:4700"; const token = flags.token ?? flags.secret ?? "";
  const client = new ChannelApiClient({ channel: "webhooks", baseUrl, token });
  if (group === "accounts" && sub === "add") { write(await client.createAccount({ name: flags.name, credentialsRef: flags["credentials-ref"] ?? null })); return; }
  if (group === "accounts" && sub === "list") { write(await client.listAccounts()); return; }
  if (group === "accounts" && sub === "remove") { write(await client.deleteAccount(flags.id)); return; }
  if (group === "routing" && sub === "assign") { write(await client.assignRouting({ accountId: flags.account, targetId: flags.target, agentId: flags.agent })); return; }
  if (group === "routing" && sub === "list") { write(await client.listRouting({ accountId: flags.account, agentId: flags.agent })); return; }
  if (group === "send") { write(await client.sendMessage({ accountId: flags.account, targetId: flags.target, content: flags.content })); return; }
  if (group === "messages") { write(await client.listMessages({ accountId: flags.account, targetId: flags.target, direction: flags.direction as "inbound" | "outbound" | undefined })); return; }
  process.stderr.write(`Unknown command: ${group} ${sub ?? ""}\n`); process.exit(64);
}
try { await main(); process.exit(0); } catch (e) { process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`); process.exit(1); }
