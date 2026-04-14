import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import { ErpError } from "../shared/errors.ts";
import type { ErpRealtimeEvent } from "../shared/events.ts";
import type {
  AccountRecord,
  ApprovalRecord,
  AuditRecord,
  BranchRecord,
  DocumentRecord,
  EmployeeRecord,
  FiscalPeriodRecord,
  InventoryBalanceRecord,
  ItemRecord,
  JobRecord,
  JournalEntryRecord,
  JournalLineRecord,
  LegalEntityRecord,
  ProjectRecord,
  TenantRecord,
  WarehouseRecord,
} from "../shared/types.ts";

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || randomUUID().slice(0, 8);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function padCounter(value: number): string {
  return String(value).padStart(4, "0");
}

type LedgerLineSpec = {
  accountCode: string;
  side: "debit" | "credit";
  amountCents: number;
  dimensions?: Record<string, unknown>;
};

type TransactionDatabase = Database.Database;

const DEFAULT_ACCOUNTS: Array<{ code: string; name: string; category: AccountRecord["category"] }> = [
  { code: "1000", name: "Cash", category: "asset" },
  { code: "1100", name: "Accounts Receivable", category: "asset" },
  { code: "1300", name: "Inventory", category: "asset" },
  { code: "1400", name: "Work In Progress", category: "asset" },
  { code: "2000", name: "Accounts Payable", category: "liability" },
  { code: "2100", name: "Payroll Payable", category: "liability" },
  { code: "2300", name: "Accrued Purchases", category: "liability" },
  { code: "4000", name: "Revenue", category: "revenue" },
  { code: "5000", name: "Cost of Goods Sold", category: "expense" },
  { code: "5100", name: "Payroll Expense", category: "expense" },
];

export interface ErpStoreOptions {
  onEvent?: (event: ErpRealtimeEvent) => void;
  adminEmail: string;
  adminPassword: string;
}

export class ErpStore {
  private readonly db: Database.Database;
  private readonly onEvent?: (event: ErpRealtimeEvent) => void;

