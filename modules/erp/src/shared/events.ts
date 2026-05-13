export type ErpEventType =
  | "tenant.bootstrapped"
  | "localization.installed"
  | "document.created"
  | "document.updated"
  | "document.posted"
  | "ledger.entry.posted"
  | "inventory.updated"
  | "project.updated"
  | "payroll.posted"
  | "approval.requested"
  | "approval.decided"
  | "job.updated"
  | "audit.logged";

export interface ErpRealtimeEvent {
  type: ErpEventType;
  tenantId?: string;
  legalEntityId?: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  at: string;
}
