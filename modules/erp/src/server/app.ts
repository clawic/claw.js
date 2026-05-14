import { clawApiPath } from "@clawjs/core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";

import { staticFormSchemas, frontendContract } from "../shared/contracts.ts";
import { ErpAuthService } from "./auth.ts";
import { loadErpConfig, type ErpServiceConfig } from "./config.ts";
import { ErpStore } from "./db.ts";
import { ErpError, errorEnvelope } from "../shared/errors.ts";
import type { ErpRealtimeEvent } from "../shared/events.ts";

function resolveUiRoot(): string | null {
  const candidates = [
    fileURLToPath(new URL("../../ui/dist", import.meta.url)),
    fileURLToPath(new URL("../ui/dist", import.meta.url)),
    path.join(process.cwd(), "ui", "dist"),
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html"))) ?? null;
}

function resolveDocsRoot(): string {
  return fileURLToPath(new URL("../../docs", import.meta.url));
}

function resolveBrandRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../../../public", import.meta.url)),
    fileURLToPath(new URL("../../public", import.meta.url)),
    path.join(process.cwd(), "../public"),
    path.join(process.cwd(), "public"),
  ];
  return candidates.find((candidate) => (
    fs.existsSync(path.join(candidate, "logo.png")) &&
    fs.existsSync(path.join(candidate, "favicon.ico"))
  )) ?? candidates[0];
}

