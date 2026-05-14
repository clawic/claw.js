import { clawApiPath } from "@clawjs/core";

export const ERP_TOKEN_STORAGE_KEY = "clawjs.erp.token";
export const ERP_TENANT_STORAGE_KEY = "clawjs.erp.tenant";
export const ERP_ENTITY_STORAGE_KEY = "clawjs.erp.entity";
export interface ErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  correlationId: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly envelope: ErrorEnvelope,
  ) {
    super(envelope.message);
  }
}

class ApiClient {
  private token: string | null = null;
  private tenantId: string | null = null;
  private legalEntityId: string | null = null;

  constructor(private baseUrl = "") {}

  setToken(token: string | null) {
    this.token = token;
    if (token) localStorage.setItem(ERP_TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(ERP_TOKEN_STORAGE_KEY);
  }

  getToken(): string | null {
    if (!this.token) this.token = localStorage.getItem(ERP_TOKEN_STORAGE_KEY);
    return this.token;
  }

  setContext(tenantId: string, legalEntityId: string) {
    this.tenantId = tenantId;
    this.legalEntityId = legalEntityId;
    localStorage.setItem(ERP_TENANT_STORAGE_KEY, tenantId);
    localStorage.setItem(ERP_ENTITY_STORAGE_KEY, legalEntityId);
  }

  getContext(): { tenantId: string | null; legalEntityId: string | null } {
    if (!this.tenantId) this.tenantId = localStorage.getItem(ERP_TENANT_STORAGE_KEY);
    if (!this.legalEntityId) this.legalEntityId = localStorage.getItem(ERP_ENTITY_STORAGE_KEY);
    return { tenantId: this.tenantId, legalEntityId: this.legalEntityId };
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    const token = this.getToken();
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }

  private scopedPath(suffix: string): string {
    const { tenantId, legalEntityId } = this.getContext();
    if (!tenantId || !legalEntityId) throw new Error("No tenant/entity context set");
    return clawApiPath(`tenants/${tenantId}/legal-entities/${legalEntityId}${suffix}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let envelope: ErrorEnvelope;
      try {
        envelope = await res.json();
      } catch {
        envelope = { code: "http_error", message: res.statusText, retryable: false, correlationId: "" };
      }
      throw new ApiError(res.status, envelope);
    }
    if (res.status === 204) return {} as T;
    return res.json();
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  // Auth
  async login(email: string, password: string): Promise<{ accessToken: string }> {
    return this.post(clawApiPath("auth/admin/login"), { email, password });
  }

  // Health
  async health(): Promise<{ ok: boolean }> {
    return this.get(clawApiPath("health"));
  }

  // App meta
  async meta(): Promise<AppMeta> {
    const { tenantId, legalEntityId } = this.getContext();
    const params = new URLSearchParams();
    if (tenantId) params.set("tenantId", tenantId);
    if (legalEntityId) params.set("legalEntityId", legalEntityId);
    return this.get(clawApiPath(`app/meta?${params}`));
  }

  async dashboard(): Promise<DashboardData> {
    const { tenantId, legalEntityId } = this.getContext();
    return this.get(clawApiPath(`app/dashboard?tenantId=${tenantId}&legalEntityId=${legalEntityId}`));
  }

  async frontendContract(): Promise<unknown> {
    return this.get(clawApiPath("app/frontend-contract"));
  }

  async formSchema(formId: string): Promise<FormSchema> {
    return this.get(clawApiPath(`app/forms/${formId}`));
  }

  async documentDetail(documentId: string): Promise<DocumentDetail> {
    const { tenantId, legalEntityId } = this.getContext();
    return this.get(clawApiPath(`app/documents/${documentId}?tenantId=${tenantId}&legalEntityId=${legalEntityId}`));
  }

  // Tenants
  async listTenants(): Promise<{ tenants: TenantRecord[] }> {
    return this.get(clawApiPath("tenants"));
  }

  async bootstrapTenant(data: Record<string, unknown>): Promise<unknown> {
    return this.post(clawApiPath("tenants/bootstrap"), data);
  }

  // Legal entities
  async listLegalEntities(tenantId: string): Promise<{ legalEntities: LegalEntityRecord[] }> {
    return this.get(clawApiPath(`tenants/${tenantId}/legal-entities`));
  }

  // Scoped reads
  async listAccounts(): Promise<{ accounts: AccountRecord[] }> {
    return this.get(this.scopedPath("/accounts"));
  }

  async listPeriods(): Promise<{ periods: FiscalPeriodRecord[] }> {
    return this.get(this.scopedPath("/periods"));
  }

  async listEntries(): Promise<{ entries: JournalEntry[] }> {
    return this.get(this.scopedPath("/gl/entries"));
  }

  async listDocuments(kind?: string): Promise<{ documents: DocumentRecord[] }> {
    const suffix = kind ? `/documents?kind=${kind}` : "/documents";
    return this.get(this.scopedPath(suffix));
  }

  async getDocument(id: string): Promise<{ document: DocumentRecord }> {
    return this.get(this.scopedPath(`/documents/${id}`));
  }

  async listInventoryBalances(): Promise<{ balances: InventoryBalance[] }> {
    return this.get(this.scopedPath("/inventory/balances"));
  }

  async listEmployees(): Promise<{ employees: EmployeeRecord[] }> {
    return this.get(this.scopedPath("/employees"));
  }

  async listApprovals(): Promise<{ approvals: ApprovalRecord[] }> {
    return this.get(this.scopedPath("/approvals"));
  }

  async listAudit(): Promise<{ audit: AuditRecord[] }> {
    return this.get(this.scopedPath("/audit"));
  }

  async listBranches(): Promise<{ branches: BranchRecord[] }> {
    return this.get(this.scopedPath("/branches"));
  }

  async listWarehouses(): Promise<{ warehouses: WarehouseRecord[] }> {
    return this.get(this.scopedPath("/warehouses"));
  }

  async listItems(): Promise<{ items: ItemRecord[] }> {
    return this.get(this.scopedPath("/items"));
  }

  async listProjects(): Promise<{ projects: ProjectRecord[] }> {
    return this.get(this.scopedPath("/projects"));
  }

  async listJobs(): Promise<{ jobs: JobRecord[] }> {
    return this.get(this.scopedPath("/jobs"));
  }

  // Mutations
  async createSalesQuote(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/sales/quotes"), data);
  }

  async confirmSalesOrder(quoteId: string): Promise<unknown> {
    return this.post(this.scopedPath(`/sales/quotes/${quoteId}/confirm-order`));
  }

  async postShipment(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/sales/shipments"), data);
  }

  async postCustomerInvoice(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/ar/invoices"), data);
  }

  async registerCustomerPayment(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/ar/payments"), data);
  }

  async createPurchaseOrder(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/purchase/orders"), data);
  }

  async postReceipt(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/purchase/receipts"), data);
  }

  async postVendorBill(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/ap/bills"), data);
  }

  async registerVendorPayment(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/ap/payments"), data);
  }

  async createItem(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/items"), data);
  }

  async createEmployee(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/employees"), data);
  }

  async createProject(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/projects"), data);
  }

  async invoiceProjectTimesheet(projectId: string, data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath(`/projects/${projectId}/timesheets/invoice`), data);
  }

  async createPayrollRun(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/payroll/runs"), data);
  }

  async postPayrollRun(runId: string): Promise<unknown> {
    return this.post(this.scopedPath(`/payroll/runs/${runId}/post`));
  }

  async createProductionOrder(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/mrp/orders"), data);
  }

  async postProductionOrder(orderId: string): Promise<unknown> {
    return this.post(this.scopedPath(`/mrp/orders/${orderId}/post`));
  }

  async createSupportTicket(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/support/tickets"), data);
  }

  async requestAgentAction(data: Record<string, unknown>): Promise<unknown> {
    return this.post(this.scopedPath("/agents/actions"), data);
  }

  async approveAction(approvalId: string): Promise<unknown> {
    return this.post(this.scopedPath(`/approvals/${approvalId}/approve`));
  }

  async closePeriod(periodId: string): Promise<unknown> {
    return this.post(this.scopedPath(`/periods/${periodId}/close`));
  }

  async reverseEntry(entryId: string): Promise<unknown> {
    return this.post(this.scopedPath(`/gl/entries/${entryId}/reverse`));
  }

  async installLocalization(packKey: string): Promise<unknown> {
    return this.post(this.scopedPath("/localizations/install"), { packKey });
  }
}

// Types matching backend records
export interface TenantRecord {
  id: string; slug: string; name: string; createdAt: string; updatedAt: string;
}
export interface LegalEntityRecord {
  id: string; tenantId: string; code: string; name: string; baseCurrency: string; localizationKey: string; createdAt: string; updatedAt: string;
}
export interface BranchRecord {
  id: string; tenantId: string; legalEntityId: string; code: string; name: string; createdAt: string; updatedAt: string;
}
export interface WarehouseRecord {
  id: string; tenantId: string; legalEntityId: string; code: string; name: string; createdAt: string; updatedAt: string;
}
export interface AccountRecord {
  code: string; tenantId: string; legalEntityId: string; name: string; category: string; createdAt: string; updatedAt: string;
}
export interface FiscalPeriodRecord {
  id: string; code: string; startsOn: string; endsOn: string; status: "open" | "closed"; closedAt?: string | null; createdAt: string; updatedAt: string;
}
export interface DocumentRecord {
  id: string; tenantId: string; legalEntityId: string; branchId?: string | null; kind: string; status: string; number: string; counterpartyName?: string | null; currency: string; totalAmountCents: number; issuedOn: string; postedAt?: string | null; payload: Record<string, unknown>; createdAt: string; updatedAt: string;
}
export interface JournalLine {
  id: string; entryId: string; accountCode: string; side: "debit" | "credit"; amountCents: number; dimensions: Record<string, unknown>;
}
export interface JournalEntry {
  id: string; sourceDocumentId?: string | null; periodId: string; kind: string; memo: string; entryDate: string; totalDebitCents: number; totalCreditCents: number; reversedFromEntryId?: string | null; createdAt: string; lines: JournalLine[];
}
export interface InventoryBalance {
  tenantId: string; legalEntityId: string; warehouseId: string; itemSku: string; onHandQty: number; averageCostCents: number; updatedAt: string;
}
export interface ItemRecord {
  id: string; sku: string; name: string; kind: "stock" | "service"; createdAt: string; updatedAt: string;
}
export interface EmployeeRecord {
  id: string; employeeNumber: string; displayName: string; createdAt: string; updatedAt: string;
}
export interface ProjectRecord {
  id: string; code: string; name: string; createdAt: string; updatedAt: string;
}
export interface ApprovalRecord {
  id: string; kind: string; status: string; requestedBy: string; decidedBy?: string | null; targetType: string; targetId?: string | null; payload: Record<string, unknown>; createdAt: string; updatedAt: string;
}
export interface AuditRecord {
  id: string; actorType: string; actorId: string; action: string; entityType: string; entityId: string; payload: Record<string, unknown>; createdAt: string;
}
export interface JobRecord {
  id: string; kind: string; status: string; progressPercent: number; message: string; result?: Record<string, unknown> | null; createdAt: string; updatedAt: string;
}

export interface AppMeta {
  shell: {
    tenantOptions: Array<{ id: string; label: string }>;
    legalEntityOptions: Array<{ id: string; label: string }>;
    branchSwitcher: Array<{ id: string; label: string }>;
    localizationBadge: string | null;
    syncStatus: string;
    runningJobs: JobRecord[];
  };
  navigation: string[];
  badges: { approvals: number };
}

export interface DashboardData {
  header: { tenantId: string; legalEntityId: string };
  metrics: {
    cashCents: number;
    arAgingCents: number;
    apAgingCents: number;
    revenueCents: number;
    marginCents: number;
    overdueApprovals: number;
    inventoryAlerts: number;
    productionBottlenecks: number;
    payrollCalendarItems: number;
    openTickets: number;
  };
  feed: AuditRecord[];
  cards: {
    revenueTrend: number;
    stockPositions: InventoryBalance[];
  };
}

export interface FormSchema {
  id: string;
  title: string;
  submitLabel: string;
  fields: Array<{
    key: string;
    label: string;
    component: string;
    required: boolean;
    group: string;
    order: number;
    placeholder?: string;
    helpText?: string;
    defaultValue?: string | number | boolean | null;
  }>;
  validations: Record<string, string>;
  visibilityRules: Array<Record<string, unknown>>;
  sideEffects: string[];
}

export interface DocumentDetail {
  header: { id: string; number: string; kind: string; status: string; counterpartyName?: string | null };
  summary: { currency: string; totalAmountCents: number; issuedOn: string; postedAt?: string | null };
  tabs: string[];
  timeline: Array<{ at: string; action: string; actor: string }>;
  audit: AuditRecord[];
  attachments: unknown[];
  approvals: ApprovalRecord[];
  comments: unknown[];
  allowedActions: string[];
  payload: Record<string, unknown>;
}

export const api = new ApiClient();
