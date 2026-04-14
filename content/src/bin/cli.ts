import { buildContentApp } from "../server/app.ts";
import { ContentApiClient } from "../cli/client.ts";
import type { ContentOperation } from "../shared/types.ts";

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

function parseCsv(value?: string): string[] {
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
    "Usage: content <command> [options]",
    "",
    "Commands:",
    "  content serve [--host HOST] [--port PORT] [--data-dir DIR]",
    "  content login --url URL --email EMAIL --password PASSWORD",
    "",
    "  content brand list|create",
    "  content destination list|create|test",
    "  content campaign list|create",
    "  content entry list|create|update|attach-asset|generate-variants",
    "  content variant list|create|update",
    "  content approval list|approve|reject",
    "  content publish plan-list|plan-create|run|cancel|runs|retry",
    "  content token list|create",
  ].join("\n") + "\n");
  process.exit(0);
}

async function main() {
  if (group === "serve") {
    const { app } = buildContentApp({
      config: {
        ...(flags.host ? { host: flags.host } : {}),
        ...(flags.port ? { port: Number(flags.port) } : {}),
        ...(flags["data-dir"] ? { dataDir: flags["data-dir"] } : {}),
        ...(flags["db-path"] ? { dbPath: flags["db-path"] } : {}),
        ...(flags.secret ? { jwtSecret: flags.secret } : {}),
        ...(flags["time-url"] ? { timeBaseUrl: flags["time-url"] } : {}),
        ...(flags["time-token"] ? { timeToken: flags["time-token"] } : {}),
      },
    });
    const address = await app.listen({
      host: flags.host ?? "127.0.0.1",
      port: flags.port ? Number(flags.port) : 4650,
    });
    process.stdout.write(`${address}\n`);
    return;
  }

  const client = new ContentApiClient({
    baseUrl: flags.url ?? "http://127.0.0.1:4650",
    token: flags.token,
  });

  if (group === "login") {
    write(await client.login(flags.email ?? "", flags.password ?? ""), wantsJson);
    return;
  }

  if (group === "brand" && command === "list") {
    write(await client.listBrands(), wantsJson);
    return;
  }
  if (group === "brand" && command === "create") {
    write(await client.createBrand({
      name: flags.name ?? "",
      description: flags.description ?? "",
      defaultLocale: flags.locale,
      voiceSummary: flags.voice,
      tags: parseCsv(flags.tags),
    }), wantsJson);
    return;
  }

  if (group === "destination" && command === "list") {
    write(await client.listDestinations({ brandId: flags.brand }), wantsJson);
    return;
  }
  if (group === "destination" && command === "create") {
    write(await client.createDestination({
      brandId: flags.brand ?? "",
      name: flags.name ?? "",
      kind: flags.kind ?? "webhook",
      publishPolicy: flags.policy ?? "manual",
      secretRef: flags.secret ?? null,
      externalAccountLabel: flags.account ?? null,
    }), wantsJson);
    return;
  }
  if (group === "destination" && command === "test") {
    write(await client.testDestination(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "campaign" && command === "list") {
    write(await client.listCampaigns({ brandId: flags.brand }), wantsJson);
    return;
  }
  if (group === "campaign" && command === "create") {
    write(await client.createCampaign({
      brandId: flags.brand ?? "",
      name: flags.name ?? "",
      description: flags.description ?? "",
      status: flags.status ?? "draft",
    }), wantsJson);
    return;
  }

  if (group === "entry" && command === "list") {
    write(await client.listEntries({ brandId: flags.brand, campaignId: flags.campaign, status: flags.status }), wantsJson);
    return;
  }
  if (group === "entry" && command === "create") {
    write(await client.createEntry({
      brandId: flags.brand ?? "",
      campaignId: flags.campaign ?? null,
      contentType: flags.type ?? "post",
      canonicalFormat: flags.format ?? "markdown",
      title: flags.title ?? "",
      summary: flags.summary ?? "",
      canonicalBody: flags.body ?? "",
      tags: parseCsv(flags.tags),
    }), wantsJson);
    return;
  }
  if (group === "entry" && command === "update") {
    write(await client.updateEntry(flags.id ?? subcommand ?? "", {
      title: flags.title,
      summary: flags.summary,
      canonicalBody: flags.body,
      status: flags.status,
    }), wantsJson);
    return;
  }
  if (group === "entry" && command === "attach-asset") {
    write(await client.attachAsset(flags.id ?? subcommand ?? "", {
      driveItemId: flags["drive-item"] ?? "",
      assetKind: flags["asset-kind"] ?? "image",
      name: flags.name ?? "Asset",
      altText: flags.alt ?? null,
    }), wantsJson);
    return;
  }
  if (group === "entry" && command === "generate-variants") {
    write(await client.generateVariants(flags.id ?? subcommand ?? "", {
      destinationIds: parseCsv(flags.destinations),
    }), wantsJson);
    return;
  }

  if (group === "variant" && command === "list") {
    write(await client.listVariants({ entryId: flags.entry, destinationId: flags.destination, status: flags.status }), wantsJson);
    return;
  }
  if (group === "variant" && command === "create") {
    write(await client.createVariant({
      entryId: flags.entry ?? "",
      destinationId: flags.destination ?? "",
      format: flags.format ?? "plain_text",
      title: flags.title ?? "",
      body: flags.body ?? "",
    }), wantsJson);
    return;
  }
  if (group === "variant" && command === "update") {
    write(await client.updateVariant(flags.id ?? subcommand ?? "", {
      title: flags.title,
      body: flags.body,
      format: flags.format,
      status: flags.status,
    }), wantsJson);
    return;
  }

  if (group === "approval" && command === "list") {
    write(await client.listApprovals({ status: flags.status }), wantsJson);
    return;
  }
  if (group === "approval" && command === "approve") {
    write(await client.approve(flags.id ?? subcommand ?? "", { comment: flags.comment ?? null }), wantsJson);
    return;
  }
  if (group === "approval" && command === "reject") {
    write(await client.reject(flags.id ?? subcommand ?? "", { comment: flags.comment ?? "" }), wantsJson);
    return;
  }

  if (group === "publish" && command === "plan-list") {
    write(await client.listPlans({ status: flags.status }), wantsJson);
    return;
  }
  if (group === "publish" && command === "plan-create") {
    write(await client.createPlan({
      variantId: flags.variant ?? "",
      scheduledAt: flags["scheduled-at"] ?? null,
    }), wantsJson);
    return;
  }
  if (group === "publish" && command === "run") {
    write(await client.runPlan(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }
  if (group === "publish" && command === "cancel") {
    write(await client.cancelPlan(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }
  if (group === "publish" && command === "runs") {
    write(await client.listPublications(), wantsJson);
    return;
  }
  if (group === "publish" && command === "retry") {
    write(await client.retryPublication(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "token" && command === "list") {
    write(await client.listTokens(), wantsJson);
    return;
  }
  if (group === "token" && command === "create") {
    write(await client.issueToken({
      label: flags.label ?? "Content token",
      operations: parseCsv(flags.operations) as ContentOperation[],
    }), wantsJson);
    return;
  }

  throw new Error("Unsupported command");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