  constructor(dbPath: string, options: ErpStoreOptions) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.onEvent = options.onEvent;
    this.migrate();
    this.seedAdmin(options.adminEmail, options.adminPassword);
  }

  close(): void {
    this.db.close();
  }

  verifyAdmin(email: string, password: string): { id: string; email: string } | null {
    const row = this.db
      .prepare("SELECT id, email, password FROM admins WHERE email = ?")
      .get(email) as { id: string; email: string; password: string } | undefined;
    if (!row || row.password !== password) return null;
    return { id: row.id, email: row.email };
  }

  listTenants(): TenantRecord[] {
    return this.db.prepare("SELECT * FROM tenants ORDER BY created_at ASC").all().map((row) => this.serializeTenant(row));
  }

  listLegalEntities(tenantId: string): LegalEntityRecord[] {
    return this.db.prepare("SELECT * FROM legal_entities WHERE tenant_id = ? ORDER BY created_at ASC").all(tenantId).map((row) => this.serializeLegalEntity(row));
  }

  listApprovals(tenantId: string, legalEntityId: string): ApprovalRecord[] {
    return this.db
      .prepare("SELECT * FROM approvals WHERE tenant_id = ? AND legal_entity_id = ? ORDER BY created_at DESC")
      .all(tenantId, legalEntityId)
      .map((row) => this.serializeApproval(row));
  }

  listAudit(tenantId: string, legalEntityId: string): AuditRecord[] {
    return this.db
      .prepare("SELECT * FROM audit_events WHERE tenant_id = ? AND legal_entity_id = ? ORDER BY created_at DESC")
      .all(tenantId, legalEntityId)
      .map((row) => this.serializeAudit(row));
  }

  listAccounts(tenantId: string, legalEntityId: string): AccountRecord[] {
    return this.db
      .prepare("SELECT * FROM accounts WHERE tenant_id = ? AND legal_entity_id = ? ORDER BY code ASC")
      .all(tenantId, legalEntityId)
      .map((row) => this.serializeAccount(row));
  }

  listPeriods(tenantId: string, legalEntityId: string): FiscalPeriodRecord[] {
    return this.db
      .prepare("SELECT * FROM fiscal_periods WHERE tenant_id = ? AND legal_entity_id = ? ORDER BY starts_on ASC")
      .all(tenantId, legalEntityId)
      .map((row) => this.serializePeriod(row));
  }

  listEntries(tenantId: string, legalEntityId: string): Array<JournalEntryRecord & { lines: JournalLineRecord[] }> {
    return this.db
      .prepare("SELECT * FROM journal_entries WHERE tenant_id = ? AND legal_entity_id = ? ORDER BY created_at ASC")
      .all(tenantId, legalEntityId)
      .map((row) => ({
        ...this.serializeEntry(row),
        lines: this.db.prepare("SELECT * FROM journal_lines WHERE entry_id = ? ORDER BY id ASC").all(row.id).map((line) => this.serializeLine(line)),
      }));
  }

  listDocuments(tenantId: string, legalEntityId: string): DocumentRecord[] {
    return this.db
      .prepare("SELECT * FROM documents WHERE tenant_id = ? AND legal_entity_id = ? ORDER BY created_at ASC")
      .all(tenantId, legalEntityId)
      .map((row) => this.serializeDocument(row));
  }

  listInventoryBalances(tenantId: string, legalEntityId: string): InventoryBalanceRecord[] {
    return this.db
      .prepare("SELECT * FROM inventory_balances WHERE tenant_id = ? AND legal_entity_id = ? ORDER BY item_sku ASC")
      .all(tenantId, legalEntityId)
      .map((row) => this.serializeInventory(row));
  }

  bootstrapTenant(input: {
    name: string;
    slug?: string;
    localizationKey?: string;
    baseCurrency?: string;
    legalEntityName?: string;
    branchName?: string;
    warehouseName?: string;
  }): {
    tenant: TenantRecord;
    legalEntity: LegalEntityRecord;
    branch: BranchRecord;
    warehouse: WarehouseRecord;
    period: FiscalPeriodRecord;
  } {
    const tx = this.db.transaction(() => {
      const createdAt = nowIso();
      const tenantId = `tenant_${randomUUID().slice(0, 8)}`;
      const legalEntityId = `entity_${randomUUID().slice(0, 8)}`;
      const branchId = `branch_${randomUUID().slice(0, 8)}`;
      const warehouseId = `warehouse_${randomUUID().slice(0, 8)}`;
      const periodId = `period_${randomUUID().slice(0, 8)}`;
      const slug = input.slug?.trim() || slugify(input.name);
      const localizationKey = input.localizationKey?.trim() || "es_eu";
      const baseCurrency = input.baseCurrency?.trim() || (localizationKey === "us" ? "USD" : "EUR");

      this.db.prepare(
        "INSERT INTO tenants (id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      ).run(tenantId, slug, input.name.trim(), createdAt, createdAt);

      this.db.prepare(
        "INSERT INTO legal_entities (id, tenant_id, code, name, base_currency, localization_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        legalEntityId,
        tenantId,
        slug.toUpperCase().slice(0, 6) || "MAIN",
        input.legalEntityName?.trim() || input.name.trim(),
        baseCurrency,
        localizationKey,
        createdAt,
        createdAt,
      );

      this.db.prepare(
        "INSERT INTO branches (id, tenant_id, legal_entity_id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(branchId, tenantId, legalEntityId, "HQ", input.branchName?.trim() || "Headquarters", createdAt, createdAt);

      this.db.prepare(
        "INSERT INTO warehouses (id, tenant_id, legal_entity_id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(warehouseId, tenantId, legalEntityId, "MAIN", input.warehouseName?.trim() || "Main Warehouse", createdAt, createdAt);

      this.db.prepare(
        "INSERT INTO fiscal_periods (id, tenant_id, legal_entity_id, code, starts_on, ends_on, status, closed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', NULL, ?, ?)",
      ).run(periodId, tenantId, legalEntityId, "FY-2026", "2026-01-01", "2026-12-31", createdAt, createdAt);

      for (const account of DEFAULT_ACCOUNTS) {
        this.db.prepare(
          "INSERT INTO accounts (tenant_id, legal_entity_id, code, name, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run(tenantId, legalEntityId, account.code, account.name, account.category, createdAt, createdAt);
      }

      this.installLocalizationPackInternal(this.db, {
        tenantId,
        legalEntityId,
        packKey: localizationKey,
        version: "1.0.0",
        actorId: "system",
      });

      this.auditInternal(this.db, {
        tenantId,
        legalEntityId,
        actorType: "admin",
        actorId: "bootstrap",
        action: "tenant.bootstrap",
        entityType: "tenant",
        entityId: tenantId,
        payload: { localizationKey, baseCurrency },
      });

      return {
        tenant: this.getTenant(tenantId),
        legalEntity: this.getLegalEntity(legalEntityId),
        branch: this.getBranch(branchId),
        warehouse: this.getWarehouse(warehouseId),
        period: this.getPeriod(periodId),
      };
    });

    const result = tx();
    this.emit({
      type: "tenant.bootstrapped",
      tenantId: result.tenant.id,
      legalEntityId: result.legalEntity.id,
      entityType: "tenant",
      entityId: result.tenant.id,
      payload: { slug: result.tenant.slug },
      at: nowIso(),
    });
    return result;
  }

  installLocalizationPack(input: {
    tenantId: string;
    legalEntityId: string;
    packKey: string;
    actorId: string;
  }): JobRecord {
    const tx = this.db.transaction(() => {
      this.assertEntityScope(input.tenantId, input.legalEntityId);
      const createdAt = nowIso();
      const jobId = `job_${randomUUID().slice(0, 8)}`;
      this.db.prepare(
        "INSERT INTO jobs (id, tenant_id, legal_entity_id, kind, status, progress_percent, message, result_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        jobId,
        input.tenantId,
        input.legalEntityId,
        "localization.install",
        "running",
        20,
        `Installing localization pack ${input.packKey}`,
        null,
        createdAt,
        createdAt,
      );
      this.installLocalizationPackInternal(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        packKey: input.packKey,
        version: "1.0.0",
        actorId: input.actorId,
      });
      const finishedAt = nowIso();
      const result = { packKey: input.packKey, status: "installed" };
      this.db.prepare(
        "UPDATE jobs SET status = 'completed', progress_percent = 100, message = ?, result_json = ?, updated_at = ? WHERE id = ?",
      ).run(`Installed localization pack ${input.packKey}`, JSON.stringify(result), finishedAt, jobId);
      return this.getJob(jobId);
    });
    const job = tx();
    this.emit({
      type: "job.updated",
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      entityType: "job",
      entityId: job.id,
      payload: { status: job.status, message: job.message },
      at: nowIso(),
    });
    return job;
  }

  closePeriod(input: {
    tenantId: string;
    legalEntityId: string;
    periodId: string;
    actorId: string;
  }): FiscalPeriodRecord {
    const tx = this.db.transaction(() => {
      this.assertEntityScope(input.tenantId, input.legalEntityId);
      const period = this.getPeriod(input.periodId);
      if (period.status === "closed") return period;
      const updatedAt = nowIso();
      this.db.prepare(
        "UPDATE fiscal_periods SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?",
      ).run(updatedAt, updatedAt, input.periodId);
      this.auditInternal(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        actorType: "admin",
        actorId: input.actorId,
        action: "period.close",
        entityType: "fiscal_period",
        entityId: input.periodId,
        payload: {},
      });
      return this.getPeriod(input.periodId);
    });
    return tx();
  }

  reverseEntry(input: {
    tenantId: string;
    legalEntityId: string;
    entryId: string;
    actorId: string;
  }): JournalEntryRecord {
    const tx = this.db.transaction(() => {
      const entry = this.getEntry(input.entryId);
      if (entry.reversedFromEntryId) {
        throw new ErpError("entry_not_reversible", "This entry is already a reversal.", 409);
      }
      const lines = this.db.prepare("SELECT * FROM journal_lines WHERE entry_id = ? ORDER BY id ASC").all(entry.id).map((row) => this.serializeLine(row));
      const reversedLines = lines.map((line) => ({
        accountCode: line.accountCode,
        side: line.side === "debit" ? "credit" : "debit",
        amountCents: line.amountCents,
        dimensions: line.dimensions,
      }));
      const reversal = this.postJournalEntry(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        sourceDocumentId: entry.sourceDocumentId ?? undefined,
        kind: `${entry.kind}.reversal`,
        memo: `Reversal of ${entry.id}`,
        entryDate: nowIso().slice(0, 10),
        reversedFromEntryId: entry.id,
        lines: reversedLines,
      });
      this.auditInternal(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        actorType: "admin",
        actorId: input.actorId,
        action: "gl.entry.reverse",
        entityType: "journal_entry",
        entityId: reversal.id,
        payload: { originalEntryId: entry.id },
      });
      return reversal;
    });
    return tx();
  }

  createItem(input: {
    tenantId: string;
    legalEntityId: string;
    sku: string;
    name: string;
    kind?: "stock" | "service";
  }): ItemRecord {
    const tx = this.db.transaction(() => {
      this.assertEntityScope(input.tenantId, input.legalEntityId);
      const createdAt = nowIso();
      const id = `item_${randomUUID().slice(0, 8)}`;
      this.db.prepare(
        "INSERT INTO items (id, tenant_id, legal_entity_id, sku, name, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, input.tenantId, input.legalEntityId, input.sku, input.name, input.kind ?? "stock", createdAt, createdAt);
      this.auditInternal(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        actorType: "admin",
        actorId: "system",
        action: "inventory.item.create",
        entityType: "item",
        entityId: id,
        payload: { sku: input.sku },
      });
      return this.getItem(id);
    });
    return tx();
  }

  createEmployee(input: {
    tenantId: string;
    legalEntityId: string;
    displayName: string;
  }): EmployeeRecord {
    const tx = this.db.transaction(() => {
      this.assertEntityScope(input.tenantId, input.legalEntityId);
      const createdAt = nowIso();
      const id = `employee_${randomUUID().slice(0, 8)}`;
      const employeeNumber = this.nextNumber(this.db, input.tenantId, input.legalEntityId, "employee", "EMP");
      this.db.prepare(
        "INSERT INTO employees (id, tenant_id, legal_entity_id, employee_number, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(id, input.tenantId, input.legalEntityId, employeeNumber, input.displayName, createdAt, createdAt);
      return this.getEmployee(id);
    });
    return tx();
  }

  listEmployees(tenantId: string, legalEntityId: string): EmployeeRecord[] {
    return this.db
      .prepare("SELECT * FROM employees WHERE tenant_id = ? AND legal_entity_id = ? ORDER BY employee_number ASC")
      .all(tenantId, legalEntityId)
      .map((row) => this.serializeEmployee(row));
  }

  createProject(input: {
    tenantId: string;
    legalEntityId: string;
    name: string;
  }): ProjectRecord {
    const tx = this.db.transaction(() => {
      this.assertEntityScope(input.tenantId, input.legalEntityId);
      const createdAt = nowIso();
      const id = `project_${randomUUID().slice(0, 8)}`;
      const code = this.nextNumber(this.db, input.tenantId, input.legalEntityId, "project", "PRJ");
      this.db.prepare(
        "INSERT INTO projects (id, tenant_id, legal_entity_id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(id, input.tenantId, input.legalEntityId, code, input.name, createdAt, createdAt);
      return this.getProject(id);
    });
    return tx();
  }

  createSalesQuote(input: {
    tenantId: string;
    legalEntityId: string;
    branchId: string;
    customerName: string;
    currency: string;
    totalAmountCents: number;
    itemSku?: string;
    quantity?: number;
  }): DocumentRecord {
    return this.createDocument({
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      branchId: input.branchId,
      kind: "sales_quote",
      status: "draft",
      prefix: "QUO",
      counterpartyName: input.customerName,
      currency: input.currency,
      totalAmountCents: input.totalAmountCents,
      payload: {
        itemSku: input.itemSku ?? null,
        quantity: input.quantity ?? 1,
      },
      auditAction: "sales.quote.create",
    });
  }

  confirmSalesOrder(input: {
    tenantId: string;
    legalEntityId: string;
    quoteId: string;
  }): DocumentRecord {
    const quote = this.getDocument(input.quoteId);
    return this.createDocument({
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      branchId: quote.branchId ?? undefined,
      kind: "sales_order",
      status: "confirmed",
      prefix: "SO",
      counterpartyName: quote.counterpartyName ?? undefined,
      currency: quote.currency,
      totalAmountCents: quote.totalAmountCents,
      payload: {
        sourceQuoteId: quote.id,
        ...quote.payload,
      },
      auditAction: "sales.order.confirm",
    });
  }

  postShipment(input: {
    tenantId: string;
    legalEntityId: string;
    branchId: string;
    warehouseId: string;
    customerName: string;
    itemSku: string;
    quantity: number;
    unitCostCents: number;
  }): DocumentRecord {
    const tx = this.db.transaction(() => {
      const shipment = this.createDocumentInternal(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        branchId: input.branchId,
        kind: "shipment",
        status: "posted",
        prefix: "SHP",
        counterpartyName: input.customerName,
        currency: "EUR",
        totalAmountCents: input.quantity * input.unitCostCents,
        payload: {
          warehouseId: input.warehouseId,
          itemSku: input.itemSku,
          quantity: input.quantity,
          unitCostCents: input.unitCostCents,
        },
      });
      this.adjustInventory(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        warehouseId: input.warehouseId,
        itemSku: input.itemSku,
        deltaQty: -input.quantity,
        unitCostCents: input.unitCostCents,
      });
      this.postJournalEntry(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        sourceDocumentId: shipment.id,
        kind: "shipment.posting",
        memo: `Shipment ${shipment.number}`,
        entryDate: shipment.issuedOn,
        lines: [
          { accountCode: "5000", side: "debit", amountCents: shipment.totalAmountCents },
          { accountCode: "1300", side: "credit", amountCents: shipment.totalAmountCents },
        ],
      });
      this.auditInternal(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        actorType: "admin",
        actorId: "system",
        action: "sales.shipment.post",
        entityType: "document",
        entityId: shipment.id,
        payload: { itemSku: input.itemSku, quantity: input.quantity },
      });
      return this.getDocument(shipment.id);
    });
    return tx();
  }

  postCustomerInvoice(input: {
    tenantId: string;
    legalEntityId: string;
    branchId: string;
    customerName: string;
    currency: string;
    totalAmountCents: number;
    description?: string;
  }): DocumentRecord {
    const tx = this.db.transaction(() => {
      const invoice = this.createDocumentInternal(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        branchId: input.branchId,
        kind: "customer_invoice",
        status: "posted",
        prefix: "AR",
        counterpartyName: input.customerName,
        currency: input.currency,
        totalAmountCents: input.totalAmountCents,
        payload: { description: input.description ?? null },
      });
      this.postJournalEntry(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        sourceDocumentId: invoice.id,
        kind: "ar.invoice.posting",
        memo: `Customer invoice ${invoice.number}`,
        entryDate: invoice.issuedOn,
        lines: [
          { accountCode: "1100", side: "debit", amountCents: input.totalAmountCents },
          { accountCode: "4000", side: "credit", amountCents: input.totalAmountCents },
        ],
      });
      return this.getDocument(invoice.id);
    });
    return tx();
  }

  registerCustomerPayment(input: {
    tenantId: string;
    legalEntityId: string;
    branchId: string;
    customerName: string;
    currency: string;
    totalAmountCents: number;
  }): DocumentRecord {
    const tx = this.db.transaction(() => {
      const payment = this.createDocumentInternal(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        branchId: input.branchId,
        kind: "customer_payment",
        status: "settled",
        prefix: "CR",
        counterpartyName: input.customerName,
        currency: input.currency,
        totalAmountCents: input.totalAmountCents,
        payload: {},
      });
      this.postJournalEntry(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        sourceDocumentId: payment.id,
        kind: "ar.payment.posting",
        memo: `Customer payment ${payment.number}`,
        entryDate: payment.issuedOn,
        lines: [
          { accountCode: "1000", side: "debit", amountCents: input.totalAmountCents },
          { accountCode: "1100", side: "credit", amountCents: input.totalAmountCents },
        ],
      });
      return this.getDocument(payment.id);
    });
    return tx();
  }

  createPurchaseOrder(input: {
    tenantId: string;
    legalEntityId: string;
    branchId: string;
    vendorName: string;
    currency: string;
    totalAmountCents: number;
    itemSku?: string;
    quantity?: number;
  }): DocumentRecord {
    return this.createDocument({
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      branchId: input.branchId,
      kind: "purchase_order",
      status: "approved",
      prefix: "PO",
      counterpartyName: input.vendorName,
      currency: input.currency,
      totalAmountCents: input.totalAmountCents,
      payload: {
        itemSku: input.itemSku ?? null,
        quantity: input.quantity ?? 1,
      },
      auditAction: "purchase.order.create",
    });
  }

  postReceipt(input: {
    tenantId: string;
    legalEntityId: string;
    branchId: string;
    warehouseId: string;
    vendorName: string;
    itemSku: string;
    quantity: number;
    unitCostCents: number;
  }): DocumentRecord {
    const tx = this.db.transaction(() => {
      const receipt = this.createDocumentInternal(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        branchId: input.branchId,
        kind: "purchase_receipt",
        status: "posted",
        prefix: "GRN",
        counterpartyName: input.vendorName,
        currency: "EUR",
        totalAmountCents: input.quantity * input.unitCostCents,
        payload: {
          warehouseId: input.warehouseId,
          itemSku: input.itemSku,
          quantity: input.quantity,
          unitCostCents: input.unitCostCents,
        },
      });
      this.adjustInventory(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        warehouseId: input.warehouseId,
        itemSku: input.itemSku,
        deltaQty: input.quantity,
        unitCostCents: input.unitCostCents,
      });
      this.postJournalEntry(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        sourceDocumentId: receipt.id,
        kind: "purchase.receipt.posting",
        memo: `Purchase receipt ${receipt.number}`,
        entryDate: receipt.issuedOn,
        lines: [
          { accountCode: "1300", side: "debit", amountCents: receipt.totalAmountCents },
          { accountCode: "2300", side: "credit", amountCents: receipt.totalAmountCents },
        ],
      });
      return this.getDocument(receipt.id);
    });
    return tx();
  }

  postVendorBill(input: {
    tenantId: string;
    legalEntityId: string;
    branchId: string;
    vendorName: string;
    currency: string;
    totalAmountCents: number;
  }): DocumentRecord {
    const tx = this.db.transaction(() => {
      const bill = this.createDocumentInternal(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        branchId: input.branchId,
        kind: "vendor_bill",
        status: "posted",
        prefix: "AP",
        counterpartyName: input.vendorName,
        currency: input.currency,
        totalAmountCents: input.totalAmountCents,
        payload: {},
      });
      this.postJournalEntry(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        sourceDocumentId: bill.id,
        kind: "ap.bill.posting",
        memo: `Vendor bill ${bill.number}`,
        entryDate: bill.issuedOn,
        lines: [
          { accountCode: "2300", side: "debit", amountCents: input.totalAmountCents },
          { accountCode: "2000", side: "credit", amountCents: input.totalAmountCents },
        ],
      });
      return this.getDocument(bill.id);
    });
    return tx();
  }

  registerVendorPayment(input: {
    tenantId: string;
    legalEntityId: string;
    branchId: string;
    vendorName: string;
    currency: string;
    totalAmountCents: number;
  }): DocumentRecord {
    const tx = this.db.transaction(() => {
      const payment = this.createDocumentInternal(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        branchId: input.branchId,
        kind: "vendor_payment",
        status: "settled",
        prefix: "VP",
        counterpartyName: input.vendorName,
        currency: input.currency,
        totalAmountCents: input.totalAmountCents,
        payload: {},
      });
      this.postJournalEntry(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        sourceDocumentId: payment.id,
        kind: "ap.payment.posting",
        memo: `Vendor payment ${payment.number}`,
        entryDate: payment.issuedOn,
        lines: [
          { accountCode: "2000", side: "debit", amountCents: input.totalAmountCents },
          { accountCode: "1000", side: "credit", amountCents: input.totalAmountCents },
        ],
      });
      return this.getDocument(payment.id);
    });
    return tx();
  }

  createProductionOrder(input: {
    tenantId: string;
    legalEntityId: string;
    branchId: string;
    warehouseId: string;
    outputSku: string;
    inputSku: string;
    inputQuantity: number;
    outputQuantity: number;
    unitCostCents: number;
  }): DocumentRecord {
    return this.createDocument({
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      branchId: input.branchId,
      kind: "production_order",
      status: "approved",
      prefix: "MO",
      currency: "EUR",
      totalAmountCents: input.outputQuantity * input.unitCostCents,
      payload: input,
      auditAction: "mrp.order.create",
    });
  }

  postProductionOrder(input: {
    tenantId: string;
    legalEntityId: string;
    orderId: string;
  }): DocumentRecord {
    const tx = this.db.transaction(() => {
      const order = this.getDocument(input.orderId);
      const payload = order.payload as {
        warehouseId: string;
        outputSku: string;
        inputSku: string;
        inputQuantity: number;
        outputQuantity: number;
        unitCostCents: number;
      };
      this.adjustInventory(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        warehouseId: payload.warehouseId,
        itemSku: payload.inputSku,
        deltaQty: -payload.inputQuantity,
        unitCostCents: payload.unitCostCents,
      });
      this.adjustInventory(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        warehouseId: payload.warehouseId,
        itemSku: payload.outputSku,
        deltaQty: payload.outputQuantity,
        unitCostCents: payload.unitCostCents,
      });
      this.db.prepare("UPDATE documents SET status = 'posted', posted_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), order.id);
      this.postJournalEntry(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        sourceDocumentId: order.id,
        kind: "mrp.order.posting",
        memo: `Production order ${order.number}`,
        entryDate: nowIso().slice(0, 10),
        lines: [
          { accountCode: "1400", side: "debit", amountCents: order.totalAmountCents },
          { accountCode: "1300", side: "credit", amountCents: order.totalAmountCents },
          { accountCode: "1300", side: "debit", amountCents: order.totalAmountCents },
          { accountCode: "1400", side: "credit", amountCents: order.totalAmountCents },
        ],
      });
      return this.getDocument(order.id);
    });
    return tx();
  }

  invoiceProjectTimesheet(input: {
    tenantId: string;
    legalEntityId: string;
    projectId: string;
    branchId: string;
    customerName: string;
    hours: number;
    rateCents: number;
  }): DocumentRecord {
    const totalAmountCents = Math.round(input.hours * input.rateCents);
    return this.postCustomerInvoice({
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      branchId: input.branchId,
      customerName: input.customerName,
      currency: "EUR",
      totalAmountCents,
      description: `Timesheet invoice for ${input.projectId}`,
    });
  }

  createPayrollRun(input: {
    tenantId: string;
    legalEntityId: string;
    branchId: string;
    employeeId: string;
    grossAmountCents: number;
  }): DocumentRecord {
    return this.createDocument({
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      branchId: input.branchId,
      kind: "payroll_run",
      status: "approved",
      prefix: "PAY",
      currency: "EUR",
      totalAmountCents: input.grossAmountCents,
      payload: {
        employeeId: input.employeeId,
      },
      auditAction: "payroll.run.create",
    });
  }

  postPayrollRun(input: {
    tenantId: string;
    legalEntityId: string;
    runId: string;
  }): DocumentRecord {
    const tx = this.db.transaction(() => {
      const run = this.getDocument(input.runId);
      this.db.prepare("UPDATE documents SET status = 'posted', posted_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), run.id);
      this.postJournalEntry(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        sourceDocumentId: run.id,
        kind: "payroll.run.posting",
        memo: `Payroll ${run.number}`,
        entryDate: nowIso().slice(0, 10),
        lines: [
          { accountCode: "5100", side: "debit", amountCents: run.totalAmountCents },
          { accountCode: "2100", side: "credit", amountCents: run.totalAmountCents },
        ],
      });
      this.emit({
        type: "payroll.posted",
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        entityType: "document",
        entityId: run.id,
        payload: { number: run.number },
        at: nowIso(),
      });
      return this.getDocument(run.id);
    });
    return tx();
  }

  createSupportTicket(input: {
    tenantId: string;
    legalEntityId: string;
    branchId: string;
    customerName: string;
    title: string;
  }): DocumentRecord {
    return this.createDocument({
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      branchId: input.branchId,
      kind: "support_ticket",
      status: "draft",
      prefix: "TKT",
      counterpartyName: input.customerName,
      currency: "EUR",
      totalAmountCents: 0,
      payload: { title: input.title },
      auditAction: "support.ticket.create",
    });
  }

  requestAgentAction(input: {
    tenantId: string;
    legalEntityId: string;
    requestedBy: string;
    actionType: string;
    amountCents: number;
    currency: string;
  }): ApprovalRecord {
    const tx = this.db.transaction(() => {
      const createdAt = nowIso();
      const id = `approval_${randomUUID().slice(0, 8)}`;
      this.db.prepare(
        "INSERT INTO approvals (id, tenant_id, legal_entity_id, kind, status, requested_by, decided_by, target_type, target_id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, NULL, 'agent_action', NULL, ?, ?, ?)",
      ).run(
        id,
        input.tenantId,
        input.legalEntityId,
        input.actionType,
        input.requestedBy,
        JSON.stringify({
          amountCents: input.amountCents,
          currency: input.currency,
          requiresApproval: true,
        }),
        createdAt,
        createdAt,
      );
      this.auditInternal(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        actorType: "agent",
        actorId: input.requestedBy,
        action: "approval.request",
        entityType: "approval",
        entityId: id,
        payload: { actionType: input.actionType, amountCents: input.amountCents },
      });
      return this.getApproval(id);
    });
    const approval = tx();
    this.emit({
      type: "approval.requested",
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      entityType: "approval",
      entityId: approval.id,
      payload: approval.payload,
      at: nowIso(),
    });
    return approval;
  }

  approveAction(input: {
    tenantId: string;
    legalEntityId: string;
    approvalId: string;
    decidedBy: string;
  }): ApprovalRecord {
    const tx = this.db.transaction(() => {
      const approval = this.getApproval(input.approvalId);
      if (approval.status !== "pending") return approval;
      const updatedAt = nowIso();
      this.db.prepare("UPDATE approvals SET status = 'approved', decided_by = ?, updated_at = ? WHERE id = ?").run(input.decidedBy, updatedAt, input.approvalId);
      this.db.prepare("UPDATE approvals SET status = 'executed', updated_at = ? WHERE id = ?").run(updatedAt, input.approvalId);
      this.auditInternal(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        actorType: "admin",
        actorId: input.decidedBy,
        action: "approval.approve",
        entityType: "approval",
        entityId: input.approvalId,
        payload: {},
      });
      return this.getApproval(input.approvalId);
    });
    const approval = tx();
    this.emit({
      type: "approval.decided",
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      entityType: "approval",
      entityId: approval.id,
      payload: { status: approval.status },
      at: nowIso(),
    });
    return approval;
  }

  getDashboard(tenantId: string, legalEntityId: string): Record<string, unknown> {
    const documents = this.listDocuments(tenantId, legalEntityId);
    const entries = this.listEntries(tenantId, legalEntityId);
    const balances = this.listInventoryBalances(tenantId, legalEntityId);
    const approvals = this.listApprovals(tenantId, legalEntityId);
    const cash = this.balanceForAccount(tenantId, legalEntityId, "1000");
    const ar = this.balanceForAccount(tenantId, legalEntityId, "1100");
    const ap = this.balanceForAccount(tenantId, legalEntityId, "2000");
    const revenue = this.balanceForAccount(tenantId, legalEntityId, "4000") * -1;
    const margin = revenue - this.balanceForAccount(tenantId, legalEntityId, "5000");
    return {
      header: {
        tenantId,
        legalEntityId,
      },
      metrics: {
        cashCents: cash,
        arAgingCents: ar,
        apAgingCents: ap,
        revenueCents: revenue,
        marginCents: margin,
        overdueApprovals: approvals.filter((approval) => approval.status === "pending").length,
        inventoryAlerts: balances.filter((balance) => balance.onHandQty <= 0).length,
        productionBottlenecks: documents.filter((doc) => doc.kind === "production_order" && doc.status !== "posted").length,
        payrollCalendarItems: documents.filter((doc) => doc.kind === "payroll_run").length,
        openTickets: documents.filter((doc) => doc.kind === "support_ticket" && doc.status !== "settled").length,
      },
      feed: this.listAudit(tenantId, legalEntityId).slice(0, 10),
      cards: {
        revenueTrend: entries.filter((entry) => entry.kind.includes("invoice")).length,
        stockPositions: balances,
      },
    };
  }

  getDocumentDetail(tenantId: string, legalEntityId: string, documentId: string): Record<string, unknown> {
    const document = this.getDocument(documentId);
    const approvals = this.listApprovals(tenantId, legalEntityId).filter((approval) => approval.targetId === documentId || approval.payload.documentId === documentId);
    const audit = this.listAudit(tenantId, legalEntityId).filter((event) => event.entityId === documentId).slice(0, 20);
    return {
      header: {
        id: document.id,
        number: document.number,
        kind: document.kind,
        status: document.status,
        counterpartyName: document.counterpartyName,
      },
      summary: {
        currency: document.currency,
        totalAmountCents: document.totalAmountCents,
        issuedOn: document.issuedOn,
        postedAt: document.postedAt,
      },
      tabs: ["overview", "timeline", "audit", "attachments", "approvals"],
      timeline: audit.map((event) => ({
        at: event.createdAt,
        action: event.action,
        actor: `${event.actorType}:${event.actorId}`,
      })),
      audit,
      attachments: [],
      approvals,
      comments: [],
      allowedActions: this.allowedActionsForDocument(document),
      payload: document.payload,
    };
  }

  getFrontendMeta(tenantId?: string, legalEntityId?: string): Record<string, unknown> {
    const tenant = tenantId ? this.getTenant(tenantId) : this.listTenants()[0] ?? null;
    const legalEntity = legalEntityId ? this.getLegalEntity(legalEntityId) : (tenant ? this.listLegalEntities(tenant.id)[0] ?? null : null);
    const jobs = tenant && legalEntity ? this.listJobs(tenant.id, legalEntity.id) : [];
    return {
      shell: {
        tenantOptions: this.listTenants().map((item) => ({ id: item.id, label: item.name })),
        legalEntityOptions: tenant ? this.listLegalEntities(tenant.id).map((item) => ({ id: item.id, label: item.name })) : [],
        branchSwitcher: legalEntity ? this.listBranches(tenant!.id, legalEntity.id).map((branch) => ({ id: branch.id, label: branch.name })) : [],
        localizationBadge: legalEntity?.localizationKey ?? null,
        syncStatus: "healthy",
        runningJobs: jobs.filter((job) => job.status !== "completed"),
      },
      navigation: [
        "dashboard",
        "finance",
        "sales",
        "purchase",
        "inventory",
        "mrp",
        "projects",
        "hr",
        "payroll",
        "support",
        "dms",
        "bi",
        "admin",
      ],
      badges: {
        approvals: tenant && legalEntity ? this.listApprovals(tenant.id, legalEntity.id).filter((approval) => approval.status === "pending").length : 0,
      },
    };
  }

  listJobs(tenantId: string, legalEntityId: string): JobRecord[] {
    return this.db
      .prepare("SELECT * FROM jobs WHERE tenant_id = ? AND legal_entity_id = ? ORDER BY created_at DESC")
      .all(tenantId, legalEntityId)
      .map((row) => this.serializeJob(row));
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS legal_entities (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        base_currency TEXT NOT NULL,
        localization_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        legal_entity_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS warehouses (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        legal_entity_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fiscal_periods (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        legal_entity_id TEXT NOT NULL,
        code TEXT NOT NULL,
        starts_on TEXT NOT NULL,
        ends_on TEXT NOT NULL,
        status TEXT NOT NULL,
        closed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS accounts (
        tenant_id TEXT NOT NULL,
        legal_entity_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, legal_entity_id, code)
      );
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        legal_entity_id TEXT NOT NULL,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (tenant_id, legal_entity_id, sku)
      );
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        legal_entity_id TEXT NOT NULL,
        employee_number TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        legal_entity_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS localizations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        legal_entity_id TEXT NOT NULL,
        pack_key TEXT NOT NULL,
        version TEXT NOT NULL,
        installed_at TEXT NOT NULL,
        UNIQUE (tenant_id, legal_entity_id, pack_key)
      );
      CREATE TABLE IF NOT EXISTS counters (
        tenant_id TEXT NOT NULL,
        legal_entity_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        next_value INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, legal_entity_id, scope)
      );
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        legal_entity_id TEXT NOT NULL,
        branch_id TEXT,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        number TEXT NOT NULL,
        counterparty_name TEXT,
        currency TEXT NOT NULL,
        total_amount_cents INTEGER NOT NULL,
        issued_on TEXT NOT NULL,
        posted_at TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        legal_entity_id TEXT NOT NULL,
        source_document_id TEXT,
        period_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        memo TEXT NOT NULL,
        entry_date TEXT NOT NULL,
        total_debit_cents INTEGER NOT NULL,
        total_credit_cents INTEGER NOT NULL,
        reversed_from_entry_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS journal_lines (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        account_code TEXT NOT NULL,
        side TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        dimensions_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS inventory_balances (
        tenant_id TEXT NOT NULL,
        legal_entity_id TEXT NOT NULL,
        warehouse_id TEXT NOT NULL,
        item_sku TEXT NOT NULL,
        on_hand_qty REAL NOT NULL,
        average_cost_cents INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, legal_entity_id, warehouse_id, item_sku)
      );
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        legal_entity_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        decided_by TEXT,
        target_type TEXT NOT NULL,
        target_id TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        legal_entity_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        progress_percent INTEGER NOT NULL,
        message TEXT NOT NULL,
        result_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        legal_entity_id TEXT,
        actor_type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  private seedAdmin(email: string, password: string): void {
    const existing = this.db.prepare("SELECT id FROM admins WHERE email = ?").get(email) as { id: string } | undefined;
    if (existing) {
      this.db.prepare("UPDATE admins SET password = ? WHERE email = ?").run(password, email);
      return;
    }
    this.db.prepare("INSERT INTO admins (id, email, password) VALUES (?, ?, ?)").run("admin_local", email, password);
  }

  private createDocument(input: {
    tenantId: string;
    legalEntityId: string;
    branchId?: string;
    kind: string;
    status: DocumentRecord["status"];
    prefix: string;
    counterpartyName?: string;
    currency: string;
    totalAmountCents: number;
    payload: Record<string, unknown>;
    auditAction: string;
  }): DocumentRecord {
    const tx = this.db.transaction(() => {
      const document = this.createDocumentInternal(this.db, input);
      this.auditInternal(this.db, {
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        actorType: "admin",
        actorId: "system",
        action: input.auditAction,
        entityType: "document",
        entityId: document.id,
        payload: { kind: input.kind },
      });
      return this.getDocument(document.id);
    });
    return tx();
  }

  private createDocumentInternal(db: TransactionDatabase, input: {
    tenantId: string;
    legalEntityId: string;
    branchId?: string;
    kind: string;
    status: DocumentRecord["status"];
    prefix: string;
    counterpartyName?: string;
    currency: string;
    totalAmountCents: number;
    payload: Record<string, unknown>;
  }): DocumentRecord {
    this.assertEntityScope(input.tenantId, input.legalEntityId);
    const createdAt = nowIso();
    const id = `doc_${randomUUID().slice(0, 8)}`;
    const number = this.nextNumber(db, input.tenantId, input.legalEntityId, input.kind, input.prefix);
    db.prepare(
      "INSERT INTO documents (id, tenant_id, legal_entity_id, branch_id, kind, status, number, counterparty_name, currency, total_amount_cents, issued_on, posted_at, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      input.tenantId,
      input.legalEntityId,
      input.branchId ?? null,
      input.kind,
      input.status,
      number,
      input.counterpartyName ?? null,
      input.currency,
      input.totalAmountCents,
      createdAt.slice(0, 10),
      input.status === "posted" || input.status === "settled" ? createdAt : null,
      JSON.stringify(input.payload),
      createdAt,
      createdAt,
    );
    this.emit({
      type: input.status === "posted" || input.status === "settled" ? "document.posted" : "document.created",
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      entityType: "document",
      entityId: id,
      payload: { kind: input.kind, status: input.status },
      at: createdAt,
    });
    return this.getDocument(id);
  }

  private postJournalEntry(db: TransactionDatabase, input: {
    tenantId: string;
    legalEntityId: string;
    sourceDocumentId?: string;
    kind: string;
    memo: string;
    entryDate: string;
    reversedFromEntryId?: string;
    lines: LedgerLineSpec[];
  }): JournalEntryRecord {
    const debit = input.lines.filter((line) => line.side === "debit").reduce((sum, line) => sum + line.amountCents, 0);
    const credit = input.lines.filter((line) => line.side === "credit").reduce((sum, line) => sum + line.amountCents, 0);
    if (debit !== credit) {
      throw new ErpError("ledger_unbalanced", "Ledger entry is not balanced.", 400, {
        debit,
        credit,
      });
    }
    const period = this.resolveOpenPeriod(input.tenantId, input.legalEntityId, input.entryDate);
    if (period.status === "closed") {
      throw new ErpError("period_closed", `Cannot post into closed period ${period.code}.`, 409);
    }
    const createdAt = nowIso();
    const id = `entry_${randomUUID().slice(0, 8)}`;
    db.prepare(
      "INSERT INTO journal_entries (id, tenant_id, legal_entity_id, source_document_id, period_id, kind, memo, entry_date, total_debit_cents, total_credit_cents, reversed_from_entry_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      input.tenantId,
      input.legalEntityId,
      input.sourceDocumentId ?? null,
      period.id,
      input.kind,
      input.memo,
      input.entryDate,
      debit,
      credit,
      input.reversedFromEntryId ?? null,
      createdAt,
    );
    for (const line of input.lines) {
      db.prepare(
        "INSERT INTO journal_lines (id, entry_id, account_code, side, amount_cents, dimensions_json) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(`line_${randomUUID().slice(0, 8)}`, id, line.accountCode, line.side, line.amountCents, JSON.stringify(line.dimensions ?? {}));
    }
    this.emit({
      type: "ledger.entry.posted",
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      entityType: "journal_entry",
      entityId: id,
      payload: { kind: input.kind, totalDebitCents: debit },
      at: createdAt,
    });
    return this.getEntry(id);
  }

  private adjustInventory(db: TransactionDatabase, input: {
    tenantId: string;
    legalEntityId: string;
    warehouseId: string;
    itemSku: string;
    deltaQty: number;
    unitCostCents: number;
  }): void {
    const current = db.prepare(
      "SELECT * FROM inventory_balances WHERE tenant_id = ? AND legal_entity_id = ? AND warehouse_id = ? AND item_sku = ?",
    ).get(input.tenantId, input.legalEntityId, input.warehouseId, input.itemSku) as {
      on_hand_qty: number;
      average_cost_cents: number;
    } | undefined;
    const currentQty = current?.on_hand_qty ?? 0;
    const newQty = currentQty + input.deltaQty;
    const averageCostCents = input.deltaQty > 0
      ? Math.round(((currentQty * (current?.average_cost_cents ?? input.unitCostCents)) + (input.deltaQty * input.unitCostCents)) / Math.max(newQty, 1))
      : (current?.average_cost_cents ?? input.unitCostCents);
    if (newQty < -0.0001) {
      throw new ErpError("inventory_negative", `Inventory for ${input.itemSku} would go negative.`, 409);
    }
    db.prepare(
      `INSERT INTO inventory_balances (tenant_id, legal_entity_id, warehouse_id, item_sku, on_hand_qty, average_cost_cents, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (tenant_id, legal_entity_id, warehouse_id, item_sku)
       DO UPDATE SET on_hand_qty = excluded.on_hand_qty, average_cost_cents = excluded.average_cost_cents, updated_at = excluded.updated_at`,
    ).run(input.tenantId, input.legalEntityId, input.warehouseId, input.itemSku, newQty, averageCostCents, nowIso());
    this.emit({
      type: "inventory.updated",
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      entityType: "inventory_balance",
      entityId: `${input.warehouseId}:${input.itemSku}`,
      payload: { onHandQty: newQty, itemSku: input.itemSku },
      at: nowIso(),
    });
  }

  private installLocalizationPackInternal(db: TransactionDatabase, input: {
    tenantId: string;
    legalEntityId: string;
    packKey: string;
    version: string;
    actorId: string;
  }): void {
    const id = `loc_${input.tenantId}_${input.legalEntityId}_${slugify(input.packKey)}`;
    db.prepare(
      `INSERT INTO localizations (id, tenant_id, legal_entity_id, pack_key, version, installed_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (tenant_id, legal_entity_id, pack_key)
       DO UPDATE SET version = excluded.version, installed_at = excluded.installed_at`,
    ).run(id, input.tenantId, input.legalEntityId, input.packKey, input.version, nowIso());
    this.auditInternal(db, {
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      actorType: "admin",
      actorId: input.actorId,
      action: "localization.install",
      entityType: "localization",
      entityId: id,
      payload: { packKey: input.packKey, version: input.version },
    });
    this.emit({
      type: "localization.installed",
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      entityType: "localization",
      entityId: id,
      payload: { packKey: input.packKey, version: input.version },
      at: nowIso(),
    });
  }

  private auditInternal(db: TransactionDatabase, input: {
    tenantId?: string;
    legalEntityId?: string;
    actorType: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  }): void {
    const createdAt = nowIso();
    db.prepare(
      "INSERT INTO audit_events (id, tenant_id, legal_entity_id, actor_type, actor_id, action, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      `audit_${randomUUID().slice(0, 8)}`,
      input.tenantId ?? null,
      input.legalEntityId ?? null,
      input.actorType,
      input.actorId,
      input.action,
      input.entityType,
      input.entityId,
      JSON.stringify(input.payload),
      createdAt,
    );
    this.emit({
      type: "audit.logged",
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: { action: input.action },
      at: createdAt,
    });
  }

  private nextNumber(db: TransactionDatabase, tenantId: string, legalEntityId: string, scope: string, prefix: string): string {
    const row = db.prepare("SELECT next_value FROM counters WHERE tenant_id = ? AND legal_entity_id = ? AND scope = ?").get(tenantId, legalEntityId, scope) as { next_value: number } | undefined;
    const nextValue = row?.next_value ?? 1;
    db.prepare(
      `INSERT INTO counters (tenant_id, legal_entity_id, scope, next_value)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (tenant_id, legal_entity_id, scope)
       DO UPDATE SET next_value = excluded.next_value`,
    ).run(tenantId, legalEntityId, scope, nextValue + 1);
    return `${prefix}-${padCounter(nextValue)}`;
  }

  private resolveOpenPeriod(tenantId: string, legalEntityId: string, entryDate: string): FiscalPeriodRecord {
    const row = this.db.prepare(
      "SELECT * FROM fiscal_periods WHERE tenant_id = ? AND legal_entity_id = ? AND starts_on <= ? AND ends_on >= ? ORDER BY starts_on DESC LIMIT 1",
    ).get(tenantId, legalEntityId, entryDate, entryDate);
    if (!row) {
      throw new ErpError("period_missing", `No fiscal period covers ${entryDate}.`, 409);
    }
    return this.serializePeriod(row);
  }

  private allowedActionsForDocument(document: DocumentRecord): string[] {
    if (document.status === "draft") return ["edit", "approve", "cancel"];
    if (document.status === "approved" || document.status === "confirmed") return ["post", "cancel"];
    if (document.status === "posted") return ["reverse", "settle"];
    return [];
  }

  private balanceForAccount(tenantId: string, legalEntityId: string, accountCode: string): number {
    const lines = this.db.prepare(
      `SELECT journal_lines.side, journal_lines.amount_cents
       FROM journal_lines
       JOIN journal_entries ON journal_entries.id = journal_lines.entry_id
       WHERE journal_entries.tenant_id = ? AND journal_entries.legal_entity_id = ? AND journal_lines.account_code = ?`,
    ).all(tenantId, legalEntityId, accountCode) as Array<{ side: "debit" | "credit"; amount_cents: number }>;
    return lines.reduce((sum, line) => sum + (line.side === "debit" ? line.amount_cents : -line.amount_cents), 0);
  }

  private assertEntityScope(tenantId: string, legalEntityId: string): void {
    this.getTenant(tenantId);
    this.getLegalEntity(legalEntityId);
  }

  private getTenant(id: string): TenantRecord {
    const row = this.db.prepare("SELECT * FROM tenants WHERE id = ?").get(id);
    if (!row) throw new ErpError("tenant_not_found", `Tenant ${id} not found.`, 404);
    return this.serializeTenant(row);
  }

  private getLegalEntity(id: string): LegalEntityRecord {
    const row = this.db.prepare("SELECT * FROM legal_entities WHERE id = ?").get(id);
    if (!row) throw new ErpError("legal_entity_not_found", `Legal entity ${id} not found.`, 404);
    return this.serializeLegalEntity(row);
  }

  private getBranch(id: string): BranchRecord {
    const row = this.db.prepare("SELECT * FROM branches WHERE id = ?").get(id);
    if (!row) throw new ErpError("branch_not_found", `Branch ${id} not found.`, 404);
    return this.serializeBranch(row);
  }

  listBranches(tenantId: string, legalEntityId: string): BranchRecord[] {
    return this.db.prepare("SELECT * FROM branches WHERE tenant_id = ? AND legal_entity_id = ? ORDER BY created_at ASC").all(tenantId, legalEntityId).map((row) => this.serializeBranch(row));
  }

  listWarehouses(tenantId: string, legalEntityId: string): WarehouseRecord[] {
    return this.db.prepare("SELECT * FROM warehouses WHERE tenant_id = ? AND legal_entity_id = ? ORDER BY created_at ASC").all(tenantId, legalEntityId).map((row) => this.serializeWarehouse(row));
  }

  listItems(tenantId: string, legalEntityId: string): ItemRecord[] {
    return this.db.prepare("SELECT * FROM items WHERE tenant_id = ? AND legal_entity_id = ? ORDER BY sku ASC").all(tenantId, legalEntityId).map((row) => this.serializeItem(row));
  }

  listProjects(tenantId: string, legalEntityId: string): ProjectRecord[] {
    return this.db.prepare("SELECT * FROM projects WHERE tenant_id = ? AND legal_entity_id = ? ORDER BY created_at ASC").all(tenantId, legalEntityId).map((row) => this.serializeProject(row));
  }

  private getWarehouse(id: string): WarehouseRecord {
    const row = this.db.prepare("SELECT * FROM warehouses WHERE id = ?").get(id);
    if (!row) throw new ErpError("warehouse_not_found", `Warehouse ${id} not found.`, 404);
    return this.serializeWarehouse(row);
  }

  private getPeriod(id: string): FiscalPeriodRecord {
    const row = this.db.prepare("SELECT * FROM fiscal_periods WHERE id = ?").get(id);
    if (!row) throw new ErpError("period_not_found", `Fiscal period ${id} not found.`, 404);
    return this.serializePeriod(row);
  }

  private getDocument(id: string): DocumentRecord {
    const row = this.db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
    if (!row) throw new ErpError("document_not_found", `Document ${id} not found.`, 404);
    return this.serializeDocument(row);
  }

  private getEntry(id: string): JournalEntryRecord {
    const row = this.db.prepare("SELECT * FROM journal_entries WHERE id = ?").get(id);
    if (!row) throw new ErpError("entry_not_found", `Entry ${id} not found.`, 404);
    return this.serializeEntry(row);
  }

  private getItem(id: string): ItemRecord {
    const row = this.db.prepare("SELECT * FROM items WHERE id = ?").get(id);
    if (!row) throw new ErpError("item_not_found", `Item ${id} not found.`, 404);
    return this.serializeItem(row);
  }

  private getEmployee(id: string): EmployeeRecord {
    const row = this.db.prepare("SELECT * FROM employees WHERE id = ?").get(id);
    if (!row) throw new ErpError("employee_not_found", `Employee ${id} not found.`, 404);
    return this.serializeEmployee(row);
  }

  private getProject(id: string): ProjectRecord {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    if (!row) throw new ErpError("project_not_found", `Project ${id} not found.`, 404);
    return this.serializeProject(row);
  }

  private getApproval(id: string): ApprovalRecord {
    const row = this.db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
    if (!row) throw new ErpError("approval_not_found", `Approval ${id} not found.`, 404);
    return this.serializeApproval(row);
  }

  private getJob(id: string): JobRecord {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
    if (!row) throw new ErpError("job_not_found", `Job ${id} not found.`, 404);
    return this.serializeJob(row);
  }

  private serializeTenant(row: any): TenantRecord {
    return { id: row.id, slug: row.slug, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  private serializeLegalEntity(row: any): LegalEntityRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      baseCurrency: row.base_currency,
      localizationKey: row.localization_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private serializeBranch(row: any): BranchRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      legalEntityId: row.legal_entity_id,
      code: row.code,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private serializeWarehouse(row: any): WarehouseRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      legalEntityId: row.legal_entity_id,
      code: row.code,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private serializePeriod(row: any): FiscalPeriodRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      legalEntityId: row.legal_entity_id,
      code: row.code,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      status: row.status,
      closedAt: row.closed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private serializeAccount(row: any): AccountRecord {
    return {
      tenantId: row.tenant_id,
      legalEntityId: row.legal_entity_id,
      code: row.code,
      name: row.name,
      category: row.category,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private serializeItem(row: any): ItemRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      legalEntityId: row.legal_entity_id,
      sku: row.sku,
      name: row.name,
      kind: row.kind,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private serializeEmployee(row: any): EmployeeRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      legalEntityId: row.legal_entity_id,
      employeeNumber: row.employee_number,
      displayName: row.display_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private serializeProject(row: any): ProjectRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      legalEntityId: row.legal_entity_id,
      code: row.code,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private serializeDocument(row: any): DocumentRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      legalEntityId: row.legal_entity_id,
      branchId: row.branch_id,
      kind: row.kind,
      status: row.status,
      number: row.number,
      counterpartyName: row.counterparty_name,
      currency: row.currency,
      totalAmountCents: row.total_amount_cents,
      issuedOn: row.issued_on,
      postedAt: row.posted_at,
      payload: parseJson(row.payload_json, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private serializeEntry(row: any): JournalEntryRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      legalEntityId: row.legal_entity_id,
      sourceDocumentId: row.source_document_id,
      periodId: row.period_id,
      kind: row.kind,
      memo: row.memo,
      entryDate: row.entry_date,
      totalDebitCents: row.total_debit_cents,
      totalCreditCents: row.total_credit_cents,
      reversedFromEntryId: row.reversed_from_entry_id,
      createdAt: row.created_at,
    };
  }

  private serializeLine(row: any): JournalLineRecord {
    return {
      id: row.id,
      entryId: row.entry_id,
      accountCode: row.account_code,
      side: row.side,
      amountCents: row.amount_cents,
      dimensions: parseJson(row.dimensions_json, {}),
    };
  }

  private serializeInventory(row: any): InventoryBalanceRecord {
    return {
      tenantId: row.tenant_id,
      legalEntityId: row.legal_entity_id,
      warehouseId: row.warehouse_id,
      itemSku: row.item_sku,
      onHandQty: row.on_hand_qty,
      averageCostCents: row.average_cost_cents,
      updatedAt: row.updated_at,
    };
  }

  private serializeApproval(row: any): ApprovalRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      legalEntityId: row.legal_entity_id,
      kind: row.kind,
      status: row.status,
      requestedBy: row.requested_by,
      decidedBy: row.decided_by,
      targetType: row.target_type,
      targetId: row.target_id,
      payload: parseJson(row.payload_json, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private serializeJob(row: any): JobRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      legalEntityId: row.legal_entity_id,
      kind: row.kind,
      status: row.status,
      progressPercent: row.progress_percent,
      message: row.message,
      result: parseJson(row.result_json, null),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private serializeAudit(row: any): AuditRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      legalEntityId: row.legal_entity_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      payload: parseJson(row.payload_json, {}),
      createdAt: row.created_at,
    };
  }

  private emit(event: ErpRealtimeEvent): void {
    this.onEvent?.(event);
  }
}
