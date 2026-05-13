export type DocumentStatus =
  | "draft"
  | "approved"
  | "confirmed"
  | "posted"
  | "settled"
  | "reversed"
  | "cancelled";

export type PeriodStatus = "open" | "closed";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "executed";
export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegalEntityRecord {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  baseCurrency: string;
  localizationKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface BranchRecord {
  id: string;
  tenantId: string;
  legalEntityId: string;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseRecord {
  id: string;
  tenantId: string;
  legalEntityId: string;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface FiscalPeriodRecord {
  id: string;
  tenantId: string;
  legalEntityId: string;
  code: string;
  startsOn: string;
  endsOn: string;
  status: PeriodStatus;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountRecord {
  code: string;
  tenantId: string;
  legalEntityId: string;
  name: string;
  category: "asset" | "liability" | "equity" | "revenue" | "expense";
  createdAt: string;
  updatedAt: string;
}

export interface ItemRecord {
  id: string;
  tenantId: string;
  legalEntityId: string;
  sku: string;
  name: string;
  kind: "stock" | "service";
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeRecord {
  id: string;
  tenantId: string;
  legalEntityId: string;
  employeeNumber: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  tenantId: string;
  legalEntityId: string;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRecord {
  id: string;
  tenantId: string;
  legalEntityId: string;
  kind: string;
  status: ApprovalStatus;
  requestedBy: string;
  decidedBy?: string | null;
  targetType: string;
  targetId?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface JobRecord {
  id: string;
  tenantId: string;
  legalEntityId: string;
  kind: string;
  status: JobStatus;
  progressPercent: number;
  message: string;
  result?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  tenantId: string;
  legalEntityId: string;
  branchId?: string | null;
  kind: string;
  status: DocumentStatus;
  number: string;
  counterpartyName?: string | null;
  currency: string;
  totalAmountCents: number;
  issuedOn: string;
  postedAt?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntryRecord {
  id: string;
  tenantId: string;
  legalEntityId: string;
  sourceDocumentId?: string | null;
  periodId: string;
  kind: string;
  memo: string;
  entryDate: string;
  totalDebitCents: number;
  totalCreditCents: number;
  reversedFromEntryId?: string | null;
  createdAt: string;
}

export interface JournalLineRecord {
  id: string;
  entryId: string;
  accountCode: string;
  side: "debit" | "credit";
  amountCents: number;
  dimensions: Record<string, unknown>;
}

export interface InventoryBalanceRecord {
  tenantId: string;
  legalEntityId: string;
  warehouseId: string;
  itemSku: string;
  onHandQty: number;
  averageCostCents: number;
  updatedAt: string;
}

export interface AuditRecord {
  id: string;
  tenantId?: string | null;
  legalEntityId?: string | null;
  actorType: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
