import { buildIotApp } from "../server/app.ts";
import { IotApiClient } from "../cli/client.ts";

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

function parseJsonFlag<T>(value: string | undefined, fallback: T): T {
  if (!value?.trim()) return fallback;
  return JSON.parse(value) as T;
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
    "Usage: iot <command> [options]",
    "",
    "Commands:",
    "  iot serve [--host HOST] [--port PORT]",
    "  iot homes list",
    "  iot areas list [--home ID]",
    "  iot things list [--home ID] [--kind KIND] [--area AREA] [--query TEXT]",
    "  iot state get [--home ID]",
    "  iot lights on|off [area] [--home ID]",
    "  iot climate set <selector> --temperature NUMBER [--home ID]",
    "  iot scenes list|activate <id> [--home ID]",
    "  iot automations list|create|enable|disable|run",
    "  iot approvals list|approve|deny",
    "  iot raw invoke --connector ID --target REF --action ACTION [--payload JSON]",
  ].join("\n") + "\n");
  process.exit(0);
}

async function main() {
  if (group === "serve") {
    const { app } = buildIotApp({
      config: {
        ...(flags.host ? { host: flags.host } : {}),
        ...(flags.port ? { port: Number(flags.port) } : {}),
        ...(flags["data-dir"] ? { dataDir: flags["data-dir"] } : {}),
        ...(flags["db-path"] ? { dbPath: flags["db-path"] } : {}),
      },
    });
    const address = await app.listen({
      host: flags.host ?? "127.0.0.1",
      port: flags.port ? Number(flags.port) : 4520,
    });
    process.stdout.write(`${address}\n`);
    return;
  }

  const client = new IotApiClient({
    baseUrl: flags.url ?? "http://127.0.0.1:4520",
  });
  const homeId = flags.home;

  if (group === "homes" && command === "list") {
    write(await client.listHomes(), wantsJson);
    return;
  }
  if (group === "areas" && command === "list") {
    write(await client.listAreas(homeId), wantsJson);
    return;
  }
  if (group === "things" && command === "list") {
    write(await client.listThings({
      homeId,
      kind: flags.kind,
      q: flags.query,
      area: flags.area,
    }), wantsJson);
    return;
  }
  if (group === "state" && command === "get") {
    write(await client.state(homeId), wantsJson);
    return;
  }
  if (group === "lights" && (command === "on" || command === "off")) {
    write(await client.runAction({
      family: "light",
      action: command,
      ...(subcommand ? { area: subcommand } : {}),
    }, homeId), wantsJson);
    return;
  }
  if (group === "climate" && command === "set") {
    const selector = subcommand || flags.selector;
    if (!selector) throw new Error("climate set requires a selector");
    if (!flags.temperature) throw new Error("climate set requires --temperature");
    write(await client.runAction({
      family: "climate",
      selector,
      action: "set",
      value: Number(flags.temperature),
    }, homeId), wantsJson);
    return;
  }
  if (group === "scenes" && command === "list") {
    write(await client.listScenes(homeId), wantsJson);
    return;
  }
  if (group === "scenes" && command === "activate") {
    write(await client.activateScene(subcommand ?? flags.id ?? "", homeId), wantsJson);
    return;
  }
  if (group === "automations" && command === "list") {
    write(await client.listAutomations(homeId), wantsJson);
    return;
  }
  if (group === "automations" && command === "create") {
    write(await client.createAutomation({
      label: flags.label ?? subcommand ?? "",
      enabled: flags.enabled !== "false",
      trigger: parseJsonFlag(flags.trigger, { type: "manual" }),
      conditions: parseJsonFlag(flags.conditions, []),
      actions: parseJsonFlag(flags.actions, []),
    }, homeId), wantsJson);
    return;
  }
  if (group === "automations" && command === "enable") {
    write(await client.setAutomationEnabled(subcommand ?? flags.id ?? "", true, homeId), wantsJson);
    return;
  }
  if (group === "automations" && command === "disable") {
    write(await client.setAutomationEnabled(subcommand ?? flags.id ?? "", false, homeId), wantsJson);
    return;
  }
  if (group === "automations" && command === "run") {
    write(await client.runAutomation(subcommand ?? flags.id ?? "", homeId), wantsJson);
    return;
  }
  if (group === "approvals" && command === "list") {
    write(await client.listApprovals(homeId), wantsJson);
    return;
  }
  if (group === "approvals" && command === "approve") {
    write(await client.approve(subcommand ?? flags.id ?? "", homeId), wantsJson);
    return;
  }
  if (group === "approvals" && command === "deny") {
    write(await client.deny(subcommand ?? flags.id ?? "", homeId), wantsJson);
    return;
  }
  if (group === "raw" && command === "invoke") {
    write(await client.rawInvoke({
      connector: flags.connector ?? "",
      target: flags.target ?? "",
      action: flags.action ?? "",
      ...(flags.payload ? { payload: parseJsonFlag(flags.payload, {}) } : {}),
      ...(homeId ? { homeId } : {}),
    }), wantsJson);
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
