import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import type { AccountRecord } from "../shared/types.ts";

export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || randomUUID().slice(0, 8);
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function padCounter(value: number): string {
  return String(value).padStart(4, "0");
}

export type LedgerLineSpec = {
  accountCode: string;
  side: "debit" | "credit";
  amountCents: number;
  dimensions?: Record<string, unknown>;
};

const ERP_TABLES = [
  "admins",
  "tenants",
  "legal_entities",
  "branches",
  "warehouses",
  "fiscal_periods",
  "accounts",
  "items",
  "employees",
  "projects",
  "localizations",
  "counters",
  "documents",
  "journal_entries",
  "journal_lines",
  "inventory_balances",
  "approvals",
  "jobs",
  "audit_events",
];

export type NativeDatabase = Database.Database;
export type TransactionDatabase = {
  prepare(sql: string): any;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
};

export class PrefixedErpDatabase {
  constructor(private readonly db: NativeDatabase) {}

  prepare(sql: string): any {
    return this.db.prepare(rewriteErpSql(sql));
  }

  exec(sql: string) {
    return this.db.exec(rewriteErpSql(sql));
  }

  pragma(source: string, options?: Parameters<NativeDatabase["pragma"]>[1]) {
    return this.db.pragma(source, options);
  }

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return this.db.transaction((...args: Parameters<T>) => fn(...args)) as unknown as T;
  }

  close() {
    return this.db.close();
  }
}

function rewriteErpSql(sql: string): string {
  let rewritten = sql;
  for (const table of ERP_TABLES) {
    rewritten = rewritten.replace(new RegExp(`\\b${table}\\b`, "g"), `erp_${table}`);
  }
  return rewritten;
}

export const DEFAULT_ACCOUNTS: Array<{ code: string; name: string; category: AccountRecord["category"] }> = [
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