function placeholderHtml(): string {
  return [
    "<!doctype html>",
    "<html lang='en'>",
    "<head>",
    "<meta charset='utf-8' />",
    "<meta name='viewport' content='width=device-width, initial-scale=1' />",
    "<title>ERP</title>",
    "<style>",
    "body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;}",
    "main{max-width:1100px;margin:0 auto;padding:48px 24px;}",
    ".card{background:#111827;border:1px solid #334155;border-radius:16px;padding:24px;margin-top:20px;}",
    ".mono{font-family:ui-monospace,SFMono-Regular,monospace;color:#93c5fd;}",
    "a{color:#93c5fd;text-decoration:none}",
    "ul{line-height:1.6}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1 data-testid='erp-placeholder-title'>ERP backend is ready</h1>",
    "<p data-testid='erp-placeholder-copy'>The backend, CLI, contracts, fixtures, OpenAPI, and frontend checklist are implemented. The SPA mount at <span class='mono'>erp/ui/</span> is intentionally reserved for the design implementation phase.</p>",
    "<div class='card' data-testid='erp-placeholder-contracts'>",
    "<h2>Reserved frontend mount</h2>",
    "<ul>",
    `<li><a href='${clawApiPath("app/frontend-contract")}'>Frontend contract</a></li>`,
    `<li><a href='${clawApiPath("app/screens")}'>Screen definitions</a></li>`,
    `<li><a href='${clawApiPath("app/forms/sales.quote.create")}'>Form schema example</a></li>`,
    "<li><a href='/docs/frontend-checklist.md'>Frontend checklist</a></li>",
    "<li><a href='/docs/api-openapi.json'>OpenAPI</a></li>",
    "</ul>",
    "</div>",
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return (request.body ?? {}) as Record<string, unknown>;
}

function parseBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

class RealtimeHub {
  private readonly sseClients = new Set<FastifyReply>();
  private readonly wsClients = new Set<import("ws").WebSocket>();

  attachSse(reply: FastifyReply): void {
    this.sseClients.add(reply);
    reply.raw.on("close", () => {
      this.sseClients.delete(reply);
    });
  }

  attachSocket(socket: import("ws").WebSocket): void {
    this.wsClients.add(socket);
    socket.on("close", () => {
      this.wsClients.delete(socket);
    });
  }

  broadcast(event: ErpRealtimeEvent): void {
    const data = JSON.stringify(event);
    for (const reply of this.sseClients) {
      reply.raw.write(`event: ${event.type}\ndata: ${data}\n\n`);
    }
    for (const socket of this.wsClients) {
      if (socket.readyState === socket.OPEN) socket.send(data);
    }
  }
}

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: ErpAuthService,
): Promise<{ adminId: string; email: string } | null> {
  const token = parseBearerToken(request);
  if (!token) {
    await reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  const principal = await auth.verifyAdminToken(token);
  if (!principal) {
    await reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  return principal;
}

function routeError(reply: FastifyReply, error: unknown): void {
  const correlationId = `corr_${randomUUID().slice(0, 8)}`;
  const envelope = errorEnvelope(error, correlationId);
  const statusCode = error instanceof ErpError ? error.statusCode : 500;
  void reply.code(statusCode).send(envelope);
}

export interface BuildErpAppOptions {
  config?: Partial<ErpServiceConfig>;
}

export function buildErpApp(options: BuildErpAppOptions = {}) {
  const config = loadErpConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false });
  const auth = new ErpAuthService(config.jwtSecret);
  const realtime = new RealtimeHub();
  const store = new ErpStore(config.dbPath, {
    adminEmail: config.adminEmail,
    adminPassword: config.adminPassword,
    onEvent: (event) => realtime.broadcast(event),
  });
  const uiRoot = resolveUiRoot();
  const docsRoot = resolveDocsRoot();
  const brandRoot = resolveBrandRoot();

  app.addHook("onClose", async () => {
    store.close();
  });

  app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  });

  if (uiRoot) {
    app.register(fastifyStatic, {
      root: uiRoot,
      prefix: "/",
      wildcard: false,
      index: false,
    });
  }
  app.register(fastifyStatic, {
    root: docsRoot,
    prefix: "/docs/",
    decorateReply: false,
  });
  app.register(fastifyStatic, {
    root: brandRoot,
    prefix: "/brand/",
    decorateReply: false,
  });
  app.register(async (wsApp) => {
    await wsApp.register(websocket);
    wsApp.get(clawApiPath("events/ws"), { websocket: true }, async (socket) => {
      realtime.attachSocket(socket);
      socket.send(JSON.stringify({ type: "ready", at: new Date().toISOString() }));
    });
  });

  app.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    if (uiRoot) {
      return fs.readFileSync(path.join(uiRoot, "index.html"), "utf8");
    }
    return placeholderHtml();
  });

  app.get("/favicon.ico", async (_request, reply) => {
    await reply.code(204).send();
  });

  app.get(clawApiPath("health"), async () => ({
    ok: true,
    service: "erp",
    host: config.host,
    port: config.port,
  }));

  app.post(clawApiPath("auth/admin/login"), async (request, reply) => {
    const body = readBody(request);
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    const admin = store.verifyAdmin(email, password);
    if (!admin) {
      await reply.code(401).send({ error: "Invalid email or password." });
      return;
    }
    const accessToken = await auth.issueAdminToken({
      adminId: admin.id,
      email: admin.email,
    });
    await reply.send({ accessToken });
  });

  app.get(clawApiPath("events/stream"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return reply;
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ adminId: principal.adminId })}\n\n`);
    realtime.attachSse(reply);
    return reply;
  });

  app.get(clawApiPath("tenants"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      await reply.send({ tenants: store.listTenants() });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("tenants/bootstrap"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const body = readBody(request);
      await reply.send(store.bootstrapTenant({
        name: String(body.name ?? ""),
        slug: typeof body.slug === "string" ? body.slug : undefined,
        localizationKey: typeof body.localizationKey === "string" ? body.localizationKey : undefined,
        baseCurrency: typeof body.baseCurrency === "string" ? body.baseCurrency : undefined,
        legalEntityName: typeof body.legalEntityName === "string" ? body.legalEntityName : undefined,
      }));
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("tenants/:tenantId/legal-entities"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId } = request.params as { tenantId: string };
      await reply.send({ legalEntities: store.listLegalEntities(tenantId) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/localizations/install"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      const body = readBody(request);
      await reply.send({
        job: store.installLocalizationPack({
          tenantId,
          legalEntityId,
          packKey: String(body.packKey ?? "es_eu"),
          actorId: principal.adminId,
        }),
      });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/accounts"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      await reply.send({ accounts: store.listAccounts(tenantId, legalEntityId) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/periods"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      await reply.send({ periods: store.listPeriods(tenantId, legalEntityId) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/periods/:periodId/close"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId, periodId } = request.params as { tenantId: string; legalEntityId: string; periodId: string };
      await reply.send({
        period: store.closePeriod({ tenantId, legalEntityId, periodId, actorId: principal.adminId }),
      });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/gl/entries"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      await reply.send({ entries: store.listEntries(tenantId, legalEntityId) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/gl/entries/:entryId/reverse"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId, entryId } = request.params as { tenantId: string; legalEntityId: string; entryId: string };
      await reply.send({ entry: store.reverseEntry({ tenantId, legalEntityId, entryId, actorId: principal.adminId }) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/items"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      const body = readBody(request);
      await reply.send({
        item: store.createItem({
          tenantId,
          legalEntityId,
          sku: String(body.sku ?? ""),
          name: String(body.name ?? ""),
          kind: body.kind === "service" ? "service" : "stock",
        }),
      });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/inventory/balances"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      await reply.send({ balances: store.listInventoryBalances(tenantId, legalEntityId) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  const documentPost = (
    route: string,
    handler: (params: { tenantId: string; legalEntityId: string }, body: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    app.post(route, async (request, reply) => {
      const principal = await requireAdmin(request, reply, auth);
      if (!principal) return;
      try {
        const params = request.params as { tenantId: string; legalEntityId: string };
        await reply.send(handler(params, readBody(request)));
      } catch (error) {
        routeError(reply, error);
      }
    });
  };

  documentPost(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/sales/quotes"), (params, body) => ({
    quote: store.createSalesQuote({
      ...params,
      branchId: String(body.branchId ?? ""),
      customerName: String(body.customerName ?? ""),
      currency: String(body.currency ?? "EUR"),
      totalAmountCents: Number(body.totalAmountCents ?? 0),
      itemSku: typeof body.itemSku === "string" ? body.itemSku : undefined,
      quantity: typeof body.quantity === "number" ? body.quantity : undefined,
    }),
  }));

  documentPost(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/sales/shipments"), (params, body) => ({
    shipment: store.postShipment({
      ...params,
      branchId: String(body.branchId ?? ""),
      warehouseId: String(body.warehouseId ?? ""),
      customerName: String(body.customerName ?? ""),
      itemSku: String(body.itemSku ?? ""),
      quantity: Number(body.quantity ?? 0),
      unitCostCents: Number(body.unitCostCents ?? 0),
    }),
  }));

  documentPost(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/ar/invoices"), (params, body) => ({
    invoice: store.postCustomerInvoice({
      ...params,
      branchId: String(body.branchId ?? ""),
      customerName: String(body.customerName ?? ""),
      currency: String(body.currency ?? "EUR"),
      totalAmountCents: Number(body.totalAmountCents ?? 0),
      description: typeof body.description === "string" ? body.description : undefined,
    }),
  }));

  documentPost(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/ar/payments"), (params, body) => ({
    payment: store.registerCustomerPayment({
      ...params,
      branchId: String(body.branchId ?? ""),
      customerName: String(body.customerName ?? ""),
      currency: String(body.currency ?? "EUR"),
      totalAmountCents: Number(body.totalAmountCents ?? 0),
    }),
  }));

  documentPost(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/purchase/orders"), (params, body) => ({
    order: store.createPurchaseOrder({
      ...params,
      branchId: String(body.branchId ?? ""),
      vendorName: String(body.vendorName ?? ""),
      currency: String(body.currency ?? "EUR"),
      totalAmountCents: Number(body.totalAmountCents ?? 0),
      itemSku: typeof body.itemSku === "string" ? body.itemSku : undefined,
      quantity: typeof body.quantity === "number" ? body.quantity : undefined,
    }),
  }));

  documentPost(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/purchase/receipts"), (params, body) => ({
    receipt: store.postReceipt({
      ...params,
      branchId: String(body.branchId ?? ""),
      warehouseId: String(body.warehouseId ?? ""),
      vendorName: String(body.vendorName ?? ""),
      itemSku: String(body.itemSku ?? ""),
      quantity: Number(body.quantity ?? 0),
      unitCostCents: Number(body.unitCostCents ?? 0),
    }),
  }));

  documentPost(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/ap/bills"), (params, body) => ({
    bill: store.postVendorBill({
      ...params,
      branchId: String(body.branchId ?? ""),
      vendorName: String(body.vendorName ?? ""),
      currency: String(body.currency ?? "EUR"),
      totalAmountCents: Number(body.totalAmountCents ?? 0),
    }),
  }));

  documentPost(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/ap/payments"), (params, body) => ({
    payment: store.registerVendorPayment({
      ...params,
      branchId: String(body.branchId ?? ""),
      vendorName: String(body.vendorName ?? ""),
      currency: String(body.currency ?? "EUR"),
      totalAmountCents: Number(body.totalAmountCents ?? 0),
    }),
  }));

  documentPost(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/projects"), (params, body) => ({
    project: store.createProject({
      ...params,
      name: String(body.name ?? ""),
    }),
  }));

  documentPost(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/employees"), (params, body) => ({
    employee: store.createEmployee({
      ...params,
      displayName: String(body.displayName ?? ""),
    }),
  }));

  app.get(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/employees"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      await reply.send({ employees: store.listEmployees(tenantId, legalEntityId) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/sales/quotes/:quoteId/confirm-order"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId, quoteId } = request.params as { tenantId: string; legalEntityId: string; quoteId: string };
      await reply.send({ order: store.confirmSalesOrder({ tenantId, legalEntityId, quoteId }) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/projects/:projectId/timesheets/invoice"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId, projectId } = request.params as { tenantId: string; legalEntityId: string; projectId: string };
      const body = readBody(request);
      await reply.send({
        invoice: store.invoiceProjectTimesheet({
          tenantId,
          legalEntityId,
          projectId,
          branchId: String(body.branchId ?? ""),
          customerName: String(body.customerName ?? ""),
          hours: Number(body.hours ?? 0),
          rateCents: Number(body.rateCents ?? 0),
        }),
      });
    } catch (error) {
      routeError(reply, error);
    }
  });

  documentPost(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/payroll/runs"), (params, body) => ({
    run: store.createPayrollRun({
      ...params,
      branchId: String(body.branchId ?? ""),
      employeeId: String(body.employeeId ?? ""),
      grossAmountCents: Number(body.grossAmountCents ?? 0),
    }),
  }));

  app.post(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/payroll/runs/:runId/post"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId, runId } = request.params as { tenantId: string; legalEntityId: string; runId: string };
      await reply.send({ run: store.postPayrollRun({ tenantId, legalEntityId, runId }) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  documentPost(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/mrp/orders"), (params, body) => ({
    order: store.createProductionOrder({
      ...params,
      branchId: String(body.branchId ?? ""),
      warehouseId: String(body.warehouseId ?? ""),
      outputSku: String(body.outputSku ?? ""),
      inputSku: String(body.inputSku ?? ""),
      inputQuantity: Number(body.inputQuantity ?? 0),
      outputQuantity: Number(body.outputQuantity ?? 0),
      unitCostCents: Number(body.unitCostCents ?? 0),
    }),
  }));

  app.post(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/mrp/orders/:orderId/post"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId, orderId } = request.params as { tenantId: string; legalEntityId: string; orderId: string };
      await reply.send({ order: store.postProductionOrder({ tenantId, legalEntityId, orderId }) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  documentPost(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/support/tickets"), (params, body) => ({
    ticket: store.createSupportTicket({
      ...params,
      branchId: String(body.branchId ?? ""),
      customerName: String(body.customerName ?? ""),
      title: String(body.title ?? ""),
    }),
  }));

  documentPost(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/agents/actions"), (params, body) => ({
    approval: store.requestAgentAction({
      ...params,
      requestedBy: String(body.requestedBy ?? "agent:unknown"),
      actionType: String(body.actionType ?? "regulated_action"),
      amountCents: Number(body.amountCents ?? 0),
      currency: String(body.currency ?? "EUR"),
    }),
  }));

  app.get(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/approvals"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      await reply.send({ approvals: store.listApprovals(tenantId, legalEntityId) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.post(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/approvals/:approvalId/approve"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId, approvalId } = request.params as { tenantId: string; legalEntityId: string; approvalId: string };
      await reply.send({ approval: store.approveAction({ tenantId, legalEntityId, approvalId, decidedBy: principal.adminId }) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/audit"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      await reply.send({ audit: store.listAudit(tenantId, legalEntityId) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/branches"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      await reply.send({ branches: store.listBranches(tenantId, legalEntityId) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/warehouses"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      await reply.send({ warehouses: store.listWarehouses(tenantId, legalEntityId) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/items"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      await reply.send({ items: store.listItems(tenantId, legalEntityId) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/projects"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      await reply.send({ projects: store.listProjects(tenantId, legalEntityId) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/jobs"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      await reply.send({ jobs: store.listJobs(tenantId, legalEntityId) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/documents"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId } = request.params as { tenantId: string; legalEntityId: string };
      const query = request.query as { kind?: string };
      let documents = store.listDocuments(tenantId, legalEntityId);
      if (query.kind) {
        documents = documents.filter((doc) => doc.kind === query.kind);
      }
      await reply.send({ documents });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("tenants/:tenantId/legal-entities/:legalEntityId/documents/:documentId"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const { tenantId, legalEntityId, documentId } = request.params as { tenantId: string; legalEntityId: string; documentId: string };
      await reply.send({ document: store.getDocumentDetail(tenantId, legalEntityId, documentId) });
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("app/frontend-contract"), async (_request, reply) => {
    await reply.send(frontendContract);
  });

  app.get(clawApiPath("app/screens"), async (_request, reply) => {
    await reply.send({ screens: frontendContract.screens });
  });

  app.get(clawApiPath("app/forms/:formId"), async (request, reply) => {
    try {
      const { formId } = request.params as { formId: string };
      const schema = staticFormSchemas[formId];
      if (!schema) throw new ErpError("form_not_found", `Form ${formId} not found.`, 404);
      await reply.send(schema);
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("app/meta"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const query = request.query as { tenantId?: string; legalEntityId?: string };
      await reply.send(store.getFrontendMeta(query.tenantId, query.legalEntityId));
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("app/dashboard"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const query = request.query as { tenantId: string; legalEntityId: string };
      await reply.send(store.getDashboard(query.tenantId, query.legalEntityId));
    } catch (error) {
      routeError(reply, error);
    }
  });

  app.get(clawApiPath("app/documents/:documentId"), async (request, reply) => {
    const principal = await requireAdmin(request, reply, auth);
    if (!principal) return;
    try {
      const query = request.query as { tenantId: string; legalEntityId: string };
      const { documentId } = request.params as { documentId: string };
      await reply.send(store.getDocumentDetail(query.tenantId, query.legalEntityId, documentId));
    } catch (error) {
      routeError(reply, error);
    }
  });

  // SPA fallback: serve index.html for non-API routes so client-side routing works.
  // Required because the SPA uses history-based routing (/dashboard, /sales/quotes, etc.).
  app.setNotFoundHandler(async (request, reply) => {
    if (request.method === "GET" && !request.url.startsWith("/v1/") && !request.url.startsWith("/docs/") && !request.url.startsWith("/brand/")) {
      reply.type("text/html; charset=utf-8");
      if (uiRoot) {
        return fs.readFileSync(path.join(uiRoot, "index.html"), "utf8");
      }
      return placeholderHtml();
    }
    await reply.code(404).send({ error: "Not found" });
  });

  return { app, store, auth, config };
}
