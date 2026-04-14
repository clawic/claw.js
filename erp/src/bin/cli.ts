import { buildErpApp } from "../server/app.ts";
import { ErpApiClient } from "../cli/client.ts";

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq > 2) {
      flags[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[token.slice(2)] = next;
      index += 1;
      continue;
    }
    flags[token.slice(2)] = "true";
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

function write(payload: unknown, wantsJson: boolean): void {
  process.stdout.write(`${typeof payload === "string" && !wantsJson ? payload : JSON.stringify(payload, null, 2)}\n`);
}

const argv = process.argv.slice(2);
const flags = parseFlags(argv);
const wantsJson = argv.includes("--json");
const [group, command, subcommand] = positionals(argv);

if (argv.includes("--help") || argv.includes("-h") || !group) {
  process.stdout.write([
    "Usage: erp <command> [options]",
    "",
    "Commands:",
    "  erp serve [--host HOST] [--port PORT]",
    "  erp login --url URL --email EMAIL --password PASSWORD",
    "  erp tenant list|bootstrap",
    "  erp company list --tenant TENANT_ID",
    "  erp localization install --tenant TENANT_ID --entity ENTITY_ID --pack es_eu|us",
    "  erp gl accounts|periods|entries|close-period|reverse",
    "  erp sales quote-create|quote-confirm-order|shipment-post",
    "  erp ar invoice-create|payment-create",
    "  erp purchase order-create|receipt-post",
    "  erp ap bill-create|payment-create",
    "  erp inventory item-create|balances",
    "  erp mrp order-create|order-post",
    "  erp projects create|timesheet-invoice",
    "  erp hr employee-create|list",
    "  erp payroll run-create|run-post",
    "  erp support ticket-create|list",
    "  erp docs list",
    "  erp reports dashboard",
    "  erp agents action-request",
    "  erp approvals list|approve",
  ].join("\n") + "\n");
  process.exit(0);
}

async function main() {
  if (group === "serve") {
    const { app } = buildErpApp({
      config: {
        ...(flags.host ? { host: flags.host } : {}),
        ...(flags.port ? { port: Number(flags.port) } : {}),
        ...(flags["data-dir"] ? { dataDir: flags["data-dir"] } : {}),
        ...(flags["db-path"] ? { dbPath: flags["db-path"] } : {}),
      },
    });
    const address = await app.listen({
      host: flags.host ?? "127.0.0.1",
      port: flags.port ? Number(flags.port) : 4530,
    });
    process.stdout.write(`${address}\n`);
    return;
  }

  const client = new ErpApiClient({
    baseUrl: flags.url ?? "http://127.0.0.1:4530",
    token: flags.token,
  });

  if (group === "login") {
    write(await client.login(flags.email ?? "", flags.password ?? ""), wantsJson);
    return;
  }

  if (group === "tenant" && command === "list") {
    write(await client.listTenants(), wantsJson);
    return;
  }

  if (group === "tenant" && command === "bootstrap") {
    write(await client.bootstrapTenant({
      name: flags.name ?? subcommand ?? "",
      slug: flags.slug,
      localizationKey: flags.pack ?? flags.localization,
      baseCurrency: flags.currency,
      legalEntityName: flags["legal-entity-name"],
    }), wantsJson);
    return;
  }

  if (group === "company" && command === "list") {
    write(await client.listLegalEntities(flags.tenant ?? ""), wantsJson);
    return;
  }

  if (group === "localization" && command === "install") {
    write(await client.installLocalization(flags.tenant ?? "", flags.entity ?? "", flags.pack ?? "es_eu"), wantsJson);
    return;
  }

  if (group === "gl" && command === "accounts") {
    write(await client.listAccounts(flags.tenant ?? "", flags.entity ?? ""), wantsJson);
    return;
  }

  if (group === "gl" && command === "periods") {
    write(await client.listPeriods(flags.tenant ?? "", flags.entity ?? ""), wantsJson);
    return;
  }

  if (group === "gl" && command === "close-period") {
    write(await client.closePeriod(flags.tenant ?? "", flags.entity ?? "", flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "gl" && command === "entries") {
    write(await client.listEntries(flags.tenant ?? "", flags.entity ?? ""), wantsJson);
    return;
  }

  if (group === "gl" && command === "reverse") {
    write(await client.reverseEntry(flags.tenant ?? "", flags.entity ?? "", flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "inventory" && command === "item-create") {
    write(await client.createItem(flags.tenant ?? "", flags.entity ?? "", {
      sku: flags.sku ?? "",
      name: flags.name ?? "",
      kind: flags.kind ?? "stock",
    }), wantsJson);
    return;
  }

  if (group === "inventory" && command === "balances") {
    write(await client.balances(flags.tenant ?? "", flags.entity ?? ""), wantsJson);
    return;
  }

  const tenant = flags.tenant ?? "";
  const entity = flags.entity ?? "";
  const branchId = flags.branch ?? "";

  if (group === "sales" && command === "quote-create") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/sales/quotes`, {
      branchId,
      customerName: flags.customer ?? "",
      currency: flags.currency ?? "EUR",
      totalAmountCents: Number(flags.amount ?? "0"),
      itemSku: flags.sku,
      quantity: Number(flags.quantity ?? "1"),
    }), wantsJson);
    return;
  }

  if (group === "sales" && command === "quote-confirm-order") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/sales/quotes/${flags.id ?? subcommand ?? ""}/confirm-order`, {}), wantsJson);
    return;
  }

  if (group === "sales" && command === "shipment-post") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/sales/shipments`, {
      branchId,
      warehouseId: flags.warehouse ?? "",
      customerName: flags.customer ?? "",
      itemSku: flags.sku ?? "",
      quantity: Number(flags.quantity ?? "0"),
      unitCostCents: Number(flags["unit-cost"] ?? "0"),
    }), wantsJson);
    return;
  }

  if (group === "ar" && command === "invoice-create") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/ar/invoices`, {
      branchId,
      customerName: flags.customer ?? "",
      currency: flags.currency ?? "EUR",
      totalAmountCents: Number(flags.amount ?? "0"),
      description: flags.description,
    }), wantsJson);
    return;
  }

  if (group === "ar" && command === "payment-create") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/ar/payments`, {
      branchId,
      customerName: flags.customer ?? "",
      currency: flags.currency ?? "EUR",
      totalAmountCents: Number(flags.amount ?? "0"),
    }), wantsJson);
    return;
  }

  if (group === "purchase" && command === "order-create") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/purchase/orders`, {
      branchId,
      vendorName: flags.vendor ?? "",
      currency: flags.currency ?? "EUR",
      totalAmountCents: Number(flags.amount ?? "0"),
      itemSku: flags.sku,
      quantity: Number(flags.quantity ?? "1"),
    }), wantsJson);
    return;
  }

  if (group === "purchase" && command === "receipt-post") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/purchase/receipts`, {
      branchId,
      warehouseId: flags.warehouse ?? "",
      vendorName: flags.vendor ?? "",
      itemSku: flags.sku ?? "",
      quantity: Number(flags.quantity ?? "0"),
      unitCostCents: Number(flags["unit-cost"] ?? "0"),
    }), wantsJson);
    return;
  }

  if (group === "ap" && command === "bill-create") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/ap/bills`, {
      branchId,
      vendorName: flags.vendor ?? "",
      currency: flags.currency ?? "EUR",
      totalAmountCents: Number(flags.amount ?? "0"),
    }), wantsJson);
    return;
  }

  if (group === "ap" && command === "payment-create") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/ap/payments`, {
      branchId,
      vendorName: flags.vendor ?? "",
      currency: flags.currency ?? "EUR",
      totalAmountCents: Number(flags.amount ?? "0"),
    }), wantsJson);
    return;
  }

  if (group === "mrp" && command === "order-create") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/mrp/orders`, {
      branchId,
      warehouseId: flags.warehouse ?? "",
      outputSku: flags["output-sku"] ?? "",
      inputSku: flags["input-sku"] ?? "",
      inputQuantity: Number(flags["input-quantity"] ?? "0"),
      outputQuantity: Number(flags["output-quantity"] ?? "0"),
      unitCostCents: Number(flags["unit-cost"] ?? "0"),
    }), wantsJson);
    return;
  }

  if (group === "mrp" && command === "order-post") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/mrp/orders/${flags.id ?? subcommand ?? ""}/post`, {}), wantsJson);
    return;
  }

  if (group === "projects" && command === "create") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/projects`, {
      name: flags.name ?? subcommand ?? "",
    }), wantsJson);
    return;
  }

  if (group === "projects" && command === "timesheet-invoice") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/projects/${flags.id ?? subcommand ?? ""}/timesheets/invoice`, {
      branchId,
      customerName: flags.customer ?? "",
      hours: Number(flags.hours ?? "0"),
      rateCents: Number(flags.rate ?? "0"),
    }), wantsJson);
    return;
  }

  if (group === "hr" && command === "employee-create") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/employees`, {
      displayName: flags.name ?? subcommand ?? "",
    }), wantsJson);
    return;
  }

  if (group === "hr" && command === "list") {
    write(await fetch(new URL(`/v1/tenants/${tenant}/legal-entities/${entity}/employees`, flags.url ?? "http://127.0.0.1:4530"), {
      headers: { authorization: `Bearer ${flags.token ?? ""}` },
    }).then((res) => res.json()), wantsJson);
    return;
  }

  if (group === "payroll" && command === "run-create") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/payroll/runs`, {
      branchId,
      employeeId: flags.employee ?? "",
      grossAmountCents: Number(flags.amount ?? "0"),
    }), wantsJson);
    return;
  }

  if (group === "payroll" && command === "run-post") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/payroll/runs/${flags.id ?? subcommand ?? ""}/post`, {}), wantsJson);
    return;
  }

  if (group === "support" && command === "ticket-create") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/support/tickets`, {
      branchId,
      customerName: flags.customer ?? "",
      title: flags.title ?? subcommand ?? "",
    }), wantsJson);
    return;
  }

  if (group === "support" && command === "list") {
    write(await client.documents(tenant, entity), wantsJson);
    return;
  }

  if (group === "docs" && command === "list") {
    write(await client.documents(tenant, entity), wantsJson);
    return;
  }

  if (group === "reports" && command === "dashboard") {
    write(await client.dashboard(tenant, entity), wantsJson);
    return;
  }

  if (group === "agents" && command === "action-request") {
    write(await client.createDocument(`/v1/tenants/${tenant}/legal-entities/${entity}/agents/actions`, {
      requestedBy: flags.actor ?? "agent:auto",
      actionType: flags.action ?? "payment_release",
      amountCents: Number(flags.amount ?? "0"),
      currency: flags.currency ?? "EUR",
    }), wantsJson);
    return;
  }

  if (group === "approvals" && command === "list") {
    write(await client.listApprovals(tenant, entity), wantsJson);
    return;
  }

  if (group === "approvals" && command === "approve") {
    write(await client.approve(tenant, entity, flags.id ?? subcommand ?? ""), wantsJson);
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
