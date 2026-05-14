import { clawApiPath } from "@clawjs/core";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { startErpServer } from "./helpers.ts";

const servers: Array<Awaited<ReturnType<typeof startErpServer>>> = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await server.close();
  }
});

async function boot() {
  const server = await startErpServer("erp-backend");
  servers.push(server);
  return server;
}

async function login(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@erp.local", password: "erp-admin" }),
  });
  const payload = await response.json() as { accessToken: string };
  return payload.accessToken;
}

async function requestJson(baseUrl: string, token: string, path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body !== undefined && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  const payload = await response.json();
  return { response, payload };
}

test("erp backend covers bootstrap, flows, app read models, approvals, audit, and multi-tenant isolation", async () => {
  const server = await boot();
  const token = await login(server.baseUrl);

  const bootstrapA = await requestJson(server.baseUrl, token, clawApiPath("tenants/bootstrap"), {
    method: "POST",
    body: JSON.stringify({ name: "Acme ERP", localizationKey: "es_eu" }),
  });
  const tenantA = bootstrapA.payload as {
    tenant: { id: string };
    legalEntity: { id: string };
    branch: { id: string };
    warehouse: { id: string };
    period: { id: string };
  };
  const bootstrapB = await requestJson(server.baseUrl, token, clawApiPath("tenants/bootstrap"), {
    method: "POST",
    body: JSON.stringify({ name: "Bravo ERP", localizationKey: "us" }),
  });
  const tenantB = bootstrapB.payload as { tenant: { id: string } };

  const tenants = await requestJson(server.baseUrl, token, clawApiPath("tenants"));
  assert.equal((tenants.payload as { tenants: Array<{ id: string }> }).tenants.length, 2);
  assert.notEqual(tenantA.tenant.id, tenantB.tenant.id);

  const localization = await requestJson(
    server.baseUrl,
    token,
    clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/localizations/install`),
    {
      method: "POST",
      body: JSON.stringify({ packKey: "us" }),
    },
  );
  assert.equal((localization.payload as { job: { status: string } }).job.status, "completed");

  await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/items`), {
    method: "POST",
    body: JSON.stringify({ sku: "RAW-1", name: "Raw material" }),
  });
  await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/items`), {
    method: "POST",
    body: JSON.stringify({ sku: "FG-1", name: "Finished good" }),
  });

  const quote = await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/sales/quotes`), {
    method: "POST",
    body: JSON.stringify({
      branchId: tenantA.branch.id,
      customerName: "Customer One",
      currency: "EUR",
      totalAmountCents: 100000,
      itemSku: "FG-1",
      quantity: 5,
    }),
  });
  const quoteId = (quote.payload as { quote: { id: string } }).quote.id;
  const order = await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/sales/quotes/${quoteId}/confirm-order`), {
    method: "POST",
  });
  assert.equal((order.payload as { order: { kind: string; status: string } }).order.kind, "sales_order");
  assert.equal((order.payload as { order: { status: string } }).order.status, "confirmed");

  await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/purchase/receipts`), {
    method: "POST",
    body: JSON.stringify({
      branchId: tenantA.branch.id,
      warehouseId: tenantA.warehouse.id,
      vendorName: "Vendor One",
      itemSku: "RAW-1",
      quantity: 10,
      unitCostCents: 5000,
    }),
  });
  await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/ap/bills`), {
    method: "POST",
    body: JSON.stringify({
      branchId: tenantA.branch.id,
      vendorName: "Vendor One",
      currency: "EUR",
      totalAmountCents: 50000,
    }),
  });
  await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/ap/payments`), {
    method: "POST",
    body: JSON.stringify({
      branchId: tenantA.branch.id,
      vendorName: "Vendor One",
      currency: "EUR",
      totalAmountCents: 50000,
    }),
  });

  const productionOrder = await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/mrp/orders`), {
    method: "POST",
    body: JSON.stringify({
      branchId: tenantA.branch.id,
      warehouseId: tenantA.warehouse.id,
      outputSku: "FG-1",
      inputSku: "RAW-1",
      inputQuantity: 4,
      outputQuantity: 2,
      unitCostCents: 5000,
    }),
  });
  const productionOrderId = (productionOrder.payload as { order: { id: string } }).order.id;
  const postedProduction = await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/mrp/orders/${productionOrderId}/post`), {
    method: "POST",
  });
  assert.equal((postedProduction.payload as { order: { status: string } }).order.status, "posted");

  await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/sales/shipments`), {
    method: "POST",
    body: JSON.stringify({
      branchId: tenantA.branch.id,
      warehouseId: tenantA.warehouse.id,
      customerName: "Customer One",
      itemSku: "FG-1",
      quantity: 1,
      unitCostCents: 5000,
    }),
  });
  await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/ar/invoices`), {
    method: "POST",
    body: JSON.stringify({
      branchId: tenantA.branch.id,
      customerName: "Customer One",
      currency: "EUR",
      totalAmountCents: 100000,
    }),
  });
  await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/ar/payments`), {
    method: "POST",
    body: JSON.stringify({
      branchId: tenantA.branch.id,
      customerName: "Customer One",
      currency: "EUR",
      totalAmountCents: 100000,
    }),
  });

  const project = await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/projects`), {
    method: "POST",
    body: JSON.stringify({ name: "Implementation Project" }),
  });
  const projectId = (project.payload as { project: { id: string } }).project.id;
  await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/projects/${projectId}/timesheets/invoice`), {
    method: "POST",
    body: JSON.stringify({
      branchId: tenantA.branch.id,
      customerName: "Customer Consulting",
      hours: 8,
      rateCents: 15000,
    }),
  });

  const employee = await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/employees`), {
    method: "POST",
    body: JSON.stringify({ displayName: "Ada Lovelace" }),
  });
  const employeeId = (employee.payload as { employee: { id: string } }).employee.id;
  const payrollRun = await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/payroll/runs`), {
    method: "POST",
    body: JSON.stringify({
      branchId: tenantA.branch.id,
      employeeId,
      grossAmountCents: 250000,
    }),
  });
  const payrollRunId = (payrollRun.payload as { run: { id: string } }).run.id;
  await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/payroll/runs/${payrollRunId}/post`), {
    method: "POST",
  });

  const entries = await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/gl/entries`));
  const entryList = (entries.payload as { entries: Array<{ id: string; totalDebitCents: number; totalCreditCents: number }> }).entries;
  assert.ok(entryList.length >= 7);
  assert.ok(entryList.every((entry) => entry.totalDebitCents === entry.totalCreditCents));

  const reversed = await requestJson(
    server.baseUrl,
    token,
    clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/gl/entries/${entryList[0]!.id}/reverse`),
    { method: "POST" },
  );
  assert.ok((reversed.payload as { entry: { reversedFromEntryId?: string | null } }).entry.reversedFromEntryId);

  const approvalRequest = await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/agents/actions`), {
    method: "POST",
    body: JSON.stringify({
      requestedBy: "agent:treasury-bot",
      actionType: "payment_release",
      amountCents: 50000,
      currency: "EUR",
    }),
  });
  const approvalId = (approvalRequest.payload as { approval: { id: string } }).approval.id;
  const approvals = await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/approvals`));
  assert.equal((approvals.payload as { approvals: Array<{ status: string }> }).approvals[0]?.status, "pending");
  const approved = await requestJson(
    server.baseUrl,
    token,
    clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/approvals/${approvalId}/approve`),
    { method: "POST" },
  );
  assert.equal((approved.payload as { approval: { status: string } }).approval.status, "executed");

  const balances = await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/inventory/balances`));
  const rawBalance = (balances.payload as { balances: Array<{ itemSku: string; onHandQty: number }> }).balances.find((item) => item.itemSku === "RAW-1");
  const fgBalance = (balances.payload as { balances: Array<{ itemSku: string; onHandQty: number }> }).balances.find((item) => item.itemSku === "FG-1");
  assert.equal(rawBalance?.onHandQty, 6);
  assert.equal(fgBalance?.onHandQty, 1);

  const dashboard = await requestJson(
    server.baseUrl,
    token,
    clawApiPath(`app/dashboard?tenantId=${tenantA.tenant.id}&legalEntityId=${tenantA.legalEntity.id}`),
  );
  const dashboardPayload = dashboard.payload as { metrics: { revenueCents: number; payrollCalendarItems: number } };
  assert.ok(dashboardPayload.metrics.revenueCents >= 220000);
  assert.equal(dashboardPayload.metrics.payrollCalendarItems, 1);

  const meta = await requestJson(
    server.baseUrl,
    token,
    clawApiPath(`app/meta?tenantId=${tenantA.tenant.id}&legalEntityId=${tenantA.legalEntity.id}`),
  );
  assert.equal((meta.payload as { navigation: string[] }).navigation.includes("finance"), true);

  const frontendContract = await fetch(`${server.baseUrl}/v1/app/frontend-contract`).then((res) => res.json()) as { version: string };
  assert.equal(frontendContract.version, "1.0.0");
  const formSchema = await fetch(`${server.baseUrl}/v1/app/forms/sales.quote.create`).then((res) => res.json()) as { id: string };
  assert.equal(formSchema.id, "sales.quote.create");

  const documents = await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/documents`));
  const documentId = (documents.payload as { documents: Array<{ id: string }> }).documents[0]!.id;
  const detail = await requestJson(
    server.baseUrl,
    token,
    clawApiPath(`app/documents/${documentId}?tenantId=${tenantA.tenant.id}&legalEntityId=${tenantA.legalEntity.id}`),
  );
  assert.ok((detail.payload as { tabs: string[] }).tabs.includes("audit"));

  const audit = await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/audit`));
  assert.ok((audit.payload as { audit: Array<{ action: string }> }).audit.some((event) => event.action === "approval.approve"));

  await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/periods/${tenantA.period.id}/close`), {
    method: "POST",
  });
  const blockedInvoice = await requestJson(server.baseUrl, token, clawApiPath(`tenants/${tenantA.tenant.id}/legal-entities/${tenantA.legalEntity.id}/ar/invoices`), {
    method: "POST",
    body: JSON.stringify({
      branchId: tenantA.branch.id,
      customerName: "Blocked Customer",
      currency: "EUR",
      totalAmountCents: 1000,
    }),
  });
  assert.equal(blockedInvoice.response.status, 409);
  assert.equal((blockedInvoice.payload as { code: string }).code, "period_closed");
});
